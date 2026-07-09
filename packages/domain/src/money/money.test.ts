import { describe, expect, it } from 'vitest';
import {
  GRUNDLOHN_SV_CAP_CENTS,
  GRUNDLOHN_TAX_CAP_CENTS,
  assertCents,
  surchargeAmountCents,
  surchargePayComponent,
} from './money';

// C-06: Zwei getrennte Grenzen - steuerfrei bis Grundlohn 50 EUR/h,
// SV-frei nur bis Grundlohn 25 EUR/h (SvEV). Geld ist IMMER Cent-Integer,
// nie Float; EINE Rundung je Lohnart und Periode.

describe('C-06: getrennte Grundlohngrenzen Steuer (50 EUR/h) und SV (25 EUR/h)', () => {
  it('AK: Grundlohn 40 EUR/h -> Zuschlag steuerfrei, aber beitragspflichtig (zwei Felder)', () => {
    // 480 min Nacht 25 % bei 40 EUR/h (4000 Cent).
    const c = surchargePayComponent({ minutes: 480, hourlyBaseWageCents: 4000, ratePercent: 25 });
    expect(c.amountCents).toBe(8000); // 8 h x 40 EUR x 25 % = 80 EUR
    // Steuer: Grundlohn 40 <= 50 EUR/h -> voll steuerfrei.
    expect(c.taxFreeCents).toBe(8000);
    expect(c.taxableCents).toBe(0);
    // SV: Grundlohn fuer die SV-Freiheit hoechstens 25 EUR/h -> Rest beitragspflichtig.
    expect(c.svFreeCents).toBe(5000); // 8 h x 25 EUR x 25 %
    expect(c.svLiableCents).toBe(3000);
  });

  it('Grundlohn 60 EUR/h: Steuer-Basis bei 50 EUR/h gekappt', () => {
    const c = surchargePayComponent({ minutes: 480, hourlyBaseWageCents: 6000, ratePercent: 25 });
    expect(c.amountCents).toBe(12000);
    expect(c.taxFreeCents).toBe(10000); // 8 h x 50 EUR x 25 %
    expect(c.taxableCents).toBe(2000);
    expect(c.svFreeCents).toBe(5000);
    expect(c.svLiableCents).toBe(7000);
  });

  it('Grundlohn 20 EUR/h: unter beiden Grenzen -> beide Felder voll frei', () => {
    const c = surchargePayComponent({ minutes: 120, hourlyBaseWageCents: 2000, ratePercent: 50 });
    expect(c.amountCents).toBe(2000); // 2 h x 20 EUR x 50 %
    expect(c.taxableCents).toBe(0);
    expect(c.svLiableCents).toBe(0);
  });

  it('exportierte Kappungsgrenzen entsprechen der Spezifikation', () => {
    expect(GRUNDLOHN_TAX_CAP_CENTS).toBe(5000);
    expect(GRUNDLOHN_SV_CAP_CENTS).toBe(2500);
  });
});

describe('Geldmodell: Cent-Integer, EINE Rundung je Lohnart und Periode', () => {
  it('rundet genau einmal am Periodenergebnis, nicht je Minute', () => {
    // 90 min x 3999 Cent x 40 % = 143.964.000 / 6000 = 2399,4 -> 2399 Cent.
    // Je-Minute-Rundung ergaebe 90 x 27 = 2430 Cent (systematischer Fehler).
    expect(surchargeAmountCents(90, 3999, 40)).toBe(2399);
  });

  it('kaufmaennische Rundung an der Halb-Cent-Grenze', () => {
    // 1 min x 3000 Cent x 25 % = 75.000 / 6000 = 12,5 -> 13 Cent.
    expect(surchargeAmountCents(1, 3000, 25)).toBe(13);
  });

  it('assertCents weist Float-Betraege zurueck (Geld ist nie Float)', () => {
    expect(() => assertCents(12.5, 'betrag')).toThrow(/Cent/);
    expect(() => assertCents(Number.NaN, 'betrag')).toThrow(/Cent/);
    expect(() => assertCents(1200, 'betrag')).not.toThrow();
  });

  it('weist negative Eingaben zurueck', () => {
    expect(() => surchargeAmountCents(-1, 4000, 25)).toThrow();
    expect(() => surchargeAmountCents(60, -4000, 25)).toThrow();
  });
});
