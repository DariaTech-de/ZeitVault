import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { TenantContextService } from '../common/tenant-context.service';
import { TerminalService } from './terminal.service';
import { parseDeviceToken } from './terminal.token';

/**
 * Authentifiziert ein Terminal über den Header `x-terminal-token`. Der Mandant
 * ist im Token kodiert und setzt den RLS-Kontext; das Geheimnis wird gegen den
 * gespeicherten Hash geprüft (ADR-0015). Der Akteur ist `terminal:<id>`.
 */
@Injectable()
export class TerminalGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly terminals: TerminalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('x-terminal-token');
    if (!header) throw new UnauthorizedException('Terminal-Token erforderlich.');
    const parsed = parseDeviceToken(header);
    if (!parsed) throw new UnauthorizedException('Terminal-Token ungültig.');

    // Kontext aus dem Token setzen, damit die RLS-geschützte Prüfung greift.
    this.tenantContext.enterWith({ tenantId: parsed.tenantId, userId: 'terminal', roles: [] });
    const terminal = await this.terminals.verifyTerminal(parsed.tokenHash);
    if (!terminal) throw new UnauthorizedException('Terminal nicht bekannt oder deaktiviert.');
    this.tenantContext.enterWith({ tenantId: parsed.tenantId, userId: `terminal:${terminal.id}`, roles: [] });
    return true;
  }
}
