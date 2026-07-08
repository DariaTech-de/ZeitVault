import { describe, expect, it } from 'vitest';
import { ARBZG_2026_V1 } from './rule-packages';
import {
  RuleConflictError,
  type RuleSetSource,
  resolveEffectiveParams,
} from './layering';

// B-09: Regel-Layering Gesetz -> Tarifvertrag -> Betriebsvereinbarung ->
// individuelle Vereinbarung, mit Guenstigkeitsprinzip. Konflikte werfen einen
// EXPLIZITEN Fehler - keine stille Priorisierung.
const DATE = '2026-07-08';

function source(partial: Partial<RuleSetSource> & Pick<RuleSetSource, 'layer' | 'params'>): RuleSetSource {
  return {
    name: partial.name ?? 'Testquelle',
    collectiveAgreementId: partial.collectiveAgreementId ?? null,
    validFrom: partial.validFrom ?? '2026-01-01',
    validTo: partial.validTo ?? null,
    ...partial,
  };
}

describe('resolveEffectiveParams: Auflösungsreihenfolge (B-09)', () => {
  it('ohne Quellen gilt das Gesetz (Baseline) - Herkunft je Parameter = law', () => {
    const resolved = resolveEffectiveParams(DATE, ARBZG_2026_V1, []);
    expect(resolved.params).toEqual(ARBZG_2026_V1.params);
    expect(resolved.provenance.minRestMinutes.layer).toBe('law');
  });

  it('Tarifvertrag darf mit Referenz auch ungünstiger abweichen (§ 7 ArbZG, B-08)', () => {
    const resolved = resolveEffectiveParams(DATE, ARBZG_2026_V1, [
      source({
        layer: 'collective_agreement',
        name: 'MTV Beispiel',
        collectiveAgreementId: 'ca-1',
        params: { minRestMinutes: 10 * 60 },
      }),
    ]);
    expect(resolved.params.minRestMinutes).toBe(600);
    expect(resolved.provenance.minRestMinutes).toEqual({
      layer: 'collective_agreement',
      source: 'MTV Beispiel',
    });
    // Nicht gesetzte Parameter bleiben Gesetz.
    expect(resolved.params.maxDailyMinutesStandard).toBe(480);
    expect(resolved.provenance.maxDailyMinutesStandard.layer).toBe('law');
  });

  it('ungünstigere Abweichung OHNE collective_agreement-Referenz ist nicht aktivierbar (B-08)', () => {
    expect(() =>
      resolveEffectiveParams(DATE, ARBZG_2026_V1, [
        source({
          layer: 'collective_agreement',
          collectiveAgreementId: null,
          params: { minRestMinutes: 10 * 60 },
        }),
      ]),
    ).toThrow(RuleConflictError);
  });

  it('Betriebsvereinbarung überschreibt den Tarifvertrag (Reihenfolge), Gesetz bleibt Basis', () => {
    const tv = source({
      layer: 'collective_agreement',
      name: 'MTV',
      collectiveAgreementId: 'ca-1',
      params: { minRestMinutes: 11 * 60, maxContinuousWorkMinutes: 5 * 60 },
    });
    const bv = source({
      layer: 'works_agreement',
      name: 'BV Arbeitszeit',
      collectiveAgreementId: 'ca-2',
      params: { minRestMinutes: 10 * 60 },
    });
    const resolved = resolveEffectiveParams(DATE, ARBZG_2026_V1, [tv, bv]);
    expect(resolved.params.minRestMinutes).toBe(600); // BV gewinnt über TV
    expect(resolved.provenance.minRestMinutes.layer).toBe('works_agreement');
    expect(resolved.params.maxContinuousWorkMinutes).toBe(300); // TV bleibt wirksam
    expect(resolved.provenance.maxContinuousWorkMinutes.layer).toBe('collective_agreement');
  });

  it('individuelle Vereinbarung darf NUR günstiger abweichen (Günstigkeitsprinzip)', () => {
    const better = resolveEffectiveParams(DATE, ARBZG_2026_V1, [
      source({ layer: 'individual', params: { minRestMinutes: 12 * 60 } }),
    ]);
    expect(better.params.minRestMinutes).toBe(720); // günstiger: ok, ohne Referenz

    expect(() =>
      resolveEffectiveParams(DATE, ARBZG_2026_V1, [
        source({ layer: 'individual', params: { minRestMinutes: 9 * 60 } }),
      ]),
    ).toThrow(RuleConflictError); // ungünstiger: expliziter Fehler
  });

  it('Richtung "weniger ist günstiger": individuelle Erhöhung der Höchstarbeitszeit ist ein Konflikt', () => {
    expect(() =>
      resolveEffectiveParams(DATE, ARBZG_2026_V1, [
        source({ layer: 'individual', params: { maxDailyMinutesStandard: 9 * 60 } }),
      ]),
    ).toThrow(RuleConflictError);
    const better = resolveEffectiveParams(DATE, ARBZG_2026_V1, [
      source({ layer: 'individual', params: { maxDailyMinutesStandard: 7 * 60 } }),
    ]);
    expect(better.params.maxDailyMinutesStandard).toBe(420);
  });

  it('gleiche Ebene + gleicher Parameter + verschiedene Werte = expliziter Konflikt, keine stille Priorisierung', () => {
    const a = source({
      layer: 'collective_agreement',
      name: 'MTV A',
      collectiveAgreementId: 'ca-1',
      params: { breakMinutesTier1: 40 },
    });
    const b = source({
      layer: 'collective_agreement',
      name: 'MTV B',
      collectiveAgreementId: 'ca-2',
      params: { breakMinutesTier1: 35 },
    });
    expect(() => resolveEffectiveParams(DATE, ARBZG_2026_V1, [a, b])).toThrow(RuleConflictError);
    expect(() => resolveEffectiveParams(DATE, ARBZG_2026_V1, [a, b])).toThrow(/MTV A|MTV B/);
    // Gleicher Wert ist kein Konflikt.
    const same = { ...b, params: { breakMinutesTier1: 40 } };
    expect(
      resolveEffectiveParams(DATE, ARBZG_2026_V1, [a, same]).params.breakMinutesTier1,
    ).toBe(40);
  });

  it('Gültigkeitszeitraum wird je Datum angewendet - rückwirkende Regelsätze wirken für alte Tage (B-10)', () => {
    const retro = source({
      layer: 'collective_agreement',
      collectiveAgreementId: 'ca-1',
      validFrom: '2026-01-01',
      validTo: '2026-03-31',
      params: { minRestMinutes: 10 * 60 },
    });
    expect(
      resolveEffectiveParams('2026-02-15', ARBZG_2026_V1, [retro]).params.minRestMinutes,
    ).toBe(600);
    expect(
      resolveEffectiveParams('2026-07-08', ARBZG_2026_V1, [retro]).params.minRestMinutes,
    ).toBe(660); // ausserhalb der Gültigkeit: Gesetz
  });

  it('Kulanzfrist (openShiftGraceMinutes) ist mitbestimmungspflichtig: Abweichung nur mit Referenz, nie individuell', () => {
    // BV mit Referenz: ok (§ 87 Abs. 1 Nr. 2 BetrVG).
    const viaBv = resolveEffectiveParams(DATE, ARBZG_2026_V1, [
      source({
        layer: 'works_agreement',
        collectiveAgreementId: 'ca-bv',
        params: { openShiftGraceMinutes: 8 * 60 },
      }),
    ]);
    expect(viaBv.params.openShiftGraceMinutes).toBe(480);
    // Ohne Referenz: Fehler - auch wenn der Parameter keine Schutzrichtung hat.
    expect(() =>
      resolveEffectiveParams(DATE, ARBZG_2026_V1, [
        source({
          layer: 'works_agreement',
          collectiveAgreementId: null,
          params: { openShiftGraceMinutes: 8 * 60 },
        }),
      ]),
    ).toThrow(RuleConflictError);
    // Individuell: Fehler (keine individuelle Vereinbarung über technische Kontrolle).
    expect(() =>
      resolveEffectiveParams(DATE, ARBZG_2026_V1, [
        source({ layer: 'individual', params: { openShiftGraceMinutes: 8 * 60 } }),
      ]),
    ).toThrow(RuleConflictError);
  });
});
