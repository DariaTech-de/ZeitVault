import type { StampKind } from '../stamping/types';

export type QueuedStampStatus = 'pending' | 'synced' | 'failed';

/**
 * Eine lokal eingereihte Stempelung (Offline-First, ARCHITEKTUR.md Paragraf 13).
 * `clientEventId` ist der Idempotenzschlüssel: der Server akzeptiert dieselbe
 * clientEventId nur einmal, sodass erneutes Senden (Retry/Reconnect) keine
 * Dubletten erzeugt.
 */
export interface QueuedStamp {
  clientEventId: string;
  kind: StampKind;
  occurredAt: string;
  status: QueuedStampStatus;
  attempts: number;
}

export interface QueueInput {
  clientEventId: string;
  kind: StampKind;
  occurredAt: string;
}

/** Reiht eine Stempelung ein; idempotent gegenüber bereits bekannter clientEventId. */
export function enqueue(queue: readonly QueuedStamp[], item: QueueInput): QueuedStamp[] {
  if (queue.some((q) => q.clientEventId === item.clientEventId)) {
    return [...queue];
  }
  return [...queue, { ...item, status: 'pending', attempts: 0 }];
}

/** Noch zu sendende Einträge (offen oder zuvor fehlgeschlagen). */
export function pendingItems(queue: readonly QueuedStamp[]): QueuedStamp[] {
  return queue.filter((q) => q.status === 'pending' || q.status === 'failed');
}

/** Wendet das Sync-Ergebnis an: erfolgreich -> synced, sonst failed (+Versuch). */
export function applySyncResults(
  queue: readonly QueuedStamp[],
  results: ReadonlyArray<{ clientEventId: string; ok: boolean }>,
): QueuedStamp[] {
  const outcome = new Map(results.map((r) => [r.clientEventId, r.ok]));
  return queue.map((q) => {
    const ok = outcome.get(q.clientEventId);
    if (ok === undefined) return q;
    return ok
      ? { ...q, status: 'synced' as const }
      : { ...q, status: 'failed' as const, attempts: q.attempts + 1 };
  });
}

/** Entfernt erfolgreich synchronisierte Einträge aus der lokalen Queue. */
export function clearSynced(queue: readonly QueuedStamp[]): QueuedStamp[] {
  return queue.filter((q) => q.status !== 'synced');
}
