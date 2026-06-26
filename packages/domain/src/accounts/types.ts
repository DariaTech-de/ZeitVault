/**
 * Arbeitszeitkonten (C2). Buchungen sind vorzeichenbehaftet: positive Betraege
 * sind Gutschriften (z. B. Jahresurlaubsanspruch, geleistete Mehrarbeit), negative
 * sind Belastungen (z. B. genommener Urlaub, ausgezahlte Ueberstunden). Der
 * Saldo ergibt sich als Summe der Buchungen.
 *
 * Einheit je Kontoart: `overtime`/`flextime` in MINUTEN, `vacation` in TAGEN.
 */
export type AccountKind = 'overtime' | 'flextime' | 'vacation';

export const ACCOUNT_KINDS: readonly AccountKind[] = ['overtime', 'flextime', 'vacation'];

export interface AccountTransaction {
  account: AccountKind;
  /** Vorzeichenbehafteter Betrag (Minuten bzw. Tage je nach Kontoart). */
  amount: number;
  effectiveDate: string;
  reason?: string;
}

export interface AccountBalance {
  account: AccountKind;
  balance: number;
}

/** Eine Buchung des Kontoauszugs mit laufendem Saldo. */
export interface StatementLine extends AccountTransaction {
  runningBalance: number;
}
