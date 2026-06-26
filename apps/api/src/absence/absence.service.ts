import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  type AbsenceAction,
  AbsenceTransitionError,
  absenceAuditAction,
  nextAbsenceStatus,
} from '@zeitvault/domain';
import type { CreateAbsenceRequest } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type AbsenceRequestRow, absenceRequests } from '../db/schema';
import { DB, type Database } from '../db/tokens';

@Injectable()
export class AbsenceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  /** Legt einen Abwesenheitsantrag an (Status 'requested') und protokolliert ihn. */
  async createRequest(input: CreateAbsenceRequest): Promise<AbsenceRequestRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(absenceRequests)
        .values({
          tenantId: ctx.tenantId,
          employeeId: input.employeeId,
          type: input.type,
          fromDate: input.from,
          toDate: input.to,
          reason: input.reason ?? null,
        })
        .returning();
      return inserted[0];
    });
    if (!row) {
      throw new Error('Abwesenheitsantrag konnte nicht gespeichert werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'absence.request',
      actorId: ctx.userId,
      subjectType: 'absence_request',
      subjectId: row.id,
      payload: { type: row.type, from: row.fromDate, to: row.toDate },
    });
    return row;
  }

  /**
   * Fuehrt einen Statuswechsel durch (approve/reject/cancel). Der zulaessige
   * Uebergang wird ueber die deklarative Zustandsmaschine (Domain) geprueft; jeder
   * Schritt erzeugt ein AuditEvent (Kern-Invariante 2).
   */
  async decide(input: {
    id: string;
    action: AbsenceAction;
    note?: string;
  }): Promise<AbsenceRequestRow> {
    const ctx = this.tenantContext.require();

    let row: AbsenceRequestRow | undefined;
    try {
      row = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        const current = await tx
          .select()
          .from(absenceRequests)
          .where(and(eq(absenceRequests.tenantId, ctx.tenantId), eq(absenceRequests.id, input.id)));
        const target = current[0];
        if (!target) {
          throw new NotFoundException('Abwesenheitsantrag nicht gefunden.');
        }
        // Mitarbeitende duerfen nur eigene Antraege stornieren (RBAC ergaenzt dies
        // fuer approve/reject auf Controller-Ebene).
        if (input.action === 'cancel' && !this.canManage(ctx.roles) && target.employeeId !== ctx.userId) {
          throw new ForbiddenException('Stornierung nur fuer eigene Antraege zulaessig.');
        }
        const status = nextAbsenceStatus(target.status, input.action);
        const updated = await tx
          .update(absenceRequests)
          .set({
            status,
            approverId: ctx.userId,
            decidedAt: sql`now()`,
          })
          .where(and(eq(absenceRequests.tenantId, ctx.tenantId), eq(absenceRequests.id, input.id)))
          .returning();
        return updated[0];
      });
    } catch (err) {
      if (err instanceof AbsenceTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    if (!row) {
      throw new Error('Abwesenheitsantrag konnte nicht aktualisiert werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: absenceAuditAction(input.action),
      actorId: ctx.userId,
      subjectType: 'absence_request',
      subjectId: row.id,
      payload: { status: row.status, ...(input.note ? { note: input.note } : {}) },
    });
    return row;
  }

  /** Listet Abwesenheitsantraege des Mandanten (optional je Mitarbeitenden). */
  async list(employeeId?: string): Promise<AbsenceRequestRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const where = employeeId
        ? and(eq(absenceRequests.tenantId, ctx.tenantId), eq(absenceRequests.employeeId, employeeId))
        : eq(absenceRequests.tenantId, ctx.tenantId);
      return tx
        .select()
        .from(absenceRequests)
        .where(where)
        .orderBy(asc(absenceRequests.fromDate));
    });
  }

  private canManage(roles: string[]): boolean {
    return roles.includes('manager') || roles.includes('admin');
  }
}
