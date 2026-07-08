import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { assertValidTimeZone } from '@zeitvault/domain';
import type {
  AssignWorkLocation,
  CreateWorkLocation,
  ResolvedWorkLocation,
  WorkLocationSummary,
} from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type EmployeeWorkLocationRow,
  type WorkLocationRow,
  employeeWorkLocations,
  employees,
  workLocations,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';

/**
 * Es gibt KEINE Fallback-Zeitzone: Der Mandanten-Default-Einsatzort ist ein
 * Pflicht-Stammdatum (Seed/Onboarding legt ihn an). Eine stille Annahme wie
 * 'Europe/Berlin' wuerde Abrechnungstage und (ab Schnitt 4) Zuschlaege leise
 * falsch bewerten - lautes Scheitern schlaegt leise falsche Bewertung.
 */
const MISSING_DEFAULT_MESSAGE =
  'Kein Einsatzort auflösbar: Für den Mandanten ist kein Standard-Einsatzort ' +
  'hinterlegt. Bitte unter Einsatzorte einen Standard-Einsatzort anlegen (Pflicht-Stammdatum).';

function toSummary(row: WorkLocationRow): WorkLocationSummary {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.countryCode,
    stateCode: row.stateCode,
    municipalityCode: row.municipalityCode,
    timeZone: row.timeZone,
    isDefault: row.isDefault,
    active: row.active,
  };
}

function toResolved(
  row: WorkLocationRow,
  resolvedFrom: ResolvedWorkLocation['resolvedFrom'],
): ResolvedWorkLocation {
  return {
    workLocationId: row.id,
    timeZone: row.timeZone,
    countryCode: row.countryCode,
    stateCode: row.stateCode,
    municipalityCode: row.municipalityCode,
    resolvedFrom,
  };
}

