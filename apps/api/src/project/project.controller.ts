import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { bookProjectTimeSchema, createProjectSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { ProjectRow, ProjectTimeEntryRow } from '../db/schema';
import { ProjectService, ProjectSummary } from './project.service';

const uuidSchema = z.string().uuid();

@ApiTags('Projektzeit')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('projects')
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  /** Projekt anlegen (nur Vorgesetzte/Administration). */
  @Post()
  @Roles('manager', 'admin')
  async create(@Body() body: unknown): Promise<ProjectRow> {
    return this.projects.create(createProjectSchema.parse(body));
  }

  /** Projekte des Mandanten auflisten. */
  @Get()
  async list(): Promise<ProjectRow[]> {
    return this.projects.list();
  }

  /** Projektzeit buchen (vorzeichenbehaftet; Korrektur = Gegenbuchung). */
  @Post(':id/bookings')
  async book(@Param('id') id: string, @Body() body: unknown): Promise<ProjectTimeEntryRow> {
    return this.projects.book(uuidSchema.parse(id), bookProjectTimeSchema.parse(body));
  }

  /** Summe der gebuchten Minuten eines Projekts. */
  @Get(':id/summary')
  async summary(@Param('id') id: string): Promise<ProjectSummary> {
    return this.projects.summary(uuidSchema.parse(id));
  }
}
