import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  type Bundesland,
  type StampEvent,
  type SurchargeMinutes,
  type SurchargePayComponent,
  classifySurchargeMinutes,
  foldShifts,
  isHolidayAtLocation,
  localDateOf,
  materializeShift,
  shiftResolution,
  surchargePayComponent,
  trimLeadingWindowCut,
} from '@zeitvault/domain';
import type { ResolvedWorkLocation } from '@zeitvault/types';
import { TenantContextService } from '../common/tenant-context.service';
import { type StampEventRow, employees, stampEvents } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { RuleResolutionService } from '../rules/rule-resolution.service';
import { closeOverCorrections, stampCorrectorFetcher } from '../stamping/event-window';
import { WorkLocationService } from '../work-location/work-location.service';

/**
 * Zuschlags-Pipeline (Schnitt 4, C-01..C-08, K-04): echte Stempel ->
 * Korrektur-Abschluss -> Schichten -> minutengenaue Paragraf-3b-Klassifikation
 * an Instants in der Zeitzone des JE SCHICHT wirksamen Einsatzortes
 * (Uebersteuerung via `workLocationId` des clock_in-Ereignisses, ADR-0016).
 *
 * Unaufgeloeste Schichten (ADR-0019) werden NICHT verguetet - Lohn zahlt nie
 * auf eine Untergrenze; sie werden je Mitarbeitendem ausgewiesen. Betraege
 * gibt es nur bei gesetztem Grundlohn (C-06): je Lohnart und Periode einmal
 * gerundet, mit getrennten Feldern steuerfrei/SV-frei.
 */

/** Paragraf-3b-Saetze (gesetzlich, NICHT konfigurierbar; ADR-0018). */
const RATE_PERCENT = {
  night25: 25,
  night40: 40,
  sunday50: 50,
  holiday125: 125,
  special150: 150,
} as const;
export type SurchargeKind3b = keyof typeof RATE_PERCENT;

export interface SurchargeComponentEntry extends SurchargePayComponent {
  kind: SurchargeKind3b;
}

export interface SurchargeAmounts {
  hourlyBaseWageCents: number;
  components: SurchargeComponentEntry[];
}

export interface SurchargeReportEntry {
  employeeId: string;
  displayName: string;
  personnelNumber: string;
  minutes: SurchargeMinutes;
  /** Nicht verguetete unaufgeloeste Schichten im Zeitraum (ADR-0019). */
  excludedUnresolvedShifts: number;
  /** Betraege nur bei gesetztem Grundlohn; sonst null (nur Minuten). */
  amounts: SurchargeAmounts | null;
}

const PAD_MS = 48 * 60 * 60 * 1000;

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

function zeroMinutes(): SurchargeMinutes {
  return {
    night25Minutes: 0,
    night40Minutes: 0,
    nightNoneMinutes: 0,
    sunday50Minutes: 0,
    holiday125Minutes: 0,
    special150Minutes: 0,
    dayNoneMinutes: 0,
  };
}

function addMinutes(total: SurchargeMinutes, part: SurchargeMinutes): void {
  for (const key of Object.keys(total) as Array<keyof SurchargeMinutes>) {
    total[key] += part[key];
  }
}

