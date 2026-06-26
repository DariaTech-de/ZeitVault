import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type SQL, and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  ARBZG_2026_V1,
  type Finding,
  type StampEvent,
  type StampKind,
  StampTransitionError,
  computeStampStatus,
  evaluateStampDay,
  foldStampDay,
  resolveEffectiveEvents,
  type StampStatus,
} from '@zeitvault/domain';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type StampEventRow, stampEvents } from '../db/schema';
import { DB, type Database } from '../db/tokens';

const STAMP_AUDIT_ACTION = {
  clock_in: 'time.clock_in',
  break_start: 'time.break_start',
  break_end: 'time.break_end',
  clock_out: 'time.clock_out',
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayWhere(tenantId: string, employeeId: string, date: Date): SQL | undefined {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const endExclusive = new Date(start.getTime() + DAY_MS);
  return and(
    eq(stampEvents.tenantId, tenantId),
    eq(stampEvents.employeeId, employeeId),
    gte(stampEvents.occurredAt, start),
    lt(stampEvents.occurredAt, endExclusive),
  );
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toStampEvent(row: StampEventRow): StampEvent {
  return { id: row.id, kind: row.kind, at: row.occurredAt, correctsId: row.correctsEventId };
}

export interface StampResult {
  event: StampEventRow;
  status: StampStatus;
  findings: Finding[];
}

export interface DayEvent {
  id: string;
  kind: StampKind;
  occurredAt: string;
  correctsEventId: string | null;
  correctionReason: string | null;
}

export interface DayListing {
  events: DayEvent[];
  status: StampStatus;
  findings: Finding[];
}

@Injectable()
export class StampingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  /** Verarbeitet eine Stempelung (validiert den Statuswechsel inkl. Korrekturen). */
  async stamp(input: {
    employeeId: string;
    kind: StampKind;
    source: 'web' | 'mobile' | 'terminal';
    occurredAt?: string;
  }): Promise<StampResult> {
    const ctx = this.tenantContext.require();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    let result: { row: StampEventRow | undefined; events: StampEvent[] };
    try {
      result = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        const rows = await tx
          .select()
          .from(stampEvents)
          .where(dayWhere(ctx.tenantId, input.employeeId, occurredAt))
          .orderBy(asc(stampEvents.occurredAt));
        const candidate: StampEvent[] = [
          ...rows.map(toStampEvent),
          { kind: input.kind, at: occurredAt },
        ];
        // Validiert den Statuswechsel auf den WIRKSAMEN Ereignissen.
        foldStampDay(resolveEffectiveEvents(candidate));
        const inserted = await tx
          .insert(stampEvents)
          .values({
            tenantId: ctx.tenantId,
            employeeId: input.employeeId,
            kind: input.kind,
            occurredAt,
            source: input.source,
          })
          .returning();
        return { row: inserted[0], events: candidate };
      });
    } catch (err) {
      if (err instanceof StampTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    const row = result.row;
    if (!row) {
      throw new Error('Stempelung konnte nicht gespeichert werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: STAMP_AUDIT_ACTION[input.kind],
      actorId: ctx.userId,
      subjectType: 'stamp_event',
      subjectId: row.id,
      payload: { kind: input.kind },
    });

    const now = new Date();
    return {
      event: row,
      status: computeStampStatus(result.events, now),
      findings: evaluateStampDay(result.events, ARBZG_2026_V1, now, { date: isoDate(occurredAt) }),
    };
  }

  /**
   * Korrigiert eine Stempelung: legt ein neues, ueberschreibendes Ereignis mit
   * korrigiertem Zeitpunkt und Pflicht-Begruendung an (append-only). Der
   * Vorgaenger bleibt erhalten (Kern-Invariante 1).
   */
  async correctStamp(input: {
    eventId: string;
    occurredAt: string;
    correctionReason: string;
  }): Promise<StampResult> {
    const ctx = this.tenantContext.require();
    const correctedAt = new Date(input.occurredAt);

    let result: { row: StampEventRow | undefined; events: StampEvent[] };
    try {
      result = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        const targetRows = await tx
          .select()
          .from(stampEvents)
          .where(and(eq(stampEvents.tenantId, ctx.tenantId), eq(stampEvents.id, input.eventId)));
        const target = targetRows[0];
        if (!target) {
          throw new NotFoundException('Zu korrigierende Stempelung nicht gefunden.');
        }
        const existing = await tx
          .select()
          .from(stampEvents)
          .where(dayWhere(ctx.tenantId, target.employeeId, target.occurredAt))
          .orderBy(asc(stampEvents.occurredAt));
        const corrective: StampEvent = { kind: target.kind, at: correctedAt, correctsId: target.id };
        // Pruefen, dass die korrigierte Tagesfolge gueltig bleibt.
        foldStampDay(resolveEffectiveEvents([...existing.map(toStampEvent), corrective]));
        const inserted = await tx
          .insert(stampEvents)
          .values({
            tenantId: ctx.tenantId,
            employeeId: target.employeeId,
            kind: target.kind,
            occurredAt: correctedAt,
            source: target.source,
            correctsEventId: target.id,
            correctionReason: input.correctionReason,
          })
          .returning();
        const insertedRow = inserted[0];
        const events = [
          ...existing.map(toStampEvent),
          ...(insertedRow ? [toStampEvent(insertedRow)] : []),
        ];
        return { row: insertedRow, events };
      });
    } catch (err) {
      if (err instanceof StampTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    const row = result.row;
    if (!row) {
      throw new Error('Korrektur konnte nicht gespeichert werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'time.correct',
      actorId: ctx.userId,
      subjectType: 'stamp_event',
      subjectId: row.id,
      payload: { correctsEventId: input.eventId, reason: input.correctionReason },
    });

    const now = new Date();
    return {
      event: row,
      status: computeStampStatus(result.events, now),
      findings: evaluateStampDay(result.events, ARBZG_2026_V1, now, { date: isoDate(correctedAt) }),
    };
  }

  /** Aktueller Tagesstatus und Live-Bewertung fuer einen Mitarbeitenden. */
  async today(
    employeeId: string,
    now: Date = new Date(),
  ): Promise<{ status: StampStatus; findings: Finding[] }> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(stampEvents)
        .where(dayWhere(ctx.tenantId, employeeId, now))
        .orderBy(asc(stampEvents.occurredAt));
    });
    const events = rows.map(toStampEvent);
    return {
      status: computeStampStatus(events, now),
      findings: evaluateStampDay(events, ARBZG_2026_V1, now, { date: isoDate(now) }),
    };
  }

  /** Listet die Roh-Ereignisse eines Tages (inkl. Korrekturen) plus Status/Befunde. */
  async listDay(employeeId: string, now: Date = new Date()): Promise<DayListing> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(stampEvents)
        .where(dayWhere(ctx.tenantId, employeeId, now))
        .orderBy(asc(stampEvents.occurredAt));
    });
    const events = rows.map(toStampEvent);
    return {
      events: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        occurredAt: r.occurredAt.toISOString(),
        correctsEventId: r.correctsEventId,
        correctionReason: r.correctionReason,
      })),
      status: computeStampStatus(events, now),
      findings: evaluateStampDay(events, ARBZG_2026_V1, now, { date: isoDate(now) }),
    };
  }
}
