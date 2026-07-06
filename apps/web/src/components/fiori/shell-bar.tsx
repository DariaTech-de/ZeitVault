'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/identity';
import { cn } from '@/lib/utils';

function initials(name: string | null): string {
  if (!name) return 'ZV';
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'ZV';
}

const iconBtn =
  'relative grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-line bg-surface-2 text-ink-muted transition hover:text-ink hover:border-line-strong';

export function ShellBar() {
  const { identity, displayName, logout, switchDevRole } = useAuth();
  const pathname = usePathname();
  const roles = identity?.roles ?? [];
  const isManager = roles.includes('manager') || roles.includes('admin');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    setDark(attr ? attr === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('zv-theme', next);
    } catch {
      /* ignore */
    }
    setDark(!dark);
  }, [dark]);

  const nav: Array<{ href: string; label: string; show: boolean }> = [
    { href: '/', label: 'Start', show: true },
    { href: '/abwesenheit', label: 'Abwesenheit', show: true },
    { href: '/zeitkorrektur', label: 'Zeitkorrektur', show: true },
    { href: '/konten', label: 'Konten', show: true },
    { href: '/admin', label: 'Verwaltung', show: isManager },
    { href: '/admin/auswertungen', label: 'Auswertungen', show: isManager },
  ];

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-line bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-5 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-gradient-to-br from-primary to-teal text-white [box-shadow:var(--shadow-sm)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-[15px] w-[15px]">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5l3.2 1.9" />
          </svg>
        </span>
        ZeitVault
        <span className="ml-0.5 text-xs font-medium tracking-wide text-ink-faint">Zeitwirtschaft</span>
      </Link>

      <nav className="ml-1.5 flex gap-0.5 rounded-[11px] border border-line bg-surface-2 p-[3px]" aria-label="Bereiche">
        {nav
          .filter((n) => n.show)
          .map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition',
                  active ? 'bg-surface text-ink [box-shadow:var(--shadow-sm)]' : 'text-ink-muted hover:text-ink',
                )}
              >
                {n.label}
              </Link>
            );
          })}
      </nav>

      <div className="flex-1" />

      <label className="hidden items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-2.5 py-[7px] text-ink-faint md:flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[15px] w-[15px]">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input
          placeholder="Suchen …"
          className="w-40 border-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      {isManager && (
        <Link href="/admin/auswertungen" className={iconBtn} aria-label="Offene Vorgänge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[17px] w-[17px]">
            <path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" />
            <path d="M10.5 20a2 2 0 003 0" />
          </svg>
        </Link>
      )}

      <button type="button" onClick={toggleTheme} className={iconBtn} aria-label="Design wechseln">
        {dark ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[17px] w-[17px]">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[17px] w-[17px]">
            <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface-2 py-[5px] pl-2.5 pr-1.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-weak text-xs font-bold text-primary">
          {initials(displayName ?? (identity ? 'ZeitVault' : null))}
        </span>
        <span className="hidden text-[13px] font-medium sm:block">{displayName ?? 'Angemeldet'}</span>
        {AUTH_MODE === 'dev' ? (
          <button
            type="button"
            onClick={switchDevRole}
            className="rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-surface-3 hover:text-ink"
          >
            Rolle
          </button>
        ) : (
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-surface-3 hover:text-ink"
          >
            Abmelden
          </button>
        )}
      </div>
    </header>
  );
}
