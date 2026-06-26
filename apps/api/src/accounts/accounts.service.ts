import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  type AccountBalance,
  type AccountKind,
  type AccountTransaction,
  type StatementLine,
  buildStatement,
  computeBalances,
} from '@zeitvault/domain';
import type { PostAccountTransaction } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { type AccountTransactionRow, accountTransactions } from '../db/schema';
import { DB, type Database } from '../db/tokens';

function toDomain(row: AccountTransactionRow): AccountTransaction {
  return {
    account: row.account,
    amount: row.amount,
    effectiveDate: row.effectiveDate,
    reason: row.reason ?? undefined,
  };
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  /** Bucht eine (append-only) Kontobewegung und protokolliert sie (Invariante 2). */
  async post(input: PostAccountTransaction): Promise<AccountTransactionRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(accountTransactions)
        .values({
          tenantId: ctx.tenantId,
          employeeId: input.employeeId,
          account: input.account,
          amount: input.amount,
          effectiveDate: input.effectiveDate,
          reason: input.reason ?? null,
        })
        .returning();
      return inserted[0];
    });
    if (!row) {
      throw new Error('Kontobuchung konnte nicht gespeichert werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'account.post',
      actorId: ctx.userId,
      subjectType: 'account_transaction',
      subjectId: row.id,
      payload: {
        account: row.account,
        amount: row.amount,
        effectiveDate: row.effectiveDate,
        employeeId: row.employeeId,
      },
    });
    return row;
  }

  /** Salden aller Kontoarten eines Mitarbeitenden. */
  async balances(employeeId: string): Promise<AccountBalance[]> {
    return computeBalances(await this.load(employeeId));
  }

  /** Kontoauszug (laufender Saldo) eines Mitarbeitenden, optional je Kontoart. */
  async statement(employeeId: string, account?: AccountKind): Promise<StatementLine[]> {
    return buildStatement(await this.load(employeeId), account);
  }

  private async load(employeeId: string): Promise<AccountTransaction[]> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(accountTransactions)
        .where(
          and(
            eq(accountTransactions.tenantId, ctx.tenantId),
            eq(accountTransactions.employeeId, employeeId),
          ),
        )
        .orderBy(asc(accountTransactions.effectiveDate));
    });
    return rows.map(toDomain);
  }
}
