import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { nextEauStatus } from '@zeitvault/domain';
import type { CreateEauRequest } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type EauRequestRow, eauRequests } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { EauGateway } from './eau.gateway';

@Injectable()
export class EauService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly gateway: EauGateway,
    private readonly audit: AuditClient,
  ) {}

  /**
   * Stößt einen eAU-Abruf an (Status 'requested') und übergibt ihn asynchron an
   * den Gateway-Port; bei Erfolg Status 'submitted' mit externer Referenz. KEIN
   * Gesundheitsinhalt wird gespeichert/protokolliert (Datensparsamkeit).
   */
  async createRequest(input: CreateEauRequest): Promise<EauRequestRow> {
    const ctx = this.tenantContext.require();
    const created = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(eauRequests)
        .values({
          tenantId: ctx.tenantId,
          employeeId: input.employeeId,
          fromDate: input.from,
          toDate: input.to,
        })
        .returning();
      return inserted[0];
    });
    if (!created) {
      throw new Error('eAU-Abruf konnte nicht gespeichert werden.');
    }

    // Datensparsam: nur Zeitraum/Status, kein Diagnoseinhalt (Art. 9 DSGVO).
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'eau.request',
      actorId: ctx.userId,
      subjectType: 'eau_request',
      subjectId: created.id,
      payload: { from: created.fromDate, to: created.toDate, status: created.status },
    });

    // Asynchrone Übergabe an den (gekapselten) Gateway-Port.
    let status = created.status;
    let externalRef: string | null = null;
    let lastError: string | null = null;
    try {
      const result = await this.gateway.submit({
        requestId: created.id,
        employeeId: created.employeeId,
        from: created.fromDate,
        to: created.toDate,
      });
      status = nextEauStatus(created.status, 'submit');
      externalRef = result.externalRef;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Übergabe fehlgeschlagen.';
    }

    const updated = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const rows = await tx
        .update(eauRequests)
        .set({ status, externalRef, lastError, updatedAt: new Date() })
        .where(and(eq(eauRequests.tenantId, ctx.tenantId), eq(eauRequests.id, created.id)))
        .returning();
      return rows[0];
    });
    return updated ?? created;
  }

  async list(): Promise<EauRequestRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(eauRequests)
        .where(eq(eauRequests.tenantId, ctx.tenantId))
        .orderBy(asc(eauRequests.requestedAt));
    });
  }
}
