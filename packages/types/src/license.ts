import { z } from 'zod';
import { uuidSchema } from './common';

/**
 * Lizenzmodell: ZeitVault wird pro Mitarbeitenden (Sitzplatz/„seat") als Paket
 * verkauft (z. B. 5/10/15/mehr). Eine Lizenz ist ein **offline verifizierbares**,
 * mit Ed25519 signiertes Token je Mandant. Der Server prueft die Signatur mit
 * dem konfigurierten oeffentlichen Schluessel (kein Phone-Home; funktioniert im
 * Self-Hosted-Betrieb). Der private Schluessel liegt ausschliesslich beim
 * Hersteller (DariaTech) und niemals im Repository (ADR-0013).
 */
export const licensePayloadSchema = z.object({
  /** Eindeutige Lizenz-ID (fuer Nachvollziehbarkeit/Sperrlisten). */
  licenseId: uuidSchema,
  /** Mandant, fuer den die Lizenz gilt (Self-Hosted: 'default'). */
  tenantId: z.string().min(1).max(64),
  /** Anzeigename des Kunden (nur informativ). */
  customer: z.string().min(1).max(200),
  /** Paketbezeichnung (frei, z. B. 'Team 10'). */
  tier: z.string().min(1).max(64),
  /** Maximale Anzahl aktiver Mitarbeitender (Sitzplaetze). */
  seats: z.number().int().positive().max(100000),
  /** Ausstellungszeitpunkt (ISO 8601). */
  issuedAt: z.string().datetime({ offset: true }),
  /** Ablaufzeitpunkt (ISO 8601). Danach faellt der Mandant in den Testmodus. */
  validUntil: z.string().datetime({ offset: true }),
  /** Optionale Feature-Flags der Lizenz. */
  features: z.array(z.string().min(1).max(64)).default([]),
});
export type LicensePayload = z.infer<typeof licensePayloadSchema>;

/** Upload eines signierten Lizenz-Tokens durch die Administration. */
export const activateLicenseSchema = z.object({
  /** Signiertes Token im Format `base64url(payload).base64url(signature)`. */
  token: z.string().min(1),
});
export type ActivateLicense = z.infer<typeof activateLicenseSchema>;

/** Live-Status der Lizenz eines Mandanten inklusive Sitzplatznutzung. */
export interface LicenseStatus {
  /** true, wenn eine gueltige (signierte, nicht abgelaufene) Lizenz vorliegt. */
  licensed: boolean;
  /** true, wenn die Lizenz aktuell gueltig ist (Signatur ok und nicht abgelaufen). */
  valid: boolean;
  /** Paketbezeichnung bzw. 'Testmodus' ohne gueltige Lizenz. */
  tier: string;
  /** Kundenname, sofern lizenziert. */
  customer: string | null;
  /** Verfuegbare Sitzplaetze (aus Lizenz bzw. Testmodus-Kontingent). */
  seats: number;
  /** Aktuell belegte Sitzplaetze (aktive Mitarbeitende). */
  seatsUsed: number;
  /** Verbleibende Sitzplaetze (max(0, seats - seatsUsed)). */
  seatsRemaining: number;
  /** Ablaufdatum (ISO) der Lizenz, falls vorhanden. */
  validUntil: string | null;
  /** Menschliche Begruendung des Zustands (z. B. Ablauf, ungueltige Signatur). */
  reason: string;
}
