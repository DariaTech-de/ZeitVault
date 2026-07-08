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

/** Genau eine Identifizierungsquelle: NFC-Chip, Personalnummer oder (lokal am
 * Terminal aufgelöster) Fingerabdruck -> Mitarbeiter-ID. */
function exactlyOneIdentifier(v: { nfcUid?: string; personnelNumber?: string; employeeId?: string }): boolean {
  return [v.nfcUid, v.personnelNumber, v.employeeId].filter(Boolean).length === 1;
}
const IDENTIFIER_MSG = 'Genau eines von nfcUid, personnelNumber oder employeeId ist erforderlich.';

/**
 * Stempelvorgang vom Terminal. Genau EINE Identifizierung: `nfcUid` (NFC-Chip),
 * `personnelNumber` (Tastatureingabe) ODER `employeeId` (Fingerabdruck lokal am
 * Terminal aufgelöst). `kind` ist optional; ohne Angabe wählt der Server
 * automatisch die nächste sinnvolle Aktion (Kommen/Gehen/Pause-Ende).
 */
export const terminalStampSchema = z
  .object({
    nfcUid: z.string().min(2).max(128).optional(),
    personnelNumber: z.string().min(1).max(64).optional(),
    employeeId: uuidSchema.optional(),
    kind: stampKindSchema.optional(),
  })
  .refine(exactlyOneIdentifier, { message: IDENTIFIER_MSG });
export type TerminalStamp = z.infer<typeof terminalStampSchema>;

/** Identifizierung am Terminal OHNE zu stempeln (zeigt Foto/Name/Status an). */
export const kioskIdentifySchema = z
  .object({
    nfcUid: z.string().min(2).max(128).optional(),
    personnelNumber: z.string().min(1).max(64).optional(),
    employeeId: uuidSchema.optional(),
  })
  .refine(exactlyOneIdentifier, { message: IDENTIFIER_MSG });
export type KioskIdentify = z.infer<typeof kioskIdentifySchema>;

/** Antwort der Identifizierung: Anzeige der Person vor dem Stempeln. */
export interface KioskIdentifyResult {
  employeeId: string;
  employeeName: string;
  personnelNumber: string;
  hasPhoto: boolean;
  /** Aktueller Anwesenheitsstatus (für die Auswahl Kommen/Gehen/Pause). */
  state: 'out' | 'in' | 'break';
  /** Vom Server vorgeschlagene nächste Aktion. */
  suggestedKind: z.infer<typeof stampKindSchema>;
}

/** Grenzen für Mitarbeiterfotos (Anzeigebild, kein Rohbild-Upload beliebiger Größe). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Upload eines Mitarbeiterfotos (Base64), z. B. nach clientseitigem Zuschnitt. */
export const employeePhotoUploadSchema = z.object({
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  dataBase64: z.string().min(1),
});
export type EmployeePhotoUpload = z.infer<typeof employeePhotoUploadSchema>;

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
  employeeId: string;
  employeeName: string;
  personnelNumber: string;
  hasPhoto: boolean;
  kind: string;
  state: 'out' | 'in' | 'break';
  occurredAt: string;
}
