'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type BalanceListEntry,
  type ViolationEntry,
  fetchBalanceList,
  fetchViolations,
} from '@/lib/api';
import { getIdentity, type Identity } from '@/lib/identity';

export function ReportsPanel() {
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [balances, setBalances] = useState<BalanceListEntry[]>([]);
  const [violations, setViolations] = useState<ViolationEntry[]>([]);
  const [from, setFrom] = useState('2026-06-01');
  const [to, setTo] = useState('2026-06-30');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadBalances = useCallback(async (id: Identity) => {
    try {
      setBalances(await fetchBalanceList(id));
      setError(null);
    } catch {
      setError('Backend nicht erreichbar oder unzureichende Berechtigung.');
    }
  }, []);

  useEffect(() => {
    const id = getIdentity();
    setIdentityState(id);
    void loadBalances(id);
  }, [loadBalances]);

  const loadViolations = useCallback(async () => {
    if (!identity) return;
    setPending(true);
    try {
      setViolations(await fetchViolations(identity, from, to));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auswertung fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, from, to]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Saldenliste</CardTitle>
        </CardHeader>
        <CardContent>
          {balances.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Daten.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">Mitarbeitende</th>
                  <th className="py-1">Überstunden (min)</th>
                  <th className="py-1">Gleitzeit (min)</th>
                  <th className="py-1">Urlaub (Tage)</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((e) => {
                  const by = Object.fromEntries(e.balances.map((b) => [b.account, b.balance]));
                  return (
                    <tr key={e.employeeId} className="border-t border-slate-100">
                      <td className="py-1 text-slate-700">{e.displayName}</td>
                      <td className="py-1">{by.overtime ?? 0}</td>
                      <td className="py-1">{by.flextime ?? 0}</td>
                      <td className="py-1">{by.vacation ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verstoßreport (ArbZG)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Von</span>
              <input
                type="date"
                className="block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Bis</span>
              <input
                type="date"
                className="block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <Button disabled={pending} onClick={() => void loadViolations()}>
              Auswerten
            </Button>
          </div>
          {violations.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Verstöße im Zeitraum (oder noch nicht ausgewertet).</p>
          ) : (
            <ul className="space-y-2">
              {violations.map((v, index) => (
                <li
                  key={`${v.employeeId}-${v.date}-${index}`}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{v.displayName}</span>
                    <span className="text-slate-500">{v.date}</span>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {v.findings.map((f, i) => (
                      <li key={`${f.code}-${i}`} className="flex items-center gap-2">
                        <Badge variant={f.severity === 'violation' ? 'violation' : 'warning'}>
                          {f.severity === 'violation' ? 'Verstoß' : 'Warnung'}
                        </Badge>
                        <span className="text-slate-700">{f.message}</span>
                      </li>
                    ))}
                  </ul>
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
