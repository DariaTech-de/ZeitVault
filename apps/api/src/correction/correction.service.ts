import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type SQL, and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { type StampEvent, StampTransitionError, foldShifts } from '@zeitvault/domain';
import type { CreateCorrectionRequest } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type StampCorrectionRequestRow, type StampEventRow, stampCorrectionRequests, stampEvents } from '../db/schema';
import { DB, type Database } from '../db/tokens';

/** Schicht-Kontextfenster wie im StampingService (ADR-0017, K-02/K-03). */
const EVENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Nacherfassungsgrenze (A-03): aeltere Nachtraege werden als late_entry markiert. */
const LATE_ENTRY_MS = 24 * 60 * 60 * 1000;

function windowWhere(tenantId: string, employeeId: string, around: Date): SQL {
  const from = new Date(around.getTime() - EVENT_WINDOW_MS);
  const to = new Date(around.getTime() + EVENT_WINDOW_MS);
  return and(
    eq(stampEvents.tenantId, tenantId),
    eq(stampEvents.employeeId, employeeId),
    gte(stampEvents.occurredAt, from),
    lte(stampEvents.occurredAt, to),
  ) as SQL;
}

function toStampEvent(row: StampEventRow): StampEvent {
  return { id: row.id, kind: row.kind, at: row.occurredAt, correctsId: row.correctsEventId };
}

@Injectable()
export class CorrectionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  /** Mitarbeitender stellt einen Anpassungsantrag (ändert noch nichts an den Stempeln). */
  async request(input: CreateCorrectionRequest): Promise<StampCorrectionRequestRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(stampCorrectionRequests)
        .values({
          tenantId: ctx.tenantId,
          employeeId: input.employeeId,
          kind: input.kind,
          targetEventId: input.targetEventId ?? null,
          proposedKind: input.proposedKind,
          proposedOccurredAt: new Date(input.proposedOccurredAt),
          reason: input.reason,
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Anpassungsantrag konnte nicht gespeichert werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'time.correction_request',
      actorId: ctx.userId,
      subjectType: 'correction_request',
      subjectId: row.id,
      payload: { kind: row.kind, proposedKind: row.proposedKind, at: row.proposedOccurredAt.toISOString() },
    });
    return row;
  }

  /**
   * Freigabe/Ablehnung durch Vorgesetzte. Freigabe erzeugt den append-only
   * Stempel (Nachtrag oder Korrektur) nach Validierung der Tagesfolge; der
   * Vorgänger bleibt erhalten (Kern-Invariante 1). Ablehnung ändert nichts.
   */
  async decide(id: string, action: 'approve' | 'reject', note?: string): Promise<StampCorrectionRequestRow> {
    const ctx = this.tenantContext.require();

    let updated: StampCorrectionRequestRow | undefined;
    let appliedEventId: string | null = null;
    try {
      const result = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        const found = await tx
          .select()
          .from(stampCorrectionRequests)
          .where(and(eq(stampCorrectionRequests.tenantId, ctx.tenantId), eq(stampCorrectionRequests.id, id)));
        const req = found[0];
        if (!req) throw new NotFoundException('Anpassungsantrag nicht gefunden.');
        if (req.status !== 'requested') {
          throw new ConflictException(`Antrag ist bereits '${req.status}'.`);
        }

        let applied: string | null = null;
        if (action === 'approve') {
          const existing = await tx
            .select()
            .from(stampEvents)
            .where(windowWhere(ctx.tenantId, req.employeeId, req.proposedOccurredAt))
            .orderBy(asc(stampEvents.occurredAt));
          const corrective: StampEvent = {
            kind: req.proposedKind,
            at: req.proposedOccurredAt,
            correctsId: req.kind === 'correct' ? req.targetEventId ?? undefined : undefined,
          };
          // Wirft StampTransitionError bei ungueltiger SCHICHTFOLGE -> 409
          // (Schichten duerfen Mitternacht ueberschreiten, K-02/K-03).
          foldShifts([...existing.map(toStampEvent), corrective]);
          // A-03: genehmigter Nachtrag/Korrektur > 24 h nach dem Zeitpunkt ist
          // eine Nacherfassung; die Antrags-Begruendung ist der Pflichtgrund.
          const isLate = Date.now() - req.proposedOccurredAt.getTime() > LATE_ENTRY_MS;
          // Einsatzort-Uebersteuerung des Ziel-Stempels vererben (ADR-0016).
          const targetLocation =
            req.kind === 'correct' && req.targetEventId
              ? (existing.find((e) => e.id === req.targetEventId)?.workLocationId ?? null)
              : null;
          const insertedStamp = await tx
            .insert(stampEvents)
            .values({
              tenantId: ctx.tenantId,
              employeeId: req.employeeId,
              kind: req.proposedKind,
              occurredAt: req.proposedOccurredAt,
              source: 'web',
              correctsEventId: req.kind === 'correct' ? req.targetEventId : null,
              correctionReason: req.reason,
              workLocationId: targetLocation,
              lateEntry: isLate,
              lateReason: isLate ? req.reason : null,
            })
            .returning();
          applied = insertedStamp[0]?.id ?? null;
        }

        const rows = await tx
          .update(stampCorrectionRequests)
          .set({
            status: action === 'approve' ? 'approved' : 'rejected',
            approverId: ctx.userId,
            appliedEventId: applied,
            note: note ?? null,
            decidedAt: new Date(),
          })
          .where(and(eq(stampCorrectionRequests.tenantId, ctx.tenantId), eq(stampCorrectionRequests.id, id)))
          .returning();
        return { row: rows[0], applied };
      });
      updated = result.row;
      appliedEventId = result.applied;
    } catch (err) {
      if (err instanceof StampTransitionError) {
        throw new ConflictException(`Nachtrag ergibt keine gültige Schichtfolge: ${err.message}`);
      }
      throw err;
    }

    if (!updated) throw new Error('Antrag konnte nicht aktualisiert werden.');
    if (action === 'approve' && appliedEventId) {
      await this.audit.append({
        tenantId: ctx.tenantId,
        action: 'time.correct',
        actorId: ctx.userId,
        subjectType: 'stamp_event',
        subjectId: appliedEventId,
        payload: { fromRequest: id, reason: updated.reason },
      });
    } else {
      await this.audit.append({
        tenantId: ctx.tenantId,
        action: 'time.correction_reject',
        actorId: ctx.userId,
        subjectType: 'correction_request',
        subjectId: id,
        payload: { ...(note ? { note } : {}) },
      });
    }
    return updated;
  }

  /** Anträge des Mandanten (optional je Mitarbeitenden). */
  async list(employeeId?: string): Promise<StampCorrectionRequestRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const where = employeeId
        ? and(eq(stampCorrectionRequests.tenantId, ctx.tenantId), eq(stampCorrectionRequests.employeeId, employeeId))
        : eq(stampCorrectionRequests.tenantId, ctx.tenantId);
      return tx.select().from(stampCorrectionRequests).where(where).orderBy(asc(stampCorrectionRequests.createdAt));
    });
  }
}
