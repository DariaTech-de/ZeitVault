import { computeEventHash, type HashableEvent } from './hash';

export interface ChainedEvent extends HashableEvent {
  hash: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  /** Sequence des ersten fehlerhaften Ereignisses, falls ungueltig. */
  brokenAtSequence: number | null;
}

/**
 * Prueft eine nach `sequence` aufsteigend sortierte Ereigniskette: jeder Hash
 * muss reproduzierbar sein und `prevHash` auf den Hash des Vorgaengers
 * verweisen. Nachtraegliche Aenderungen/Luecken werden so sofort evident.
 */
export function verifyChain(events: readonly ChainedEvent[]): ChainVerificationResult {
  let previousHash: string | null = null;
  for (const event of events) {
    if (event.prevHash !== previousHash) {
      return { valid: false, brokenAtSequence: event.sequence };
    }
    if (computeEventHash(event) !== event.hash) {
      return { valid: false, brokenAtSequence: event.sequence };
    }
    previousHash = event.hash;
  }
  return { valid: true, brokenAtSequence: null };
}
