import { describe, expect, it } from 'vitest';
import { applySyncResults, clearSynced, enqueue, pendingItems, type QueuedStamp } from './queue';

const item = (clientEventId: string): { clientEventId: string; kind: 'clock_in'; occurredAt: string } => ({
  clientEventId,
  kind: 'clock_in',
  occurredAt: '2026-06-26T08:00:00.000Z',
});

describe('Offline-Sync-Queue', () => {
  it('enqueue ist idempotent gegenueber clientEventId', () => {
    let q: QueuedStamp[] = [];
    q = enqueue(q, item('a'));
    q = enqueue(q, item('a'));
    expect(q).toHaveLength(1);
    expect(q[0]?.status).toBe('pending');
  });

  it('pendingItems liefert offene und fehlgeschlagene, nicht synchronisierte', () => {
    let q = enqueue(enqueue([], item('a')), item('b'));
    q = applySyncResults(q, [{ clientEventId: 'a', ok: true }]);
    expect(pendingItems(q).map((x) => x.clientEventId)).toEqual(['b']);
  });

  it('applySyncResults markiert synced bzw. failed mit Versuchszaehler', () => {
    let q = enqueue(enqueue([], item('a')), item('b'));
    q = applySyncResults(q, [
      { clientEventId: 'a', ok: true },
      { clientEventId: 'b', ok: false },
    ]);
    expect(q.find((x) => x.clientEventId === 'a')?.status).toBe('synced');
    const b = q.find((x) => x.clientEventId === 'b');
    expect(b?.status).toBe('failed');
    expect(b?.attempts).toBe(1);
  });

  it('clearSynced entfernt erfolgreiche Eintraege', () => {
    let q = enqueue(enqueue([], item('a')), item('b'));
    q = applySyncResults(q, [{ clientEventId: 'a', ok: true }]);
    expect(clearSynced(q).map((x) => x.clientEventId)).toEqual(['b']);
  });
});
