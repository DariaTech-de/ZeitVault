import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { blockEmployeeSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { EmployeeRow } from '../db/schema';
import { RetentionDueEntry, RetentionService } from './retention.service';

const uuidSchema = z.string().uuid();

@ApiTags('Aufbewahrung & Löschung')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  /** Mitarbeitende:n sperren (Austritt/Löschanfrage); setzt die Aufbewahrungsfrist. */
  @Post('employees/:id/block')
  @Roles('admin')
  async block(@Param('id') id: string, @Body() body: unknown): Promise<EmployeeRow> {
    const input = blockEmployeeSchema.parse(body ?? {});
    return this.retention.block(uuidSchema.parse(id), input.retentionClass, input.reason);
  }

  /** Personenbezogene Stammdaten pseudonymisieren (DSGVO). */
  @Post('employees/:id/anonymize')
  @Roles('admin')
  async anonymize(@Param('id') id: string): Promise<EmployeeRow> {
    return this.retention.anonymize(uuidSchema.parse(id));
  }

  /** Mitarbeitende mit abgelaufener Aufbewahrungsfrist (löschfähig). */
  @Get('due')
  @Roles('admin')
  async due(): Promise<RetentionDueEntry[]> {
    return this.retention.dueForDeletion();
  }
}