@Injectable()
export class SurchargeReportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly workLocations: WorkLocationService,
    private readonly rules: RuleResolutionService,
  ) {}

  /** Zuschlagsminuten (+ Betraege bei Grundlohn) je Mitarbeitenden im Zeitraum. */
  async report(from: string, to: string): Promise<SurchargeReportEntry[]> {
    const ctx = this.tenantContext.require();
    // Ladefenster mit 48-h-Kontext (ADR-0018): Schichten, die vor `from`
    // beginnen oder am `to`-Tag ueber Mitternacht laufen, vollstaendig laden.
    const start = new Date(new Date(`${from}T00:00:00.000Z`).getTime() - PAD_MS);
    const endExclusive = new Date(
      new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 + PAD_MS,
    );
    const { emps, stamps } = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const empRows = await tx.select().from(employees).where(eq(employees.tenantId, ctx.tenantId));
      const base = await tx
        .select()
        .from(stampEvents)
        .where(
          and(
            eq(stampEvents.tenantId, ctx.tenantId),
            gte(stampEvents.occurredAt, start),
            lt(stampEvents.occurredAt, endExclusive),
          ),
        )
        .orderBy(asc(stampEvents.employeeId), asc(stampEvents.occurredAt));
      // Korrektur-Abschluss: Korrekturen ausserhalb des Fensters duerfen ihr
      // Original hier nicht wieder wirksam machen.
      const rows = await closeOverCorrections(base, stampCorrectorFetcher(tx, ctx.tenantId));
      return { emps: empRows, stamps: rows };
    });

    const byEmployee = new Map<string, StampEventRow[]>();
    for (const row of stamps) {
      const bucket = byEmployee.get(row.employeeId) ?? [];
      bucket.push(row);
      byEmployee.set(row.employeeId, bucket);
    }

    // Deterministisch fuer Historie: offene Segmente materialisieren zum
    // Zeitraumende bzw. "jetzt" (das Fruehere) - wie im Lohnexport.
    const rangeEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + PAD_MS);
    const now = new Date();
    const materializeAt = now.getTime() < rangeEnd.getTime() ? now : rangeEnd;

    const activeRuleSets = await this.rules.loadActiveRuleSets();
    const memberships = await this.rules.loadGroupMemberships();
    const birthDates = await this.rules.loadBirthDates();

    const entries: SurchargeReportEntry[] = [];
    for (const emp of emps) {
      const rows = byEmployee.get(emp.id);
      if (!rows || rows.length === 0) continue;
      const packageFor = this.rules.buildResolver(
        this.rules.sourcesFor(activeRuleSets, emp.id, memberships),
        birthDates.get(emp.id) ?? null,
      );
      // Uebersteuerung je Schicht: workLocationId des (effektiven) clock_in.
      const overrideByEventId = new Map(rows.map((r) => [r.id, r.workLocationId]));
      const resolvedCache = new Map<string, ResolvedWorkLocation>();
      const resolveFor = async (overrideId: string | null): Promise<ResolvedWorkLocation> => {
        const key = overrideId ?? '';
        let resolved = resolvedCache.get(key);
        if (!resolved) {
          resolved = await this.workLocations.resolve(emp.id, from, overrideId);
          resolvedCache.set(key, resolved);
        }
        return resolved;
      };

      const shifts = foldShifts(trimLeadingWindowCut(rows.map(toStampEvent)));
      const totals = zeroMinutes();
      let excludedUnresolvedShifts = 0;
      for (const shift of shifts) {
        // C-09: Rufbereitschaft ist keine Arbeitszeit - keine Paragraf-3b-
        // Zuschlaege; ihre Verguetung laeuft ueber die eigene Lohnart.
        if (shift.workKind === 'standby') continue;
        const clockInId = shift.events[0]?.id;
        const overrideId = (clockInId && overrideByEventId.get(clockInId)) || null;
        const resolved = await resolveFor(overrideId);
        const day = localDateOf(shift.startAt, resolved.timeZone);
        if (day < from || day > to) continue;
        const graceMs = packageFor(day).params.openShiftGraceMinutes * 60_000;
        // ADR-0019: keine Verguetung auf eine Untergrenze.
        if (shiftResolution(shift, materializeAt, graceMs) === 'unresolved') {
          excludedUnresolvedShifts += 1;
          continue;
        }
        const { workIntervals } = materializeShift(shift, materializeAt, graceMs);
        // C-08: Feiertag je Einsatzort (Bundesland + Gemeinde-Schluessel).
        const holidayLocation = {
          stateCode: (resolved.countryCode === 'DE' ? resolved.stateCode : null) as Bundesland | null,
          municipalHolidayKeys: resolved.municipalHolidayKeys,
        };
        addMinutes(
          totals,
          classifySurchargeMinutes(
            workIntervals,
            shift.startAt,
            resolved.timeZone,
            (date) => isHolidayAtLocation(date, holidayLocation),
          ),
        );
      }

      const totalMinutes =
        totals.night25Minutes +
        totals.night40Minutes +
        totals.nightNoneMinutes +
        totals.sunday50Minutes +
        totals.holiday125Minutes +
        totals.special150Minutes +
        totals.dayNoneMinutes;
      if (totalMinutes === 0 && excludedUnresolvedShifts === 0) continue;

      // C-06: Betraege nur bei gesetztem Grundlohn; EINE Rundung je Lohnart
      // und Periode (Minuten werden erst ueber die Periode summiert).
      let amounts: SurchargeAmounts | null = null;
      if (emp.hourlyBaseWageCents !== null) {
        const components: SurchargeComponentEntry[] = [];
        for (const kind of Object.keys(RATE_PERCENT) as SurchargeKind3b[]) {
          const minutes = totals[`${kind}Minutes`];
          if (minutes === 0) continue;
          components.push({
            kind,
            ...surchargePayComponent({
              minutes,
              hourlyBaseWageCents: emp.hourlyBaseWageCents,
              ratePercent: RATE_PERCENT[kind],
            }),
          });
        }
        amounts = { hourlyBaseWageCents: emp.hourlyBaseWageCents, components };
      }

      entries.push({
        employeeId: emp.id,
        displayName: emp.displayName,
        personnelNumber: emp.personnelNumber,
        minutes: totals,
        excludedUnresolvedShifts,
        amounts,
      });
    }
    return entries.sort((a, b) => a.personnelNumber.localeCompare(b.personnelNumber));
  }
}
