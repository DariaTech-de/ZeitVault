import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  type AccountingDay,
  type Finding,
  type StampEvent,
  type StampKind,
  StampTransitionError,
  type StampState,
  applyStampRounding,
  buildAccountingDays,
  foldShifts,
  localDateOf,
  shiftState,
  stampRoundingConfigFrom,
  trimLeadingWindowCut,
} from '@zeitvault/domain';
import type { StampLocation } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type StampEventRow, stampEvents, workLocations } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { GeofenceService } from '../geofence/geofence.service';
import { NotificationsService } from '../notifications/notifications.service';
import { type RulePackageResolver, RuleResolutionService } from '../rules/rule-resolution.service';
import { WorkLocationService } from '../work-location/work-location.service';
import { type Queryable, loadEmployeeEventWindow } from './event-window';

const STAMP_AUDIT_ACTION = {
  clock_in: 'time.clock_in',
  break_start: 'time.break_start',
  break_end: 'time.break_end',
  clock_out: 'time.clock_out',
} as const;

/**
 * Kontextfenster um einen Stempelzeitpunkt (ADR-0017, K-02/K-03): Die
 * Validierung erfolgt gegen die SCHICHTFOLGE, nicht gegen den UTC-Kalendertag.
 * 48 h vor/nach dem betrachteten Zeitpunkt decken die betroffene Schicht
 * (auch ueber Mitternacht) samt Nachbarschichten vollstaendig ab.
 */
const EVENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Nacherfassungsgrenze (A-03): aeltere Eintraege brauchen eine Begruendung. */
const LATE_ENTRY_MS = 24 * 60 * 60 * 1000;

/**
 * Datum fuer die Einsatzort-Aufloesung (Zuordnungen sind tagesgranular). Das
 * UTC-Datum des Instants genuegt hier: Abweichungen zur lokalen Sicht wirken
 * sich nur aus, wenn ein Zuordnungswechsel exakt auf die Tagesgrenze faellt.
 */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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

export interface StampStatus {
  state: StampState;
  workedMinutes: number;
  breakMinutes: number;
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
  /** Nacherfassungs-Kennzeichnung (A-03), fuer die Anzeige in der Timeline. */
  lateEntry: boolean;
  lateReason: string | null;
}

export interface DayListing {
  events: DayEvent[];
  status: StampStatus;
  findings: Finding[];
}

/** Bewertete Sicht auf den (fuer einen Referenzzeitpunkt) relevanten Abrechnungstag. */
interface DayView {
  status: StampStatus;
  findings: Finding[];
  day: AccountingDay | null;
}

