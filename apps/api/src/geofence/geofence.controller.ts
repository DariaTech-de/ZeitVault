import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type GeofenceSite, createGeofenceSiteSchema, flagStampSchema, geofenceSettingsSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import { GeofenceService, type ReviewStamp } from './geofence.service';

const uuidSchema = z.string().uuid();

@ApiTags('Standort-Prüfung')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('geofence')
export class GeofenceController {
  constructor(private readonly geofence: GeofenceService) {}

  /** Aktueller Geofencing-Status des Mandanten. */
  @Get('settings')
  @Roles('manager', 'admin')
  async settings(): Promise<{ enabled: boolean }> {
    return this.geofence.getSettings();
  }

  /** Geofencing aktivieren/deaktivieren (nur Administration, Betriebsvereinbarung). */
  @Put('settings')
  @Roles('admin')
  async setEnabled(@Body() body: unknown): Promise<{ enabled: boolean }> {
    const { enabled } = geofenceSettingsSchema.parse(body);
    return this.geofence.setEnabled(enabled);
  }

  @Get('sites')
  @Roles('manager', 'admin')
  async sites(): Promise<GeofenceSite[]> {
    return this.geofence.listSites();
  }

  @Post('sites')
  @Roles('admin')
  async createSite(@Body() body: unknown): Promise<GeofenceSite> {
    return this.geofence.createSite(createGeofenceSiteSchema.parse(body));
  }

  @Delete('sites/:id')
  @Roles('admin')
  async deactivateSite(@Param('id') id: string): Promise<{ ok: true }> {
    await this.geofence.deactivateSite(uuidSchema.parse(id));
    return { ok: true };
  }

  /** Stempel mit Standortbezug zur Prüfung (außerhalb/ohne Signal). */
  @Get('review')
  @Roles('manager', 'admin')
  async review(): Promise<ReviewStamp[]> {
    return this.geofence.reviewStamps();
  }

  /** Stempel kennzeichnen/entkennzeichnen („blinken"). */
  @Post('flags')
  @Roles('manager', 'admin')
  async flag(@Body() body: unknown): Promise<{ ok: true }> {
    await this.geofence.flagStamp(flagStampSchema.parse(body));
    return { ok: true };
  }
}
