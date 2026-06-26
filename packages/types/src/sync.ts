import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './common';
import { stampKindSchema } from './stamp';

/** Eine offline erfasste Stempelung mit Idempotenzschlüssel (clientEventId). */
export const syncStampItemSchema = z.object({
  clientEventId: uuidSchema,
  kind: stampKindSchema,
  occurredAt: isoTimestampSchema,
});
export type SyncStampItem = z.infer<typeof syncStampItemSchema>;

/** Batch-Synchronisation der lokalen Offline-Queue eines Mitarbeitenden. */
export const syncStampsSchema = z.object({
  employeeId: uuidSchema,
  items: z.array(syncStampItemSchema).min(1).max(200),
});
export type SyncStampsInput = z.infer<typeof syncStampsSchema>;
