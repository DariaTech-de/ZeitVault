import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type LicenseStatus, activateLicenseSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import { LicensingService } from './licensing.service';

@ApiTags('Lizenzierung')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('license')
export class LicensingController {
  constructor(private readonly licensing: LicensingService) {}

  /** Lizenzstatus inkl. Sitzplatznutzung (Vorgesetzte/Administration). */
  @Get()
  @Roles('manager', 'admin')
  async status(): Promise<LicenseStatus> {
    return this.licensing.status();
  }

  /** Signiertes Lizenz-Token aktivieren (nur Administration). */
  @Post()
  @Roles('admin')
  async activate(@Body() body: unknown): Promise<LicenseStatus> {
    const { token } = activateLicenseSchema.parse(body);
    return this.licensing.activate(token);
  }
}
