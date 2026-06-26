'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getIdentity, setIdentity, type Identity } from '@/lib/identity';

export function AppNav() {
  const [identity, setIdentityState] = useState<Identity | null>(null);

  useEffect(() => {
    setIdentityState(getIdentity());
  }, []);

  const isAdmin = identity?.roles.includes('admin') ?? false;

  function switchRole() {
    if (!identity) return;
    const roles = isAdmin ? ['employee'] : ['employee', 'admin'];
    setIdentity({ ...identity, roles });
    window.location.reload();
  }

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
          {isAdmin && (
            <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">
              Verwaltung
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/auswertungen"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Auswertungen
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            Rolle: <span className="font-medium text-slate-700">{isAdmin ? 'admin' : 'employee'}</span>
          </span>
          <Button
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={switchRole}
            disabled={identity === null}
          >
            Rolle wechseln (Demo)
          </Button>
        </div>
      </div>
    </nav>
  );
}
