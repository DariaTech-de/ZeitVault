import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import {
  type BalanceListEntry,
  ReportingService,
  type Timesheet,
  type ViolationEntry,
} from './reporting.service';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');
const uuidSchema = z.string().uuid();

@ApiTags('Auswertungen')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  /** Stundenzettel je Mitarbeitenden und Zeitraum. */
  @Get('timesheet')
  async timesheet(
    @Query('employeeId') employeeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<Timesheet> {
    return this.reporting.timesheet(
      uuidSchema.parse(employeeId),
      isoDateSchema.parse(from),
      isoDateSchema.parse(to),
    );
  }

  /** Verstoßreport ueber alle Mitarbeitenden (nur Vorgesetzte/Administration). */
  @Get('violations')
  @Roles('manager', 'admin')
  async violations(@Query('from') from: string, @Query('to') to: string): Promise<ViolationEntry[]> {
    return this.reporting.violations(isoDateSchema.parse(from), isoDateSchema.parse(to));
  }

  /** Saldenliste aller Mitarbeitenden (nur Vorgesetzte/Administration). */
  @Get('balances')
  @Roles('manager', 'admin')
  async balances(): Promise<BalanceListEntry[]> {
    return this.reporting.balanceList();
  }
}
