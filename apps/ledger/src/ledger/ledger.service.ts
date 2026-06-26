import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { AppendAuditEvent } from '@zeitvault/types';
import { type AuditEventRow, auditEvents } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { type ChainVerificationResult, type ChainedEvent, verifyChain } from './chain';
import { computeEventHash } from './hash';

@Injectable()
export class LedgerService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Haengt ein Ereignis an die mandantenbezogene Kette an: ermittelt die naechste
   * Sequence und den prevHash, berechnet den Hash und fuegt insert-only ein.
   * (tenant_id, sequence) ist eindeutig - konkurrierende Schreibvorgaenge fallen
   * auf den Unique-Constraint zurueck. Fuer hohen Durchsatz: Advisory-Lock je
   * Mandant ergaenzen.
   */
  async append(input: AppendAuditEvent): Promise<AuditEventRow> {
    const recordedAt = new Date().toISOString();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${input.tenantId}, true)`);

      const seqRows = await tx
        .select({ maxSeq: sql<number>`coalesce(max(${auditEvents.sequence}), 0)` })
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, input.tenantId));
      const sequence = (seqRows[0]?.maxSeq ?? 0) + 1;

      const prevRows =
        sequence > 1
          ? await tx
              .select({ hash: auditEvents.hash })
              .from(auditEvents)
              .where(
                and(
                  eq(auditEvents.tenantId, input.tenantId),
                  eq(auditEvents.sequence, sequence - 1),
                ),
              )
          : [];
      const prevHash = prevRows[0]?.hash ?? null;

      const hash = computeEventHash({
        sequence,
        tenantId: input.tenantId,
        action: input.action,
        actorId: input.actorId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        recordedAt,
        payload: input.payload,
        prevHash,
      });

      const inserted = await tx
        .insert(auditEvents)
        .values({
          tenantId: input.tenantId,
          sequence,
          action: input.action,
          actorId: input.actorId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          payload: input.payload,
          recordedAt,
          prevHash,
          hash,
        })
        .returning();
      return inserted[0];
    });

    if (!row) {
      throw new Error('Audit-Ereignis konnte nicht geschrieben werden.');
    }
    return row;
  }

  /** Verifiziert die Integritaet der gesamten Kette eines Mandanten. */
  async verify(tenantId: string): Promise<ChainVerificationResult> {
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, tenantId))
        .orderBy(asc(auditEvents.sequence));
    });

    const chained: ChainedEvent[] = rows.map((r) => ({
      sequence: r.sequence,
      tenantId: r.tenantId,
      action: r.action,
      actorId: r.actorId,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      recordedAt: r.recordedAt,
      payload: r.payload,
      prevHash: r.prevHash,
      hash: r.hash,
    }));
    return verifyChain(chained);
  }
}
