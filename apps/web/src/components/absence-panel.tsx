'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type AbsenceAction,
  type AbsenceRequest,
  type AbsenceStatus,
  type AbsenceType,
  createAbsence,
  decideAbsence,
  fetchAbsences,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

const TYPE_LABEL: Record<AbsenceType, string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  special: 'Sonderurlaub',
};

const STATUS_LABEL: Record<AbsenceStatus, string> = {
  requested: 'Beantragt',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
};

function statusVariant(status: AbsenceStatus): 'default' | 'success' | 'warning' | 'violation' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'violation';
  if (status === 'cancelled') return 'warning';
  return 'default';
}

export function AbsencePanel() {
  const { identity } = useAuth();
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [type, setType] = useState<AbsenceType>('vacation');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canApprove = identity?.roles.some((r) => r === 'manager' || r === 'admin') ?? false;

  const refresh = useCallback(async (id: Identity) => {
    try {
      // Vorgesetzte/Administration sehen alle Antraege, Mitarbeitende nur eigene.
      const all = id.roles.some((r) => r === 'manager' || r === 'admin');
      const data = await fetchAbsences(id, all ? undefined : id.employeeId);
      setRequests(data);
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API (apps/api) starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const onSubmit = useCallback(async () => {
    if (!identity || !from || !to) return;
    setPending(true);
    try {
      await createAbsence(identity, { type, from, to, reason: reason || undefined });
      setFrom('');
      setTo('');
      setReason('');
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Antrag fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, type, from, to, reason, refresh]);

  const onDecide = useCallback(
    async (id: string, action: AbsenceAction) => {
      if (!identity) return;
      setPending(true);
      try {
        await decideAbsence(identity, id, action);
        await refresh(identity);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
      } finally {
        setPending(false);
      }
    },
    [identity, refresh],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Abwesenheit beantragen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Art</span>
              <select
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as AbsenceType)}
              >
                <option value="vacation">Urlaub</option>
                <option value="sick">Krankheit</option>
                <option value="special">Sonderurlaub</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Von</span>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Bis</span>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Begründung (optional)</span>
            <input
              type="text"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <Button disabled={pending || !from || !to} onClick={() => void onSubmit()}>
            Antrag stellen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{canApprove ? 'Anträge (alle)' : 'Meine Anträge'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Anträge vorhanden.</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((req) => (
                <li
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant={statusVariant(req.status)}>{STATUS_LABEL[req.status]}</Badge>
                    <span className="text-slate-700">
                      {TYPE_LABEL[req.type]} · {req.fromDate} – {req.toDate}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    {canApprove && req.status === 'requested' && (
                      <>
                        <Button
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={pending}
                          onClick={() => void onDecide(req.id, 'approve')}
                        >
                          Genehmigen
                        </Button>
                        <Button
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={pending}
                          onClick={() => void onDecide(req.id, 'reject')}
                        >
                          Ablehnen
                        </Button>
                      </>
                    )}
                    {(req.status === 'requested' || req.status === 'approved') && (
                      <Button
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={pending}
                        onClick={() => void onDecide(req.id, 'cancel')}
                      >
                        Stornieren
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
