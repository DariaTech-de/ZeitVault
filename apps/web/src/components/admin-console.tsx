'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import {
  Avatar,
  Button,
  Empty,
  ErrorNote,
  Facet,
  Facets,
  ObjectHeader,
  PageHead,
  Row,
  Worklist,
} from '@/components/fiori/ui';
import { type DayListing, type EmployeeSummary, fetchDayEvents, fetchEmployees, postCorrection } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}
function formatMinutes(total: number): string {
  return `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')} h`;
}
function initials(name: string): string {
  const p = name.split(' ');
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

export function AdminConsole() {
  const { identity } = useAuth();
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState<DayListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    fetchEmployees(identity)
      .then((list) => {
        setEmployees(list);
        setError(null);
      })
      .catch(() => setError('Mitarbeitende konnten nicht geladen werden (Admin-Rolle nötig; API erreichbar?).'));
  }, [identity]);

  const loadDay = useCallback(
    async (employeeId: string) => {
      if (!identity) return;
      setSelected(employeeId);
      try {
        setDay(await fetchDayEvents(identity, employeeId));
        setError(null);
      } catch {
        setError('Tagesdaten konnten nicht geladen werden.');
      }
    },
    [identity],
  );

  const correct = useCallback(
    async (eventId: string, current: string) => {
      if (!identity || !selected) return;
      const occurredAt = window.prompt('Korrigierter Zeitpunkt (ISO 8601):', current);
      if (!occurredAt) return;
      const reason = window.prompt('Begründung der Korrektur:', '');
      if (!reason) return;
      try {
        await postCorrection(identity, eventId, occurredAt, reason);
        await loadDay(selected);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Korrektur fehlgeschlagen.');
      }
    },
    [identity, selected, loadDay],
  );

  const selectedEmp = employees.find((e) => e.id === selected);

  return (
    <>
      <PageHead
        eyebrow="Verwaltung"
        title="Mitarbeitende & Tageskorrektur"
        sub="Stempelungen einsehen und korrigieren. Korrekturen erzeugen eine neue Revision; der Vorgänger bleibt erhalten (GoBD)."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        <Worklist className="h-fit">
          {employees.length === 0 ? (
            <Empty>Keine Daten.</Empty>
          ) : (
            employees.map((emp) => (
              <Row key={emp.id} selected={selected === emp.id} onClick={() => void loadDay(emp.id)}>
                <Avatar>{initials(emp.displayName)}</Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{emp.displayName}</span>
                  <span className="mono block text-[12px] text-ink-faint">Pers.-Nr. {emp.personnelNumber}</span>
                </span>
              </Row>
            ))
          )}
        </Worklist>

        <div>
          {!day ? (
            <div className="rounded-card border border-dashed border-line bg-surface px-5 py-16 text-center text-sm text-ink-faint">
              Mitarbeiter:in links auswählen.
            </div>
          ) : (
            <div className="rounded-card [box-shadow:var(--shadow)]">
              <ObjectHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedEmp?.displayName ?? 'Tag'}</h2>
                    <p className="mono mt-1 text-sm text-ink-muted">Pers.-Nr. {selectedEmp?.personnelNumber ?? '—'}</p>
                  </div>
                  {day.findings.length > 0 ? (
                    <StatusPill tone="negative">{day.findings.length} Befund(e)</StatusPill>
                  ) : (
                    <StatusPill tone="positive">konform</StatusPill>
                  )}
                </div>
              </ObjectHeader>
              <Facets>
                <Facet k="Gearbeitet" v={<span className="mono">{formatMinutes(day.status.workedMinutes)}</span>} />
                <Facet k="Pause" v={<span className="mono">{formatMinutes(day.status.breakMinutes)}</span>} />
                <Facet k="Ereignisse" v={<span className="mono">{day.events.length}</span>} />
                <Facet k="Status" v={day.status.state === 'out' ? 'Ausgestempelt' : day.status.state === 'break' ? 'Pause' : 'Aktiv'} />
              </Facets>

              {day.findings.length > 0 && (
                <div className="border-x border-line bg-surface px-5 py-4">
                  <MessageStrip tone="negative">
                    {day.findings.map((f) => f.message).join(' · ')}
                  </MessageStrip>
                </div>
              )}

              <div className="rounded-b-card border-x border-b border-line bg-surface px-5 py-4">
                <h3 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  Stempelungen (Historie)
                </h3>
                <ul className="divide-y divide-line">
                  {day.events.map((event) => (
                    <li key={event.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <span className="font-semibold">{KIND_LABEL[event.kind] ?? event.kind}</span>{' '}
                        <span className="mono text-ink-muted">{formatTime(event.occurredAt)}</span>
                        {event.correctsEventId && (
                          <StatusPill tone="warning" className="ml-2">Korrektur</StatusPill>
                        )}
                        {event.correctionReason && (
                          <span className="mt-0.5 block text-xs text-ink-faint">{event.correctionReason}</span>
                        )}
                      </div>
                      {!event.correctsEventId && (
                        <Button size="sm" onClick={() => void correct(event.id, event.occurredAt)}>
                          Korrigieren
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </div>
      </div>
    </>
  );
}
