import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type StampEvent, StampTransitionError, foldShifts, trimLeadingWindowCut } from '@zeitvault/domain';
import type { CreateCorrectionRequest } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type StampCorrectionRequestRow, type StampEventRow, stampCorrectionRequests, stampEvents } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { loadEmployeeEventWindow } from '../stamping/event-window';

/** Schicht-Kontextfenster wie im StampingService (ADR-0017, K-02/K-03). */
const EVENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Nacherfassungsgrenze (A-03): aeltere Nachtraege werden als late_entry markiert. */
const LATE_ENTRY_MS = 24 * 60 * 60 * 1000;

function toStampEvent(row: StampEventRow): StampEvent {
  return {
    id: row.id,
    kind: row.kind,
    at: row.occurredAt,
    workKind: row.workKind,
    correctsId: row.correctsEventId,
    // Korrekturweg-Herkunft (auch Nachtraege ohne correctsId): unterscheidet
    // 'closed' von 'closed_by_correction' (ADR-0019).
    viaCorrection: row.correctsEventId !== null || row.correctionReason !== null,
  };
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
          // Bei einer KORREKTUR wird das Ziel-Ereignis per id geladen: seine
          // Existenz, die Zugehoerigkeit zum Antrags-Mitarbeitenden und sein
          // Zeitpunkt sind Validierungsgrundlage - nicht das Fenster um den
          // vorgeschlagenen Zeitpunkt (das Ziel kann > 48 h entfernt liegen).
          let target: StampEventRow | null = null;
          if (req.kind === 'correct') {
            if (!req.targetEventId) {
              throw new BadRequestException('Korrektur-Antrag ohne targetEventId.');
            }
            const targetRows = await tx
              .select()
              .from(stampEvents)
              .where(
                and(eq(stampEvents.tenantId, ctx.tenantId), eq(stampEvents.id, req.targetEventId)),
              );
            target = targetRows[0] ?? null;
            if (!target) {
              throw new NotFoundException('Zu korrigierende Stempelung nicht gefunden.');
            }
            if (target.employeeId !== req.employeeId) {
              throw new BadRequestException(
                'Ziel-Stempelung gehört nicht zum Mitarbeitenden des Antrags.',
              );
            }
          }
          // Fenster deckt Original UND vorgeschlagenen Zeitpunkt ab (wie
          // correctStamp); die Umgebung des Originals wird also mitvalidiert,
          // auch wenn die Korrektur den Stempel weit verschiebt.
          const anchors = [
            req.proposedOccurredAt.getTime(),
            ...(target ? [target.occurredAt.getTime()] : []),
          ];
          const existing = await loadEmployeeEventWindow(
            tx,
            ctx.tenantId,
            req.employeeId,
            new Date(Math.min(...anchors) - EVENT_WINDOW_MS),
            new Date(Math.max(...anchors) + EVENT_WINDOW_MS),
          );
          const corrective: StampEvent = {
            kind: req.proposedKind,
            at: req.proposedOccurredAt,
            correctsId: target?.id,
            // C-09: Bewertungsart der Schicht bleibt bei Korrekturen erhalten.
            ...(target ? { workKind: target.workKind } : {}),
          };
          // Wirft StampTransitionError bei ungueltiger SCHICHTFOLGE -> 409
          // (Schichten duerfen Mitternacht ueberschreiten, K-02/K-03);
          // Fenster-Beschnitt am Rand wird toleriert.
          foldShifts([...trimLeadingWindowCut(existing.map(toStampEvent)), corrective]);
          // A-03: genehmigter Nachtrag/Korrektur > 24 h nach dem Zeitpunkt ist
          // eine Nacherfassung; die Antrags-Begruendung ist der Pflichtgrund.
          const isLate = Date.now() - req.proposedOccurredAt.getTime() > LATE_ENTRY_MS;
          // Einsatzort-Uebersteuerung des Ziel-Stempels vererben (ADR-0016).
          const targetLocation = target?.workLocationId ?? null;
          const insertedStamp = await tx
            .insert(stampEvents)
            .values({
              tenantId: ctx.tenantId,
              employeeId: req.employeeId,
              kind: req.proposedKind,
              occurredAt: req.proposedOccurredAt,
              source: 'web',
              correctsEventId: target?.id ?? null,
              correctionReason: req.reason,
              workLocationId: targetLocation,
              workKind: target?.workKind ?? 'full_work',
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
        payload: {
          fromRequest: id,
          reason: updated.reason,
          kind: updated.proposedKind,
          occurredAt: updated.proposedOccurredAt.toISOString(),
          ...(updated.targetEventId ? { correctsEventId: updated.targetEventId } : {}),
        },
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
