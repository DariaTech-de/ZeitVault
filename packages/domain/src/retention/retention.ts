/**
 * Aufbewahrungs- und Lösch-Engine (E3). Realisiert Kern-Invariante 4:
 * aufbewahrungspflichtige Daten werden NICHT hart gelöscht, sondern bei
 * Austritt/Löschanfrage gesperrt/pseudonymisiert und erst nach Fristablauf
 * automatisiert gelöscht. Diese Logik ist rein und damit testbar.
 *
 * Hinweis: Die Fristen fassen die übliche steuerliche/handelsrechtliche
 * Aufbewahrung zusammen und ersetzen keine Rechtsberatung; maßgeblich sind die
 * offiziellen Vorgaben (GoBD/AO/HGB) je Datenart.
 */
export type RetentionClass = 'gobd_10y' | 'payroll_6y' | 'dsgvo_general';

/** Aufbewahrungsdauer in vollen Jahren je Klasse. */
export const RETENTION_YEARS: Record<RetentionClass, number> = {
  gobd_10y: 10,
  payroll_6y: 6,
  dsgvo_general: 0,
};

/**
 * Löschdatum = Referenzdatum + Aufbewahrungsjahre. Die Frist beginnt üblicherweise
 * mit Ablauf des Kalenderjahres; das wird hier konservativ auf den Jahresletzten
 * des Referenzjahres + n Jahre abgebildet (31.12. des Zieljahres).
 */
export function deletionDueDate(referenceIso: string, retentionClass: RetentionClass): string {
  const [year] = referenceIso.split('-').map(Number);
  const due = (year ?? 0) + RETENTION_YEARS[retentionClass];
  return `${due}-12-31`;
}

/** Ist die Löschfrist zum Stichtag (inklusive) abgelaufen? */
export function isDeletionDue(nowIso: string, dueIso: string): boolean {
  return nowIso >= dueIso;
}

export interface Pseudonym {
  displayName: string;
  personnelNumber: string;
}

/**
 * Deterministische Pseudonymisierung personenbezogener Stammdaten. Der
 * technische Bezug (employee_id) bleibt erhalten, damit revisionssichere
 * Zeit-/Audit-Daten weiterhin konsistent referenziert werden, ohne die Person
 * zu identifizieren.
 */
export function pseudonymize(employeeId: string): Pseudonym {
  const token = employeeId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return {
    displayName: `Gesperrt (${token})`,
    personnelNumber: `ANON-${token}`,
  };
}
