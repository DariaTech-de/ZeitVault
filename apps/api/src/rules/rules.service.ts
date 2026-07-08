import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  ARBZG_2026_V1,
  DEFAULT_RULE_PACKAGES,
  RuleConflictError,
  type RuleSetSource,
  resolveEffectiveParams,
  selectRulePackage,
} from '@zeitvault/domain';
import type {
  AssignEmployeeGroup,
  CreateCollectiveAgreement,
  CreateEmployeeGroup,
  CreateRuleSet,
} from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type CollectiveAgreementRow,
  type EmployeeGroupMemberRow,
  type EmployeeGroupRow,
  type RuleSetRow,
  collectiveAgreements,
  employeeGroupMembers,
  employeeGroups,
  employees,
  ruleSets,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { ReprocessingService } from './reprocessing.service';

/**
 * Stammdaten der Regelschicht (B-08/B-10): Tarifvertraege/Betriebs-
 * vereinbarungen und persistente, versionierte Regelsaetze. Aktive
 * Regelsaetze werden nicht editiert - Aenderung = neuer Satz (eigene
 * Gueltigkeit) + Deaktivierung des alten; jeder Schreibpfad ist auditiert
 * (G-01) und Konflikte werden bereits beim Anlegen abgewiesen (B-09).
 */
