'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { ShellBar } from '@/components/fiori/shell-bar';

/**
 * Rahmen der Anwendung: normalerweise ShellBar + Auth-Schutz. Der Kiosk-Bereich
 * (Terminal am Eingang) läuft ohne Nutzer-Login und ohne Navigationsleiste; er
 * authentifiziert sich über das Geräte-Token (ADR-0015).
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/kiosk')) {
    return <>{children}</>;
  }
  return (
    <>
      <ShellBar />
      <AuthGate>{children}</AuthGate>
    </>
  );
}
