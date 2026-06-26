import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextService } from '../common/tenant-context.service';
import { TenantGuard } from '../common/tenant.guard';
import { AdminService, type EmployeeSummary } from './admin.service';

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
}
