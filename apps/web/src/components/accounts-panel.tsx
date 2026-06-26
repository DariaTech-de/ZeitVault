'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type AccountBalance,
  type AccountKind,
  type StatementLine,
  fetchBalances,
  fetchStatement,
  postAccountTransaction,
} from '@/lib/api';
import { getIdentity, type Identity } from '@/lib/identity';

const ACCOUNT_LABEL: Record<AccountKind, string> = {
  overtime: 'Überstunden',
  flextime: 'Gleitzeit',
  vacation: 'Urlaub',
};

/** Minuten (overtime/flextime) bzw. Tage (vacation) lesbar darstellen. */
function formatAmount(account: AccountKind, value: number): string {
  if (account === 'vacation') {
    return `${value} ${Math.abs(value) === 1 ? 'Tag' : 'Tage'}`;
  }
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, '0')} min`;
}

export function AccountsPanel() {
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [statement, setStatement] = useState<StatementLine[]>([]);
  const [account, setAccount] = useState<AccountKind>('overtime');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canPost = identity?.roles.some((r) => r === 'manager' || r === 'admin') ?? false;

  const refresh = useCallback(async (id: Identity) => {
    try {
      const [b, s] = await Promise.all([
        fetchBalances(id, id.employeeId),
        fetchStatement(id, id.employeeId),
      ]);
      setBalances(b);
      setStatement(s);
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API (apps/api) starten.');
    }
  }, []);

  useEffect(() => {
    const id = getIdentity();
    setIdentityState(id);
    void refresh(id);
  }, [refresh]);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Salden</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {balances.map((b) => (
              <div key={b.account} className="rounded-md border border-slate-200 px-3 py-2">
                <div className="text-xs text-slate-500">{ACCOUNT_LABEL[b.account]}</div>
                <div className="text-lg font-semibold text-slate-800">
                  {formatAmount(b.account, b.balance)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {canPost && (
        <Card>
          <CardHeader>
            <CardTitle>Buchung erfassen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Konto</span>
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={account}
                  onChange={(e) => setAccount(e.target.value as AccountKind)}
                >
                  <option value="overtime">Überstunden (Minuten)</option>
                  <option value="flextime">Gleitzeit (Minuten)</option>
                  <option value="vacation">Urlaub (Tage)</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Betrag (+/-)</span>
                <input
                  type="number"
                  step="1"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Wirksam am</span>
                <input
                  type="date"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
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
            <Button disabled={pending || !amount || !effectiveDate} onClick={() => void onPost()}>
              Buchen
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kontoauszug</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {statement.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Buchungen vorhanden.</p>
          ) : (
            <ul className="space-y-1">
              {statement.map((line, index) => (
                <li
                  key={`${line.account}-${line.effectiveDate}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Badge>{ACCOUNT_LABEL[line.account]}</Badge>
                    <span className="text-slate-600">{line.effectiveDate}</span>
                    {line.reason && <span className="text-slate-500">{line.reason}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={line.amount < 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {formatAmount(line.account, line.amount)}
                    </span>
                    <span className="font-medium text-slate-800">
                      = {formatAmount(line.account, line.runningBalance)}
                    </span>
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
