import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  type WorkLocationSummary,
  assignWorkLocationSchema,
  createWorkLocationSchema,
} from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { EmployeeWorkLocationRow } from '../db/schema';
import { WorkLocationService } from './work-location.service';

const uuidSchema = z.string().uuid();

/** Verwaltung der Einsatzorte und Mitarbeiter-Zuordnungen (ADR-0016). */
@ApiTags('Einsatzorte')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('work-locations')
export class WorkLocationController {
  constructor(private readonly locations: WorkLocationService) {}

  @Post()
  @Roles('admin')
  async create(@Body() body: unknown): Promise<WorkLocationSummary> {
    return this.locations.create(createWorkLocationSchema.parse(body));
  }

  @Get()
  @Roles('manager', 'admin')
  async list(): Promise<WorkLocationSummary[]> {
    return this.locations.list();
  }

  @Delete(':id')
  @Roles('admin')
  async deactivate(@Param('id') id: string): Promise<{ ok: true }> {
    await this.locations.deactivate(uuidSchema.parse(id));
    return { ok: true };
  }

  @Post('assignments')
  @Roles('admin')
  async assign(@Body() body: unknown): Promise<EmployeeWorkLocationRow> {
    return this.locations.assign(assignWorkLocationSchema.parse(body));
  }

  @Get('assignments')
  @Roles('manager', 'admin')
  async assignments(@Query('employeeId') employeeId: string): Promise<EmployeeWorkLocationRow[]> {
    return this.locations.listAssignments(uuidSchema.parse(employeeId));
  }
}
