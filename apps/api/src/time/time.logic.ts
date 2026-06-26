import type { TimeEntrySource } from '@zeitvault/types';
import type { NewTimeEntryRow } from '../db/schema';

/** Minimaler Ausschnitt eines Vorgaenger-Eintrags fuer die Korrektur. */
export interface PreviousEntry {
  id: string;
  tenantId: string;
  employeeId: string;
  source: TimeEntrySource;
  revision: number;
}

export interface CorrectionInput {
  startAt: Date;
  endAt: Date | null;
  correctionReason: string;
}

/**
 * Reine Korrektur-Logik (ohne I/O, daher testbar): erzeugt die Werte fuer eine
 * NEUE Revision. Der Vorgaenger wird NIEMALS veraendert (Kern-Invariante 1).
 */
export function buildCorrectionEntry(
  previous: PreviousEntry,
  input: CorrectionInput,
): NewTimeEntryRow {
  return {
    tenantId: previous.tenantId,
    employeeId: previous.employeeId,
    startAt: input.startAt,
    endAt: input.endAt,
    source: previous.source,
    status: 'corrected',
    revision: previous.revision + 1,
    previousEntryId: previous.id,
    correctionReason: input.correctionReason,
  };
}
