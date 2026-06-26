import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AccountBalance, StatementLine } from '@zeitvault/domain';
import { accountKindSchema, postAccountTransactionSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { AccountTransactionRow } from '../db/schema';
import { AccountsService } from './accounts.service';

@ApiTags('Arbeitszeitkonten')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Kontobuchung anlegen (nur Vorgesetzte/Administration). */
  @Post('transactions')
  @Roles('manager', 'admin')
  async post(@Body() body: unknown): Promise<AccountTransactionRow> {
    const input = postAccountTransactionSchema.parse(body);
    return this.accounts.post(input);
  }

  /** Salden aller Konten eines Mitarbeitenden. */
  @Get('balances')
  async balances(@Query('employeeId') employeeId: string): Promise<AccountBalance[]> {
    return this.accounts.balances(employeeId);
  }

  /** Kontoauszug (laufender Saldo), optional ?account=overtime|flextime|vacation. */
  @Get('statement')
  async statement(
    @Query('employeeId') employeeId: string,
    @Query('account') account?: string,
  ): Promise<StatementLine[]> {
    const parsed = account ? accountKindSchema.parse(account) : undefined;
    return this.accounts.statement(employeeId, parsed);
  }
}
