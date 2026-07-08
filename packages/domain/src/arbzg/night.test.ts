import { describe, expect, it } from 'vitest';
import { classifyNightMinute, isArbzgNightWork, isTaxNightBonusMinute } from './night';
import { ARBZG_2026_V1 } from './rule-packages';

// B-05: Nachtzeit hat ZWEI verschiedene Definitionen, die nie vermischt
// werden duerfen: ArbZG § 2 Abs. 3 (23-6 Uhr; Baeckereien/Konditoreien 22-5,
// per TV-Regelsatz umstellbar) fuer den Arbeitsschutz, § 3b EStG (20-6 Uhr)
// fuer den steuerfreien Zuschlag.
describe('Nachtzeit-Definitionen (B-05)', () => {
  it('AK-Beweis: 20:30 Uhr ist tax_night_bonus=true, aber arbzg_night_work=false', () => {
    const c = classifyNightMinute(20 * 60 + 30, ARBZG_2026_V1.params);
    expect(c.taxNightBonus).toBe(true);
    expect(c.arbzgNightWork).toBe(false);
  });

  it('ArbZG-Nachtzeit 23-6: Grenzen inklusive Beginn, exklusive Ende', () => {
    expect(isArbzgNightWork(23 * 60, ARBZG_2026_V1.params)).toBe(true);
    expect(isArbzgNightWork(2 * 60, ARBZG_2026_V1.params)).toBe(true);
    expect(isArbzgNightWork(6 * 60, ARBZG_2026_V1.params)).toBe(false);
    expect(isArbzgNightWork(22 * 60 + 59, ARBZG_2026_V1.params)).toBe(false);
  });

  it('EStG-Fenster 20-6 unabhaengig von den ArbZG-Params', () => {
    expect(isTaxNightBonusMinute(20 * 60)).toBe(true);
    expect(isTaxNightBonusMinute(5 * 60 + 59)).toBe(true);
    expect(isTaxNightBonusMinute(6 * 60)).toBe(false);
    expect(isTaxNightBonusMinute(19 * 60 + 59)).toBe(false);
  });

  it('Baeckerei-Fenster 22-5 ist als Regelsatz-Abweichung abbildbar', () => {
    const baecker = {
      ...ARBZG_2026_V1.params,
      arbzgNightStartMinute: 22 * 60,
      arbzgNightEndMinute: 5 * 60,
    };
    expect(isArbzgNightWork(22 * 60 + 30, baecker)).toBe(true);
    expect(isArbzgNightWork(22 * 60 + 30, ARBZG_2026_V1.params)).toBe(false);
    expect(isArbzgNightWork(5 * 60 + 30, baecker)).toBe(false);
  });
});
