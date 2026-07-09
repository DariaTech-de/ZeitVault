import { z } from 'zod';

/**
 * Anlegen eines Mitarbeitenden durch die Administration. Die Aktivierung belegt
 * einen Lizenz-Sitzplatz; die Durchsetzung erfolgt serverseitig (ADR-0013).
 */
export const createEmployeeSchema = z.object({
  personnelNumber: z.string().min(1).max(64),
  displayName: z.string().min(1).max(200),
  /** OIDC-Subject (sub) des verknüpften Nutzers, optional. */
  externalId: z.string().min(1).max(128).optional(),
  /**
   * Optionales Geburtsdatum (B-07): Zweckbindung ausschliesslich die
   * automatische JArbSchG-Umschaltung fuer Beschaeftigte unter 18.
   */
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * C-06: Grundlohn als GANZZAHLIGE Cent (Geld ist nie Float). Optional -
   * ohne Grundlohn werden Zuschlagsminuten ausgewiesen, aber keine Betraege.
   */
  hourlyBaseWageCents: z.number().int().nonnegative().optional(),
});
export type CreateEmployee = z.infer<typeof createEmployeeSchema>;
