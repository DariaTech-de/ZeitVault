import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { CreateTimeEntry } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type TimeEntryRow, timeEntries } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { buildCorrectionEntry, type CorrectionInput } from './time.logic';

@Injectable()
export class TimeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  /** Erfasst einen neuen Zeiteintrag (Revision 1) und schreibt ein AuditEvent. */
  async createEntry(input: CreateTimeEntry): Promise<TimeEntryRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      // Tenant-Kontext fuer RLS je Transaktion setzen (ADR-0004).
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(timeEntries)
        .values({
          tenantId: ctx.tenantId,
          employeeId: input.employeeId,
          startAt: new Date(input.start),
          endAt: input.end === null ? null : new Date(input.end),
          source: input.source,
        })
        .returning();
      return inserted[0];
    });
    if (!row) {
      throw new Error('Zeiteintrag konnte nicht erstellt werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'time_entry.create',
      actorId: ctx.userId,
      subjectType: 'time_entry',
      subjectId: row.id,
      payload: { revision: row.revision },
    });
    return row;
  }

  /**
   * Korrigiert einen Eintrag, indem eine NEUE Revision angelegt wird. Der
   * Vorgaenger bleibt unveraendert (Kern-Invariante 1; auf DB-Ebene zusaetzlich
   * per Trigger erzwungen).
   */
  async correctEntry(previousEntryId: string, input: CorrectionInput): Promise<TimeEntryRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const previousRows = await tx
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.id, previousEntryId), eq(timeEntries.tenantId, ctx.tenantId)));
      const previous = previousRows[0];
      if (!previous) {
        throw new NotFoundException('Vorgaenger-Eintrag nicht gefunden.');
      }
      const next = buildCorrectionEntry(
        {
          id: previous.id,
          tenantId: previous.tenantId,
          employeeId: previous.employeeId,
          source: previous.source,
          revision: previous.revision,
        },
        input,
      );
      const inserted = await tx.insert(timeEntries).values(next).returning();
      return inserted[0];
    });
    if (!row) {
      throw new Error('Korrektur fehlgeschlagen.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'time_entry.correct',
      actorId: ctx.userId,
      subjectType: 'time_entry',
      subjectId: row.id,
      payload: { revision: row.revision, previousEntryId },
    });
    return row;
  }
}