@Injectable()
export class RulesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
    private readonly reprocessing: ReprocessingService,
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

  async createAgreement(input: CreateCollectiveAgreement): Promise<CollectiveAgreementRow> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      if (input.basedOnId) {
        const base = await tx
          .select()
          .from(collectiveAgreements)
          .where(
            and(
              eq(collectiveAgreements.tenantId, tenantId),
              eq(collectiveAgreements.id, input.basedOnId),
            ),
          );
        if (!base[0]) throw new NotFoundException('Ermächtigender Tarifvertrag nicht gefunden.');
        if (base[0].kind !== 'collective_agreement') {
          throw new BadRequestException(
            'basedOnId muss auf einen Tarifvertrag zeigen (§ 7 ArbZG: BV aufgrund TV).',
          );
        }
      }
      const inserted = await tx
        .insert(collectiveAgreements)
        .values({
          tenantId,
          kind: input.kind,
          name: input.name,
          reference: input.reference ?? null,
          basedOnId: input.basedOnId ?? null,
          validFrom: input.validFrom,
          validTo: input.validTo ?? null,
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Tarifwerk konnte nicht angelegt werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'collective_agreement.create',
      actorId: ctx.userId,
      subjectType: 'collective_agreement',
      subjectId: row.id,
      payload: { kind: row.kind, name: row.name, validFrom: row.validFrom },
    });
    return row;
  }

  async listAgreements(): Promise<CollectiveAgreementRow[]> {
    return this.tx(async (tx, tenantId) =>
      tx
        .select()
        .from(collectiveAgreements)
        .where(eq(collectiveAgreements.tenantId, tenantId))
        .orderBy(asc(collectiveAgreements.validFrom)),
    );
  }

  async deactivateAgreement(id: string): Promise<void> {
    const ctx = this.tenantContext.require();
    await this.tx(async (tx, tenantId) => {
      const referencing = await tx
        .select({ id: ruleSets.id })
        .from(ruleSets)
        .where(
          and(
            eq(ruleSets.tenantId, tenantId),
            eq(ruleSets.collectiveAgreementId, id),
            eq(ruleSets.active, true),
          ),
        );
      if (referencing.length > 0) {
        throw new ConflictException(
          'Tarifwerk wird von aktiven Regelsätzen referenziert - zuerst die Regelsätze deaktivieren.',
        );
      }
      const updated = await tx
        .update(collectiveAgreements)
        .set({ active: false })
        .where(and(eq(collectiveAgreements.tenantId, tenantId), eq(collectiveAgreements.id, id)))
        .returning();
      if (updated.length === 0) throw new NotFoundException('Tarifwerk nicht gefunden.');
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'collective_agreement.deactivate',
      actorId: ctx.userId,
      subjectType: 'collective_agreement',
      subjectId: id,
      payload: {},
    });
  }

  /**
   * Legt einen Regelsatz an (= aktiviert ihn). B-08: TV-/BV-Ebene erfordert
   * eine existierende, aktive collective_agreement-Referenz passender Art.
   * B-09: Der neue Satz wird gegen die bereits aktiven Saetze probeweise
   * aufgeloest - Konflikte weisen das Anlegen mit 409 ab, statt spaetere
   * Bewertungen zu vergiften.
   */
  async createRuleSet(input: CreateRuleSet): Promise<RuleSetRow> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      if (input.layer !== 'individual') {
        const agreement = await tx
          .select()
          .from(collectiveAgreements)
          .where(
            and(
              eq(collectiveAgreements.tenantId, tenantId),
              eq(collectiveAgreements.id, input.collectiveAgreementId!),
            ),
          );
        if (!agreement[0] || !agreement[0].active) {
          throw new BadRequestException(
            'Abweichender Regelsatz erfordert ein existierendes, aktives collective_agreement-Objekt (B-08).',
          );
        }
        if (agreement[0].kind !== input.layer) {
          throw new BadRequestException(
            `Referenziertes Tarifwerk ist '${agreement[0].kind}', der Regelsatz liegt aber auf Ebene '${input.layer}'.`,
          );
        }
      } else {
        const emp = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.tenantId, tenantId), eq(employees.id, input.employeeId!)));
        if (!emp[0]) throw new NotFoundException('Mitarbeitender nicht gefunden.');
      }
      if (input.employeeGroupId) {
        const grp = await tx
          .select({ id: employeeGroups.id, active: employeeGroups.active })
          .from(employeeGroups)
          .where(
            and(eq(employeeGroups.tenantId, tenantId), eq(employeeGroups.id, input.employeeGroupId)),
          );
        if (!grp[0] || !grp[0].active) {
          throw new BadRequestException('Mitarbeitergruppe nicht gefunden oder inaktiv.');
        }
      }

      // Probe-Aufloesung gegen die aktiven Saetze an allen Grenzdaten.
      const existing = await tx
        .select()
        .from(ruleSets)
        .where(and(eq(ruleSets.tenantId, tenantId), eq(ruleSets.active, true)));
      const candidate: RuleSetSource = {
        name: input.name,
        layer: input.layer,
        collectiveAgreementId: input.collectiveAgreementId ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
        params: input.params,
      };
      // Probe: gruppen-gescopte Saetze ANDERER Gruppen gelten nie fuer
      // dieselbe Person wie der Kandidat mit seinem Scope - Konflikte durch
      // ueberlappende Mitgliedschaften werden zur Bewertungszeit gemeldet.
      const sources: RuleSetSource[] = [
        ...existing
          .filter((r) => r.layer !== 'individual' || r.employeeId === (input.employeeId ?? null))
          .filter(
            (r) =>
              !r.employeeGroupId ||
              r.employeeGroupId === (input.employeeGroupId ?? null),
          )
          .map((r) => ({
            id: r.id,
            name: r.name,
            layer: r.layer,
            collectiveAgreementId: r.collectiveAgreementId,
            validFrom: r.validFrom,
            validTo: r.validTo,
            params: r.params,
          })),
        candidate,
      ];
      const probeDates = new Set<string>([input.validFrom]);
      if (input.validTo) probeDates.add(input.validTo);
      for (const r of existing) {
        if (r.validFrom >= input.validFrom) probeDates.add(r.validFrom);
      }
      try {
        for (const date of probeDates) {
          const law = selectRulePackage(DEFAULT_RULE_PACKAGES, date) ?? ARBZG_2026_V1;
          resolveEffectiveParams(date, law, sources);
        }
      } catch (err) {
        if (err instanceof RuleConflictError) throw new ConflictException(err.message);
        throw err;
      }

      const inserted = await tx
        .insert(ruleSets)
        .values({
          tenantId,
          name: input.name,
          layer: input.layer,
          collectiveAgreementId: input.collectiveAgreementId ?? null,
          employeeId: input.employeeId ?? null,
          employeeGroupId: input.employeeGroupId ?? null,
          validFrom: input.validFrom,
          validTo: input.validTo ?? null,
          params: input.params,
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Regelsatz konnte nicht angelegt werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'rule_set.create',
      actorId: ctx.userId,
      subjectType: 'rule_set',
      subjectId: row.id,
      payload: {
        name: row.name,
        layer: row.layer,
        validFrom: row.validFrom,
        ...(row.validTo ? { validTo: row.validTo } : {}),
        ...(row.collectiveAgreementId ? { collectiveAgreementId: row.collectiveAgreementId } : {}),
        params: JSON.stringify(row.params),
      },
    });
    // B-10: Ein rueckwirkend wirksamer Regelsatz loest die Neubewertung der
    // betroffenen Tage aus (Lauf wird protokolliert; Differenzen: F-04).
    await this.reprocessing.runForRuleSet(row);
    return row;
  }

  /** Mitarbeitergruppe anlegen (B-11; auditiert, G-01). */
  async createGroup(input: CreateEmployeeGroup): Promise<EmployeeGroupRow> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      const inserted = await tx
        .insert(employeeGroups)
        .values({ tenantId, name: input.name })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Mitarbeitergruppe konnte nicht angelegt werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'employee_group.create',
      actorId: ctx.userId,
      subjectType: 'employee_group',
      subjectId: row.id,
      payload: { name: row.name },
    });
    return row;
  }

  async listGroups(): Promise<EmployeeGroupRow[]> {
    return this.tx(async (tx, tenantId) =>
      tx.select().from(employeeGroups).where(eq(employeeGroups.tenantId, tenantId)),
    );
  }

  /** Mitgliedschaft mit Gueltigkeit (B-11; auditiert). */
  async assignGroupMember(input: AssignEmployeeGroup): Promise<EmployeeGroupMemberRow> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      const grp = await tx
        .select({ id: employeeGroups.id, active: employeeGroups.active })
        .from(employeeGroups)
        .where(and(eq(employeeGroups.tenantId, tenantId), eq(employeeGroups.id, input.groupId)));
      if (!grp[0] || !grp[0].active) {
        throw new NotFoundException('Mitarbeitergruppe nicht gefunden oder inaktiv.');
      }
      const emp = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, input.employeeId)));
      if (!emp[0]) throw new NotFoundException('Mitarbeitender nicht gefunden.');
      const inserted = await tx
        .insert(employeeGroupMembers)
        .values({
          tenantId,
          groupId: input.groupId,
          employeeId: input.employeeId,
          validFrom: input.validFrom,
          validTo: input.validTo ?? null,
        })
        .returning();
      return inserted[0];
    });
    if (!row) throw new Error('Mitgliedschaft konnte nicht gespeichert werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'employee_group.assign',
      actorId: ctx.userId,
      subjectType: 'employee',
      subjectId: input.employeeId,
      payload: {
        groupId: input.groupId,
        validFrom: input.validFrom,
        validTo: input.validTo ?? '',
      },
    });
    return row;
  }

  async listRuleSets(): Promise<RuleSetRow[]> {
    return this.tx(async (tx, tenantId) =>
      tx
        .select()
        .from(ruleSets)
        .where(eq(ruleSets.tenantId, tenantId))
        .orderBy(asc(ruleSets.validFrom)),
    );
  }

  /** Deaktiviert einen Regelsatz (kein DELETE; Historie bleibt, G-02). */
  async deactivateRuleSet(id: string): Promise<RuleSetRow> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      const updated = await tx
        .update(ruleSets)
        .set({ active: false })
        .where(and(eq(ruleSets.tenantId, tenantId), eq(ruleSets.id, id)))
        .returning();
      if (!updated[0]) throw new NotFoundException('Regelsatz nicht gefunden.');
      return updated[0];
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'rule_set.deactivate',
      actorId: ctx.userId,
      subjectType: 'rule_set',
      subjectId: id,
      payload: { name: row.name, layer: row.layer },
    });
    // B-10: Auch das Deaktivieren aendert die Bewertung rueckwirkend.
    await this.reprocessing.runForRuleSet(row);
    return row;
  }
}
