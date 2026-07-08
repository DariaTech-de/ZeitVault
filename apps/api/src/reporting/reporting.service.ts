import { Inject, Injectable } from '@nestjs/common';
import { type SQL, and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  ARBZG_2026_V1,
  type AccountBalance,
  type Finding,
  type StampEvent,
  buildAccountingDays,
  computeBalances,
} from '@zeitvault/domain';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type AccountTransactionRow,
  type StampEventRow,
  accountTransactions,
  employees,
  stampEvents,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { closeOverCorrections, stampCorrectorFetcher } from '../stamping/event-window';
import { WorkLocationService } from '../work-location/work-location.service';

function toStampEvent(row: StampEventRow): StampEvent {
  return {
    id: row.id,
    kind: row.kind,
    at: row.occurredAt,
    correctsId: row.correctsEventId,
    // Korrekturweg-Herkunft (auch Nachtraege ohne correctsId): unterscheidet
    // 'closed' von 'closed_by_correction' (ADR-0019).
    viaCorrection: row.correctsEventId !== null || row.correctionReason !== null,
  };
}

/**
 * Kontext-Erweiterung des Ladefensters (ADR-0018): Schichten, die vor `from`
 * beginnen und in den Zeitraum hineinragen (bzw. am `to`-Tag beginnen und
 * danach enden), muessen vollstaendig geladen werden. 48 h decken jede Schicht
 * samt Zeitzonen-Versatz ab.
 */
const RANGE_PAD_MS = 48 * 60 * 60 * 1000;

/** Ladefenster [from, to] (lokale Kalendertage) mit Kontext-Vor-/Nachlauf. */
function rangeWhere(column: typeof stampEvents.occurredAt, from: string, to: string): SQL {
  const start = new Date(new Date(`${from}T00:00:00.000Z`).getTime() - RANGE_PAD_MS);
  const endExclusive = new Date(
    new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 + RANGE_PAD_MS,
  );
  return and(gte(column, start), lt(column, endExclusive)) as SQL;
}

export interface TimesheetDay {
  date: string;
  workedMinutes: number;
  breakMinutes: number;
  findings: Finding[];
}

export interface Timesheet {
  employeeId: string;
  from: string;
  to: string;
  days: TimesheetDay[];
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
}

export interface ViolationEntry {
  employeeId: string;
  displayName: string;
  date: string;
  findings: Finding[];
}

export interface BalanceListEntry {
  employeeId: string;
  displayName: string;
  balances: AccountBalance[];
}

