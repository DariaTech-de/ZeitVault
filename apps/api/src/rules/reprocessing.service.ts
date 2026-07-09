import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  type StampEvent,
  StampTransitionError,
  buildAccountingDays,
} from '@zeitvault/domain';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type ReprocessingRunRow,
  type RuleSetRow,
  type StampEventRow,
  reprocessingRuns,
  stampEvents,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { closeOverCorrections, stampCorrectorFetcher } from '../stamping/event-window';
import { WorkLocationService } from '../work-location/work-location.service';
import { RuleResolutionService } from './rule-resolution.service';

/** Kontext-Vorlauf wie in Report/Export (Schichten ueber Mitternacht, ADR-0018). */
const RANGE_PAD_MS = 48 * 60 * 60 * 1000;

function toStampEvent(row: StampEventRow): StampEvent {
  return {
    id: row.id,
    kind: row.kind,
    at: row.occurredAt,
    workKind: row.workKind,
    correctsId: row.correctsEventId,
    viaCorrection: row.correctsEventId !== null || row.correctionReason !== null,
  };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reprocessing-Geruest (B-10): Ein rueckwirkend angelegter oder deaktivierter
 * Regelsatz ("Tarifabschluss im Juni gilt ab Januar") loest eine Neubewertung
 * aller betroffenen Abrechnungstage aus. Der Lauf wird als
 * `reprocessing_runs`-Zeile MIT Ergebnis-Zusammenfassung protokolliert und
 * auditiert (G-01). Die DIFFERENZ-ErzEUGUNG gegenueber dem vorherigen Stand
 * (F-04) folgt mit dem Periodenmodell in Schnitt 5 - erst dort gibt es einen
 * eingefrorenen Vergleichsstand.
 */
@Injectable()
export class ReprocessingService {
  private readonly logger = new Logger(ReprocessingService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
    private readonly rules: RuleResolutionService,
    private readonly workLocations: WorkLocationService,
  ) {}

  /**
   * Neubewertung nach Regelsatz-Aenderung: betroffener Zeitraum ist die
   * Gueltigkeit des Satzes, gekappt auf heute. Wirkt der Satz erst in der
   * Zukunft, gibt es nichts neu zu bewerten (null).
   */
  async runForRuleSet(ruleSet: RuleSetRow): Promise<ReprocessingRunRow | null> {
    const today = isoToday();
    if (ruleSet.validFrom > today) return null;
    const to = ruleSet.validTo && ruleSet.validTo < today ? ruleSet.validTo : today;
    return this.run('rule_set_change', ruleSet.validFrom, to, {
      ruleSetId: ruleSet.id,
      onlyEmployeeId: ruleSet.employeeId ?? undefined,
    });
  }

  /** Bewertet [from, to] neu und protokolliert den Lauf. */
  async run(
    triggerKind: 'rule_set_change' | 'manual',
    from: string,
    to: string,
    opts: { ruleSetId?: string; onlyEmployeeId?: string } = {},
  ): Promise<ReprocessingRunRow> {
    const ctx = this.tenantContext.require();
    const start = new Date(new Date(`${from}T00:00:00.000Z`).getTime() - RANGE_PAD_MS);
    const endExclusive = new Date(
      new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 + RANGE_PAD_MS,
    );

    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const base = await tx
        .select()
        .from(stampEvents)
        .where(
          and(
            eq(stampEvents.tenantId, ctx.tenantId),
            ...(opts.onlyEmployeeId ? [eq(stampEvents.employeeId, opts.onlyEmployeeId)] : []),
            gte(stampEvents.occurredAt, start),
            lt(stampEvents.occurredAt, endExclusive),
          ),
        )
        .orderBy(asc(stampEvents.employeeId), asc(stampEvents.occurredAt));
      return closeOverCorrections(base, stampCorrectorFetcher(tx, ctx.tenantId));
    });

    const byEmployee = new Map<string, StampEvent[]>();
    for (const row of rows) {
      const bucket = byEmployee.get(row.employeeId) ?? [];
      bucket.push(toStampEvent(row));
      byEmployee.set(row.employeeId, bucket);
    }

    // Historische Zeitraeume deterministisch: Materialisierung zum
    // Zeitraumende bzw. "jetzt" (das Fruehere) - wie Report/Export.
    const rangeEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + RANGE_PAD_MS);
    const now = new Date();
    const materializeAt = now.getTime() < rangeEnd.getTime() ? now : rangeEnd;

    const activeRuleSets = await this.rules.loadActiveRuleSets();
    const memberships = await this.rules.loadGroupMemberships();
    const birthDates = await this.rules.loadBirthDates();
    let employeesEvaluated = 0;
    let daysEvaluated = 0;
    let findings = 0;
    let violations = 0;
    let unresolvedShifts = 0;
    let skippedEmployees = 0;
    let status: 'completed' | 'failed' = 'completed';

    for (const [employeeId, events] of byEmployee) {
      try {
        const tz = (await this.workLocations.resolve(employeeId, from)).timeZone;
        const packageFor = this.rules.buildResolver(
          this.rules.sourcesFor(activeRuleSets, employeeId, memberships),
          birthDates.get(employeeId) ?? null,
        );
        const days = buildAccountingDays(events, tz, packageFor, materializeAt).filter(
          (d) => d.date >= from && d.date <= to,
        );
        employeesEvaluated += 1;
        for (const day of days) {
          daysEvaluated += 1;
          findings += day.findings.length;
          violations += day.findings.filter((f) => f.severity === 'violation').length;
          unresolvedShifts += day.findings.filter((f) => f.code === 'SHIFT_UNRESOLVED').length;
        }
      } catch (err) {
        // Inkonsistente Altdaten eines Mitarbeitenden brechen den Lauf nicht
        // ab; sie werden gezaehlt und sind im Protokoll sichtbar.
        if (err instanceof StampTransitionError) {
          skippedEmployees += 1;
          this.logger.warn(`Reprocessing: inkonsistente Stempelfolge fuer ${employeeId}: ${err.message}`);
          continue;
        }
        status = 'failed';
        throw err;
      }
    }

    const summary = {
      employeesEvaluated,
      daysEvaluated,
      findings,
      violations,
      unresolvedShifts,
      skippedEmployees,
    };
    const run = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(reprocessingRuns)
        .values({
          tenantId: ctx.tenantId,
          triggerKind,
          ruleSetId: opts.ruleSetId ?? null,
          fromDate: from,
          toDate: to,
          status,
          summary,
          finishedAt: new Date(),
        })
        .returning();
      return inserted[0];
    });
    if (!run) throw new Error('Reprocessing-Lauf konnte nicht protokolliert werden.');

    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'rules.reprocessing_run',
      actorId: ctx.userId,
      subjectType: 'reprocessing_run',
      subjectId: run.id,
      payload: {
        triggerKind,
        from,
        to,
        ...(opts.ruleSetId ? { ruleSetId: opts.ruleSetId } : {}),
        ...summary,
      },
    });
    return run;
  }

  async listRuns(): Promise<ReprocessingRunRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(reprocessingRuns)
        .where(eq(reprocessingRuns.tenantId, ctx.tenantId))
        .orderBy(desc(reprocessingRuns.createdAt));
    });
  }
}
