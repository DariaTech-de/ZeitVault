'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type Finding,
  type StampAction,
  type StampState,
  type StampStatus,
  fetchToday,
  stamp,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

const STATE_LABEL: Record<StampState, string> = {
  out: 'Ausgestempelt',
  in: 'Eingestempelt',
  break: 'In Pause',
};

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}

export function StampPanel() {
  const { identity } = useAuth();
  const [status, setStatus] = useState<StampStatus | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (id: Identity) => {
    try {
      const data = await fetchToday(id);
      setStatus(data.status);
      setFindings(data.findings);
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API (apps/api) starten.');
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
        const data = await stamp(identity, action);
        setStatus(data.status);
        setFindings(data.findings);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Stempelung fehlgeschlagen.');
      } finally {
        setPending(false);
      }
    },
    [identity],
  );

  const state: StampState = status?.state ?? 'out';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heute</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge variant={state === 'out' ? 'default' : state === 'break' ? 'warning' : 'success'}>
            {STATE_LABEL[state]}
          </Badge>
          {status ? (
            <span>
              Arbeit {formatMinutes(status.workedMinutes)} &middot; Pause{' '}
              {formatMinutes(status.breakMinutes)}
            </span>
          ) : (
            <span>wird geladen &hellip;</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" disabled={pending || state !== 'out'} onClick={() => void onStamp('clock-in')}>
            Kommen
          </Button>
          <Button
            size="lg"
            variant="destructive"
            disabled={pending || state !== 'in'}
            onClick={() => void onStamp('clock-out')}
          >
            Gehen
          </Button>
          <Button
            size="lg"
            variant="secondary"
            disabled={pending || state !== 'in'}
            onClick={() => void onStamp('break-start')}
          >
            Pause beginnen
          </Button>
          <Button
            size="lg"
            variant="secondary"
            disabled={pending || state !== 'break'}
            onClick={() => void onStamp('break-end')}
          >
            Pause beenden
          </Button>
        </div>

        {findings.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Hinweise (ArbZG)</h3>
            <ul className="space-y-1">
              {findings.map((finding, index) => (
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

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </CardContent>
    </Card>
  );
}
