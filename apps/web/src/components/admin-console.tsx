'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type DayListing,
  type EmployeeSummary,
  fetchDayEvents,
  fetchEmployees,
  postCorrection,
} from '@/lib/api';
import { getIdentity, type Identity } from '@/lib/identity';

const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}

export function AdminConsole() {
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState<DayListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = getIdentity();
    setIdentityState(id);
    fetchEmployees(id)
      .then((list) => {
        setEmployees(list);
        setError(null);
      })
      .catch(() =>
        setError(
          'Mitarbeitende konnten nicht geladen werden (Admin-Rolle nötig; API erreichbar?).',
        ),
      );
  }, []);

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

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Mitarbeitende</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {employees.length === 0 && <p className="text-sm text-slate-500">Keine Daten.</p>}
          {employees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => void loadDay(emp.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                selected === emp.id ? 'bg-slate-100 font-medium' : ''
              }`}
            >
              {emp.displayName}
              <span className="block text-xs text-slate-400">Pers.-Nr. {emp.personnelNumber}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tagesübersicht</CardTitle>
          {day && (
            <div className="text-sm text-slate-600">
              Arbeit {formatMinutes(day.status.workedMinutes)} &middot; Pause{' '}
              {formatMinutes(day.status.breakMinutes)}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {!day && <p className="text-sm text-slate-500">Mitarbeiter:in links auswählen.</p>}

          {day && day.findings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700">Verstoßreport (ArbZG)</h3>
              <ul className="space-y-1">
                {day.findings.map((finding, index) => (
                  <li key={`${finding.code}-${index}`} className="flex items-center gap-2 text-sm">
                    <Badge variant={finding.severity === 'violation' ? 'violation' : 'warning'}>
                      {finding.severity === 'violation' ? 'Verstoß' : 'Warnung'}
                    </Badge>
                    <span className="text-slate-700">{finding.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {day && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700">Stempelungen (Historie)</h3>
              <ul className="divide-y divide-slate-100">
                {day.events.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{KIND_LABEL[event.kind] ?? event.kind}</span>{' '}
                      <span className="text-slate-600">{formatTime(event.occurredAt)}</span>
                      {event.correctsEventId && (
                        <Badge variant="warning" className="ml-2">
                          Korrektur
                        </Badge>
                      )}
                      {event.correctionReason && (
                        <span className="block text-xs text-slate-400">{event.correctionReason}</span>
                      )}
                    </div>
                    {!event.correctsEventId && (
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={() => void correct(event.id, event.occurredAt)}
                      >
                        Korrigieren
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
