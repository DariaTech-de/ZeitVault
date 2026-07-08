import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { createEmployeeSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextService } from '../common/tenant-context.service';
import { TenantGuard } from '../common/tenant.guard';
import type { EmployeeRow } from '../db/schema';
import { decodePhotoUpload } from '../media/photo';
import { AdminService, type EmployeeSummary } from './admin.service';

const uuidSchema = z.string().uuid();

@ApiTags('Verwaltung')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly admin: AdminService,
  ) {}

  /** Beispiel-Endpunkt ausschliesslich fuer Administratoren (RBAC-Nachweis). */
  @Get('overview')
  @Roles('admin')
  overview(): { tenantId: string; roles: string[] } {
    const ctx = this.tenantContext.require();
    return { tenantId: ctx.tenantId, roles: ctx.roles };
  }

  /** Mitarbeitende des Mandanten (nur Administration). */
  @Get('employees')
  @Roles('admin')
  async employees(): Promise<EmployeeSummary[]> {
    return this.admin.listEmployees();
  }

  /** Mitarbeitenden anlegen (nur Administration) – belegt einen Lizenz-Sitzplatz. */
  @Post('employees')
  @Roles('admin')
  async createEmployee(@Body() body: unknown): Promise<EmployeeRow> {
    return this.admin.createEmployee(createEmployeeSchema.parse(body));
  }

  /** Anzeigefoto eines Mitarbeitenden setzen/ersetzen (Base64-Upload). */
  @Put('employees/:id/photo')
  @Roles('admin')
  async setPhoto(@Param('id') id: string, @Body() body: unknown): Promise<{ ok: true }> {
    const { contentType, data } = decodePhotoUpload(body);
    await this.admin.setPhoto(uuidSchema.parse(id), contentType, data);
    return { ok: true };
  }

  /** Anzeigefoto eines Mitarbeitenden abrufen (Bytes). */
  @Get('employees/:id/photo')
  @Roles('manager', 'admin')
  async getPhoto(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const photo = await this.admin.getPhoto(uuidSchema.parse(id));
    if (!photo) throw new NotFoundException('Kein Foto hinterlegt.');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(photo.data);
  }

  /** Anzeigefoto eines Mitarbeitenden entfernen. */
  @Delete('employees/:id/photo')
  @Roles('admin')
  async deletePhoto(@Param('id') id: string): Promise<{ ok: true }> {
    await this.admin.deletePhoto(uuidSchema.parse(id));
    return { ok: true };
  }
}
