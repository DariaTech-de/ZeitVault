'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/identity';

export function AppNav() {
  const { identity, displayName, logout, switchDevRole } = useAuth();
  const roles = identity?.roles ?? [];
  const isManager = roles.includes('manager') || roles.includes('admin');

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold tracking-tight">
            ZeitVault
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
            Self-Service
          </Link>
          <Link href="/abwesenheit" className="text-sm text-slate-600 hover:text-slate-900">
            Abwesenheit
          </Link>
          <Link href="/konten" className="text-sm text-slate-600 hover:text-slate-900">
            Konten
          </Link>
          {isManager && (
            <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">
              Verwaltung
            </Link>
          )}
          {isManager && (
            <Link
              href="/admin/auswertungen"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Auswertungen
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {displayName && <span className="font-medium text-slate-700">{displayName}</span>}
          <span>
            Rolle: <span className="font-medium text-slate-700">{roles.join(', ') || '-'}</span>
          </span>
          {AUTH_MODE === 'dev' ? (
            <Button
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={switchDevRole}
              disabled={identity === null}
            >
              Rolle wechseln (Demo)
            </Button>
          ) : (
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={logout}>
              Abmelden
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
