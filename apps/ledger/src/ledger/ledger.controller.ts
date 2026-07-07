import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { appendAuditEventSchema } from '@zeitvault/types';
import type { AuditEventRow } from '../db/schema';
import type { ChainVerificationResult } from './chain';
import { LedgerService } from './ledger.service';

const tenantIdSchema = z.string().min(1).max(64);

@ApiTags('Audit-Ledger')
@Controller('audit')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  /** Haengt ein unveraenderliches Audit-Ereignis an (append-only). */
  @Post('events')
  async append(@Body() body: unknown): Promise<AuditEventRow> {
    const input = appendAuditEventSchema.parse(body);
    return this.ledger.append(input);
  }

  /** Verifiziert die Hash-Kette eines Mandanten. */
  @Get('verify')
  async verify(@Query('tenantId') tenantId?: string): Promise<ChainVerificationResult> {
    const parsed = tenantIdSchema.safeParse(tenantId);
    if (!parsed.success) {
      throw new BadRequestException('Query-Parameter tenantId ist erforderlich.');
    }
    return this.ledger.verify(parsed.data);
  }
}
