import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { absenceDecisionSchema, createAbsenceRequestSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { AbsenceRequestRow } from '../db/schema';
import { AbsenceService } from './absence.service';

@ApiTags('Abwesenheiten')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('absences')
export class AbsenceController {
  constructor(private readonly absence: AbsenceService) {}

  /** Abwesenheitsantrag stellen. */
  @Post()
  async create(@Body() body: unknown): Promise<AbsenceRequestRow> {
    const input = createAbsenceRequestSchema.parse(body);
    return this.absence.createRequest(input);
  }

  /** Antrag genehmigen (nur Vorgesetzte/Administration). */
  @Post(':id/approve')
  @Roles('manager', 'admin')
  async approve(@Param('id') id: string, @Body() body: unknown): Promise<AbsenceRequestRow> {
    const { note } = absenceDecisionSchema.parse(body ?? {});
    return this.absence.decide({ id, action: 'approve', note });
  }

  /** Antrag ablehnen (nur Vorgesetzte/Administration). */
  @Post(':id/reject')
  @Roles('manager', 'admin')
  async reject(@Param('id') id: string, @Body() body: unknown): Promise<AbsenceRequestRow> {
    const { note } = absenceDecisionSchema.parse(body ?? {});
    return this.absence.decide({ id, action: 'reject', note });
  }

  /** Antrag stornieren (eigener Antrag oder Vorgesetzte/Administration). */
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() body: unknown): Promise<AbsenceRequestRow> {
    const { note } = absenceDecisionSchema.parse(body ?? {});
    return this.absence.decide({ id, action: 'cancel', note });
  }

  /** Antraege auflisten (optional je Mitarbeitenden ?employeeId=...). */
  @Get()
  async list(@Query('employeeId') employeeId?: string): Promise<AbsenceRequestRow[]> {
    return this.absence.list(employeeId);
  }
}
