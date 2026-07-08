import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import {
  type StampEvent,
  StampTransitionError,
  addIsoDays,
  buildAccountingDays,
  dayOfWeek,
  foldShifts,
  localDateOf,
  localDayStart,
  shiftState,
} from '@zeitvault/domain';
import { TenantContextService } from '../common/tenant-context.service';
import {
  absenceRequests,
  employeePhotos,
  employees,
  projectTimeEntries,
  projects,
  stampCorrectionRequests,
  stampEvents,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { RuleResolutionService } from '../rules/rule-resolution.service';
import { closeOverCorrections, stampCorrectorFetcher } from '../stamping/event-window';
import { WorkLocationService } from '../work-location/work-location.service';

const WINDOW_DAYS = 14;
/** Vorlauf, damit Schichten mit Beginn vor dem Fenster vollstaendig laden. */
const RANGE_PAD_MS = 48 * 60 * 60 * 1000;

/** Aggregierte Kennzahlen für das Admin-Dashboard (alle Werte real berechnet). */
export interface DashboardData {
  generatedAt: string;
  kpis: { employees: number; presentNow: number; pendingApprovals: number; weekMinutes: number };
  activity: Array<{ date: string; minutes: number }>;
  recentStamps: Array<{
    employeeId: string;
    employeeName: string;
    hasPhoto: boolean;
    kind: string;
    occurredAt: string;
    source: string;
  }>;
  recentBookings: Array<{ employeeName: string; projectName: string; minutes: number; workDate: string }>;
  projects: Array<{ id: string; name: string; bookedMinutes: number }>;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly workLocations: WorkLocationService,
    private readonly rules: RuleResolutionService,
  ) {}

  /**
   * Kennzahlen und juengste Aktivitaet. Arbeitsminuten werden schichtbasiert
   * je ABRECHNUNGSTAG berechnet (lokaler Tag des Schichtbeginns in der
   * Einsatzort-Zeitzone des Mitarbeitenden, ADR-0016/0018) - dieselbe Logik
   * wie Heute-Ansicht und Report. Die Achsen-Tage des Charts laufen in der
   * Zeitzone des Mandanten-Default-Einsatzortes (Pflicht-Stammdatum).
   */
  async getDashboard(now: Date = new Date()): Promise<DashboardData> {
    const ctx = this.tenantContext.require();
    const axisTz = (await this.workLocations.tenantDefault()).timeZone;
    const todayKey = localDateOf(now, axisTz);
    const windowDates: string[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i -= 1) {
      windowDates.push(addIsoDays(todayKey, -i));
    }
    const windowStart = new Date(
      localDayStart(windowDates[0]!, axisTz).getTime() - RANGE_PAD_MS,
    );
    // Montag der laufenden Woche (lokal): dayOfWeek liefert 0 = Sonntag.
    const weekStartKey = addIsoDays(todayKey, -((dayOfWeek(todayKey) + 6) % 7));

    const { emps, evRows, absC, corrC, projRows, bookRows } = await this.db.transaction(
      async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        const emps = await tx
          .select({ id: employees.id, name: employees.displayName, photoId: employeePhotos.employeeId })
          .from(employees)
          .leftJoin(employeePhotos, eq(employeePhotos.employeeId, employees.id))
          .where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.status, 'active')));
        const evBase = await tx
          .select({
            id: stampEvents.id,
            employeeId: stampEvents.employeeId,
            kind: stampEvents.kind,
            occurredAt: stampEvents.occurredAt,
            source: stampEvents.source,
            correctsEventId: stampEvents.correctsEventId,
          })
          .from(stampEvents)
          .where(and(eq(stampEvents.tenantId, ctx.tenantId), gte(stampEvents.occurredAt, windowStart)))
          .orderBy(asc(stampEvents.employeeId), asc(stampEvents.occurredAt));
        // Korrektur-Abschluss: aeltere Korrekturen vor dem Fenster duerfen
        // ihre Originale hier nicht wieder wirksam werden lassen.
        const evRows = await closeOverCorrections(
          evBase,
          stampCorrectorFetcher(tx, ctx.tenantId),
        );
        const absC = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(absenceRequests)
          .where(and(eq(absenceRequests.tenantId, ctx.tenantId), eq(absenceRequests.status, 'requested')));
        const corrC = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(stampCorrectionRequests)
          .where(
            and(
              eq(stampCorrectionRequests.tenantId, ctx.tenantId),
              eq(stampCorrectionRequests.status, 'requested'),
            ),
          );
        const projRows = await tx
          .select({
            id: projects.id,
            name: projects.name,
            minutes: sql<number>`coalesce(sum(${projectTimeEntries.minutes}), 0)::int`,
          })
          .from(projects)
          .leftJoin(projectTimeEntries, eq(projectTimeEntries.projectId, projects.id))
          .where(eq(projects.tenantId, ctx.tenantId))
          .groupBy(projects.id, projects.name);
        const bookRows = await tx
          .select({
            employeeId: projectTimeEntries.employeeId,
            minutes: projectTimeEntries.minutes,
            workDate: projectTimeEntries.workDate,
            projectName: projects.name,
          })
          .from(projectTimeEntries)
          .leftJoin(projects, eq(projects.id, projectTimeEntries.projectId))
          .where(eq(projectTimeEntries.tenantId, ctx.tenantId))
          .orderBy(desc(projectTimeEntries.createdAt))
          .limit(6);
        return { emps, evRows, absC, corrC, projRows, bookRows };
      },
    );

    const empMap = new Map(emps.map((e) => [e.id, { name: e.name, hasPhoto: e.photoId !== null }]));

    // Ereignisse je Mitarbeitendem; Bewertung schichtbasiert je Abrechnungstag.
    const byEmployee = new Map<string, StampEvent[]>();
    for (const r of evRows) {
      const bucket = byEmployee.get(r.employeeId) ?? [];
      bucket.push({ id: r.id, kind: r.kind, at: r.occurredAt, correctsId: r.correctsEventId });
      byEmployee.set(r.employeeId, bucket);
    }

    const activityMap = new Map<string, number>(windowDates.map((d) => [d, 0]));
    let weekMinutes = 0;
    let presentNow = 0;
    const activeRuleSets = await this.rules.loadActiveRuleSets();
    const memberships = await this.rules.loadGroupMemberships();
    for (const [employeeId, events] of byEmployee) {
      try {
        const tz = (await this.workLocations.resolve(employeeId, todayKey)).timeZone;
        const packageFor = this.rules.buildResolver(
          this.rules.sourcesFor(activeRuleSets, employeeId, memberships),
        );
        const days = buildAccountingDays(events, tz, packageFor, now);
        const graceMs = packageFor(localDateOf(now, tz)).params.openShiftGraceMinutes * 60_000;
        if (shiftState(foldShifts(events), now, graceMs) !== 'out') presentNow += 1;
        for (const day of days) {
          const current = activityMap.get(day.date);
          if (current !== undefined) activityMap.set(day.date, current + day.workedMinutes);
          if (day.date >= weekStartKey && day.date <= todayKey) weekMinutes += day.workedMinutes;
        }
      } catch (err) {
        // Dashboard ist informativ: inkonsistente Altdaten eines Mitarbeitenden
        // duerfen die Uebersicht nicht zum Absturz bringen.
        if (err instanceof StampTransitionError) {
          this.logger.warn(`Dashboard: inkonsistente Stempelfolge fuer ${employeeId}: ${err.message}`);
          continue;
        }
        throw err;
      }
    }
    const activity = windowDates.map((date) => ({
      date,
      minutes: Math.round(activityMap.get(date) ?? 0),
    }));

    const recentStamps = [...evRows]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 8)
      .map((r) => ({
        employeeId: r.employeeId,
        employeeName: empMap.get(r.employeeId)?.name ?? '—',
        hasPhoto: empMap.get(r.employeeId)?.hasPhoto ?? false,
        kind: r.kind,
        occurredAt: r.occurredAt.toISOString(),
        source: r.source,
      }));

    const pendingApprovals = (absC[0]?.c ?? 0) + (corrC[0]?.c ?? 0);
    const projectsOut = projRows
      .map((p) => ({ id: p.id, name: p.name, bookedMinutes: Number(p.minutes) }))
      .sort((a, b) => b.bookedMinutes - a.bookedMinutes)
      .slice(0, 6);
    const recentBookings = bookRows.map((b) => ({
      employeeName: empMap.get(b.employeeId)?.name ?? '—',
      projectName: b.projectName ?? '—',
      minutes: b.minutes,
      workDate: b.workDate,
    }));

    return {
      generatedAt: now.toISOString(),
      kpis: {
        employees: emps.length,
        presentNow,
        pendingApprovals,
        weekMinutes: Math.round(weekMinutes),
      },
      activity,
      recentStamps,
      recentBookings,
      projects: projectsOut,
    };
  }
}
