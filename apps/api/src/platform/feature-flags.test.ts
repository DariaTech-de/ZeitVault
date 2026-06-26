import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { resolvePlatformInfo } from './feature-flags';

function env(overrides: Partial<Env>): Env {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgres://x:y@localhost:5432/z',
    LEDGER_URL: 'http://localhost:3001',
    AUTH_MODE: 'oidc',
    TENANT_CLAIM: 'tenant_id',
    DEFAULT_TENANT_ID: 'default',
    OPERATION_MODE: 'self_hosted',
    REGISTRATION_ENABLED: false,
    BILLING_ENABLED: false,
    OTEL_SERVICE_NAME: 'zeitvault-api',
    ...overrides,
  } as Env;
}

describe('resolvePlatformInfo', () => {
  it('Self-Hosted erzwingt deaktivierte SaaS-Funktionen, auch wenn gesetzt', () => {
    const info = resolvePlatformInfo(
      env({ OPERATION_MODE: 'self_hosted', REGISTRATION_ENABLED: true, BILLING_ENABLED: true }),
    );
    expect(info.features).toEqual({ registration: false, billing: false });
  });

  it('Cloud-Modus aktiviert gesetzte SaaS-Funktionen', () => {
    const info = resolvePlatformInfo(
      env({ OPERATION_MODE: 'cloud', REGISTRATION_ENABLED: true, BILLING_ENABLED: false }),
    );
    expect(info.features).toEqual({ registration: true, billing: false });
  });

  it('Telemetrie gilt als aktiv, wenn ein OTLP-Endpunkt gesetzt ist', () => {
    const off = resolvePlatformInfo(env({}));
    const on = resolvePlatformInfo(env({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' }));
    expect(off.observability.telemetryEnabled).toBe(false);
    expect(on.observability.telemetryEnabled).toBe(true);
  });
});
