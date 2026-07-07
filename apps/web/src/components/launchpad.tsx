'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { Sparkline } from '@/components/fiori/sparkline';
import { StatusPill } from '@/components/fiori/status-pill';
import { Bars, Donut, Tile, TileFoot, TileSub, TileValue } from '@/components/fiori/tile';
import {
  type AbsenceRequest,
  type AccountBalance,
  type StampStatus,
  type ViolationEntry,
  fetchAbsences,
  fetchBalanceList,
  fetchBalances,
  fetchToday,
  fetchViolations,
  stamp as postStamp,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';
import { cn } from '@/lib/utils';

const STATE_LABEL: Record<StampStatus['state'], string> = {
  out: 'Ausgestempelt',
  in: 'Eingestempelt',
  break: 'In Pause',
};

function hm(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
}

const icons = {
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  trend: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 17l5-5 4 3 6-7" /><path d="M17 8h4v4" /></svg>
  ),
  cal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M8 2v3M16 2v3M3 9h18" /><rect x="3" y="5" width="18" height="16" rx="2" /></svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
  ),
  warn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
  ),
};

function balanceOf(list: AccountBalance[], account: string): number {
  return list.find((b) => b.account === account)?.balance ?? 0;
}

export function Launchpad() {
  const { identity, displayName } = useAuth();
  const roles = identity?.roles ?? [];
  const isManager = roles.includes('manager') || roles.includes('admin');
  const isAdmin = roles.includes('admin');

  const [today, setToday] = useState<StampStatus | null>(null);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [absences, setAbsences] = useState<AbsenceRequest[]>([]);
  const [violations, setViolations] = useState<ViolationEntry[]>([]);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const loadEmployee = useCallback(async (id: Identity) => {
    try {
      const [t, b] = await Promise.all([fetchToday(id), fetchBalances(id, id.employeeId)]);
      setToday(t.status);
      setBalances(b);
    } catch {
      /* Backend nicht erreichbar – Kacheln bleiben leer. */
    }
  }, []);

  const loadManager = useCallback(async (id: Identity) => {
    const now = new Date();
    try {
      const [abs, vio, team] = await Promise.all([
        fetchAbsences(id).catch(() => []),
        fetchViolations(id, iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)).catch(() => []),
        fetchBalanceList(id).catch(() => []),
      ]);
      setAbsences(abs);
      setViolations(vio);
      setTeamCount(team.length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!identity) return;
    void loadEmployee(identity);
    if (identity.roles.includes('manager') || identity.roles.includes('admin')) void loadManager(identity);
  }, [identity, loadEmployee, loadManager]);

  const onStamp = useCallback(
    async (action: 'clock-in' | 'break-start' | 'break-end' | 'clock-out') => {
      if (!identity) return;
      setPending(true);
      try {
        const res = await postStamp(identity, action);
        setToday(res.status);
      } catch {
        /* ignore */
      } finally {
        setPending(false);
      }
    },
    [identity],
  );

  const state = today?.state ?? 'out';
  const openAbsences = absences.filter((a) => a.status === 'requested').length;
  const overtime = balanceOf(balances, 'overtime');
  const vacation = balanceOf(balances, 'vacation');

  const btn =
    'inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2 text-[13.5px] font-semibold text-ink transition hover:border-line-strong disabled:opacity-50';
  const btnPrimary = 'border-transparent bg-primary text-on-primary [box-shadow:var(--shadow-sm)] hover:bg-primary-hover';

  return (
    <main className="mx-auto max-w-[1200px] px-5 pb-16 pt-7">
      <header className="mb-5 flex items-end justify-between gap-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            {isAdmin ? 'Administration' : isManager ? 'Teamleitung' : 'Mein Arbeitsplatz'}
          </div>
          <h1 className="mt-1.5 text-[27px] font-semibold">
            {greeting()}
            {displayName ? `, ${displayName.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}Standort Köln · Gleitzeitmodell 40 h
          </p>
        </div>
        <StatusPill tone={state === 'out' ? 'neutral' : state === 'break' ? 'warning' : 'positive'}>
          {STATE_LABEL[state]}
        </StatusPill>
      </header>

      <SectionLabel>Meine Zeit</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Hero: Heute live + Stempeln */}
        <div className="rounded-card border border-line bg-surface p-[17px] [box-shadow:var(--shadow-sm)] sm:col-span-2 [background:radial-gradient(120%_140%_at_100%_0%,color-mix(in_srgb,var(--primary)_12%,var(--surface))_0%,var(--surface)_46%)]">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-semibold text-ink-muted">Heute · Live</span>
            <Link href="/heute" className="flex items-center gap-1 text-[13px] font-medium text-primary transition hover:underline">
              Tagesübersicht
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.5 w-3.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
          <div className="mono mt-3 text-[40px] font-semibold leading-none tracking-tight">{hm(today?.workedMinutes ?? 0)}<span className="text-lg text-ink-faint"> h gearbeitet</span></div>
          <div className="mt-3.5 flex gap-7">
            <Stat k="Pause" v={`${hm(today?.breakMinutes ?? 0)} h`} />
            <Stat k="Soll heute" v="8:00 h" />
            <Stat k="Status" v={STATE_LABEL[state]} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={cn(btn, btnPrimary)} disabled={pending || state !== 'out'} onClick={() => void onStamp('clock-in')}>Kommen</button>
            <button className={btn} disabled={pending || state !== 'in'} onClick={() => void onStamp('break-start')}>Pause</button>
            <button className={btn} disabled={pending || state !== 'break'} onClick={() => void onStamp('break-end')}>Pause beenden</button>
            <button className={cn(btn, 'text-neg')} disabled={pending || state !== 'in'} onClick={() => void onStamp('clock-out')}>Gehen</button>
          </div>
        </div>

        <Tile title="Überstundenkonto" accent="teal" icon={icons.trend}>
          <Sparkline data={[3, 4, 3.4, 5, 4.6, 6, 5.4, 7, 6.6, 8, 7.2, 9, 8.4, 10, 9.4, 10.6, 11.4, 12.5]} className="mt-3 h-[46px] w-full" />
          <TileValue>{`${overtime >= 0 ? '+' : ''}${hm(overtime)}`}</TileValue>
          <TileSub>Stunden · Saldo aktuell</TileSub>
        </Tile>

        <Tile title="Resturlaub 2026" accent="primary" icon={icons.cal}>
          <div className="mt-auto flex items-center gap-4">
            <Donut value={vacation} max={30} />
            <div>
              <div className="mono text-[30px] font-bold leading-none">{vacation}</div>
              <TileSub>von 30 Tagen offen</TileSub>
            </div>
          </div>
        </Tile>
      </div>

      {isManager && (
        <>
          <SectionLabel>Genehmigungen &amp; Compliance</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile title="Offene Anträge" accent="primary" icon={icons.inbox} href="/abwesenheit">
              <TileValue className="text-[34px]">{openAbsences}</TileValue>
              <TileFoot>
                <StatusPill tone="warning">{openAbsences} zu prüfen</StatusPill>
              </TileFoot>
            </Tile>

            <Tile title="ArbZG-Verstöße · Monat" accent="neg" icon={icons.warn} href="/admin/auswertungen">
              <TileValue className="text-[34px]">{violations.length}</TileValue>
              <TileFoot>
                {violations.length > 0 ? (
                  <StatusPill tone="negative">Prüfung erforderlich</StatusPill>
                ) : (
                  <StatusPill tone="positive">keine Verstöße</StatusPill>
                )}
              </TileFoot>
            </Tile>

            <Tile title="Verstöße · Verlauf" accent="teal" icon={icons.warn}>
              <Bars data={[3, 2, 4, 1, 2, 1, violations.length > 4 ? 4 : violations.length]} />
              <TileSub>letzte 7 Kalendertage (illustrativ)</TileSub>
            </Tile>

            <Tile title="Mitarbeitende" accent="none" icon={icons.list} href="/admin/auswertungen">
              <TileValue className="text-[34px]">{teamCount ?? '–'}</TileValue>
              <TileSub>im Mandanten · Saldenliste</TileSub>
            </Tile>
          </div>
        </>
      )}

      <div className="mt-9 border-t border-line pt-4">
        <MessageStrip tone="info">
          Rollenbasierte Startseite (Fiori-Launchpad). Kacheln sind an die Live-API angebunden; Rolle über
          das Menü oben rechts wechseln, um Sichtbarkeit und Aufgaben zu ändern.
        </MessageStrip>
      </div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{k}</div>
      <div className="mono mt-1 text-[17px] font-semibold">{v}</div>
    </div>
  );
}
