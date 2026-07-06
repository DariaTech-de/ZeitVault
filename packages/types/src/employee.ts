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
});
export type CreateEmployee = z.infer<typeof createEmployeeSchema>;
