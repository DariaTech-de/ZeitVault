import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DatevMapping, PayrollCategory } from '@zeitvault/domain';
import type { SetPayrollMappingInput } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type PayrollMappingRow, payrollMappings } from '../db/schema';
import { DB, type Database } from '../db/tokens';

/**
 * C-11: Mandantenspezifisches Lohnartenmapping, persistiert und ueber die
 * Oberflaeche pflegbar - Aenderungen sind ohne Deployment wirksam (der
 * naechste Export laedt den aktuellen Stand). Bewusst KEINE
 * DATEV-Feldlayouts (CLAUDE.md Abschnitt 9): nur die konfigurierbare
 * Zuordnung Kategorie -> Abrechnungsschluessel (+ Faktor je Bewertungsart,
 * C-09). Jede Aenderung erzeugt ein AuditEvent (Kern-Invariante 2:
 * lohnrelevante Konfiguration).
 */
@Injectable()
export class PayrollMappingService {
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

  async list(): Promise<PayrollMappingRow[]> {
    return this.tx(async (tx, tenantId) =>
      tx
        .select()
        .from(payrollMappings)
        .where(eq(payrollMappings.tenantId, tenantId))
        .orderBy(asc(payrollMappings.category)),
    );
  }

  /** Legt einen Mapping-Eintrag an oder aktualisiert ihn (Upsert je Kategorie). */
  async set(input: SetPayrollMappingInput): Promise<PayrollMappingRow> {
    const ctx = this.tenantContext.require();
    const row = await this.tx(async (tx, tenantId) => {
      const values = {
        tenantId,
        category: input.category,
        lohnart: input.lohnart,
        kostenstelle: input.kostenstelle ?? null,
        ausfallschluessel: input.ausfallschluessel ?? null,
        factorPercent: input.factorPercent ?? null,
        updatedAt: new Date(),
      };
      const upserted = await tx
        .insert(payrollMappings)
        .values(values)
        .onConflictDoUpdate({
          target: [payrollMappings.tenantId, payrollMappings.category],
          set: values,
        })
        .returning();
      return upserted[0];
    });
    if (!row) throw new Error('Lohnartenmapping konnte nicht gespeichert werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'payroll_mapping.set',
      actorId: ctx.userId,
      subjectType: 'payroll_mapping',
      subjectId: row.id,
      payload: {
        category: input.category,
        lohnart: input.lohnart,
        kostenstelle: input.kostenstelle ?? '',
        ausfallschluessel: input.ausfallschluessel ?? '',
        factorPercent: input.factorPercent ?? 100,
      },
    });
    return row;
  }

  /** Entfernt einen Mapping-Eintrag; die Kategorie erscheint dann als `unmapped`. */
  async remove(category: PayrollCategory): Promise<void> {
    const ctx = this.tenantContext.require();
    const deleted = await this.tx(async (tx, tenantId) =>
      tx
        .delete(payrollMappings)
        .where(and(eq(payrollMappings.tenantId, tenantId), eq(payrollMappings.category, category)))
        .returning(),
    );
    if (deleted.length === 0) throw new NotFoundException('Mapping-Eintrag nicht gefunden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'payroll_mapping.delete',
      actorId: ctx.userId,
      subjectType: 'payroll_mapping',
      subjectId: deleted[0]!.id,
      payload: { category },
    });
  }

  /** Aktuelles Mapping in der Form, die der Export konsumiert. */
  async getMapping(): Promise<DatevMapping> {
    const rows = await this.list();
    const mapping: DatevMapping = {};
    for (const row of rows) {
      mapping[row.category as PayrollCategory] = {
        lohnart: row.lohnart,
        ...(row.kostenstelle ? { kostenstelle: row.kostenstelle } : {}),
        ...(row.ausfallschluessel ? { ausfallschluessel: row.ausfallschluessel } : {}),
        ...(row.factorPercent !== null ? { factorPercent: row.factorPercent } : {}),
      };
    }
    return mapping;
  }
}
