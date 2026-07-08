import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  ARBZG_2026_V1,
  RuleConflictError,
  type RulePackage,
  type RuleSetSource,
  resolveEffectiveParams,
  selectLawPackage,
} from '@zeitvault/domain';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type EmployeeGroupMemberRow,
  type RuleSetRow,
  employeeGroupMembers,
  employees,
  ruleSets,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';

/** (Datum) -> wirksames Regelpaket; wirft ConflictException bei Regel-Konflikt. */
export type RulePackageResolver = (isoDate: string) => RulePackage;

/**
 * Loest je Abrechnungstag das wirksame Regelpaket auf (B-09): Gesetz
 * (versioniertes Code-Paket, ADR-0009) + aktive persistierte Regelsaetze des
 * Mandanten (B-08/B-10). Individuelle Regelsaetze wirken nur fuer den
 * jeweiligen Mitarbeitenden. Konflikte werden als 409 sichtbar - keine
 * stille Priorisierung (B-09-AK).
 *
 * Fuer Mehr-Mitarbeiter-Laeufe (Report, Export, Dashboard, Reprocessing)
 * einmal `loadActiveRuleSets()` laden und je Mitarbeitendem
 * `buildResolver(sourcesFor(rows, employeeId))` bauen - eine DB-Abfrage
 * statt N.
 */
@Injectable()
export class RuleResolutionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Alle aktiven Regelsaetze des Mandanten (eine Abfrage). */
  async loadActiveRuleSets(): Promise<RuleSetRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(ruleSets)
        .where(and(eq(ruleSets.tenantId, ctx.tenantId), eq(ruleSets.active, true)));
    });
  }

  /** Alle Gruppen-Mitgliedschaften des Mandanten (eine Abfrage). */
  async loadGroupMemberships(): Promise<EmployeeGroupMemberRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(employeeGroupMembers)
        .where(eq(employeeGroupMembers.tenantId, ctx.tenantId));
    });
  }

  /**
   * Quellen fuer einen Mitarbeitenden: mandantenweite Saetze + SEINE
   * individuellen Saetze + gruppen-gescopte Saetze (B-11), deren Gueltigkeit
   * mit seinen Mitgliedschafts-Intervallen geschnitten wird - die Domain-
   * Aufloesung bleibt dadurch rein datumsbasiert.
   */
  sourcesFor(
    rows: readonly RuleSetRow[],
    employeeId?: string,
    memberships: readonly EmployeeGroupMemberRow[] = [],
  ): RuleSetSource[] {
    const sources: RuleSetSource[] = [];
    const mine = employeeId ? memberships.filter((m) => m.employeeId === employeeId) : [];
    for (const r of rows) {
      if (r.layer === 'individual' && (!employeeId || r.employeeId !== employeeId)) continue;
      const base: RuleSetSource = {
        id: r.id,
        name: r.name,
        layer: r.layer,
        collectiveAgreementId: r.collectiveAgreementId,
        validFrom: r.validFrom,
        validTo: r.validTo,
        params: r.params,
      };
      if (!r.employeeGroupId) {
        sources.push(base);
        continue;
      }
      for (const m of mine.filter((mm) => mm.groupId === r.employeeGroupId)) {
        const from = m.validFrom > r.validFrom ? m.validFrom : r.validFrom;
        const toCandidates = [m.validTo, r.validTo].filter((x): x is string => x !== null);
        const to = toCandidates.length > 0 ? toCandidates.sort()[0]! : null;
        if (to !== null && from > to) continue;
        sources.push({ ...base, validFrom: from, validTo: to });
      }
    }
    return sources;
  }

  /** Geburtsdaten aller Mitarbeitenden (B-07-Baseline; eine Abfrage). */
  async loadBirthDates(): Promise<Map<string, string | null>> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select({ id: employees.id, birthDate: employees.birthDate })
        .from(employees)
        .where(eq(employees.tenantId, ctx.tenantId));
    });
    return new Map(rows.map((r) => [r.id, r.birthDate]));
  }

  /**
   * Baut aus Quellen einen (Datum)->Paket-Resolver (rein, synchron). Die
   * Gesetzes-Baseline haengt am Geburtsdatum (B-07): unter 18 gilt das
   * JArbSchG-Paket, ab dem 18. Geburtstag automatisch das ArbZG.
   */
  buildResolver(
    sources: readonly RuleSetSource[],
    birthDate?: string | null,
  ): RulePackageResolver {
    return (isoDate: string) => {
      const law = selectLawPackage(isoDate, birthDate) ?? ARBZG_2026_V1;
      try {
        const { params } = resolveEffectiveParams(isoDate, law, sources);
        return { ...law, params };
      } catch (err) {
        if (err instanceof RuleConflictError) {
          throw new ConflictException(err.message);
        }
        throw err;
      }
    };
  }

  /** Bequemer Einstieg fuer Einzel-Mitarbeiter-Pfade (Stempeln, Heute, Timesheet). */
  async resolverFor(employeeId?: string): Promise<RulePackageResolver> {
    const rows = await this.loadActiveRuleSets();
    const memberships = employeeId ? await this.loadGroupMemberships() : [];
    const birthDate = employeeId ? ((await this.loadBirthDates()).get(employeeId) ?? null) : null;
    return this.buildResolver(this.sourcesFor(rows, employeeId, memberships), birthDate);
  }

  /** Quellen fuer die Herkunfts-Anzeige (GET /rules/effective). */
  async loadSources(employeeId?: string): Promise<RuleSetSource[]> {
    const memberships = employeeId ? await this.loadGroupMemberships() : [];
    return this.sourcesFor(await this.loadActiveRuleSets(), employeeId, memberships);
  }
}