@Injectable()
export class ReportingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly workLocations: WorkLocationService,
  ) {}

  /** Stundenzettel: je Tag gearbeitete/pausierte Minuten und ArbZG-Befunde. */
  async timesheet(employeeId: string, from: string, to: string): Promise<Timesheet> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const base = await tx
        .select()
        .from(stampEvents)
        .where(
          and(
            eq(stampEvents.tenantId, ctx.tenantId),
            eq(stampEvents.employeeId, employeeId),
            rangeWhere(stampEvents.occurredAt, from, to),
          ),
        )
        .orderBy(asc(stampEvents.occurredAt));
      // Korrektur-Abschluss: eine Korrektur ausserhalb des Fensters darf ihr
      // Original hier nicht wieder wirksam werden lassen (Doppelzaehlung).
      return closeOverCorrections(base, stampCorrectorFetcher(tx, ctx.tenantId, employeeId));
    });

    const days = await this.aggregateDays(employeeId, rows, from, to);
    return {
      employeeId,
      from,
      to,
      days,
      totalWorkedMinutes: days.reduce((s, d) => s + d.workedMinutes, 0),
      totalBreakMinutes: days.reduce((s, d) => s + d.breakMinutes, 0),
    };
  }

  /** Verstoßreport: alle Tage mit ArbZG-Befunden je Mitarbeitenden im Zeitraum. */
  async violations(from: string, to: string): Promise<ViolationEntry[]> {
    const ctx = this.tenantContext.require();
    const { rows, names } = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const base = await tx
        .select()
        .from(stampEvents)
        .where(and(eq(stampEvents.tenantId, ctx.tenantId), rangeWhere(stampEvents.occurredAt, from, to)))
        .orderBy(asc(stampEvents.occurredAt));
      // Korrektur-Abschluss (mandantenweit, siehe timesheet()).
      const stamps = await closeOverCorrections(base, stampCorrectorFetcher(tx, ctx.tenantId));
      const emps = await tx
        .select()
        .from(employees)
        .where(eq(employees.tenantId, ctx.tenantId));
      return { rows: stamps, names: new Map(emps.map((e) => [e.id, e.displayName])) };
    });

    const byEmployee = new Map<string, StampEventRow[]>();
    for (const row of rows) {
      const bucket = byEmployee.get(row.employeeId) ?? [];
      bucket.push(row);
      byEmployee.set(row.employeeId, bucket);
    }

    const entries: ViolationEntry[] = [];
    for (const [employeeId, empRows] of byEmployee) {
      const displayName = names.get(employeeId);
      // Nur reale Mitarbeitende: Stempel ohne zugehoerigen Mitarbeiterdatensatz
      // (z. B. Import-/Testartefakte) gehoeren nicht in den Verstoszreport und
      // wuerden sonst als rohe UUID erscheinen.
      if (!displayName) continue;
      for (const day of await this.aggregateDays(employeeId, empRows, from, to)) {
        if (day.findings.length > 0) {
          entries.push({ employeeId, displayName, date: day.date, findings: day.findings });
        }
      }
    }
    return entries.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  }

  /** Saldenliste: Kontosalden aller Mitarbeitenden des Mandanten. */
  async balanceList(): Promise<BalanceListEntry[]> {
    const ctx = this.tenantContext.require();
    const { emps, txns } = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const employeeRows = await tx
        .select()
        .from(employees)
        .where(eq(employees.tenantId, ctx.tenantId))
        .orderBy(asc(employees.displayName));
      const transactionRows = await tx
        .select()
        .from(accountTransactions)
        .where(eq(accountTransactions.tenantId, ctx.tenantId));
      return { emps: employeeRows, txns: transactionRows };
    });

    const byEmployee = new Map<string, AccountTransactionRow[]>();
    for (const t of txns) {
      const bucket = byEmployee.get(t.employeeId) ?? [];
      bucket.push(t);
      byEmployee.set(t.employeeId, bucket);
    }

    return emps.map((e) => ({
      employeeId: e.id,
      displayName: e.displayName,
      balances: computeBalances(
        (byEmployee.get(e.id) ?? []).map((t) => ({
          account: t.account,
          amount: t.amount,
          effectiveDate: t.effectiveDate,
          reason: t.reason ?? undefined,
        })),
      ),
    }));
  }

  /**
   * Bewertet die Schichten je ABRECHNUNGSTAG (lokaler Tag des Schichtbeginns
   * in der Einsatzort-Zeitzone, ADR-0018) und liefert nur Tage im Zeitraum
   * [from, to]. Nachtschichten bleiben ganze Schichten (K-02/K-03); die
   * Ruhezeit verkettet schichtuebergreifend. Offene Segmente werden zum
   * Zeitraumende bzw. "jetzt" geschlossen (das Fruehere von beiden), damit
   * historische Zeitraeume deterministisch bleiben.
   */
  private async aggregateDays(
    employeeId: string,
    rows: StampEventRow[],
    from: string,
    to: string,
  ): Promise<TimesheetDay[]> {
    // Einsatzort-Zeitzone je Mitarbeitendem (Aufloesung zum Zeitraumbeginn;
    // unterjaehrige Zuordnungswechsel innerhalb des Zeitraums: Schnitt 4).
    const resolved = await this.workLocations.resolve(employeeId, from);
    const rangeEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 48 * 60 * 60 * 1000);
    const now = new Date();
    const materializeAt = now.getTime() < rangeEnd.getTime() ? now : rangeEnd;

    return buildAccountingDays(
      rows.map(toStampEvent),
      resolved.timeZone,
      ARBZG_2026_V1,
      materializeAt,
    )
      .filter((day) => day.date >= from && day.date <= to)
      .map((day) => ({
        date: day.date,
        workedMinutes: day.workedMinutes,
        breakMinutes: day.breakMinutes,
        findings: day.findings,
      }));
  }
}
