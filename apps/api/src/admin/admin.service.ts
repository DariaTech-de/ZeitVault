import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { CreateEmployee } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type EmployeeRow, employees } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { LicensingService } from '../licensing/licensing.service';

export interface EmployeeSummary {
  id: string;
  personnelNumber: string;
  displayName: string;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly licensing: LicensingService,
    private readonly audit: AuditClient,
  ) {}

  /** Mitarbeitende des Mandanten (RLS-mandantenscharf). */
  async listEmployees(): Promise<EmployeeSummary[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select({
          id: employees.id,
          personnelNumber: employees.personnelNumber,
          displayName: employees.displayName,
        })
        .from(employees)
        .where(eq(employees.tenantId, ctx.tenantId))
        .orderBy(asc(employees.personnelNumber));
    });
  }

  /**
   * Legt einen Mitarbeitenden an. Die Aktivierung belegt einen Lizenz-Sitzplatz;
   * ist das Kontingent erschöpft, wird mit 409 abgelehnt (ADR-0013). Erzeugt ein
   * unveränderliches AuditEvent (employee.create, Kern-Invariante 2).
   */
  async createEmployee(input: CreateEmployee): Promise<EmployeeRow> {
    const ctx = this.tenantContext.require();
    // Sitzplatz-Durchsetzung VOR dem Insert.
    await this.licensing.assertSeatAvailable();

    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const existing = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.personnelNumber, input.personnelNumber));
      if (existing.length > 0) {
        throw new ConflictException(`Personalnummer ${input.personnelNumber} ist bereits vergeben.`);
      }
      const inserted = await tx
        .insert(employees)
        .values({
          tenantId: ctx.tenantId,
          personnelNumber: input.personnelNumber,
          displayName: input.displayName,
          externalId: input.externalId ?? null,
          status: 'active',
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Mitarbeitender konnte nicht angelegt werden.');

    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'employee.create',
      actorId: ctx.userId,
      subjectType: 'employee',
      subjectId: row.id,
      payload: { personnelNumber: row.personnelNumber },
    });
    return row;
  }
}
