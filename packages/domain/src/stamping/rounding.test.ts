import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  NO_STAMP_ROUNDING,
  type StampRoundingConfig,
  applyStampRounding,
  roundStampTime,
} from './rounding';

const d = (iso: string): Date => new Date(iso);

// B-12: Rundung ist eine Regel am EREIGNIS (Erfassung), nie je Intervall oder
// Zeitscheibe. Standard ist immer 'none'.
describe('roundStampTime', () => {
  it("'none' laesst den Zeitstempel unveraendert (Sekunden bleiben erhalten)", () => {
    const at = d('2026-07-08T07:12:34.567Z');
    expect(roundStampTime(at, 'none').getTime()).toBe(at.getTime());
  });

  it("'nearest_minute' rundet kaufmaennisch (ab 30 s aufwaerts)", () => {
    expect(roundStampTime(d('2026-07-08T07:12:29.999Z'), 'nearest_minute').toISOString()).toBe(
      '2026-07-08T07:12:00.000Z',
    );
    expect(roundStampTime(d('2026-07-08T07:12:30.000Z'), 'nearest_minute').toISOString()).toBe(
      '2026-07-08T07:13:00.000Z',
    );
  });

  it("'down_minute' und 'up_minute' schneiden bzw. heben auf die ganze Minute", () => {
    expect(roundStampTime(d('2026-07-08T07:12:59.000Z'), 'down_minute').toISOString()).toBe(
      '2026-07-08T07:12:00.000Z',
    );
    expect(roundStampTime(d('2026-07-08T07:12:01.000Z'), 'up_minute').toISOString()).toBe(
      '2026-07-08T07:13:00.000Z',
    );
  });

  it('eine bereits ganze Minute bleibt unter jedem Modus unveraendert', () => {
    const at = d('2026-07-08T07:12:00.000Z');
    for (const mode of ['none', 'nearest_minute', 'down_minute', 'up_minute'] as const) {
      expect(roundStampTime(at, mode).getTime()).toBe(at.getTime());
    }
  });

  it('Property: Ergebnis ist ganze Minute, weicht < 60 s ab und ist monoton', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2025, 0, 1), max: Date.UTC(2027, 0, 1) }),
        fc.integer({ min: 0, max: 10 * 60_000 }),
        fc.constantFrom('nearest_minute', 'down_minute', 'up_minute' as const),
        (aMs, delta, mode) => {
          const a = roundStampTime(new Date(aMs), mode);
          const b = roundStampTime(new Date(aMs + delta), mode);
          expect(a.getTime() % 60_000).toBe(0);
          expect(Math.abs(a.getTime() - aMs)).toBeLessThan(60_000);
          // Monotonie: spaeterer Roh-Stempel rundet nie auf einen frueheren Instant.
          expect(b.getTime()).toBeGreaterThanOrEqual(a.getTime());
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('applyStampRounding', () => {
  it('Standard ist keine Rundung (NO_STAMP_ROUNDING)', () => {
    const at = d('2026-07-08T07:12:34.567Z');
    expect(applyStampRounding('clock_in', at).getTime()).toBe(at.getTime());
    expect(applyStampRounding('clock_out', at, NO_STAMP_ROUNDING).getTime()).toBe(at.getTime());
  });

  it('asymmetrische Betriebsvereinbarungs-Regel ist abbildbar (Kommen auf, Gehen ab)', () => {
    const bv: StampRoundingConfig = {
      clock_in: 'up_minute',
      break_start: 'none',
      break_end: 'none',
      clock_out: 'down_minute',
    };
    expect(applyStampRounding('clock_in', d('2026-07-08T07:12:10Z'), bv).toISOString()).toBe(
      '2026-07-08T07:13:00.000Z',
    );
    expect(applyStampRounding('clock_out', d('2026-07-08T16:59:50Z'), bv).toISOString()).toBe(
      '2026-07-08T16:59:00.000Z',
    );
    expect(applyStampRounding('break_start', d('2026-07-08T12:00:30Z'), bv).toISOString()).toBe(
      '2026-07-08T12:00:30.000Z',
    );
  });
});
