'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe } from '@/lib/api';
import {
  AUTH_MODE,
  type Identity,
  authHeaders,
  getDevIdentity,
  setDevIdentity,
} from '@/lib/identity';
import { getUserManager } from '@/lib/oidc';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: Status;
  identity: Identity | null;
  displayName: string | null;
  login: () => void;
  logout: () => void;
  switchDevRole: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Reichert eine Basis-Identität über /me an (Mitarbeiterbezug, Rollen, Tenant). */
async function enrich(base: Identity): Promise<{ identity: Identity; displayName: string | null }> {
  try {
    const me = await fetchMe(authHeaders(base));
    return {
      identity: {
        ...base,
        tenantId: me.tenantId,
        userId: me.userId,
        roles: me.roles,
        employeeId: me.employee?.id ?? base.employeeId,
      },
      displayName: me.employee?.displayName ?? null,
    };
  } catch {
    // Backend nicht erreichbar: Basis-Identität verwenden (UI bleibt bedienbar).
    return { identity: base, displayName: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const applyDev = useCallback(async () => {
    const { identity: id, displayName: dn } = await enrich(getDevIdentity());
    setIdentity(id);
    setDisplayName(dn);
    setStatus('authenticated');
  }, []);

  const applyOidc = useCallback(async () => {
    const user = await getUserManager().getUser();
    if (!user || user.expired || !user.access_token) {
      setStatus('unauthenticated');
      setIdentity(null);
      return;
    }
    const base: Identity = {
      mode: 'oidc',
      tenantId: 'default',
      userId: user.profile.sub ?? '',
      employeeId: '',
      roles: [],
      accessToken: user.access_token,
    };
    const { identity: id, displayName: dn } = await enrich(base);
    setIdentity(id);
    setDisplayName(dn ?? (user.profile.name as string | undefined) ?? null);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    if (AUTH_MODE === 'dev') {
      void applyDev();
    } else {
      void applyOidc();
    }
  }, [applyDev, applyOidc]);

  const login = useCallback(() => {
    if (AUTH_MODE === 'oidc') void getUserManager().signinRedirect();
  }, []);

  const logout = useCallback(() => {
    if (AUTH_MODE === 'oidc') void getUserManager().signoutRedirect();
  }, []);

  const switchDevRole = useCallback(() => {
    if (AUTH_MODE !== 'dev' || !identity) return;
    const isAdmin = identity.roles.includes('admin');
    const next = getDevIdentity();
    next.roles = isAdmin ? ['employee'] : ['employee', 'manager', 'admin'];
    // Admin-Demo-Subject, damit /me die Rolle konsistent auflöst.
    next.userId = isAdmin
      ? '11111111-1111-1111-1111-111111111111'
      : '22222222-2222-2222-2222-222222222222';
    setDevIdentity(next);
    window.location.reload();
  }, [identity]);

  const value = useMemo<AuthState>(
    () => ({ status, identity, displayName, login, logout, switchDevRole }),
    [status, identity, displayName, login, logout, switchDevRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  }
  return ctx;
}
