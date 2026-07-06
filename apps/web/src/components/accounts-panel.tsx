'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '@/components/fiori/status-pill';
import {
  Button,
  Card,
  DataTable,
  Empty,
  ErrorNote,
  Field,
  Kpi,
  KpiRow,
  PageHead,
  Select,
  SectionTitle,
  TextInput,
} from '@/components/fiori/ui';
import {
  type AccountBalance,
  type AccountKind,
  type StatementLine,
  fetchBalances,
  fetchStatement,
  postAccountTransaction,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

const ACCOUNT_LABEL: Record<AccountKind, string> = { overtime: 'Überstunden', flextime: 'Gleitzeit', vacation: 'Urlaub' };

function fmt(account: AccountKind, value: number): string {
  if (account === 'vacation') return `${value} ${Math.abs(value) === 1 ? 'Tag' : 'Tage'}`;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')} h`;
}

export function AccountsPanel() {
  const { identity } = useAuth();
  const canPost = identity?.roles.some((r) => r === 'manager' || r === 'admin') ?? false;
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [statement, setStatement] = useState<StatementLine[]>([]);
  const [account, setAccount] = useState<AccountKind>('overtime');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (id: Identity) => {
    try {
      const [b, s] = await Promise.all([fetchBalances(id, id.employeeId), fetchStatement(id, id.employeeId)]);
      setBalances(b);
      setStatement(s);
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const onPost = useCallback(async () => {
    if (!identity || !amount || !effectiveDate) return;
    setPending(true);
    try {
      await postAccountTransaction(identity, {
        employeeId: identity.employeeId,
        account,
        amount: Number.parseInt(amount, 10),
        effectiveDate,
        reason: reason || undefined,
      });
      setAmount('');
      setReason('');
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Buchung fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, account, amount, effectiveDate, reason, refresh]);

  const bal = (a: AccountKind) => balances.find((b) => b.account === a)?.balance ?? 0;

  return (
    <>
      <PageHead
        eyebrow="Zeitwirtschaft · Konten"
        title="Arbeitszeitkonten"
        sub="Überstunden-, Gleitzeit- und Urlaubssaldo. Buchungen sind append-only; Korrekturen erfolgen ausschließlich über Gegenbuchungen."
      />

      <KpiRow>
        <Kpi k="Überstunden" v={fmt('overtime', bal('overtime'))} tone={bal('overtime') < 0 ? 'neg' : 'pos'} />
        <Kpi k="Gleitzeit" v={fmt('flextime', bal('flextime'))} />
        <Kpi k="Urlaub" v={fmt('vacation', bal('vacation'))} />
      </KpiRow>

      {canPost && (
        <Card className="mt-5 p-5">
          <h2 className="text-base font-semibold">Buchung erfassen</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Konto">
              <Select value={account} onChange={(e) => setAccount(e.target.value as AccountKind)}>
                <option value="overtime">Überstunden (Minuten)</option>
                <option value="flextime">Gleitzeit (Minuten)</option>
                <option value="vacation">Urlaub (Tage)</option>
              </Select>
            </Field>
            <Field label="Betrag (+/-)">
              <TextInput type="number" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Wirksam am">
              <TextInput type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </Field>
            <Field label="Begründung (optional)">
              <TextInput value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4">
            <Button variant="primary" disabled={pending || !amount || !effectiveDate} onClick={() => void onPost()}>
              Buchen
            </Button>
          </div>
        </Card>
      )}

      <SectionTitle>Kontoauszug</SectionTitle>
      {statement.length === 0 ? (
        <Empty>Keine Buchungen vorhanden.</Empty>
      ) : (
        <DataTable
          head={
            <>
              <th className="px-4 py-2.5 font-semibold">Datum</th>
              <th className="px-4 py-2.5 font-semibold">Konto</th>
              <th className="px-4 py-2.5 font-semibold">Begründung</th>
              <th className="px-4 py-2.5 text-right font-semibold">Betrag</th>
              <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
            </>
          }
        >
          {statement.map((line, i) => (
            <tr key={`${line.account}-${line.effectiveDate}-${i}`} className="border-b border-line last:border-0">
              <td className="mono px-4 py-2.5 text-ink-muted">{line.effectiveDate}</td>
              <td className="px-4 py-2.5">
                <StatusPill tone="neutral" dot={false}>{ACCOUNT_LABEL[line.account]}</StatusPill>
              </td>
              <td className="px-4 py-2.5 text-ink-muted">{line.reason ?? '—'}</td>
              <td className={`mono px-4 py-2.5 text-right ${line.amount < 0 ? 'text-neg' : 'text-pos'}`}>
                {fmt(line.account, line.amount)}
              </td>
              <td className="mono px-4 py-2.5 text-right font-semibold">{fmt(line.account, line.runningBalance)}</td>
            </tr>
          ))}
        </DataTable>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </>
  );
}
