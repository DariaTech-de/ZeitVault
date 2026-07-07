'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import { Card, Empty, Facet, Facets, ObjectHeader, PageHead } from '@/components/fiori/ui';
import {
  type DayListing,
  type StampAction,
  type StampState,
  fetchDayEvents,
  stamp as postStamp,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';
import { cn } from '@/lib/utils';

const STATE_LABEL: Record<StampState, string> = { out: 'Ausgestempelt', in: 'Eingestempelt', break: 'In Pause' };
const STATE_TONE: Record<StampState, 'neutral' | 'positive' | 'warning'> = { out: 'neutral', in: 'positive', break: 'warning' };
const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};
const KIND_TONE: Record<string, string> = {
  clock_in: 'var(--pos)',
  break_start: 'var(--warn)',
  break_end: 'var(--warn)',
  clock_out: 'var(--neg)',
};

function hm(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  return `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function today(): string {
  return new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function HeuteWorkspace() {
  const { identity, displayName } = useAuth();
  const [day, setDay] = useState<DayListing | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (id: Identity) => {
    try {
      setDay(await fetchDayEvents(id, id.employeeId));
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const onStamp = useCallback(
    async (action: StampAction) => {
      if (!identity) return;
      setPending(true);
      try {
        await postStamp(identity, action);
        await refresh(identity);
      } catch (err) {
        setError(err instanceof Error ? err.message.replace(/^HTTP \d+:\s*/, '').slice(0, 160) : 'Stempeln fehlgeschlagen.');
      } finally {
        setPending(false);
      }
    },
    [identity, refresh],
  );

  const state: StampState = day?.status.state ?? 'out';
  const events = day?.events ?? [];
  // Nur wirksame Ereignisse in der Timeline (korrigierte Vorgänger ausblenden).
  const correctedIds = new Set(events.map((e) => e.correctsEventId).filter((x): x is string => x !== null));
  const timeline = events.filter((e) => !correctedIds.has(e.id));
  const findings = day?.findings ?? [];

  const btn = 'h-10 rounded-[10px] px-4 text-sm font-semibold transition disabled:opacity-40';

  return (
    <>
      <PageHead
        eyebrow={`Meine Zeit · ${today()}`}
        title="Heute"
        sub="Tagesübersicht mit Stempelungen, Zeiten und Live-Bewertung nach ArbZG."
        right={<StatusPill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</StatusPill>}
      />

      {error && (
        <div className="mb-4">
          <MessageStrip tone="negative">{error}</MessageStrip>
        </div>
      )}

      <div className="overflow-hidden rounded-card">
        <ObjectHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-weak text-base font-bold text-primary">
                {(displayName ?? 'ZV').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <div>
                <div className="text-lg font-semibold">{displayName ?? 'Angemeldet'}</div>
                <div className="text-[13px] text-ink-muted">{today()}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cn(btn, 'bg-primary text-on-primary [box-shadow:var(--shadow-sm)] hover:bg-primary-hover')} disabled={pending || state !== 'out'} onClick={() => void onStamp('clock-in')}>
                Kommen
              </button>
              <button type="button" className={cn(btn, 'border border-line bg-surface-2 text-ink hover:border-line-strong')} disabled={pending || state !== 'in'} onClick={() => void onStamp('break-start')}>
                Pause
              </button>
              <button type="button" className={cn(btn, 'border border-line bg-surface-2 text-ink hover:border-line-strong')} disabled={pending || state !== 'break'} onClick={() => void onStamp('break-end')}>
                Pause beenden
              </button>
              <button type="button" className={cn(btn, 'border border-line bg-surface-2 text-neg hover:border-line-strong')} disabled={pending || state !== 'in'} onClick={() => void onStamp('clock-out')}>
                Gehen
              </button>
            </div>
          </div>
        </ObjectHeader>
        <Facets>
          <Facet k="Status" v={STATE_LABEL[state]} />
          <Facet k="Gearbeitet" v={<span className="mono">{hm(day?.status.workedMinutes ?? 0)} h</span>} />
          <Facet k="Pause" v={<span className="mono">{hm(day?.status.breakMinutes ?? 0)} h</span>} />
          <Facet k="Stempelungen" v={<span className="mono">{timeline.length}</span>} />
        </Facets>
        <div className="rounded-b-card border border-t-0 border-line bg-surface" />
      </div>

      {findings.length > 0 && (
        <div className="mt-5 space-y-2">
          {findings.map((f) => (
            <MessageStrip key={`${f.code}-${f.message}`} tone={f.severity === 'violation' ? 'negative' : 'warning'}>
              {f.message}
            </MessageStrip>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <h2 className="text-base font-semibold">Tagesverlauf</h2>
          {timeline.length === 0 ? (
            <div className="mt-4">
              <Empty>Noch keine Stempelung heute. Mit „Kommen" starten.</Empty>
            </div>
          ) : (
            <ol className="mt-4">
              {timeline.map((e, i) => (
                <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < timeline.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-line" aria-hidden />}
                  <span className="relative z-10 mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-surface [box-shadow:0_0_0_1px_var(--line)]" style={{ background: KIND_TONE[e.kind] ?? 'var(--primary)' }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="mono text-[15px] font-semibold tabular-nums">{timeOf(e.occurredAt)}</span>
                      <span className="font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                      {e.correctsEventId && <StatusPill tone="info">Korrektur</StatusPill>}
                    </span>
                    {e.correctionReason && <span className="mt-0.5 block text-[12.5px] text-ink-faint">{e.correctionReason}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="h-fit p-5">
          <h2 className="text-base font-semibold">Hinweise</h2>
          {findings.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-pos">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-5 w-5">
                <path d="M5 13l4 4L19 7" />
              </svg>
              Keine arbeitszeitrechtlichen Auffälligkeiten.
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">{findings.length} Hinweis(e) – siehe oben. Korrekturen über „Zeitkorrektur".</p>
          )}
          <div className="mt-4 border-t border-line pt-4 text-[12.5px] text-ink-faint">
            Stempelungen sind revisionssicher (append-only). Eine Korrektur erzeugt eine neue Revision; der Vorgänger bleibt erhalten.
          </div>
        </Card>
      </div>
    </>
  );
}
