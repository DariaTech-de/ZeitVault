import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  ARBZG_2026_V1,
  DEFAULT_RULE_PACKAGES,
  RuleConflictError,
  type RulePackage,
  type RuleSetSource,
  resolveEffectiveParams,
  selectRulePackage,
} from '@zeitvault/domain';
import { TenantContextService } from '../common/tenant-context.service';
import { type RuleSetRow, ruleSets } from '../db/schema';
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

  /** Quellen fuer einen Mitarbeitenden: Mandanten-Ebenen + SEINE individuellen Saetze. */
  sourcesFor(rows: readonly RuleSetRow[], employeeId?: string): RuleSetSource[] {
    return rows
      .filter((r) => r.layer !== 'individual' || (employeeId && r.employeeId === employeeId))
      .map((r) => ({
        id: r.id,
        name: r.name,
        layer: r.layer,
        collectiveAgreementId: r.collectiveAgreementId,
        validFrom: r.validFrom,
        validTo: r.validTo,
        params: r.params,
      }));
  }

  /** Baut aus Quellen einen (Datum)->Paket-Resolver (rein, synchron). */
  buildResolver(sources: readonly RuleSetSource[]): RulePackageResolver {
    return (isoDate: string) => {
      const law = selectRulePackage(DEFAULT_RULE_PACKAGES, isoDate) ?? ARBZG_2026_V1;
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
    return this.buildResolver(this.sourcesFor(rows, employeeId));
  }

  /** Quellen fuer die Herkunfts-Anzeige (GET /rules/effective). */
  async loadSources(employeeId?: string): Promise<RuleSetSource[]> {
    return this.sourcesFor(await this.loadActiveRuleSets(), employeeId);
  }
}
