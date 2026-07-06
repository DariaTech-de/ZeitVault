'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '@/components/fiori/status-pill';
import {
  Button,
  Card,
  DataTable,
  Empty,
  ErrorNote,
  FilterBar,
  FilterLabel,
  PageHead,
  SectionTitle,
  TextInput,
} from '@/components/fiori/ui';
import {
  type BalanceListEntry,
  type ViolationEntry,
  fetchBalanceList,
  fetchViolations,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

export function ReportsPanel() {
  const { identity } = useAuth();
  const [balances, setBalances] = useState<BalanceListEntry[]>([]);
  const [violations, setViolations] = useState<ViolationEntry[]>([]);
  const [from, setFrom] = useState('2026-06-01');
  const [to, setTo] = useState('2026-06-30');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [evaluated, setEvaluated] = useState(false);

  const loadBalances = useCallback(async (id: Identity) => {
    try {
      setBalances(await fetchBalanceList(id));
      setError(null);
    } catch {
      setError('Backend nicht erreichbar oder unzureichende Berechtigung.');
    }
  }, []);

  useEffect(() => {
    if (identity) void loadBalances(identity);
  }, [identity, loadBalances]);

  const loadViolations = useCallback(async () => {
    if (!identity) return;
    setPending(true);
    try {
      setViolations(await fetchViolations(identity, from, to));
      setEvaluated(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auswertung fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, from, to]);

  return (
    <>
      <PageHead
        eyebrow="Auswertungen"
        title="Saldenliste & Verstoßreport"
        sub="Kontosalden aller Mitarbeitenden und ArbZG-Befunde je Zeitraum. Rein berechnet aus den revisionssicheren Erfassungsdaten."
        right={<StatusPill tone="neutral">{balances.length} Mitarbeitende</StatusPill>}
      />

      <SectionTitle>Saldenliste</SectionTitle>
      {balances.length === 0 ? (
        <Empty>Keine Daten.</Empty>
      ) : (
        <DataTable
          head={
            <>
              <th className="px-4 py-2.5 font-semibold">Mitarbeitende</th>
              <th className="px-4 py-2.5 text-right font-semibold">Überstunden (min)</th>
              <th className="px-4 py-2.5 text-right font-semibold">Gleitzeit (min)</th>
              <th className="px-4 py-2.5 text-right font-semibold">Urlaub (Tage)</th>
            </>
          }
        >
          {balances.map((e) => {
            const by = Object.fromEntries(e.balances.map((b) => [b.account, b.balance]));
            return (
              <tr key={e.employeeId} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-medium">{e.displayName}</td>
                <td className="mono px-4 py-2.5 text-right">{by.overtime ?? 0}</td>
                <td className="mono px-4 py-2.5 text-right">{by.flextime ?? 0}</td>
                <td className="mono px-4 py-2.5 text-right">{by.vacation ?? 0}</td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <SectionTitle>Verstoßreport (ArbZG)</SectionTitle>
      <FilterBar>
        <FilterLabel>Zeitraum</FilterLabel>
        <TextInput type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-ink-faint">–</span>
        <TextInput type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="flex-1" />
        <Button variant="primary" disabled={pending} onClick={() => void loadViolations()}>
          Auswerten
        </Button>
      </FilterBar>

      {violations.length === 0 ? (
        <Empty>{evaluated ? 'Keine Verstöße im Zeitraum.' : 'Zeitraum wählen und auswerten.'}</Empty>
      ) : (
        <div className="space-y-3">
          {violations.map((v, index) => (
            <Card key={`${v.employeeId}-${v.date}-${index}`} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{v.displayName}</span>
                <span className="mono text-sm text-ink-faint">{v.date}</span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {v.findings.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="flex items-center gap-2">
                    <StatusPill tone={f.severity === 'violation' ? 'negative' : 'warning'}>
                      {f.severity === 'violation' ? 'Verstoß' : 'Warnung'}
                    </StatusPill>
                    <span className="text-sm text-ink">{f.message}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </>
  );
}
