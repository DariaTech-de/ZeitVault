/**
 * eAU – elektronische Arbeitsunfähigkeitsbescheinigung (F1, Gerüst). ZeitVault
 * kapselt den Abruf als ASYNCHRONE Schnittstelle hinter einem Port; die
 * tatsächliche Übertragung erfolgt über ein ZERTIFIZIERTES externes Gateway
 * (SV-Meldeverfahren), das organisatorisch zu beschaffen ist und hier NICHT
 * nachgebaut wird. Dieses Modul beschreibt nur den fachlichen Statusfluss.
 *
 * Hinweis: Gesundheitsdaten sind besonders schützenswert (Art. 9 DSGVO) –
 * datensparsam behandeln; ersetzt keine Rechtsberatung.
 */
export type EauStatus = 'requested' | 'submitted' | 'confirmed' | 'failed';
export type EauEvent = 'submit' | 'confirm' | 'fail' | 'retry';

export class EauTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EauTransitionError';
  }
}

const TRANSITIONS: Record<EauStatus, Partial<Record<EauEvent, EauStatus>>> = {
  requested: { submit: 'submitted' },
  submitted: { confirm: 'confirmed', fail: 'failed' },
  failed: { retry: 'submitted' },
  confirmed: {},
};

/** Nächster Status eines eAU-Abrufs; wirft bei unzulässigem Übergang. */
export function nextEauStatus(current: EauStatus, event: EauEvent): EauStatus {
  const next = TRANSITIONS[current][event];
  if (next === undefined) {
    throw new EauTransitionError(`Ereignis '${event}' im Status '${current}' nicht zulässig.`);
  }
  return next;
}
