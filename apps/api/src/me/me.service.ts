import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant-context.service';
import { employees } from '../db/schema';
import { DB, type Database } from '../db/tokens';

export interface MeResponse {
  tenantId: string;
  userId: string;
  roles: string[];
  employee: { id: string; displayName: string; personnelNumber: string } | null;
}

@Injectable()
export class MeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Liefert den aktuellen Auth-Kontext und den verknüpften Mitarbeiter-Datensatz.
   * Die Zuordnung erfolgt über `external_id == sub` (aus dem OIDC-Token). Ist kein
   * Mitarbeiter verknüpft, ist `employee` null (z. B. reiner Administrator).
   */
  async me(): Promise<MeResponse> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.externalId, ctx.userId)))
        .limit(1);
    });
    const row = rows[0];
    return {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roles: ctx.roles,
      employee: row
        ? { id: row.id, displayName: row.displayName, personnelNumber: row.personnelNumber }
        : null,
    };
  }
}
