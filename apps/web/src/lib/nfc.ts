// NFC-Hilfsfunktionen für Kiosk (Scan) und Verwaltung (Zuordnung).

/**
 * Normalisiert eine NFC-UID auf Hex in Kleinbuchstaben ohne Trennzeichen.
 * Quellen liefern unterschiedliche Formate (Web NFC "04:a1:b2", PC/SC-Agent
 * "04A1B2", Keyboard-Wedge-Leser "04 A1 B2"); Zuordnung und Scan müssen exakt
 * dieselbe Form verwenden, sonst schlägt die Auflösung fehl.
 */
export function normalizeUid(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

/** Minimale Web-NFC-Schnittstelle (Android/Chrome); nicht in lib.dom enthalten. */
export interface NdefReaderLike {
  onreading: ((event: { serialNumber?: string }) => void) | null;
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}

/** Web-NFC-Konstruktor des Browsers, falls verfügbar (Android/Chrome). */
export function getNdefReader(): (new () => NdefReaderLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { NDEFReader?: new () => NdefReaderLike };
  return w.NDEFReader ?? null;
}
