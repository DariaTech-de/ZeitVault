import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { stampCorrectionSchema, stampSchema, syncStampsSchema } from '@zeitvault/types';
import { TenantGuard } from '../common/tenant.guard';
import { DayListing, StampResult, StampingService } from './stamping.service';

@ApiTags('Zeiterfassung')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('stamp')
export class StampingController {
  constructor(private readonly stamping: StampingService) {}

  /** Einstempeln (Kommen). */
  @Post('clock-in')
  async clockIn(@Body() body: unknown): Promise<StampResult> {
    const input = stampSchema.parse(body);
    return this.stamping.stamp({ ...input, kind: 'clock_in' });
  }

  /** Pause beginnen. */
  @Post('break-start')
  async breakStart(@Body() body: unknown): Promise<StampResult> {
    const input = stampSchema.parse(body);
    return this.stamping.stamp({ ...input, kind: 'break_start' });
  }

  /** Pause beenden. */
  @Post('break-end')
  async breakEnd(@Body() body: unknown): Promise<StampResult> {
    const input = stampSchema.parse(body);
    return this.stamping.stamp({ ...input, kind: 'break_end' });
  }

  /** Ausstempeln (Gehen). */
  @Post('clock-out')
  async clockOut(@Body() body: unknown): Promise<StampResult> {
    const input = stampSchema.parse(body);
    return this.stamping.stamp({ ...input, kind: 'clock_out' });
  }

  /** Korrektur einer Stempelung (neue Revision mit Begruendung, Kern-Invariante 1). */
  @Post('corrections')
  async correct(@Body() body: unknown): Promise<StampResult> {
    const input = stampCorrectionSchema.parse(body);
    return this.stamping.correctStamp(input);
  }

  /** Tagesstatus und Live-ArbZG-Befunde. */
  @Get('today')
  async today(@Query('employeeId') employeeId: string) {
    return this.stamping.today(employeeId);
  }

  /** Roh-Ereignisse des Tages (inkl. Korrekturen) + Status/Befunde. */
  @Get('events')
  async events(@Query('employeeId') employeeId: string): Promise<DayListing> {
    return this.stamping.listDay(employeeId);
  }

  /** Idempotente Batch-Synchronisation der Offline-Queue (Mobile, B3). */
  @Post('sync')
  async sync(@Body() body: unknown): Promise<{ accepted: number; duplicates: number }> {
    const input = syncStampsSchema.parse(body);
    return this.stamping.sync(input);
  }
}
