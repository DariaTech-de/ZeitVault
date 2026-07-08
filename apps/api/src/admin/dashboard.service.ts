import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { type StampEvent, computeStampStatus } from '@zeitvault/domain';
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

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

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

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Montag 00:00 UTC der aktuellen Woche. */
function isoWeekStart(d: Date): Date {
  const day = utcDayStart(d);
  const dow = (day.getUTCDay() + 6) % 7; // Mo=0 … So=6
  return new Date(day.getTime() - dow * DAY_MS);
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
  ) {}

  private tx<T>(fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0], tenantId: string) => Promise<T>): Promise<T> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return fn(tx, ctx.tenantId);
    });
  }

  /**
   * Kennzahlen und jüngste Aktivität für das Dashboard. Arbeitsminuten werden über
   * den Domänen-Kalkulator (computeStampStatus) aus den Roh-Stempelungen berechnet
   * – dieselbe Logik wie in der Tagesansicht (keine erfundenen Werte).
   */
  async getDashboard(now: Date = new Date()): Promise<DashboardData> {
    const windowStart = new Date(utcDayStart(now).getTime() - (WINDOW_DAYS - 1) * DAY_MS);
    const weekStart = isoWeekStart(now);
    const todayKey = isoDay(now);

    return this.tx(async (tx, tenantId) => {
      const emps = await tx
        .select({ id: employees.id, name: employees.displayName, photoId: employeePhotos.employeeId })
        .from(employees)
        .leftJoin(employeePhotos, eq(employeePhotos.employeeId, employees.id))
        .where(and(eq(employees.tenantId, tenantId), eq(employees.status, 'active')));
      const empMap = new Map(emps.map((e) => [e.id, { name: e.name, hasPhoto: e.photoId !== null }]));

      const evRows = await tx
        .select({
          id: stampEvents.id,
          employeeId: stampEvents.employeeId,
          kind: stampEvents.kind,
          occurredAt: stampEvents.occurredAt,
          source: stampEvents.source,
          correctsEventId: stampEvents.correctsEventId,
        })
        .from(stampEvents)
        .where(and(eq(stampEvents.tenantId, tenantId), gte(stampEvents.occurredAt, windowStart)))
        .orderBy(asc(stampEvents.employeeId), asc(stampEvents.occurredAt));

      // Nach Mitarbeiter+Tag gruppieren (chronologisch dank Sortierung).
      const byGroup = new Map<string, StampEvent[]>();
      for (const r of evRows) {
        const key = `${r.employeeId}|${isoDay(r.occurredAt)}`;
        const arr = byGroup.get(key) ?? [];
        arr.push({ id: r.id, kind: r.kind, at: r.occurredAt, correctsId: r.correctsEventId });
        byGroup.set(key, arr);
      }

      const activityMap = new Map<string, number>();
      for (let i = 0; i < WINDOW_DAYS; i++) {
        activityMap.set(isoDay(new Date(windowStart.getTime() + i * DAY_MS)), 0);
      }
      let weekMinutes = 0;
      let presentNow = 0;
      for (const [key, events] of byGroup) {
        const day = key.split('|')[1] ?? todayKey;
        const isToday = day === todayKey;
        const dayStart = new Date(`${day}T00:00:00.000Z`);
        const calcNow = isToday ? now : new Date(dayStart.getTime() + DAY_MS - 1);
        const status = computeStampStatus(events, calcNow);
        activityMap.set(day, (activityMap.get(day) ?? 0) + status.workedMinutes);
        if (dayStart >= weekStart) weekMinutes += status.workedMinutes;
        if (isToday && status.state !== 'out') presentNow += 1;
      }
      const activity = [...activityMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

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

      const absC = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(absenceRequests)
        .where(and(eq(absenceRequests.tenantId, tenantId), eq(absenceRequests.status, 'requested')));
      const corrC = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(stampCorrectionRequests)
        .where(and(eq(stampCorrectionRequests.tenantId, tenantId), eq(stampCorrectionRequests.status, 'requested')));
      const pendingApprovals = (absC[0]?.c ?? 0) + (corrC[0]?.c ?? 0);

      const projRows = await tx
        .select({
          id: projects.id,
          name: projects.name,
          minutes: sql<number>`coalesce(sum(${projectTimeEntries.minutes}), 0)::int`,
        })
        .from(projects)
        .leftJoin(projectTimeEntries, eq(projectTimeEntries.projectId, projects.id))
        .where(eq(projects.tenantId, tenantId))
        .groupBy(projects.id, projects.name);
      const projectsOut = projRows
        .map((p) => ({ id: p.id, name: p.name, bookedMinutes: Number(p.minutes) }))
        .sort((a, b) => b.bookedMinutes - a.bookedMinutes)
        .slice(0, 6);

      const bookRows = await tx
        .select({
          employeeId: projectTimeEntries.employeeId,
          minutes: projectTimeEntries.minutes,
          workDate: projectTimeEntries.workDate,
          projectName: projects.name,
        })
        .from(projectTimeEntries)
        .leftJoin(projects, eq(projects.id, projectTimeEntries.projectId))
        .where(eq(projectTimeEntries.tenantId, tenantId))
        .orderBy(desc(projectTimeEntries.createdAt))
        .limit(6);
      const recentBookings = bookRows.map((b) => ({
        employeeName: empMap.get(b.employeeId)?.name ?? '—',
        projectName: b.projectName ?? '—',
        minutes: b.minutes,
        workDate: b.workDate,
      }));

      return {
        generatedAt: now.toISOString(),
        kpis: { employees: emps.length, presentNow, pendingApprovals, weekMinutes: Math.round(weekMinutes) },
        activity,
        recentStamps,
        recentBookings,
        projects: projectsOut,
      };
    });
  }
}
