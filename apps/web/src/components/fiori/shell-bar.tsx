'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/identity';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
}

const CORE: NavItem[] = [
  { href: '/', label: 'Start' },
  { href: '/heute', label: 'Heute' },
  { href: '/abwesenheit', label: 'Abwesenheit' },
  { href: '/zeitkorrektur', label: 'Zeitkorrektur' },
  { href: '/konten', label: 'Konten' },
];
const ADMIN: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin', label: 'Übersicht' },
  { href: '/admin/auswertungen', label: 'Auswertungen' },
  { href: '/admin/standort', label: 'Standort' },
  { href: '/admin/terminals', label: 'Terminals' },
  { href: '/admin/lizenz', label: 'Lizenz' },
];
const HELP: NavItem = { href: '/hilfe', label: 'Hilfe' };

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    setDark(attr ? attr === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  // Menüs bei Navigation schliessen.
  useEffect(() => {
    setMenuOpen(false);
    setAdminOpen(false);
  }, [pathname]);

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

  const flat: NavItem[] = [...CORE, ...(isManager ? ADMIN : []), HELP];
  // Aktiver Eintrag = laengster passender Pfad-Praefix (damit unter /admin/... nicht
  // zusaetzlich die Uebersicht (/admin) markiert wird).
  const activeHref = flat
    .filter((n) => (n.href === '/' ? pathname === '/' : pathname === n.href || pathname.startsWith(`${n.href}/`)))
    .reduce<string | null>((best, n) => (best && best.length >= n.href.length ? best : n.href), null);
  const adminActive = isManager && pathname.startsWith('/admin');

  const pill = (active: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition',
      active ? 'bg-surface text-ink [box-shadow:var(--shadow-sm)]' : 'text-ink-muted hover:text-ink',
    );

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3 backdrop-blur-md sm:gap-4 sm:px-5">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Menü"
        aria-expanded={menuOpen}
        className={cn(iconBtn, 'xl:hidden')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[18px] w-[18px]">
          {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-gradient-to-br from-primary to-teal text-white [box-shadow:var(--shadow-sm)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-[15px] w-[15px]">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5l3.2 1.9" />
          </svg>
        </span>
        ZeitVault
        <span className="ml-0.5 hidden text-xs font-medium tracking-wide text-ink-faint sm:inline">Zeitwirtschaft</span>
      </Link>

      <nav className="ml-1.5 hidden items-center gap-0.5 rounded-[11px] border border-line bg-surface-2 p-[3px] xl:flex" aria-label="Bereiche">
        {CORE.map((n) => (
          <Link key={n.href} href={n.href} aria-current={n.href === activeHref ? 'page' : undefined} className={pill(n.href === activeHref)}>
            {n.label}
          </Link>
        ))}
        {isManager && (
          <span className="relative">
            <button type="button" onClick={() => setAdminOpen((v) => !v)} aria-expanded={adminOpen} className={cn(pill(adminActive), 'flex items-center gap-1')}>
              Verwaltung
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={cn('h-3.5 w-3.5 transition', adminOpen && 'rotate-180')}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {adminOpen && (
              <>
                <button type="button" aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setAdminOpen(false)} />
                <span className="absolute left-0 top-[calc(100%+8px)] z-50 block w-52 rounded-[12px] border border-line bg-surface p-1.5 [box-shadow:var(--shadow)]">
                  {ADMIN.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={n.href === activeHref ? 'page' : undefined}
                      className={cn(
                        'block rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
                        n.href === activeHref ? 'bg-primary-weak text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      {n.label}
                    </Link>
                  ))}
                </span>
              </>
            )}
          </span>
        )}
        <Link href={HELP.href} aria-current={HELP.href === activeHref ? 'page' : undefined} className={pill(HELP.href === activeHref)}>
          {HELP.label}
        </Link>
      </nav>

      {menuOpen && (
        <>
          <button type="button" aria-hidden className="fixed inset-0 top-14 z-40 cursor-default bg-black/20 xl:hidden" onClick={() => setMenuOpen(false)} />
          <nav className="absolute left-0 right-0 top-14 z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-line bg-surface p-2 [box-shadow:var(--shadow)] xl:hidden" aria-label="Bereiche">
            {flat.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.href === activeHref ? 'page' : undefined}
                className={cn(
                  'block rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  n.href === activeHref ? 'bg-primary-weak text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </>
      )}

      <div className="flex-1" />

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
