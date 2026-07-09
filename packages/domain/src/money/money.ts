/**
 * Geldmodell (C-06, BL-Vorgabe): Geldbetraege sind IMMER ganzzahlige Cent
 * (Integer), niemals Float. Prozentrechnung laeuft ueber exakte
 * Integer-Multiplikation; dividiert und kaufmaennisch gerundet wird genau
 * EINMAL je Lohnart und Periode - nie je Minute, nie je Zeitscheibe (dieselbe
 * Invariante wie bei der Zeitscheiben-Splittung, B-12).
 *
 * C-06 (Paragraf 3b Abs. 2 EStG / SvEV): Zwei GETRENNTE Grundlohngrenzen -
 * fuer die STEUERfreiheit ist der Grundlohn mit hoechstens 50 EUR/h
 * anzusetzen, fuer die SV-Freiheit mit hoechstens 25 EUR/h. Ein Zuschlag kann
 * also steuerfrei und trotzdem (teilweise) beitragspflichtig sein; beide
 * Anteile werden als separate Felder ausgewiesen. Rechtsstand: exakt die
 * Werte der Spezifikation (Juli 2026).
 *
 * Hinweis: Diese Zusammenfassung steuer-/sozialversicherungsrechtlicher
 * Regeln ersetzt keine Rechtsberatung; massgeblich sind die offiziellen
 * Quellen.
 */

/** Grundlohn-Kappung fuer die Steuerfreiheit: 50 EUR/h (Paragraf 3b Abs. 2 EStG). */
export const GRUNDLOHN_TAX_CAP_CENTS = 5000;
/** Grundlohn-Kappung fuer die SV-Freiheit: 25 EUR/h (SvEV). */
export const GRUNDLOHN_SV_CAP_CENTS = 2500;

/** Wirft, wenn ein Betrag kein ganzzahliger Cent-Wert ist (Geld ist nie Float). */
export function assertCents(value: number, label = 'Betrag'): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} muss ein ganzzahliger Cent-Betrag sein (kein Float): ${value}.`);
  }
}

function assertNonNegativeInt(value: number, label: string): void {
  assertCents(value, label);
  if (value < 0) {
    throw new Error(`${label} darf nicht negativ sein: ${value}.`);
  }
}

/**
 * Zuschlagsbetrag in Cent fuer eine Periode: minutes x baseCents x ratePercent,
 * exakt als Integer multipliziert und genau EINMAL durch 6000 (60 min x 100 %)
 * geteilt und kaufmaennisch gerundet.
 */
export function surchargeAmountCents(
  minutes: number,
  baseWageCents: number,
  ratePercent: number,
): number {
  assertNonNegativeInt(minutes, 'Minuten');
  assertNonNegativeInt(baseWageCents, 'Grundlohn (Cent)');
  assertNonNegativeInt(ratePercent, 'Zuschlagssatz (Prozent)');
  return Math.round((minutes * baseWageCents * ratePercent) / 6000);
}

/** Bewerteter Zuschlag einer Lohnart fuer eine Periode (alle Betraege Cent-Integer). */
export interface SurchargePayComponent {
  minutes: number;
  ratePercent: number;
  /** Auszuzahlender Zuschlag auf den tatsaechlichen Grundlohn. */
  amountCents: number;
  /** Steuerfreier Anteil (Grundlohn-Basis bei 50 EUR/h gekappt). */
  taxFreeCents: number;
  /** Steuerpflichtiger Rest. */
  taxableCents: number;
  /** SV-freier Anteil (Grundlohn-Basis bei 25 EUR/h gekappt). */
  svFreeCents: number;
  /** Beitragspflichtiger Rest. */
  svLiableCents: number;
}

/**
 * Bewertet die Zuschlagsminuten einer Lohnart fuer eine Periode gegen den
 * Grundlohn: Auszahlungsbetrag plus die zwei GETRENNTEN Freistellungs-Anteile
 * (C-06). Jeder der drei Betraege wird genau einmal gerundet; die Freibetraege
 * sind zusaetzlich auf den Auszahlungsbetrag gedeckelt (ein Freibetrag kann
 * nie groesser sein als der Zuschlag selbst).
 */
export function surchargePayComponent(input: {
  minutes: number;
  hourlyBaseWageCents: number;
  ratePercent: number;
}): SurchargePayComponent {
  const { minutes, hourlyBaseWageCents, ratePercent } = input;
  const amountCents = surchargeAmountCents(minutes, hourlyBaseWageCents, ratePercent);
  const taxFreeCents = Math.min(
    amountCents,
    surchargeAmountCents(minutes, Math.min(hourlyBaseWageCents, GRUNDLOHN_TAX_CAP_CENTS), ratePercent),
  );
  const svFreeCents = Math.min(
    amountCents,
    surchargeAmountCents(minutes, Math.min(hourlyBaseWageCents, GRUNDLOHN_SV_CAP_CENTS), ratePercent),
  );
  return {
    minutes,
    ratePercent,
    amountCents,
    taxFreeCents,
    taxableCents: amountCents - taxFreeCents,
    svFreeCents,
    svLiableCents: amountCents - svFreeCents,
  };
}
