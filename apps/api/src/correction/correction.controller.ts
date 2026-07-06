import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { correctionDecisionSchema, createCorrectionRequestSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { StampCorrectionRequestRow } from '../db/schema';
import { CorrectionService } from './correction.service';

const uuidSchema = z.string().uuid();

@ApiTags('Anpassungsanträge')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('corrections')
export class CorrectionController {
  constructor(private readonly corrections: CorrectionService) {}

  /** Anpassungsantrag stellen (jede angemeldete Person). */
  @Post()
  async request(@Body() body: unknown): Promise<StampCorrectionRequestRow> {
    return this.corrections.request(createCorrectionRequestSchema.parse(body));
  }

  /** Antrag freigeben (nur Vorgesetzte/Administration) – erzeugt den Stempel. */
  @Post(':id/approve')
  @Roles('manager', 'admin')
  async approve(@Param('id') id: string, @Body() body: unknown): Promise<StampCorrectionRequestRow> {
    const { note } = correctionDecisionSchema.parse(body ?? {});
    return this.corrections.decide(uuidSchema.parse(id), 'approve', note);
  }

  /** Antrag ablehnen (nur Vorgesetzte/Administration). */
  @Post(':id/reject')
  @Roles('manager', 'admin')
  async reject(@Param('id') id: string, @Body() body: unknown): Promise<StampCorrectionRequestRow> {
    const { note } = correctionDecisionSchema.parse(body ?? {});
    return this.corrections.decide(uuidSchema.parse(id), 'reject', note);
  }

  /** Anträge auflisten (optional ?employeeId=). */
  @Get()
  async list(@Query('employeeId') employeeId?: string): Promise<StampCorrectionRequestRow[]> {
    return this.corrections.list(employeeId);
  }
}
