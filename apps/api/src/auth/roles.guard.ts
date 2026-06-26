import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../common/tenant-context.service';
import { ROLES_KEY } from './roles.decorator';
import { hasRequiredRoles } from './roles';

/**
 * Erzwingt die per @Roles(...) geforderten Rollen gegen den (zuvor von der
 * TenantGuard gesetzten) Tenant-Kontext. Muss NACH der TenantGuard laufen:
 * @UseGuards(TenantGuard, RolesGuard).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) {
      return true;
    }
    const ctx = this.tenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('Kein Tenant-Kontext.');
    }
    if (!hasRequiredRoles(ctx.roles, required)) {
      throw new ForbiddenException('Unzureichende Berechtigung fuer diese Aktion.');
    }
    return true;
  }
}
