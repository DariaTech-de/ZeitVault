import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { CreateEmployee } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type EmployeeRow, employeePhotos, employees } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { LicensingService } from '../licensing/licensing.service';

export interface EmployeeSummary {
  id: string;
  personnelNumber: string;
  displayName: string;
  hasPhoto: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly licensing: LicensingService,
    private readonly audit: AuditClient,
  ) {}

  /** Mitarbeitende des Mandanten (RLS-mandantenscharf), inkl. Foto-Flag. */
  async listEmployees(): Promise<EmployeeSummary[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const rows = await tx
        .select({
          id: employees.id,
          personnelNumber: employees.personnelNumber,
          displayName: employees.displayName,
          photoId: employeePhotos.employeeId,
        })
        .from(employees)
        .leftJoin(employeePhotos, eq(employeePhotos.employeeId, employees.id))
        .where(eq(employees.tenantId, ctx.tenantId))
        .orderBy(asc(employees.personnelNumber));
      return rows.map((r) => ({
        id: r.id,
        personnelNumber: r.personnelNumber,
        displayName: r.displayName,
        hasPhoto: r.photoId !== null,
      }));
    });
  }

  private tx<T>(fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0], tenantId: string) => Promise<T>): Promise<T> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return fn(tx, ctx.tenantId);
    });
  }

  private async requireEmployee(tx: Parameters<Parameters<Database['transaction']>[0]>[0], tenantId: string, employeeId: string): Promise<void> {
    const rows = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)));
    if (!rows[0]) throw new NotFoundException('Mitarbeitender nicht gefunden.');
  }

  /** Setzt/ersetzt das Anzeigefoto eines Mitarbeitenden (RLS, Audit). */
  async setPhoto(employeeId: string, contentType: string, data: Buffer): Promise<void> {
    const ctx = this.tenantContext.require();
    await this.tx(async (tx, tenantId) => {
      await this.requireEmployee(tx, tenantId, employeeId);
      await tx
        .insert(employeePhotos)
        .values({ employeeId, tenantId, contentType, data, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: employeePhotos.employeeId,
          set: { contentType, data, updatedAt: new Date() },
        });
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'employee.photo.set',
      actorId: ctx.userId,
      subjectType: 'employee',
      subjectId: employeeId,
      payload: { contentType, bytes: data.length },
    });
  }

  /** Anzeigefoto eines Mitarbeitenden (RLS-mandantenscharf). */
  async getPhoto(employeeId: string): Promise<{ contentType: string; data: Buffer } | null> {
    return this.tx(async (tx, tenantId) => {
      const rows = await tx
        .select({ contentType: employeePhotos.contentType, data: employeePhotos.data })
        .from(employeePhotos)
        .where(and(eq(employeePhotos.tenantId, tenantId), eq(employeePhotos.employeeId, employeeId)));
      const row = rows[0];
      return row ? { contentType: row.contentType, data: row.data } : null;
    });
  }

  /** Entfernt das Anzeigefoto eines Mitarbeitenden (RLS, Audit). */
  async deletePhoto(employeeId: string): Promise<void> {
    const ctx = this.tenantContext.require();
    await this.tx(async (tx, tenantId) => {
      await tx
        .delete(employeePhotos)
        .where(and(eq(employeePhotos.tenantId, tenantId), eq(employeePhotos.employeeId, employeeId)));
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'employee.photo.delete',
      actorId: ctx.userId,
      subjectType: 'employee',
      subjectId: employeeId,
      payload: {},
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
