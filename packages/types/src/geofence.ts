import { z } from 'zod';
import { uuidSchema } from './common';

/**
 * Standort-Prüfung beim Stempeln (Geofencing). WICHTIG: Standardmäßig
 * DEAKTIVIERT (Kern-Invariante 5, BetrVG § 87). Nur nach Betriebsvereinbarung je
 * Mandant aktivierbar; keine heimliche Überwachung. Datensparsamkeit: gespeichert
 * wird das Prüfergebnis (innerhalb/außerhalb), der getroffene Standort und die
 * gerundete Distanz – NICHT die rohen Koordinaten (ADR-0014).
 */

/** Ergebnis der Standort-Prüfung eines Stempels. */
export const locationCheckSchema = z.enum(['not_required', 'inside', 'outside', 'no_signal']);
export type LocationCheck = z.infer<typeof locationCheckSchema>;

/** Optionale Position, die eine App beim Stempeln mitsendet (nur wenn aktiviert). */
export const stampLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100000).optional(),
});
export type StampLocation = z.infer<typeof stampLocationSchema>;

/** Mandanteneinstellung: Geofencing an/aus (Default aus). */
export const geofenceSettingsSchema = z.object({
  enabled: z.boolean(),
});
export type GeofenceSettings = z.infer<typeof geofenceSettingsSchema>;

/** Standort/Geofence eines Mandanten (Mittelpunkt + Radius in Metern). */
export const createGeofenceSiteSchema = z.object({
  name: z.string().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(10).max(100000),
});
export type CreateGeofenceSite = z.infer<typeof createGeofenceSiteSchema>;

export interface GeofenceSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active: boolean;
}

/** Admin kennzeichnet einen Stempel zur Nachverfolgung („blinken"). */
export const flagStampSchema = z.object({
  eventId: uuidSchema,
  flagged: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type FlagStamp = z.infer<typeof flagStampSchema>;
