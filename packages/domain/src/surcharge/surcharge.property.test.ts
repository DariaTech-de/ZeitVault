import { describe, expect, it } from 'vitest';
import { computeSurcharges } from './compute';
import { ZUSCHLAEGE_BASIS_2026_V1 } from './rule-packages';
import type { SurchargeContext, WorkSpan } from './types';

/**
 * Eigenschaftsbasierte Tests mit einem deterministischen (geseedeten) Generator
 * – ohne externe Abhängigkeit, damit die Fälle reproduzierbar sind. Geprüft
 * werden Invarianten der Zuschlagsberechnung über viele zufällige Eingaben.
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Linearer Kongruenzgenerator (numerical recipes).
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const ALWAYS: SurchargeContext = { isHoliday: () => true };
const NEVER: SurchargeContext = { isHoliday: () => false };

function randomSpans(rng: () => number): { spans: WorkSpan[]; total: number } {
  const count = 1 + Math.floor(rng() * 4);
  const spans: WorkSpan[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const month = 1 + Math.floor(rng() * 12);
    const day = 1 + Math.floor(rng() * 28);
    const startMinute = Math.floor(rng() * 1440);
    const durationMinutes = 1 + Math.floor(rng() * 600);
    spans.push({
      date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      startMinute,
      durationMinutes,
    });
    total += durationMinutes;
  }
  return { spans, total };
}

function minutesOf(results: ReturnType<typeof computeSurcharges>, kind: string): number {
  return results.find((r) => r.kind === kind)?.minutes ?? 0;
}

const ITERATIONS = 400;

describe('computeSurcharges – Eigenschaften (geseedet, deterministisch)', () => {
  it('jede Regel liefert Minuten im Bereich [0, Gesamtarbeitszeit]', () => {
    const rng = makeRng(12345);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const { spans, total } = randomSpans(rng);
      for (const ctx of [NEVER, ALWAYS]) {
        for (const res of computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, ctx)) {
          expect(res.minutes).toBeGreaterThanOrEqual(0);
          expect(res.minutes).toBeLessThanOrEqual(total);
        }
      }
    }
  });

  it('ist deterministisch (gleiche Eingabe → gleiches Ergebnis)', () => {
    const rng = makeRng(999);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const { spans } = randomSpans(rng);
      const a = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NEVER);
      const b = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NEVER);
      expect(a).toEqual(b);
    }
  });

  it('Feiertagskontext: holiday == Gesamtzeit, sunday == 0 (Vorrang Feiertag)', () => {
    const rng = makeRng(2024);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const { spans, total } = randomSpans(rng);
      const r = computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, ALWAYS);
      expect(minutesOf(r, 'holiday')).toBe(total);
      expect(minutesOf(r, 'sunday')).toBe(0);
    }
  });

  it('ohne Feiertage sind die Feiertagsminuten stets 0', () => {
    const rng = makeRng(7);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const { spans } = randomSpans(rng);
      expect(minutesOf(computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NEVER), 'holiday')).toBe(0);
    }
  });

  it('Nachtminuten sind unabhängig vom Feiertags-/Sonntagsstatus', () => {
    const rng = makeRng(54321);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const { spans } = randomSpans(rng);
      const withHol = minutesOf(computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, ALWAYS), 'night');
      const noHol = minutesOf(computeSurcharges(spans, ZUSCHLAEGE_BASIS_2026_V1, NEVER), 'night');
      expect(withHol).toBe(noHol);
    }
  });

  it('Monotonie: längere Dauer erhöht keine Regel-Minuten unter den Wert der kürzeren', () => {
    const rng = makeRng(31337);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const month = 1 + Math.floor(rng() * 12);
      const day = 1 + Math.floor(rng() * 28);
      const startMinute = Math.floor(rng() * 1440);
      const shorter = 1 + Math.floor(rng() * 300);
      const longer = shorter + 1 + Math.floor(rng() * 300);
      const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const a = computeSurcharges([{ date, startMinute, durationMinutes: shorter }], ZUSCHLAEGE_BASIS_2026_V1, NEVER);
      const b = computeSurcharges([{ date, startMinute, durationMinutes: longer }], ZUSCHLAEGE_BASIS_2026_V1, NEVER);
      for (const res of a) {
        expect(minutesOf(b, res.kind)).toBeGreaterThanOrEqual(res.minutes);
      }
    }
  });
});
