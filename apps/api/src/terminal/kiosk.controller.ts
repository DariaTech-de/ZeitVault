import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type TerminalStampResult, terminalStampSchema } from '@zeitvault/types';
import { TerminalGuard } from './terminal.guard';
import { TerminalService } from './terminal.service';

/**
 * Kiosk-Endpunkt für das Terminal am Eingang. Authentifiziert über das
 * Geräte-Token (nicht über einen Nutzer-Login). Fingerabdrücke werden lokal am
 * Terminal abgeglichen; hier kommt nur die NFC-UID bzw. die aufgelöste
 * Mitarbeiter-ID an (ADR-0015).
 */
@ApiTags('Terminals')
@UseGuards(TerminalGuard)
@Controller('kiosk')
export class KioskController {
  constructor(private readonly terminals: TerminalService) {}

  /** Stempelvorgang am Terminal (NFC oder lokal aufgelöster Fingerabdruck). */
  @Post('stamp')
  async stamp(@Body() body: unknown): Promise<TerminalStampResult> {
    return this.terminals.stamp(terminalStampSchema.parse(body));
  }
}
