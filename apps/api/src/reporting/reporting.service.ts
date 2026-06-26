import { Inject, Injectable } from '@nestjs/common';
import { type SQL, and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  ARBZG_2026_V1,
  type AccountBalance,
  type Finding,
  type StampEvent,
  computeBalances,
  computeStampStatus,
  evaluateStampDay,
  foldStampDay,
  resolveEffectiveEvents,
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

function toStampEvent(row: StampEventRow): StampEvent {
  return { id: row.id, kind: row.kind, at: row.occurredAt, correctsId: row.correctsEventId };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Tagesgrenzen [from, to] (UTC, inklusiv) als Halboffenintervall fuer Queries. */
function rangeWhere(column: typeof stampEvents.occurredAt, from: string, to: string): SQL {
  const start = new Date(`${from}T00:00:00.000Z`);
  const endExclusive = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
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
  ) {}

  /** Stundenzettel: je Tag gearbeitete/pausierte Minuten und ArbZG-Befunde. */
  async timesheet(employeeId: string, from: string, to: string): Promise<Timesheet> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
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
    });

    const days = this.aggregateDays(rows);
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
      const stamps = await tx
        .select()
        .from(stampEvents)
        .where(and(eq(stampEvents.tenantId, ctx.tenantId), rangeWhere(stampEvents.occurredAt, from, to)))
        .orderBy(asc(stampEvents.occurredAt));
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
      for (const day of this.aggregateDays(empRows)) {
        if (day.findings.length > 0) {
          entries.push({
            employeeId,
            displayName: names.get(employeeId) ?? employeeId,
            date: day.date,
            findings: day.findings,
          });
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
   * Gruppiert Rohereignisse nach UTC-Tag und bewertet jeden Tag (gearbeitete/
   * pausierte Minuten, ArbZG-Befunde). Die Ruhezeit wird tagesuebergreifend mit
   * dem Ende der jeweils vorigen Schicht verkettet.
   */
  private aggregateDays(rows: StampEventRow[]): TimesheetDay[] {
    const byDay = new Map<string, StampEventRow[]>();
    for (const row of rows) {
      const day = isoDate(row.occurredAt);
      const bucket = byDay.get(day) ?? [];
      bucket.push(row);
      byDay.set(day, bucket);
    }

    const days: TimesheetDay[] = [];
    let previousShiftEnd: Date | null = null;
    for (const date of [...byDay.keys()].sort()) {
      const events = (byDay.get(date) ?? []).map(toStampEvent);
      // Offene Segmente werden zum Tagesende geschlossen, um historische Tage
      // deterministisch zu bewerten.
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      const status = computeStampStatus(events, endOfDay);
      const findings = evaluateStampDay(events, ARBZG_2026_V1, endOfDay, { date, previousShiftEnd });
      days.push({
        date,
        workedMinutes: status.workedMinutes,
        breakMinutes: status.breakMinutes,
        findings,
      });
      const fold = foldStampDay(resolveEffectiveEvents(events));
      const last = fold.workIntervals.at(-1);
      if (last) previousShiftEnd = last.end;
    }
    return days;
  }
}
