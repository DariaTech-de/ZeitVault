import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type NfcMapping, type TerminalSummary, mapNfcSchema, registerTerminalSchema } from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import { TerminalService } from './terminal.service';

const uuidSchema = z.string().uuid();

/** Verwaltung der Terminals und NFC-Zuordnungen (Administration, Nutzer-Token). */
@ApiTags('Terminals')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('terminal')
export class TerminalController {
  constructor(private readonly terminals: TerminalService) {}

  /** Terminal registrieren – Geräte-Token wird EINMALIG zurückgegeben. */
  @Post('devices')
  @Roles('admin')
  async register(@Body() body: unknown): Promise<{ id: string; name: string; token: string }> {
    const { name } = registerTerminalSchema.parse(body);
    return this.terminals.registerDevice(name);
  }

  @Get('devices')
  @Roles('manager', 'admin')
  async devices(): Promise<TerminalSummary[]> {
    return this.terminals.listDevices();
  }

  @Delete('devices/:id')
  @Roles('admin')
  async deactivate(@Param('id') id: string): Promise<{ ok: true }> {
    await this.terminals.deactivateDevice(uuidSchema.parse(id));
    return { ok: true };
  }

  /** NFC-Chip einem Mitarbeitenden zuordnen. */
  @Post('nfc')
  @Roles('admin')
  async mapNfc(@Body() body: unknown): Promise<{ ok: true }> {
    await this.terminals.mapNfc(mapNfcSchema.parse(body));
    return { ok: true };
  }

  @Get('nfc')
  @Roles('manager', 'admin')
  async nfc(): Promise<NfcMapping[]> {
    return this.terminals.listNfc();
  }
}
