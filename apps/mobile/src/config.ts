// Laufzeitkonfiguration der Mobile-App (EXPO_PUBLIC_* zur Build-/Startzeit).
// Zwei Auth-Modi analog zu Web/API: 'oidc' (Keycloak, PKCE) oder 'dev' (Header).

export type AuthMode = 'oidc' | 'dev';

// Im Emulator: Android -> 10.0.2.2, iOS-Simulator -> localhost. Produktion: HTTPS.
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3000';
export const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? 'default';
export const AUTH_MODE: AuthMode =
  (process.env.EXPO_PUBLIC_AUTH_MODE as AuthMode | undefined) ?? 'dev';

// OIDC (Keycloak)
export const OIDC_ISSUER =
  process.env.EXPO_PUBLIC_OIDC_ISSUER ?? 'http://10.0.2.2:8080/realms/zeitvault';
export const OIDC_CLIENT_ID = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID ?? 'zeitvault-mobile';

// Dev-Fallback: festes Demo-Subject (entspricht Keycloak-Demo-Nutzer); /me löst
// daraus denselben Mitarbeiter auf wie nach echtem Login.
export const DEV_USER_ID =
  process.env.EXPO_PUBLIC_USER_ID ?? '11111111-1111-1111-1111-111111111111';

export const QUEUE_STORAGE_KEY = 'zeitvault.queue';
