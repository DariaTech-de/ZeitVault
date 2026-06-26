import type { Env } from '../config/env';

export interface FeatureFlags {
  registration: boolean;
  billing: boolean;
}

export interface PlatformInfo {
  operationMode: 'self_hosted' | 'cloud';
  features: FeatureFlags;
  observability: { telemetryEnabled: boolean };
}

/**
 * Leitet die WIRKSAMEN Feature-Flags aus der Konfiguration ab. SaaS-Funktionen
 * (Registrierung/Abrechnung) sind ausschließlich im Cloud-Modus möglich; im
 * Self-Hosted-Betrieb werden sie unabhängig von der Einzelvariable erzwungen
 * deaktiviert (eine Codebasis, zwei Betriebsmodelle; ADR-0010). Reine Funktion.
 */
export function resolvePlatformInfo(env: Env): PlatformInfo {
  const cloud = env.OPERATION_MODE === 'cloud';
  return {
    operationMode: env.OPERATION_MODE,
    features: {
      registration: cloud && env.REGISTRATION_ENABLED,
      billing: cloud && env.BILLING_ENABLED,
    },
    observability: { telemetryEnabled: Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT) },
  };
}
