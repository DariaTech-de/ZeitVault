import { describe, expect, it } from 'vitest';
import { summarizeOvertime } from './overtime';
import { ARBZG_2026_V1 } from './rule-packages';
import type { RulePackage } from './types';

// C-10: Abgrenzung MEHRARBEIT (ueber die gesetzliche/tarifliche
// Hoechstarbeitszeit hinaus, `maxWeeklyMinutes`) vs. UEBERSTUNDEN (ueber die
// VERTRAGLICH vereinbarte Wochenarbeitszeit hinaus,
// `contractualWeeklyMinutes`) - zwei GETRENNTE Zaehler; die Definition ist
// pro Tarifvertrag konfigurierbar (Regelschicht, B-08/B-09).
function pkgWith(contractualWeeklyMinutes: number): RulePackage {
  return {
    ...ARBZG_2026_V1,
    params: { ...ARBZG_2026_V1.params, contractualWeeklyMinutes },
  };
}

const days = (worked: number[]): Array<{ date: string; workedMinutes: number }> =>
  worked.map((minutes, i) => ({ date: `2026-07-${String(6 + i).padStart(2, '0')}`, workedMinutes: minutes }));

describe('C-10: zwei getrennte Zaehler je Kalenderwoche', () => {
  it('38-h-Vertrag, 50 h gearbeitet: 12 h Ueberstunden, 2 h Mehrarbeit (Grenze 48 h)', () => {
    const weeks = summarizeOvertime(days([600, 600, 600, 600, 600]), () => pkgWith(38 * 60));
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.workedMinutes).toBe(3000);
    expect(weeks[0]!.overtimeMinutes).toBe(3000 - 38 * 60); // 720
    expect(weeks[0]!.extraWorkMinutes).toBe(3000 - 48 * 60); // 120
  });

  it('unter beiden Grenzen: beide Zaehler 0', () => {
    const weeks = summarizeOvertime(days([480, 480, 480]), () => pkgWith(38 * 60));
    expect(weeks[0]!.overtimeMinutes).toBe(0);
    expect(weeks[0]!.extraWorkMinutes).toBe(0);
  });

  it('ohne vertragliche Wochenarbeitszeit (0 = nicht konfiguriert): Ueberstunden-Zaehler ist null', () => {
    const weeks = summarizeOvertime(days([600, 600, 600, 600, 600]), () => pkgWith(0));
    expect(weeks[0]!.overtimeMinutes).toBeNull();
    expect(weeks[0]!.extraWorkMinutes).toBe(120); // Mehrarbeit bleibt pruefbar
  });

  it('tarifliche Definition wirkt: 35-h-Vertrag erhoeht nur die Ueberstunden', () => {
    const weeks = summarizeOvertime(days([600, 600, 600, 600, 600]), () => pkgWith(35 * 60));
    expect(weeks[0]!.overtimeMinutes).toBe(3000 - 35 * 60); // 900
    expect(weeks[0]!.extraWorkMinutes).toBe(120);
  });
});
