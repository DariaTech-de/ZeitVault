import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  type DatevMapping,
  type PayrollAggregate,
  type PayrollCategory,
  type StampEvent,
  buildAccountingDays,
  countWorkingDays,
  mapToLineItems,
  materializeShift,
  shiftResolution,
  toPayrollCsv,
  totalMinutes,
} from '@zeitvault/domain';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type ExportJobRow,
  type StampEventRow,
  absenceRequests,
  employees,
  exportJobs,
  stampEvents,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { RuleResolutionService } from '../rules/rule-resolution.service';
import { closeOverCorrections, stampCorrectorFetcher } from '../stamping/event-window';
import { WorkLocationService } from '../work-location/work-location.service';
import { type GobdRecord, checksum, serializeGobd } from './export.serialize';

const ABSENCE_CATEGORY: Record<string, PayrollCategory> = {
  vacation: 'vacation',
  sick: 'sick',
  special: 'special',
};

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

export interface ExportResult {
  jobId: string;
  kind: 'gobd_time' | 'payroll_generic';
  format: 'csv' | 'json';
  from: string;
  to: string;
  rowCount: number;
  checksum: string;
  content: string;
}

function toRecord(row: StampEventRow): GobdRecord {
  return {
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    event_id: row.id,
    kind: row.kind,
    occurred_at: row.occurredAt.toISOString(),
    source: row.source,
    corrects_event_id: row.correctsEventId,
    correction_reason: row.correctionReason,
    client_event_id: row.clientEventId,
    created_at: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ExportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
    private readonly workLocations: WorkLocationService,
    private readonly rules: RuleResolutionService,
  ) {}

  /**
   * Erzeugt einen reproduzierbaren GoBD-Prüfexport der Stempel-Rohdaten im
   * Zeitraum, protokolliert ihn als unveränderlichen ExportJob mit Prüfsumme und
   * schreibt ein AuditEvent 'export.run' (Kern-Invariante 2). Gleiche Daten +
   * gleicher Zeitraum + gleiches Format ergeben dieselbe Prüfsumme.
   */
  async runGobd(from: string, to: string, format: 'csv' | 'json'): Promise<ExportResult> {
    const ctx = this.tenantContext.require();
    // BEWUSST UTC-Periodengrenzen: der GoBD-Pruefexport ist ein ROHDATEN-Export
    // (alle Ereignisse eines Zeitfensters, reproduzierbar per Pruefsumme). Die
    // fachliche Zuordnung zu Abrechnungstagen erfolgt im Lohnexport (ADR-0018).
    const start = new Date(`${from}T00:00:00.000Z`);
    const endExclusive = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);

    const { job, rowCount, sum, content } = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const rows = await tx
        .select()
        .from(stampEvents)
        .where(
          and(
            eq(stampEvents.tenantId, ctx.tenantId),
            gte(stampEvents.occurredAt, start),
            lt(stampEvents.occurredAt, endExclusive),
          ),
        )
        // Stabile Sortierung -> reproduzierbarer Inhalt/Prüfsumme.
        .orderBy(asc(stampEvents.employeeId), asc(stampEvents.occurredAt), asc(stampEvents.id));

      const content = serializeGobd(rows.map(toRecord), format);
      const sum = checksum(content);
      const inserted = await tx
        .insert(exportJobs)
        .values({
          tenantId: ctx.tenantId,
          kind: 'gobd_time',
          periodFrom: from,
          periodTo: to,
          format,
          rowCount: rows.length,
          checksum: sum,
          requestedBy: ctx.userId,
        })
        .returning();
      return { job: inserted[0], rowCount: rows.length, sum, content };
    });

    if (!job) {
      throw new Error('Export konnte nicht protokolliert werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'export.run',
      actorId: ctx.userId,
      subjectType: 'export_job',
      subjectId: job.id,
      payload: { kind: 'gobd_time', from, to, format, rowCount, checksum: sum },
    });

    return { jobId: job.id, kind: 'gobd_time', format, from, to, rowCount, checksum: sum, content };
  }

  /**
   * Generischer Lohnexport (D3-Gerüst). Aggregiert je Mitarbeitenden die
   * Arbeitszeit (Minuten) und genehmigte Abwesenheiten (Arbeitstage) im Zeitraum
   * und bildet sie über die mandantenseitige Mapping-Tabelle auf
   * Abrechnungsschlüssel ab. Ausgabe ist ein GENERISCHES, neutrales CSV - KEIN
   * DATEV-Datensatzformat (CLAUDE.md §9). Wird wie der GoBD-Export als
   * unveränderlicher ExportJob mit Prüfsumme protokolliert (export.run).
   */
  async runPayroll(
    from: string,
    to: string,
    mapping: DatevMapping,
  ): Promise<ExportResult & { unmapped: Array<{ category: PayrollCategory; value: number }> }> {
    const ctx = this.tenantContext.require();
    const aggregates = await this.aggregatePayroll(from, to);
    const { items, unmapped } = mapToLineItems(aggregates, mapping);
    const content = toPayrollCsv(items);
    const sum = checksum(content);

    const job = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(exportJobs)
        .values({
          tenantId: ctx.tenantId,
          kind: 'payroll_generic',
          periodFrom: from,
          periodTo: to,
          format: 'csv',
          rowCount: items.length,
          checksum: sum,
          requestedBy: ctx.userId,
        })
        .returning();
      return inserted[0];
    });
    if (!job) {
      throw new Error('Lohnexport konnte nicht protokolliert werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'export.run',
      actorId: ctx.userId,
      subjectType: 'export_job',
      subjectId: job.id,
      payload: { kind: 'payroll_generic', from, to, rowCount: items.length, checksum: sum },
    });

    return {
      jobId: job.id,
      kind: 'payroll_generic',
      format: 'csv',
      from,
      to,
      rowCount: items.length,
      checksum: sum,
      content,
      unmapped,
    };
  }

  /** Aggregiert Arbeitszeit (Minuten) und genehmigte Abwesenheiten (Tage) je Mitarbeitenden. */
  private async aggregatePayroll(from: string, to: string): Promise<PayrollAggregate[]> {
    const ctx = this.tenantContext.require();
    // Ladefenster mit 48-h-Kontext: Schichten, die vor `from` beginnen oder am
    // `to`-Tag ueber Mitternacht laufen, werden vollstaendig geladen; die
    // Zuordnung erfolgt anschliessend je Abrechnungstag (ADR-0018, K-02).
    const PAD_MS = 48 * 60 * 60 * 1000;
    const start = new Date(new Date(`${from}T00:00:00.000Z`).getTime() - PAD_MS);
    const endExclusive = new Date(
      new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 + PAD_MS,
    );

    const { emps, stamps, absences } = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const empRows = await tx.select().from(employees).where(eq(employees.tenantId, ctx.tenantId));
      const stampBase = await tx
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
      // Korrektur-Abschluss: eine Korrektur ausserhalb des Ladefensters darf
      // ihr Original im Lohnexport nicht wieder wirksam machen (F-01-Basis).
      const stampRows = await closeOverCorrections(
        stampBase,
        stampCorrectorFetcher(tx, ctx.tenantId),
      );
      const absenceRows = await tx
        .select()
        .from(absenceRequests)
        .where(
          and(eq(absenceRequests.tenantId, ctx.tenantId), eq(absenceRequests.status, 'approved')),
        );
      return { emps: empRows, stamps: stampRows, absences: absenceRows };
    });

    const personnel = new Map(emps.map((e) => [e.id, e.personnelNumber]));

    // Arbeitszeit je Mitarbeitenden: schichtbasiert je ABRECHNUNGSTAG (lokaler
    // Tag des Schichtbeginns in der Einsatzort-Zeitzone, ADR-0016/0018); nur
    // Tage im Zeitraum [from, to] zaehlen - Nachtschichten wandern nicht in den
    // falschen Abrechnungsmonat (K-02). Offene Segmente materialisieren zum
    // Zeitraumende bzw. "jetzt" (das Fruehere), deterministisch fuer Historie.
    const byEmployee = new Map<string, StampEvent[]>();
    for (const row of stamps) {
      const bucket = byEmployee.get(row.employeeId) ?? [];
      bucket.push(toStampEvent(row));
      byEmployee.set(row.employeeId, bucket);
    }
    const rangeEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + PAD_MS);
    const nowTs = new Date();
    const materializeAt = nowTs.getTime() < rangeEnd.getTime() ? nowTs : rangeEnd;
    const workedByEmployee = new Map<string, number>();
    const activeRuleSets = await this.rules.loadActiveRuleSets();
    for (const [employeeId, events] of byEmployee) {
      const tz = (await this.workLocations.resolve(employeeId, from)).timeZone;
      const packageFor = this.rules.buildResolver(this.rules.sourcesFor(activeRuleSets, employeeId));
      const days = buildAccountingDays(events, tz, packageFor, materializeAt).filter(
        (d) => d.date >= from && d.date <= to,
      );
      // ADR-0019: Unaufgeloeste Schichten (Ende unbekannt) werden NICHT
      // exportiert - Lohn zahlt nie auf eine Untergrenze. Die Aufloesung
      // erfolgt durch Menschen; der Perioden-Freeze (F-03, Schnitt 5) wird
      // solche Perioden zusaetzlich blockieren.
      let minutes = 0;
      for (const day of days) {
        const graceMs = packageFor(day.date).params.openShiftGraceMinutes * 60_000;
        for (const shift of day.shifts) {
          if (shiftResolution(shift, materializeAt, graceMs) === 'unresolved') continue;
          minutes += totalMinutes(materializeShift(shift, materializeAt, graceMs).workIntervals);
        }
      }
      if (minutes > 0) workedByEmployee.set(employeeId, minutes);
    }

    // Genehmigte Abwesenheiten je Mitarbeitenden/Kategorie (Arbeitstage im Schnitt
    // mit dem Exportzeitraum). Ohne Standortbezug ohne Feiertagsabzug (Mo–Fr).
    const absenceDays = new Map<string, number>();
    for (const a of absences) {
      const fromDate = a.fromDate > from ? a.fromDate : from;
      const toDate = a.toDate < to ? a.toDate : to;
      if (fromDate > toDate) continue;
      const days = countWorkingDays(fromDate, toDate, () => false);
      const category = ABSENCE_CATEGORY[a.type];
      if (!category) continue;
      const key = `${a.employeeId}|${category}`;
      absenceDays.set(key, (absenceDays.get(key) ?? 0) + days);
    }

    const aggregates: PayrollAggregate[] = [];
    for (const [employeeId, minutes] of workedByEmployee) {
      const pn = personnel.get(employeeId);
      if (pn && minutes > 0) {
        aggregates.push({ personnelNumber: pn, category: 'work_time', value: minutes, unit: 'minutes' });
      }
    }
    for (const [key, days] of absenceDays) {
      const [employeeId, category] = key.split('|') as [string, PayrollCategory];
      const pn = personnel.get(employeeId);
      if (pn && days > 0) {
        aggregates.push({ personnelNumber: pn, category, value: days, unit: 'days' });
      }
    }
    // Stabile Reihenfolge für reproduzierbaren Export.
    return aggregates.sort((a, b) =>
      a.personnelNumber === b.personnelNumber
        ? a.category.localeCompare(b.category)
        : a.personnelNumber.localeCompare(b.personnelNumber),
    );
  }

  /** Listet die protokollierten Exporte des Mandanten (ohne Inhalt). */
  async list(): Promise<ExportJobRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(exportJobs)
        .where(eq(exportJobs.tenantId, ctx.tenantId))
        .orderBy(asc(exportJobs.createdAt));
    });
  }
}
