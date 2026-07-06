import { z } from 'zod';

/** Boolesches Flag aus einer Umgebungsvariable ('true'/'false'); Default false. */
const envBool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/** Validierte Umgebungskonfiguration. Faellt fail-fast bei ungueltigen Werten. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://zeitvault:zeitvault@localhost:5432/zeitvault'),
  LEDGER_URL: z.string().url().default('http://localhost:3001'),
  // Authentifizierung: 'oidc' (Default, produktionssicher: Bearer-Token gegen
  // Keycloak-JWKS) oder 'dev' (nur lokal/Tests: Tenant/User aus Headern).
  AUTH_MODE: z.enum(['oidc', 'dev']).default('oidc'),
  KEYCLOAK_ISSUER_URL: z.string().url().optional(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  TENANT_CLAIM: z.string().default('tenant_id'),
  DEFAULT_TENANT_ID: z.string().default('default'),
  // Betriebsmodell (eine Codebasis, zwei Modelle; ADR-0010): 'self_hosted' oder
  // 'cloud'. SaaS-Funktionen (Registrierung/Abrechnung) sind nur im Cloud-Modus
  // wirksam und standardmaessig deaktiviert (Datensparsamkeit, ADR-0010).
  OPERATION_MODE: z.enum(['self_hosted', 'cloud']).default('self_hosted'),
  REGISTRATION_ENABLED: envBool,
  BILLING_ENABLED: envBool,
  // Observability (OpenTelemetry): OTLP-Endpunkt des Collectors; ohne Wert wird
  // kein Telemetrie-Export verdrahtet (datensparsam, Opt-in).
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('zeitvault-api'),
  // Erlaubte CORS-Ursprünge (kommagetrennt) für die Web-/Mobile-App. Leer =
  // Ursprung wird reflektiert (nur für lokale Entwicklung gedacht). In Produktion
  // explizit pinnen.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  // Lizenzierung (ADR-0013): oeffentlicher Ed25519-Schluessel (PEM) zur Pruefung
  // signierter Lizenz-Token. Der private Schluessel liegt beim Hersteller und
  // nie im Repo. Ohne konfigurierten Schluessel bleibt der Mandant im Testmodus.
  // Zeilenumbrueche duerfen als "\n" uebergeben werden.
  LICENSE_PUBLIC_KEY: z
    .string()
    .default('')
    .transform((value) => value.replace(/\\n/g, '\n').trim()),
  // Sitzplatz-Kontingent ohne gueltige Lizenz (Testmodus), damit Ersteinrichtung
  // und Demo moeglich bleiben. In Produktion durch eine echte Lizenz ersetzt.
  LICENSE_GRACE_SEATS: z.coerce.number().int().min(0).max(100000).default(5),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
