import {
  ACCOUNT_KINDS,
  type AccountBalance,
  type AccountKind,
  type AccountTransaction,
  type StatementLine,
} from './types';

/** Saldo eines Kontos = Summe der vorzeichenbehafteten Buchungen. */
export function computeBalance(
  transactions: readonly AccountTransaction[],
  account: AccountKind,
): number {
  return transactions
    .filter((t) => t.account === account)
    .reduce((sum, t) => sum + t.amount, 0);
}

/** Salden aller Kontoarten (auch ohne Buchungen, dann 0). */
export function computeBalances(transactions: readonly AccountTransaction[]): AccountBalance[] {
  return ACCOUNT_KINDS.map((account) => ({
    account,
    balance: computeBalance(transactions, account),
  }));
}

/**
 * Kontoauszug: Buchungen chronologisch (nach effectiveDate, stabil) mit
 * laufendem Saldo. Optional auf eine Kontoart gefiltert.
 */
export function buildStatement(
  transactions: readonly AccountTransaction[],
  account?: AccountKind,
): StatementLine[] {
  const filtered = account ? transactions.filter((t) => t.account === account) : transactions;
  const ordered = [...filtered].sort((a, b) =>
    a.effectiveDate === b.effectiveDate ? 0 : a.effectiveDate < b.effectiveDate ? -1 : 1,
  );
  const running = new Map<AccountKind, number>();
  return ordered.map((t) => {
    const next = (running.get(t.account) ?? 0) + t.amount;
    running.set(t.account, next);
    return { ...t, runningBalance: next };
  });
}
