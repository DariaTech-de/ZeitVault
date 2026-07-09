import { Inject, Injectable } from '@nestjs/common';
import { type SQL, and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  type AccountBalance,
  type Finding,
  type StampEvent,
  averagingWindow,
  buildAccountingDays,
  computeBalances,
  evaluateRestCompensation,
  evaluateSundayHolidayRest,
  evaluateWeeklyWorkTime,
  evaluateWorkingTimeAverage,
  foldShifts,
  isHolidayAtLocation,
  restPeriodsFromShifts,
  trimLeadingWindowCut,
} from '@zeitvault/domain';
import type { Bundesland } from '@zeitvault/domain';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type AccountTransactionRow,
  type StampEventRow,
  accountTransactions,
  employees,
  stampEvents,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { type RulePackageResolver, RuleResolutionService } from '../rules/rule-resolution.service';
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

/** Sonn-/Feiertagsruhe-Report (B-06) je Mitarbeitendem. */
export interface SundayRestEntry {
  employeeId: string;
  displayName: string;
  date: string;
  findings: Finding[];
}

/** Durchschnittspruefung (B-01/B-04) zum Stichtag. */
export interface AveragingEntry {
  employeeId: string;
  displayName: string;
  nightWorker: boolean;
  windowFrom: string;
  windowTo: string;
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
    private readonly rules: RuleResolutionService,
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

