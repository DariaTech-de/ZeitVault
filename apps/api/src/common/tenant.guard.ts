import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TenantContextService } from './tenant-context.service';

/**
 * Leitet den Tenant-Kontext ab und setzt ihn fuer den Request. Im Scaffold aus
 * den Headern `x-tenant-id`/`x-user-id`; in der Zielarchitektur aus den
 * verifizierten Claims des OIDC-Tokens (Keycloak, ADR-0008). Ohne gueltigen
 * Kontext wird der Request abgewiesen (Kern-Invariante 3).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContextService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = request.header('x-tenant-id');
    const userId = request.header('x-user-id');

    if (!tenantId || !userId) {
      throw new ForbiddenException(
        'Kein gueltiger Tenant-Kontext (x-tenant-id und x-user-id erforderlich).',
      );
    }

    this.tenantContext.enterWith({ tenantId, userId, roles: [] });
    return true;
  }
}
