import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import {
  type RetentionClass,
  deletionDueDate,
  isDeletionDue,
  pseudonymize,
} from '@zeitvault/domain';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type EmployeeRow, employees } from '../db/schema';
import { DB, type Database } from '../db/tokens';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RetentionDueEntry {
  employeeId: string;
  status: string;
  deletionDueDate: string | null;
  retentionClass: string | null;
}

@Injectable()
export class RetentionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  /**
   * Sperrt einen Mitarbeitenden (Austritt/Löschanfrage) und setzt das Löschdatum
   * gemäß Aufbewahrungsklasse. KEINE harte Löschung (Kern-Invariante 4).
   */
  async block(
    employeeId: string,
    retentionClass: RetentionClass,
    reason?: string,
  ): Promise<EmployeeRow> {
    const ctx = this.tenantContext.require();
    const due = deletionDueDate(todayIso(), retentionClass);
    const row = await this.update(employeeId, {
      status: 'blocked',
      blockedAt: new Date(),
      deletionDueDate: due,
      retentionClass,
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'retention.block',
      actorId: ctx.userId,
      subjectType: 'employee',
      subjectId: employeeId,
      payload: { retentionClass, deletionDueDate: due, ...(reason ? { reason } : {}) },
    });
    return row;
  }

  /**
   * Pseudonymisiert die personenbezogenen Stammdaten. Der technische Bezug
   * (employee_id) bleibt erhalten, damit revisionssichere Zeit-/Audit-Daten
   * konsistent referenziert werden, ohne die Person zu identifizieren.
   */
  async anonymize(employeeId: string): Promise<EmployeeRow> {
    const ctx = this.tenantContext.require();
    const pseudonym = pseudonymize(employeeId);
    const row = await this.update(employeeId, {
      status: 'anonymized',
      anonymizedAt: new Date(),
      displayName: pseudonym.displayName,
      personnelNumber: pseudonym.personnelNumber,
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'retention.anonymize',
      actorId: ctx.userId,
      subjectType: 'employee',
      subjectId: employeeId,
      payload: { status: 'anonymized' },
    });
    return row;
  }

  /** Mitarbeitende, deren Aufbewahrungsfrist abgelaufen ist (löschfähig). */
  async dueForDeletion(): Promise<RetentionDueEntry[]> {
    const ctx = this.tenantContext.require();
    const now = todayIso();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, ctx.tenantId), lte(employees.deletionDueDate, now)))
        .orderBy(asc(employees.deletionDueDate));
    });
    return rows
      .filter((r) => r.deletionDueDate && isDeletionDue(now, r.deletionDueDate))
      .map((r) => ({
        employeeId: r.id,
        status: r.status,
        deletionDueDate: r.deletionDueDate,
        retentionClass: r.retentionClass,
      }));
  }

  private async update(
    employeeId: string,
    values: Partial<typeof employees.$inferInsert>,
  ): Promise<EmployeeRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const updated = await tx
        .update(employees)
        .set(values)
        .where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.id, employeeId)))
        .returning();
      return updated[0];
    });
    if (!row) {
      throw new NotFoundException('Mitarbeitende:r nicht gefunden.');
    }
    return row;
  }
}
