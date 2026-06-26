import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant-context.service';
import { employees } from '../db/schema';
import { DB, type Database } from '../db/tokens';

export interface EmployeeSummary {
  id: string;
  personnelNumber: string;
  displayName: string;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Mitarbeitende des Mandanten (RLS-mandantenscharf). */
  async listEmployees(): Promise<EmployeeSummary[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select({
          id: employees.id,
          personnelNumber: employees.personnelNumber,
          displayName: employees.displayName,
        })
        .from(employees)
        .where(eq(employees.tenantId, ctx.tenantId))
        .orderBy(asc(employees.personnelNumber));
    });
  }
}
