import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CreateGeofenceSite, FlagStamp, GeofenceSite, LocationCheck, StampLocation } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { geofenceSettings, geofenceSites, stampEvents, stampFlags } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { evaluateGeofence } from './geofence.geo';

export interface StampGeoResult {
  check: LocationCheck;
  siteId: string | null;
  distanceM: number | null;
}

export interface ReviewStamp {
  eventId: string;
  employeeId: string;
  kind: string;
  occurredAt: string;
  locationCheck: LocationCheck;
  distanceM: number | null;
  siteName: string | null;
  flagged: boolean;
  flagReason: string | null;
}

@Injectable()
export class GeofenceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  private tx<T>(fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0], tenantId: string) => Promise<T>): Promise<T> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return fn(tx, ctx.tenantId);
    });
  }

  /** Geofencing-Einstellung des Mandanten (Default AUS, Kern-Invariante 5). */
  async getSettings(): Promise<{ enabled: boolean }> {
    const rows = await this.tx((tx, tenantId) =>
      tx.select().from(geofenceSettings).where(eq(geofenceSettings.tenantId, tenantId)),
    );
    return { enabled: rows[0]?.enabled ?? false };
  }

  /** Geofencing aktivieren/deaktivieren (nur nach Betriebsvereinbarung). Auditiert. */
  async setEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    const ctx = this.tenantContext.require();
    await this.tx(async (tx, tenantId) => {
      await tx
        .insert(geofenceSettings)
        .values({ tenantId, enabled, updatedBy: ctx.userId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: geofenceSettings.tenantId,
          set: { enabled, updatedBy: ctx.userId, updatedAt: new Date() },
        });
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'geofence.configure',
      actorId: ctx.userId,
      subjectType: 'geofence_settings',
      subjectId: ctx.tenantId,
      payload: { enabled },
    });
    return { enabled };
  }

  async listSites(): Promise<GeofenceSite[]> {
    const rows = await this.tx((tx, tenantId) =>
      tx.select().from(geofenceSites).where(eq(geofenceSites.tenantId, tenantId)).orderBy(desc(geofenceSites.createdAt)),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      radiusMeters: r.radiusM,
      active: r.active,
    }));
  }

  async createSite(input: CreateGeofenceSite): Promise<GeofenceSite> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      const inserted = await tx
        .insert(geofenceSites)
        .values({
          tenantId,
          name: input.name,
          latitude: input.latitude,
          longitude: input.longitude,
          radiusM: input.radiusMeters,
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Standort konnte nicht angelegt werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'geofence.configure',
      actorId: ctx.userId,
      subjectType: 'geofence_site',
      subjectId: row.id,
      payload: { name: row.name, radiusM: row.radiusM },
    });
    return { id: row.id, name: row.name, latitude: row.latitude, longitude: row.longitude, radiusMeters: row.radiusM, active: row.active };
  }

  async deactivateSite(id: string): Promise<void> {
    const ctx = this.tenantContext.require();
    await this.tx(async (tx, tenantId) => {
      await tx
        .update(geofenceSites)
        .set({ active: false })
        .where(and(eq(geofenceSites.tenantId, tenantId), eq(geofenceSites.id, id)));
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'geofence.configure',
      actorId: ctx.userId,
      subjectType: 'geofence_site',
      subjectId: id,
      payload: { active: false },
    });
  }

  /**
   * Baut einen Auswerter, der Einstellungen und aktive Standorte EINMAL lädt und
   * danach beliebig viele Positionen rein in-memory bewertet (für Batch-Sync,
   * ohne verschachtelte Transaktionen). Ist Geofencing deaktiviert, liefert er
   * stets 'not_required' (Kern-Invariante 5, Datensparsamkeit).
   */
  async buildEvaluator(): Promise<(location: StampLocation | undefined) => StampGeoResult> {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      return () => ({ check: 'not_required', siteId: null, distanceM: null });
    }
    const rows = await this.tx((tx, tenantId) =>
      tx
        .select()
        .from(geofenceSites)
        .where(and(eq(geofenceSites.tenantId, tenantId), eq(geofenceSites.active, true))),
    );
    const points = rows.map((r) => ({ id: r.id, latitude: r.latitude, longitude: r.longitude, radiusM: r.radiusM }));
    return (location) => {
      const e = evaluateGeofence(location, points);
      return { check: e.check, siteId: e.siteId, distanceM: e.distanceM };
    };
  }

  /**
   * Bewertet die Position eines Stempels. Ist Geofencing deaktiviert, wird KEINE
   * Position ausgewertet und 'not_required' zurückgegeben (Kern-Invariante 5,
   * Datensparsamkeit).
   */
  async checkStampLocation(location: StampLocation | undefined): Promise<StampGeoResult> {
    const evaluate = await this.buildEvaluator();
    return evaluate(location);
  }

  /** Admin kennzeichnet/entkennzeichnet einen Stempel („blinken"). Auditiert. */
  async flagStamp(input: FlagStamp): Promise<void> {
    const ctx = this.tenantContext.require();
    await this.tx(async (tx, tenantId) => {
      await tx
        .insert(stampFlags)
        .values({ eventId: input.eventId, tenantId, flagged: input.flagged, reason: input.reason ?? null, flaggedBy: ctx.userId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: stampFlags.eventId,
          set: { flagged: input.flagged, reason: input.reason ?? null, flaggedBy: ctx.userId, updatedAt: new Date() },
        });
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'stamp.flag',
      actorId: ctx.userId,
      subjectType: 'stamp_event',
      subjectId: input.eventId,
      payload: { flagged: input.flagged, ...(input.reason ? { reason: input.reason } : {}) },
    });
  }

  /** Stempel mit Standortbezug zur Prüfung (außerhalb/ohne Signal „blinken"). */
  async reviewStamps(limit = 200): Promise<ReviewStamp[]> {
    return this.tx(async (tx, tenantId) => {
      const rows = await tx
        .select()
        .from(stampEvents)
        .where(
          and(
            eq(stampEvents.tenantId, tenantId),
            inArray(stampEvents.locationCheck, ['inside', 'outside', 'no_signal']),
          ),
        )
        .orderBy(desc(stampEvents.occurredAt))
        .limit(limit);
      if (rows.length === 0) return [];

      const siteRows = await tx.select().from(geofenceSites).where(eq(geofenceSites.tenantId, tenantId));
      const siteName = new Map(siteRows.map((s) => [s.id, s.name]));
      const flagRows = await tx.select().from(stampFlags).where(eq(stampFlags.tenantId, tenantId));
      const flagByEvent = new Map(flagRows.map((f) => [f.eventId, f]));

      return rows.map((r) => {
        const flag = flagByEvent.get(r.id);
        return {
          eventId: r.id,
          employeeId: r.employeeId,
          kind: r.kind,
          occurredAt: r.occurredAt.toISOString(),
          locationCheck: r.locationCheck,
          distanceM: r.locationDistanceM,
          siteName: r.locationSiteId ? siteName.get(r.locationSiteId) ?? null : null,
          flagged: flag?.flagged ?? false,
          flagReason: flag?.reason ?? null,
        };
      });
    });
  }
}
