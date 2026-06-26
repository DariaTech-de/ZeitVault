import { describe, expect, it } from 'vitest';
import { buildStatement, computeBalance, computeBalances } from './balance';
import type { AccountTransaction } from './types';

const tx: AccountTransaction[] = [
  { account: 'vacation', amount: 30, effectiveDate: '2026-01-01', reason: 'Jahresanspruch' },
  { account: 'vacation', amount: -5, effectiveDate: '2026-07-06', reason: 'Sommerurlaub' },
  { account: 'overtime', amount: 120, effectiveDate: '2026-06-01' },
  { account: 'overtime', amount: -60, effectiveDate: '2026-06-15', reason: 'Abbau' },
];

describe('computeBalance', () => {
  it('summiert vorzeichenbehaftete Buchungen je Konto', () => {
    expect(computeBalance(tx, 'vacation')).toBe(25);
    expect(computeBalance(tx, 'overtime')).toBe(60);
  });
  it('leeres Konto ergibt 0', () => {
    expect(computeBalance(tx, 'flextime')).toBe(0);
    expect(computeBalance([], 'vacation')).toBe(0);
  });
});

describe('computeBalances', () => {
  it('liefert alle Kontoarten (auch ohne Buchungen)', () => {
    const balances = computeBalances(tx);
    expect(balances).toEqual([
      { account: 'overtime', balance: 60 },
      { account: 'flextime', balance: 0 },
      { account: 'vacation', balance: 25 },
    ]);
  });
});

describe('buildStatement', () => {
  it('berechnet laufenden Saldo chronologisch je Konto', () => {
    const lines = buildStatement(tx, 'vacation');
    expect(lines.map((l) => l.runningBalance)).toEqual([30, 25]);
  });
  it('ueber alle Konten bleibt der laufende Saldo je Konto getrennt', () => {
    const lines = buildStatement(tx);
    const overtime = lines.filter((l) => l.account === 'overtime');
    expect(overtime.map((l) => l.runningBalance)).toEqual([120, 60]);
  });
});