@Injectable()
export class StampingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
    private readonly geofence: GeofenceService,
    private readonly workLocations: WorkLocationService,
    private readonly rules: RuleResolutionService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * F5-Schutz: Eine Einsatzort-Uebersteuerung am Stempel wird beim EINTRAGEN
   * validiert (existiert im Mandanten, ist aktiv) - sonst stuende dauerhaft
   * eine haengende Referenz in der append-only Tabelle und resolve() fiele
   * still auf Zuordnung/Default zurueck (falsche Zeitzone/falsches
   * Feiertagsland, ohne Rueckmeldung). Historische Aufloesung bereits
   * gespeicherter Stempel prueft `active` bewusst NICHT.
   */
  private async assertWorkLocationOverride(
    q: Queryable,
    tenantId: string,
    workLocationId: string,
  ): Promise<void> {
    const rows = await q
      .select({ active: workLocations.active })
      .from(workLocations)
      .where(and(eq(workLocations.tenantId, tenantId), eq(workLocations.id, workLocationId)));
    if (!rows[0]) {
      throw new BadRequestException('Einsatzort-Übersteuerung: Einsatzort nicht gefunden.');
    }
    if (!rows[0].active) {
      throw new BadRequestException('Einsatzort-Übersteuerung: Einsatzort ist deaktiviert.');
    }
  }

  /**
   * Bewertete Tagessicht: Abrechnungstag = lokaler Tag des Schichtbeginns
   * (ADR-0018) in der Zeitzone des aufgeloesten Einsatzortes (ADR-0016).
   * Referenz ist die Schicht, die den Zeitpunkt `ref` enthaelt; ausserhalb
   * jeder Schicht gilt der lokale Kalendertag von `ref`.
   */
  private buildView(
    events: StampEvent[],
    timeZone: string,
    ref: Date,
    now: Date,
    packageFor: RulePackageResolver,
  ): DayView {
    const days = buildAccountingDays(trimLeadingWindowCut(events), timeZone, packageFor, now);
    const graceMs = packageFor(localDateOf(now, timeZone)).params.openShiftGraceMinutes * 60_000;
    const state = shiftState(
      days.flatMap((d) => d.shifts),
      now,
      graceMs,
    );
    const refMs = ref.getTime();
    let refDay =
      days.find((d) =>
        d.shifts.some(
          (s) =>
            s.startAt.getTime() <= refMs &&
            (s.endAt === null ? refMs <= now.getTime() : refMs <= s.endAt.getTime()),
        ),
      ) ?? null;
    if (!refDay) {
      const isoRef = localDateOf(ref, timeZone);
      refDay = days.find((d) => d.date === isoRef) ?? null;
    }
    return {
      status: {
        state,
        workedMinutes: refDay?.workedMinutes ?? 0,
        breakMinutes: refDay?.breakMinutes ?? 0,
      },
      findings: refDay?.findings ?? [],
      day: refDay,
    };
  }

  /** Verarbeitet eine Stempelung (validiert die Schichtfolge inkl. Korrekturen). */
  async stamp(input: {
    employeeId: string;
    kind: StampKind;
    source: 'web' | 'mobile' | 'terminal';
    occurredAt?: string;
    reason?: string;
    workLocationId?: string;
    location?: StampLocation;
  }): Promise<StampResult> {
    const ctx = this.tenantContext.require();
    const now = new Date();
    // B-12: Konfigurierte Rundung setzt am EREIGNIS beim Eintragen an
    // (Standard 'none'; Abweichung nur per BV-Regelsatz). Korrekturen
    // uebernehmen den ausdruecklich eingegebenen Zeitpunkt UNVERAENDERT.
    const packageFor = await this.rules.resolverFor(input.employeeId);
    const rawOccurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
    const roundingConfig = stampRoundingConfigFrom(
      packageFor(isoDate(rawOccurredAt)).params,
    );
    const occurredAt = applyStampRounding(input.kind, rawOccurredAt, roundingConfig);

    // A-03: Nacherfassung > 24 h nach der Arbeitsleistung nur mit Begruendung;
    // der Eintrag wird dauerhaft als late_entry markiert.
    const isLate = now.getTime() - occurredAt.getTime() > LATE_ENTRY_MS;
    if (isLate && !input.reason) {
      throw new BadRequestException(
        'Nacherfassung mehr als 24 Stunden nach der Arbeitsleistung erfordert eine Begründung (reason).',
      );
    }

    // Standort-Pruefung (nur wenn je Mandant aktiviert; sonst 'not_required'
    // ohne Auswertung der Position, Kern-Invariante 5).
    const geo = await this.geofence.checkStampLocation(input.location);

    let result: { row: StampEventRow | undefined; events: StampEvent[] };
    try {
      result = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        if (input.workLocationId) {
          await this.assertWorkLocationOverride(tx, ctx.tenantId, input.workLocationId);
        }
        const from = new Date(occurredAt.getTime() - EVENT_WINDOW_MS);
        const to = new Date(occurredAt.getTime() + EVENT_WINDOW_MS);
        const rows = await loadEmployeeEventWindow(tx, ctx.tenantId, input.employeeId, from, to);
        // Fenster-Beschnitt tolerieren: fuehrende Ereignisse einer vor dem
        // Fenster begonnenen Schicht gehoeren nicht zur Validierung.
        const candidate: StampEvent[] = [
          ...trimLeadingWindowCut(rows.map(toStampEvent)),
          { kind: input.kind, at: occurredAt },
        ];
        // Validiert die SCHICHTFOLGE (auch ueber Mitternacht, K-02/K-03).
        foldShifts(candidate);
        const inserted = await tx
          .insert(stampEvents)
          .values({
            tenantId: ctx.tenantId,
            employeeId: input.employeeId,
            kind: input.kind,
            occurredAt,
            source: input.source,
            locationCheck: geo.check,
            locationSiteId: geo.siteId,
            locationDistanceM: geo.distanceM,
            workLocationId: input.workLocationId ?? null,
            lateEntry: isLate,
            lateReason: isLate ? (input.reason ?? null) : null,
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
      // A-03/G-01: Nacherfassung und Einsatzort-Uebersteuerung muessen aus dem
      // manipulationsevidenten Ledger allein erkennbar sein - nicht nur aus
      // der (per Trigger geschuetzten) Anwendungstabelle.
      payload: {
        kind: input.kind,
        occurredAt: occurredAt.toISOString(),
        source: input.source,
        // B-12: Rundung ist im manipulationsevidenten Trail sichtbar.
        ...(occurredAt.getTime() !== rawOccurredAt.getTime()
          ? {
              rounding: roundingConfig[input.kind],
              rawOccurredAt: rawOccurredAt.toISOString(),
            }
          : {}),
        ...(input.workLocationId ? { workLocationId: input.workLocationId } : {}),
        ...(isLate ? { lateEntry: true, lateReason: input.reason ?? '' } : {}),
      },
    });

    const resolved = await this.workLocations.resolve(
      input.employeeId,
      isoDate(occurredAt),
      input.workLocationId ?? null,
    );
    const view = this.buildView(result.events, resolved.timeZone, occurredAt, now, packageFor);
    // B-13: Verstoesse erreichen die Fuehrungskraft PRAEVENTIV beim Erfassen -
    // nicht erst im Monatsbericht (der Mitarbeitende sieht sie in der Antwort).
    await this.notifications.notifyViolations(input.employeeId, view.findings);
    return { event: row, status: view.status, findings: view.findings };
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
    const now = new Date();

    let result: {
      row: StampEventRow | undefined;
      events: StampEvent[];
      employeeId: string;
      workLocationId: string | null;
    };
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
        // Fenster deckt Original UND korrigierten Zeitpunkt ab (auch wenn die
        // Korrektur eine Stempelung ueber die Mitternachtsgrenze verschiebt).
        const from = new Date(
          Math.min(target.occurredAt.getTime(), correctedAt.getTime()) - EVENT_WINDOW_MS,
        );
        const to = new Date(
          Math.max(target.occurredAt.getTime(), correctedAt.getTime()) + EVENT_WINDOW_MS,
        );
        const existing = await loadEmployeeEventWindow(
          tx,
          ctx.tenantId,
          target.employeeId,
          from,
          to,
        );
        const corrective: StampEvent = { kind: target.kind, at: correctedAt, correctsId: target.id };
        const candidate = [...trimLeadingWindowCut(existing.map(toStampEvent)), corrective];
        // Pruefen, dass die korrigierte SCHICHTFOLGE gueltig bleibt.
        foldShifts(candidate);
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
            workLocationId: target.workLocationId,
          })
          .returning();
        const insertedRow = inserted[0];
        const events = insertedRow
          ? [...trimLeadingWindowCut(existing.map(toStampEvent)), toStampEvent(insertedRow)]
          : candidate;
        return {
          row: insertedRow,
          events,
          employeeId: target.employeeId,
          workLocationId: target.workLocationId,
        };
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
      payload: {
        correctsEventId: input.eventId,
        occurredAt: correctedAt.toISOString(),
        reason: input.correctionReason,
        ...(result.workLocationId ? { workLocationId: result.workLocationId } : {}),
      },
    });

    const resolved = await this.workLocations.resolve(
      result.employeeId,
      isoDate(correctedAt),
      result.workLocationId,
    );
    const packageFor = await this.rules.resolverFor(result.employeeId);
    const view = this.buildView(result.events, resolved.timeZone, correctedAt, now, packageFor);
    return { event: row, status: view.status, findings: view.findings };
  }

  /**
   * Aktueller Status und Live-Bewertung. Referenz ist die laufende Schicht
   * (auch wenn sie am Vortag begonnen hat, ADR-0018); ohne laufende Schicht
   * der lokale Kalendertag "heute" in der Einsatzort-Zeitzone.
   */
  async today(
    employeeId: string,
    now: Date = new Date(),
  ): Promise<{ status: StampStatus; findings: Finding[] }> {
    const view = await this.loadDayView(employeeId, now);
    return { status: view.status, findings: view.findings };
  }

  /** Ereignisse der relevanten Schicht(en) plus Status/Befunde (Heute-Ansicht). */
  async listDay(employeeId: string, now: Date = new Date()): Promise<DayListing> {
    const ctx = this.tenantContext.require();
    const rows = await this.loadWindowRows(ctx.tenantId, employeeId, now);
    const resolved = await this.workLocations.resolve(employeeId, isoDate(now));
    const packageFor = await this.rules.resolverFor(employeeId);
    const view = this.buildView(rows.map(toStampEvent), resolved.timeZone, now, now, packageFor);

    // Roh-Ereignisse (inkl. korrigierter Originale) im Zeitbereich der
    // Schichten des Referenztags - fuer die Timeline mit Korrektur-Historie.
    const spans = (view.day?.shifts ?? []).map((s) => ({
      from: s.startAt.getTime(),
      to: (s.endAt ?? now).getTime(),
    }));
    const events = rows
      .filter((r) => spans.some((sp) => r.occurredAt.getTime() >= sp.from && r.occurredAt.getTime() <= sp.to))
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        occurredAt: r.occurredAt.toISOString(),
        correctsEventId: r.correctsEventId,
        correctionReason: r.correctionReason,
        lateEntry: r.lateEntry,
        lateReason: r.lateReason,
      }));
    return { events, status: view.status, findings: view.findings };
  }

  private async loadWindowRows(
    tenantId: string,
    employeeId: string,
    now: Date,
  ): Promise<StampEventRow[]> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return loadEmployeeEventWindow(
        tx,
        tenantId,
        employeeId,
        new Date(now.getTime() - EVENT_WINDOW_MS),
        now,
      );
    });
  }

  private async loadDayView(employeeId: string, now: Date): Promise<DayView> {
    const ctx = this.tenantContext.require();
    const rows = await this.loadWindowRows(ctx.tenantId, employeeId, now);
    const resolved = await this.workLocations.resolve(employeeId, isoDate(now));
    const packageFor = await this.rules.resolverFor(employeeId);
    return this.buildView(rows.map(toStampEvent), resolved.timeZone, now, now, packageFor);
  }

  /**
   * Idempotente Batch-Synchronisation der Offline-Queue (B3, A-06). Ereignisse
   * mit bekannter clientEventId werden uebersprungen (keine Dubletten); die
   * resultierende SCHICHTFOLGE wird als Ganzes validiert (auch ueber
   * Mitternacht, K-02). Offline erfasste Eintraege aelter als 24 h werden als
   * late_entry mit systemischer Begruendung 'offline_sync' markiert (A-03) -
   * die Synchronisation bleibt moeglich (A-06), der Marker bleibt sichtbar.
   */
  async sync(input: {
    employeeId: string;
    items: ReadonlyArray<{
      clientEventId: string;
      kind: StampKind;
      occurredAt: string;
      location?: StampLocation;
    }>;
  }): Promise<{ accepted: number; duplicates: number }> {
    const ctx = this.tenantContext.require();
    if (input.items.length === 0) return { accepted: 0, duplicates: 0 };
    const now = new Date();
    const acceptedItems: Array<{ kind: StampKind; id: string; occurredAt: Date; isLate: boolean }> =
      [];
    let summary = { accepted: 0, duplicates: 0 };
    const evaluate = await this.geofence.buildEvaluator();
    // B-12: Offline-Erfassung ist Erfassung - dieselbe Ereignis-Rundung.
    const packageFor = await this.rules.resolverFor(input.employeeId);

    const times = input.items.map((it) => new Date(it.occurredAt).getTime());
    const from = new Date(Math.min(...times) - EVENT_WINDOW_MS);
    const to = new Date(Math.max(...times) + EVENT_WINDOW_MS);

    try {
      summary = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
        const existing = await loadEmployeeEventWindow(
          tx,
          ctx.tenantId,
          input.employeeId,
          from,
          to,
        );
        const knownClientIds = new Set(
          existing.map((r) => r.clientEventId).filter((x): x is string => x !== null),
        );
        const fresh = input.items.filter((it) => !knownClientIds.has(it.clientEventId));
        let duplicates = input.items.length - fresh.length;

        const candidate: StampEvent[] = [
          ...trimLeadingWindowCut(existing.map(toStampEvent)),
          ...fresh.map((it) => ({ kind: it.kind, at: new Date(it.occurredAt) })),
        ];
        // Wirft StampTransitionError bei ungueltiger Schichtfolge -> 409.
        foldShifts(candidate);

        let accepted = 0;
        for (const it of fresh) {
          const rawAt = new Date(it.occurredAt);
          const occurredAt = applyStampRounding(
            it.kind,
            rawAt,
            stampRoundingConfigFrom(packageFor(isoDate(rawAt)).params),
          );
          const isLate = now.getTime() - occurredAt.getTime() > LATE_ENTRY_MS;
          const geo = evaluate(it.location);
          const inserted = await tx
            .insert(stampEvents)
            .values({
              tenantId: ctx.tenantId,
              employeeId: input.employeeId,
              kind: it.kind,
              occurredAt,
              source: 'mobile',
              clientEventId: it.clientEventId,
              locationCheck: geo.check,
              locationSiteId: geo.siteId,
              locationDistanceM: geo.distanceM,
              lateEntry: isLate,
              lateReason: isLate ? 'offline_sync' : null,
            })
            .onConflictDoNothing()
            .returning();
          const row = inserted[0];
          if (row) {
            accepted += 1;
            acceptedItems.push({ kind: it.kind, id: row.id, occurredAt, isLate });
          } else {
            duplicates += 1;
          }
        }
        return { accepted, duplicates };
      });
    } catch (err) {
      if (err instanceof StampTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    for (const accepted of acceptedItems) {
      await this.audit.append({
        tenantId: ctx.tenantId,
        action: STAMP_AUDIT_ACTION[accepted.kind],
        actorId: ctx.userId,
        subjectType: 'stamp_event',
        subjectId: accepted.id,
        // A-03: Offline nacherfasste Stempel muessen auch im Ledger als
        // Nacherfassung erkennbar sein, nicht nur in der Anwendungstabelle.
        payload: {
          source: 'mobile',
          sync: true,
          occurredAt: accepted.occurredAt.toISOString(),
          ...(accepted.isLate ? { lateEntry: true, lateReason: 'offline_sync' } : {}),
        },
      });
    }
    return summary;
  }
}
