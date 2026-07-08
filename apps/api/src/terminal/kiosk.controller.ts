import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  type KioskIdentifyResult,
  type TerminalStampResult,
  kioskIdentifySchema,
  terminalStampSchema,
} from '@zeitvault/types';
import { TerminalGuard } from './terminal.guard';
import { TerminalService } from './terminal.service';

const uuidSchema = z.string().uuid();

/**
 * Kiosk-Endpunkt für das Terminal am Eingang. Authentifiziert über das
 * Geräte-Token (nicht über einen Nutzer-Login). Fingerabdrücke werden lokal am
 * Terminal abgeglichen; hier kommt nur die NFC-UID, die Personalnummer bzw. die
 * aufgelöste Mitarbeiter-ID an (ADR-0015).
 */
@ApiTags('Terminals')
@UseGuards(TerminalGuard)
@Controller('kiosk')
export class KioskController {
  constructor(private readonly terminals: TerminalService) {}

  /** Person identifizieren (Foto/Name/Status anzeigen) OHNE zu stempeln. */
  @Post('identify')
  async identify(@Body() body: unknown): Promise<KioskIdentifyResult> {
    return this.terminals.identify(kioskIdentifySchema.parse(body));
  }

  /** Stempelvorgang am Terminal (NFC, Personalnummer oder lokaler Fingerabdruck). */
  @Post('stamp')
  async stamp(@Body() body: unknown): Promise<TerminalStampResult> {
    return this.terminals.stamp(terminalStampSchema.parse(body));
  }

  /** Anzeigebild des Mitarbeitenden für die Begrüßung (mandantengetrennt, RLS). */
  @Get('employee/:id/photo')
  async photo(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const photo = await this.terminals.getEmployeePhoto(uuidSchema.parse(id));
    if (!photo) throw new NotFoundException('Kein Foto hinterlegt.');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(photo.data);
  }
}
