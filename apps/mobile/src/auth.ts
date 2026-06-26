// Auth-Hook der Mobile-App: OIDC (Keycloak, Authorization Code + PKCE über
// expo-auth-session) oder Dev-Fallback (Header). Liefert Session + aufgelösten
// Mitarbeiter (über /me), analog zur Web-App.
import { useCallback, useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { fetchMe, type MeResponse, type Session } from './api';
import { AUTH_MODE, DEV_USER_ID, OIDC_CLIENT_ID, OIDC_ISSUER } from './config';

WebBrowser.maybeCompleteAuthSession();

type Status = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthResult {
  status: Status;
  session: Session | null;
  profile: MeResponse | null;
  employeeId: string | null;
  login: () => void;
}

export function useAuth(): AuthResult {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MeResponse | null>(null);

  const discovery = AuthSession.useAutoDiscovery(OIDC_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'zeitvault' });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: OIDC_CLIENT_ID,
      redirectUri,
      scopes: ['openid', 'profile'],
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery,
  );

  const establish = useCallback(async (next: Session) => {
    try {
      const me = await fetchMe(next);
      setProfile(me);
    } catch {
      setProfile(null);
    }
    setSession(next);
    setStatus('authenticated');
  }, []);

  // Dev-Modus: sofort mit Demo-Identität anmelden.
  useEffect(() => {
    if (AUTH_MODE === 'dev') {
      void establish({ mode: 'dev', userId: DEV_USER_ID, roles: ['employee'] });
    } else {
      setStatus('unauthenticated');
    }
  }, [establish]);

  // OIDC-Modus: Authorization Code gegen Tokens tauschen (PKCE).
  useEffect(() => {
    if (AUTH_MODE !== 'oidc' || !discovery || !request) return;
    if (response?.type !== 'success' || !response.params.code) return;
    AuthSession.exchangeCodeAsync(
      {
        clientId: OIDC_CLIENT_ID,
        code: response.params.code,
        redirectUri,
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
      },
      discovery,
    )
      .then((token) =>
        establish({ mode: 'oidc', userId: '', roles: [], accessToken: token.accessToken }),
      )
      .catch(() => setStatus('unauthenticated'));
  }, [response, discovery, request, redirectUri, establish]);

  const login = useCallback(() => {
    if (AUTH_MODE === 'oidc') void promptAsync();
  }, [promptAsync]);

  return {
    status,
    session,
    profile,
    employeeId: profile?.employee?.id ?? session?.userId ?? null,
    login,
  };
}
