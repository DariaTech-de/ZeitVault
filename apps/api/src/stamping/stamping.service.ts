import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import {
  ARBZG_2026_V1,
  type Finding,
  type StampEvent,
  type StampKind,
  StampTransitionError,
  computeStampStatus,
  evaluateStampDay,
  foldStampDay,
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

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface StampResult {
  event: StampEventRow;
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

  /**
   * Verarbeitet eine Stempelung: validiert den Statuswechsel, fuegt das Ereignis
   * append-only ein, schreibt ein AuditEvent (Kern-Invariante 2) und liefert den
   * aktuellen Status samt Live-ArbZG-Befunden.
   */
  async stamp(input: {
    employeeId: string;
    kind: StampKind;
    source: 'web' | 'mobile' | 'terminal';
    occurredAt?: string;
  }): Promise<StampResult> {
    const ctx = this.tenantContext.require();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    const dayStart = startOfUtcDay(occurredAt);

    let result: { row: StampEventRow | undefined; events: StampEvent[] };
    try {
      result = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        const rows = await tx
          .select()
          .from(stampEvents)
          .where(
            and(
              eq(stampEvents.tenantId, ctx.tenantId),
              eq(stampEvents.employeeId, input.employeeId),
              gte(stampEvents.occurredAt, dayStart),
            ),
          )
          .orderBy(asc(stampEvents.occurredAt));
        const existing: StampEvent[] = rows.map((r) => ({ kind: r.kind, at: r.occurredAt }));
        const candidate: StampEvent[] = [...existing, { kind: input.kind, at: occurredAt }];
        // Validiert den Statuswechsel; wirft StampTransitionError bei Unzulaessigkeit.
        foldStampDay(candidate);
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

  /** Aktueller Tagesstatus und Live-Bewertung fuer einen Mitarbeitenden. */
  async today(
    employeeId: string,
    now: Date = new Date(),
  ): Promise<{ status: StampStatus; findings: Finding[] }> {
    const ctx = this.tenantContext.require();
    const dayStart = startOfUtcDay(now);
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(stampEvents)
        .where(
          and(
            eq(stampEvents.tenantId, ctx.tenantId),
            eq(stampEvents.employeeId, employeeId),
            gte(stampEvents.occurredAt, dayStart),
          ),
        )
        .orderBy(asc(stampEvents.occurredAt));
    });
    const events: StampEvent[] = rows.map((r) => ({ kind: r.kind, at: r.occurredAt }));
    return {
      status: computeStampStatus(events, now),
      findings: evaluateStampDay(events, ARBZG_2026_V1, now, { date: isoDate(now) }),
    };
  }
}