    const packageFor = await this.rules.resolverFor(employeeId);
    const days = await this.aggregateDays(employeeId, rows, from, to, packageFor);
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
    const activeRuleSets = await this.rules.loadActiveRuleSets();
    const memberships = await this.rules.loadGroupMemberships();
    const birthDates = await this.rules.loadBirthDates();
    for (const [employeeId, empRows] of byEmployee) {
      const displayName = names.get(employeeId);
      // Nur reale Mitarbeitende: Stempel ohne zugehoerigen Mitarbeiterdatensatz
      // (z. B. Import-/Testartefakte) gehoeren nicht in den Verstoszreport und
      // wuerden sonst als rohe UUID erscheinen.
      if (!displayName) continue;
      const packageFor = this.rules.buildResolver(
        this.rules.sourcesFor(activeRuleSets, employeeId, memberships),
        birthDates.get(employeeId) ?? null,
      );
      for (const day of await this.aggregateDays(employeeId, empRows, from, to, packageFor)) {
        if (day.findings.length > 0) {
          entries.push({ employeeId, displayName, date: day.date, findings: day.findings });
        }
      }
      // B-03 (§ 5 Abs. 2): verkuerzte Ruhezeiten brauchen ihren 12-h-Ausgleich
      // binnen Frist - Warnung vor Fristablauf, Verstoss nach Fristablauf.
      const shifts = foldShifts(trimLeadingWindowCut(empRows.map(toStampEvent)));
      const restFindings = evaluateRestCompensation(
        restPeriodsFromShifts(shifts),
        to,
        packageFor,
        new Date(),
      ).filter((r) => r.date >= from && r.date <= to);
      for (const r of restFindings) {
        entries.push({ employeeId, displayName, date: r.date, findings: [r.finding] });
      }
    }
    return entries.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  }

  /**
   * Sonn-/Feiertagsruhe (B-06, §§ 9-11 ArbZG) fuer ein Kalenderjahr:
   * beschaeftigungsfreie Sonntage, Ersatzruhetag-Fristen mit Warnung VOR
   * Fristablauf. Feiertage einsatzortscharf (Bundesland, C-08).
   */
  async sundayRestReport(year: number): Promise<SundayRestEntry[]> {
    const ctx = this.tenantContext.require();
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const activeRuleSets = await this.rules.loadActiveRuleSets();
    const memberships = await this.rules.loadGroupMemberships();
    const birthDates = await this.rules.loadBirthDates();

    const { rows, names } = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const base = await tx
        .select()
        .from(stampEvents)
        .where(and(eq(stampEvents.tenantId, ctx.tenantId), rangeWhere(stampEvents.occurredAt, from, to)))
        .orderBy(asc(stampEvents.occurredAt));
      const stamps = await closeOverCorrections(base, stampCorrectorFetcher(tx, ctx.tenantId));
      const emps = await tx.select().from(employees).where(eq(employees.tenantId, ctx.tenantId));
      return { rows: stamps, names: new Map(emps.map((e) => [e.id, e.displayName])) };
    });
    const byEmployee = new Map<string, StampEventRow[]>();
    for (const row of rows) {
      const bucket = byEmployee.get(row.employeeId) ?? [];
      bucket.push(row);
      byEmployee.set(row.employeeId, bucket);
    }

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const entries: SundayRestEntry[] = [];
    for (const [employeeId, empRows] of byEmployee) {
      const displayName = names.get(employeeId);
      if (!displayName) continue;
      const resolved = await this.workLocations.resolve(employeeId, from);
      const packageFor = this.rules.buildResolver(
        this.rules.sourcesFor(activeRuleSets, employeeId, memberships),
        birthDates.get(employeeId) ?? null,
      );
      const rangeEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + RANGE_PAD_MS);
      const materializeAt = now.getTime() < rangeEnd.getTime() ? now : rangeEnd;
      const days = buildAccountingDays(
        empRows.map(toStampEvent),
        resolved.timeZone,
        packageFor,
        materializeAt,
      ).filter((d) => d.date >= from && d.date <= to);
      // C-08: Feiertag haengt am EINSATZORT (Bundesland + Gemeinde-Schluessel).
      const land = resolved.countryCode === 'DE' ? (resolved.stateCode as Bundesland | null) : null;
      const isHoliday = (date: string): boolean =>
        isHolidayAtLocation(date, {
          stateCode: land,
          municipalHolidayKeys: resolved.municipalHolidayKeys,
        });
      const findings = evaluateSundayHolidayRest(
        days.map((d) => ({ date: d.date, workedMinutes: d.workedMinutes })),
        isHoliday,
        packageFor,
        today,
      );
      for (const f of findings) {
        entries.push({ employeeId, displayName, date: f.date, findings: [f.finding] });
      }
    }
    return entries.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  }

  /**
   * Werktaeglicher 8-h-Durchschnitt zum Stichtag (B-01, § 3 ArbZG);
   * Nachtarbeitnehmer mit der kuerzeren Periode nach § 6 Abs. 2 (B-04).
   * Rueckblickendes Fenster - eine Ueberschreitung ist ein sicherer Verstoss.
   */
  async workingTimeAverages(to: string): Promise<AveragingEntry[]> {
    const ctx = this.tenantContext.require();
    const activeRuleSets = await this.rules.loadActiveRuleSets();
    const memberships = await this.rules.loadGroupMemberships();
    const birthDates = await this.rules.loadBirthDates();

    const emps = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select({
          id: employees.id,
          displayName: employees.displayName,
          nightWorker: employees.nightWorker,
        })
        .from(employees)
        .where(eq(employees.tenantId, ctx.tenantId));
    });

    // Fenster je Mitarbeitendem; geladen wird einmal ueber das weiteste.
    const windows = new Map<string, { from: string; to: string }>();
    const resolvers = new Map<string, ReturnType<RuleResolutionService['buildResolver']>>();
    let minFrom = to;
    for (const emp of emps) {
      const packageFor = this.rules.buildResolver(
        this.rules.sourcesFor(activeRuleSets, emp.id, memberships),
        birthDates.get(emp.id) ?? null,
      );
      resolvers.set(emp.id, packageFor);
      const window = averagingWindow(to, packageFor(to).params, emp.nightWorker);
      windows.set(emp.id, window);
      if (window.from < minFrom) minFrom = window.from;
    }

    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const base = await tx
        .select()
        .from(stampEvents)
        .where(and(eq(stampEvents.tenantId, ctx.tenantId), rangeWhere(stampEvents.occurredAt, minFrom, to)))
        .orderBy(asc(stampEvents.occurredAt));
      return closeOverCorrections(base, stampCorrectorFetcher(tx, ctx.tenantId));
    });
    const byEmployee = new Map<string, StampEventRow[]>();
    for (const row of rows) {
      const bucket = byEmployee.get(row.employeeId) ?? [];
      bucket.push(row);
      byEmployee.set(row.employeeId, bucket);
    }

    const entries: AveragingEntry[] = [];
    const now = new Date();
    for (const emp of emps) {
      const window = windows.get(emp.id)!;
      const packageFor = resolvers.get(emp.id)!;
      const empRows = byEmployee.get(emp.id) ?? [];
      if (empRows.length === 0) continue;
      const resolved = await this.workLocations.resolve(emp.id, window.from);
      const rangeEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + RANGE_PAD_MS);
      const materializeAt = now.getTime() < rangeEnd.getTime() ? now : rangeEnd;
      const days = buildAccountingDays(
        empRows.map(toStampEvent),
        resolved.timeZone,
        packageFor,
        materializeAt,
      ).filter((d) => d.date >= window.from && d.date <= to);
      const findings = evaluateWorkingTimeAverage(
        days.map((d) => ({ date: d.date, workedMinutes: d.workedMinutes })),
        to,
        packageFor,
        emp.nightWorker,
      );
      if (findings.length > 0) {
        entries.push({
          employeeId: emp.id,
          displayName: emp.displayName,
          nightWorker: emp.nightWorker,
          windowFrom: window.from,
          windowTo: to,
          findings,
        });
      }
    }
    return entries;
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
    packageFor: RulePackageResolver,
  ): Promise<TimesheetDay[]> {
    // Einsatzort-Zeitzone je Mitarbeitendem (Aufloesung zum Zeitraumbeginn;
    // unterjaehrige Zuordnungswechsel innerhalb des Zeitraums: Schnitt 4).
    const resolved = await this.workLocations.resolve(employeeId, from);
    const rangeEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 48 * 60 * 60 * 1000);
    const now = new Date();
    const materializeAt = now.getTime() < rangeEnd.getTime() ? now : rangeEnd;

    const days = buildAccountingDays(
      rows.map(toStampEvent),
      resolved.timeZone,
      packageFor,
      materializeAt,
    )
      .filter((day) => day.date >= from && day.date <= to)
      .map((day) => ({
        date: day.date,
        workedMinutes: day.workedMinutes,
        breakMinutes: day.breakMinutes,
        findings: day.findings,
      }));
    // B-11: Wochenmaxima (nur im 'weekly'-Modus meldend); Befund haengt am
    // letzten geladenen Tag der Kalenderwoche.
    for (const weekly of evaluateWeeklyWorkTime(days, packageFor)) {
      days.find((d) => d.date === weekly.date)?.findings.push(weekly.finding);
    }
    return days;
  }
}
