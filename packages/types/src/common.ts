import { z } from 'zod';

/** UUID (v4/v7) als String. */
export const uuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/** ISO-8601-Zeitstempel mit Offset (z. B. 2026-06-26T08:00:00+02:00). */
export const isoTimestampSchema = z.string().datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

/**
 * Deutsche Bundeslaender - relevant fuer den Feiertagskalender je Standort
 * (siehe ARCHITEKTUR.md Paragraf 8, Entitaet Location).
 */
export const bundeslandSchema = z.enum([
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
]);
export type Bundesland = z.infer<typeof bundeslandSchema>;
