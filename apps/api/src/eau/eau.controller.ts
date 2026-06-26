import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createEauRequestSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { EauRequestRow } from '../db/schema';
import { EauService } from './eau.service';

@ApiTags('eAU')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('eau/requests')
export class EauController {
  constructor(private readonly eau: EauService) {}

  /** eAU-Abruf anstoßen (nur Vorgesetzte/Administration; Gesundheitsdaten). */
  @Post()
  @Roles('manager', 'admin')
  async create(@Body() body: unknown): Promise<EauRequestRow> {
    return this.eau.createRequest(createEauRequestSchema.parse(body));
  }

  /** eAU-Abrufe des Mandanten auflisten (ohne Diagnoseinhalt). */
  @Get()
  @Roles('manager', 'admin')
  async list(): Promise<EauRequestRow[]> {
    return this.eau.list();
  }
}
