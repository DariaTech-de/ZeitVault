import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { claimsToContext } from '../auth/claims';
import { TokenVerifier } from '../auth/token-verifier';
import { loadEnv } from '../config/env';
import { TenantContextService } from './tenant-context.service';

/**
 * Setzt den Tenant-Kontext fuer den Request. Im Default-Modus 'oidc' aus den
 * verifizierten Claims eines Keycloak-Bearer-Tokens (ADR-0008); im Modus 'dev'
 * (nur lokal/Tests) aus Headern. Ohne gueltigen Kontext wird abgewiesen
 * (Kern-Invariante 3).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tokenVerifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const env = loadEnv();

    if (env.AUTH_MODE === 'dev') {
      const tenantId = request.header('x-tenant-id');
      const userId = request.header('x-user-id');
      if (!tenantId || !userId) {
        throw new ForbiddenException(
          'Kein gueltiger Tenant-Kontext (Dev-Modus: x-tenant-id und x-user-id erforderlich).',
        );
      }
      const roles = (request.header('x-roles') ?? '')
        .split(',')
        .map((role) => role.trim())
        .filter((role) => role.length > 0);
      this.tenantContext.enterWith({ tenantId, userId, roles });
      return true;
    }

    const authorization = request.header('authorization');
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer-Token erforderlich.');
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await this.tokenVerifier.verify(
        authorization.slice('Bearer '.length),
      )) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Token ungueltig.');
    }

    this.tenantContext.enterWith(
      claimsToContext(payload, {
        tenantClaim: env.TENANT_CLAIM,
        defaultTenantId: env.DEFAULT_TENANT_ID,
      }),
    );
    return true;
  }
}
