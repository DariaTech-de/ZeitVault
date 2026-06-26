import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextService } from '../common/tenant-context.service';
import { TenantGuard } from '../common/tenant.guard';

@ApiTags('Verwaltung')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly tenantContext: TenantContextService) {}

  /** Beispiel-Endpunkt ausschliesslich fuer Administratoren (RBAC-Nachweis). */
  @Get('overview')
  @Roles('admin')
  overview(): { tenantId: string; roles: string[] } {
    const ctx = this.tenantContext.require();
    return { tenantId: ctx.tenantId, roles: ctx.roles };
  }
}
