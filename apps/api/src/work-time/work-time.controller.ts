import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Holiday } from '@zeitvault/domain';
import { bundeslandSchema, createWorkTimeModelSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { WorkTimeModelRow } from '../db/schema';
import { WorkTimeService } from './work-time.service';

const yearSchema = z.coerce.number().int().min(1970).max(2100);

@ApiTags('Arbeitszeitmodelle')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('work-time')
export class WorkTimeController {
  constructor(private readonly workTime: WorkTimeService) {}

  /** Arbeitszeitmodell anlegen (nur Administration). */
  @Post('models')
  @Roles('admin')
  async create(@Body() body: unknown): Promise<WorkTimeModelRow> {
    const input = createWorkTimeModelSchema.parse(body);
    return this.workTime.create(input);
  }

  /** Arbeitszeitmodelle des Mandanten auflisten. */
  @Get('models')
  async list(): Promise<WorkTimeModelRow[]> {
    return this.workTime.list();
  }

  /** Feiertage fuer Jahr + Bundesland (z. B. ?year=2026&land=NW). */
  @Get('holidays')
  holidays(@Query('year') year: string, @Query('land') land: string): Holiday[] {
    return this.workTime.holidays(yearSchema.parse(year), bundeslandSchema.parse(land));
  }
}