@Injectable()
export class WorkLocationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  private tx<T>(
    fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0], tenantId: string) => Promise<T>,
  ): Promise<T> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return fn(tx, ctx.tenantId);
    });
  }

  /** Legt einen Einsatzort an (Stammdaten; auditiert, G-01). */
  async create(input: CreateWorkLocation): Promise<WorkLocationSummary> {
    const ctx = this.tenantContext.require();
    try {
      assertValidTimeZone(input.timeZone);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Ungueltige Zeitzone.');
    }
    if (input.countryCode === 'DE' && !input.stateCode) {
      throw new BadRequestException(
        'Fuer Einsatzorte in Deutschland ist das Bundesland (stateCode) erforderlich (Feiertagsrecht, C-08).',
      );
    }
    const row = await this.tx(async (tx, tenantId) => {
      if (input.isDefault) {
        // Es gibt hoechstens EINEN Mandanten-Default.
        await tx
          .update(workLocations)
          .set({ isDefault: false })
          .where(and(eq(workLocations.tenantId, tenantId), eq(workLocations.isDefault, true)));
      }
      const inserted = await tx
        .insert(workLocations)
        .values({
          tenantId,
          name: input.name,
          countryCode: input.countryCode,
          stateCode: input.stateCode ?? null,
          municipalityCode: input.municipalityCode ?? null,
          timeZone: input.timeZone,
          isDefault: input.isDefault,
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Einsatzort konnte nicht angelegt werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'work_location.create',
      actorId: ctx.userId,
      subjectType: 'work_location',
      subjectId: row.id,
      payload: {
        name: row.name,
        countryCode: row.countryCode,
        stateCode: row.stateCode ?? '',
        timeZone: row.timeZone,
        isDefault: row.isDefault,
      },
    });
    return toSummary(row);
  }

  async list(): Promise<WorkLocationSummary[]> {
    return this.tx(async (tx, tenantId) =>
      (
        await tx
          .select()
          .from(workLocations)
          .where(eq(workLocations.tenantId, tenantId))
          .orderBy(asc(workLocations.name))
      ).map(toSummary),
    );
  }

  /** Deaktiviert einen Einsatzort (kein DELETE; Historie bleibt, G-02). */
  async deactivate(id: string): Promise<void> {
    const ctx = this.tenantContext.require();
    const updated = await this.tx(async (tx, tenantId) =>
      tx
        .update(workLocations)
        .set({ active: false, isDefault: false })
        .where(and(eq(workLocations.tenantId, tenantId), eq(workLocations.id, id)))
        .returning(),
    );
    if (updated.length === 0) throw new NotFoundException('Einsatzort nicht gefunden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'work_location.deactivate',
      actorId: ctx.userId,
      subjectType: 'work_location',
      subjectId: id,
      payload: {},
    });
  }

  /** Ordnet einem Mitarbeitenden einen Standard-Einsatzort zu (mit Gueltigkeit). */
  async assign(input: AssignWorkLocation): Promise<EmployeeWorkLocationRow> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      const emp = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, input.employeeId)));
      if (!emp[0]) throw new NotFoundException('Mitarbeitender nicht gefunden.');
      const loc = await tx
        .select({ id: workLocations.id, active: workLocations.active })
        .from(workLocations)
        .where(and(eq(workLocations.tenantId, tenantId), eq(workLocations.id, input.workLocationId)));
      if (!loc[0]) throw new NotFoundException('Einsatzort nicht gefunden.');
      if (!loc[0].active) throw new BadRequestException('Einsatzort ist deaktiviert.');
      const inserted = await tx
        .insert(employeeWorkLocations)
        .values({
          tenantId,
          employeeId: input.employeeId,
          workLocationId: input.workLocationId,
          validFrom: input.validFrom,
          validTo: input.validTo ?? null,
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Zuordnung konnte nicht gespeichert werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'employee.work_location.assign',
      actorId: ctx.userId,
      subjectType: 'employee',
      subjectId: input.employeeId,
      payload: {
        workLocationId: input.workLocationId,
        validFrom: input.validFrom,
        validTo: input.validTo ?? '',
      },
    });
    return row;
  }

  async listAssignments(employeeId: string): Promise<EmployeeWorkLocationRow[]> {
    return this.tx(async (tx, tenantId) =>
      tx
        .select()
        .from(employeeWorkLocations)
        .where(
          and(
            eq(employeeWorkLocations.tenantId, tenantId),
            eq(employeeWorkLocations.employeeId, employeeId),
          ),
        )
        .orderBy(asc(employeeWorkLocations.validFrom)),
    );
  }

  /** Standard-Einsatzort des Mandanten (Pflicht-Stammdatum); wirft, wenn er fehlt. */
  async tenantDefault(): Promise<WorkLocationSummary> {
    const rows = await this.tx(async (tx, tenantId) =>
      tx
        .select()
        .from(workLocations)
        .where(
          and(
            eq(workLocations.tenantId, tenantId),
            eq(workLocations.isDefault, true),
            eq(workLocations.active, true),
          ),
        )
        .limit(1),
    );
    if (!rows[0]) throw new ConflictException(MISSING_DEFAULT_MESSAGE);
    return toSummary(rows[0]);
  }

  /**
   * Loest den fuer Mitarbeitenden + Datum wirksamen Einsatzort auf (ADR-0016):
   * Uebersteuerung (Stempel) > Zuordnung (juengstes validFrom, das das Datum
   * abdeckt) > Mandanten-Default. Existiert keiner davon, wird geworfen -
   * es gibt bewusst KEINEN stillen Zeitzonen-Fallback. Die Herkunft ist am
   * Ergebnis ablesbar; Bewertungen speichern das Ergebnis als Snapshot (F-05).
   */
  async resolve(
    employeeId: string,
    atIsoDate: string,
    overrideWorkLocationId?: string | null,
  ): Promise<ResolvedWorkLocation> {
    return this.tx(async (tx, tenantId) => {
      if (overrideWorkLocationId) {
        const rows = await tx
          .select()
          .from(workLocations)
          .where(and(eq(workLocations.tenantId, tenantId), eq(workLocations.id, overrideWorkLocationId)));
        if (rows[0]) return toResolved(rows[0], 'entry_override');
      }
      const assigned = await tx
        .select({ loc: workLocations })
        .from(employeeWorkLocations)
        .innerJoin(workLocations, eq(workLocations.id, employeeWorkLocations.workLocationId))
        .where(
          and(
            eq(employeeWorkLocations.tenantId, tenantId),
            eq(employeeWorkLocations.employeeId, employeeId),
            sql`${employeeWorkLocations.validFrom} <= ${atIsoDate}`,
            sql`(${employeeWorkLocations.validTo} IS NULL OR ${employeeWorkLocations.validTo} >= ${atIsoDate})`,
          ),
        )
        .orderBy(desc(employeeWorkLocations.validFrom))
        .limit(1);
      if (assigned[0]) return toResolved(assigned[0].loc, 'employee_assignment');
      const tenantDefault = await tx
        .select()
        .from(workLocations)
        .where(
          and(
            eq(workLocations.tenantId, tenantId),
            eq(workLocations.isDefault, true),
            eq(workLocations.active, true),
          ),
        )
        .limit(1);
      if (tenantDefault[0]) return toResolved(tenantDefault[0], 'tenant_default');
      throw new ConflictException(MISSING_DEFAULT_MESSAGE);
    });
  }
}
