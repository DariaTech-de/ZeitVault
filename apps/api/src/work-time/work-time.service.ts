import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import {
  type Bundesland,
  type Holiday,
  type SurchargeResult,
  type WorkSpan,
  ZUSCHLAEGE_BASIS_2026_V1,
  computeSurcharges,
  germanHolidays,
  isGermanHoliday,
} from '@zeitvault/domain';
import type { CreateWorkTimeModel } from '@zeitvault/types';
import { TenantContextService } from '../common/tenant-context.service';
import { type WorkTimeModelRow, workTimeModels } from '../db/schema';
import { DB, type Database } from '../db/tokens';

@Injectable()
export class WorkTimeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(input: CreateWorkTimeModel): Promise<WorkTimeModelRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(workTimeModels)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          validFrom: input.validFrom,
          validTo: input.validTo,
          targetMinutes: [...input.targetMinutesByWeekday],
        })
        .returning();
      return inserted[0];
    });
    if (!row) {
      throw new Error('Arbeitszeitmodell konnte nicht gespeichert werden.');
    }
    return row;
  }

  async list(): Promise<WorkTimeModelRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(workTimeModels)
        .where(eq(workTimeModels.tenantId, ctx.tenantId))
        .orderBy(asc(workTimeModels.validFrom));
    });
  }

  /** Feiertage (rein berechnet, ohne DB) fuer Jahr + Bundesland. */
  holidays(year: number, land: Bundesland): Holiday[] {
    return germanHolidays(year, land);
  }

  /**
   * Zuschlagsvorschau (Nacht/Sonntag/Feiertag) fuer gearbeitete Spannen anhand
   * des Basis-Regelpakets (C3). Rein berechnet; Feiertage je Bundesland.
   */
  surcharges(spans: WorkSpan[], land: Bundesland): SurchargeResult[] {
    return computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, {
      isHoliday: (iso) => isGermanHoliday(iso, land),
    });
  }
}
