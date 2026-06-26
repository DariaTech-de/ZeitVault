// OIDC-Client (Authorization Code + PKCE) gegen Keycloak. Nur im Browser und nur
// im Modus 'oidc' aktiv. Konfiguration über NEXT_PUBLIC_OIDC_*.
import { type UserManagerSettings, UserManager, WebStorageStateStore } from 'oidc-client-ts';

let manager: UserManager | null = null;

function settings(): UserManagerSettings {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    authority:
      process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/zeitvault',
    client_id: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? 'zeitvault-web',
    redirect_uri: process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI ?? `${origin}/auth/callback`,
    post_logout_redirect_uri: process.env.NEXT_PUBLIC_OIDC_POST_LOGOUT_URI ?? origin,
    response_type: 'code',
    scope: process.env.NEXT_PUBLIC_OIDC_SCOPE ?? 'openid profile',
    automaticSilentRenew: true,
    userStore:
      typeof window !== 'undefined'
        ? new WebStorageStateStore({ store: window.localStorage })
        : undefined,
  };
}

/** Liefert den (lazy erzeugten) UserManager; nur im Browser aufrufen. */
export function getUserManager(): UserManager {
  if (!manager) {
    manager = new UserManager(settings());
  }
  return manager;
}
