import { z } from 'zod';
import { uuidSchema } from './common';
import { stampKindSchema } from './stamp';

/**
 * Zeiterfassungs-Terminal am Eingang. Mitarbeitende stempeln per NFC-Chip oder
 * Fingerabdruck. WICHTIG: Fingerabdrücke werden ausschließlich LOKAL auf dem
 * Terminal abgeglichen (Secure Element); der Server erhält NIE biometrische
 * Daten (DSGVO Art. 9). Das Terminal sendet nur die aufgelöste Mitarbeiter-ID
 * bzw. eine NFC-UID. Terminals authentifizieren sich mit einem Geräte-Token
 * (nicht mit einem Nutzer-Token) (ADR-0015).
 */

/** Registrierung eines Terminals (Administration). */
export const registerTerminalSchema = z.object({
  name: z.string().min(1).max(120),
});
export type RegisterTerminal = z.infer<typeof registerTerminalSchema>;

/** Zuordnung einer NFC-UID zu einem Mitarbeitenden (Administration). */
export const mapNfcSchema = z.object({
  uid: z.string().min(2).max(128),
  employeeId: uuidSchema,
});
export type MapNfc = z.infer<typeof mapNfcSchema>;

/**
 * Stempelvorgang vom Terminal. Entweder `nfcUid` (NFC-Chip) ODER `employeeId`
 * (Fingerabdruck lokal am Terminal aufgelöst). `kind` ist optional; ohne Angabe
 * wählt der Server automatisch die nächste sinnvolle Aktion (Kommen/Gehen).
 */
export const terminalStampSchema = z
  .object({
    nfcUid: z.string().min(2).max(128).optional(),
    employeeId: uuidSchema.optional(),
    kind: stampKindSchema.optional(),
  })
  .refine((v) => Boolean(v.nfcUid) !== Boolean(v.employeeId), {
    message: 'Genau eines von nfcUid oder employeeId ist erforderlich.',
  });
export type TerminalStamp = z.infer<typeof terminalStampSchema>;

export interface TerminalSummary {
  id: string;
  name: string;
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface NfcMapping {
  uid: string;
  employeeId: string;
  employeeName: string | null;
  active: boolean;
}

/** Antwort an das Terminal nach einem Stempelvorgang (für die Anzeige). */
export interface TerminalStampResult {
  employeeName: string;
  personnelNumber: string;
  kind: string;
  state: 'out' | 'in' | 'break';
  occurredAt: string;
}
