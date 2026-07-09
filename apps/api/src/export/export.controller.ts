import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { payrollCategorySchema, setPayrollMappingSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { ExportJobRow, PayrollMappingRow } from '../db/schema';
import { ExportResult, ExportService } from './export.service';
import { PayrollMappingService } from './payroll-mapping.service';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet YYYY-MM-DD');
const formatSchema = z.enum(['csv', 'json']).default('csv');

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('exports')
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly payrollMappings: PayrollMappingService,
  ) {}

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
   * Generischer Lohnexport (D3-Gerüst). C-11: nutzt das PERSISTIERTE
   * Lohnartenmapping des Mandanten (Admin-Pflege, kein Mapping im Request).
   * KEIN DATEV-Datensatzformat (CLAUDE.md §9) - nur generisches CSV.
   */
  @Post('payroll')
  @Roles('manager', 'admin')
  async payroll(
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<ExportResult & { unmapped: Array<{ category: string; value: number }> }> {
    return this.exports.runPayroll(isoDateSchema.parse(from), isoDateSchema.parse(to));
  }

  /** C-11: Lohnartenmapping des Mandanten (Kategorie -> Lohnart/Faktor). */
  @Get('payroll-mapping')
  @Roles('manager', 'admin')
  async listMapping(): Promise<PayrollMappingRow[]> {
    return this.payrollMappings.list();
  }

  /** C-11: Mapping-Eintrag anlegen/aktualisieren (ohne Deployment wirksam). */
  @Put('payroll-mapping')
  @Roles('admin')
  async setMapping(@Body() body: unknown): Promise<PayrollMappingRow> {
    return this.payrollMappings.set(setPayrollMappingSchema.parse(body));
  }

  /** C-11: Mapping-Eintrag entfernen (Kategorie erscheint wieder als unmapped). */
  @Delete('payroll-mapping/:category')
  @Roles('admin')
  async removeMapping(@Param('category') category: string): Promise<{ ok: true }> {
    await this.payrollMappings.remove(payrollCategorySchema.parse(category));
    return { ok: true };
  }

  /** Protokoll der durchgeführten Exporte (nur Vorgesetzte/Administration). */
  @Get()
  @Roles('manager', 'admin')
  async list(): Promise<ExportJobRow[]> {
    return this.exports.list();
  }
}
