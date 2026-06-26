import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { stampSchema } from '@zeitvault/types';
import { TenantGuard } from '../common/tenant.guard';
import { StampResult, StampingService } from './stamping.service';

@ApiTags('Zeiterfassung')
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

  /** Tagesstatus und Live-ArbZG-Befunde. */
  @Get('today')
  async today(@Query('employeeId') employeeId: string) {
    return this.stamping.today(employeeId);
  }
}
