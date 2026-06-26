import { describe, expect, it } from 'vitest';
import { computeEventHash, type HashableEvent } from './hash';
import { verifyChain, type ChainedEvent } from './chain';

function buildChain(count: number): ChainedEvent[] {
  const events: ChainedEvent[] = [];
  let prevHash: string | null = null;
  for (let i = 1; i <= count; i++) {
    const event: HashableEvent = {
      sequence: i,
      tenantId: 't1',
      action: 'time_entry.create',
      actorId: 'user-1',
      subjectType: 'time_entry',
      subjectId: `te-${i}`,
      recordedAt: `2026-06-26T08:0${i}:00.000Z`,
      payload: { i },
      prevHash,
    };
    const hash = computeEventHash(event);
    events.push({ ...event, hash });
    prevHash = hash;
  }
  return events;
}

describe('verifyChain', () => {
  it('akzeptiert eine intakte Kette', () => {
    const result = verifyChain(buildChain(5));
    expect(result.valid).toBe(true);
    expect(result.brokenAtSequence).toBeNull();
  });

  it('erkennt einen manipulierten Payload', () => {
    const chain = buildChain(5);
    const tampered = chain.map((e) =>
      e.sequence === 3 ? { ...e, payload: { i: 999 } } : e,
    );
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(3);
  });

  it('erkennt eine gebrochene prevHash-Verkettung', () => {
    const chain = buildChain(5);
    const tampered = chain.map((e) =>
      e.sequence === 4 ? { ...e, prevHash: 'falsch' } : e,
    );
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(4);
  });

  it('akzeptiert eine leere Kette', () => {
    expect(verifyChain([]).valid).toBe(true);
  });
});
