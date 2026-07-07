// OIDC-Client (Authorization Code + PKCE) gegen Keycloak. Nur im Browser und nur
// im Modus 'oidc' aktiv. Konfiguration über NEXT_PUBLIC_OIDC_*.
import { type UserManagerSettings, UserManager, WebStorageStateStore } from 'oidc-client-ts';

let manager: UserManager | null = null;

/**
 * Ermittelt die OIDC-Authority (Keycloak-Realm-URL). Reihenfolge:
 *  1. explizite absolute URL aus NEXT_PUBLIC_OIDC_AUTHORITY (z. B. eigene
 *     Keycloak-Subdomain),
 *  2. opt-in: aus dem aktuellen Ursprung + NEXT_PUBLIC_OIDC_AUTHORITY_PATH
 *     abgeleitet (same-origin, Keycloak unter einem relativen Pfad wie /idp) -
 *     macht das Web-Image hostunabhaengig (nuetzlich hinter Tunneln/Proxys mit
 *     wechselndem Hostnamen),
 *  3. lokaler Entwicklungs-Fallback.
 */
function resolveAuthority(origin: string): string {
  const explicit = process.env.NEXT_PUBLIC_OIDC_AUTHORITY;
  if (explicit) return explicit;
  const path = process.env.NEXT_PUBLIC_OIDC_AUTHORITY_PATH;
  if (path && origin) return `${origin}${path}`;
  return 'http://localhost:8080/realms/zeitvault';
}

function settings(): UserManagerSettings {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    authority: resolveAuthority(origin),
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
