import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { payrollExportSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { ExportJobRow } from '../db/schema';
import { ExportResult, ExportService } from './export.service';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');
const formatSchema = z.enum(['csv', 'json']).default('csv');

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('exports')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  /** GoBD-Prüfexport der Stempel-Rohdaten im Zeitraum (nur Vorgesetzte/Administration). */
  @Post('gobd')
  @Roles('manager', 'admin')
  async gobd(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format?: string,
  ): Promise<ExportResult> {
    return this.exports.runGobd(
      isoDateSchema.parse(from),
      isoDateSchema.parse(to),
      formatSchema.parse(format),
    );
  }

  /**
   * Generischer Lohnexport (D3-Gerüst) mit mandantenseitiger Mapping-Tabelle.
   * KEIN DATEV-Datensatzformat (CLAUDE.md §9) - nur generisches CSV.
   */
  @Post('payroll')
  @Roles('manager', 'admin')
  async payroll(
    @Query('from') from: string,
    @Query('to') to: string,
    @Body() body: unknown,
  ): Promise<ExportResult & { unmapped: Array<{ category: string; value: number }> }> {
    const input = payrollExportSchema.parse(body ?? {});
    return this.exports.runPayroll(isoDateSchema.parse(from), isoDateSchema.parse(to), input.mapping);
  }

  /** Protokoll der durchgeführten Exporte (nur Vorgesetzte/Administration). */
  @Get()
  @Roles('manager', 'admin')
  async list(): Promise<ExportJobRow[]> {
    return this.exports.list();
  }
}
