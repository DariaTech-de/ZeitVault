import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { correctTimeEntrySchema, createTimeEntrySchema } from '@zeitvault/types';
import { TenantGuard } from '../common/tenant.guard';
import type { TimeEntryRow } from '../db/schema';
import { TimeService } from './time.service';

@ApiTags('Zeiterfassung')
@UseGuards(TenantGuard)
@Controller('time-entries')
export class TimeController {
  constructor(private readonly time: TimeService) {}

  /** Neuen Zeiteintrag erfassen (Kommen/Gehen). */
  @Post()
  async create(@Body() body: unknown): Promise<TimeEntryRow> {
    const input = createTimeEntrySchema.parse(body);
    return this.time.createEntry(input);
  }

  /** Korrektur eines Eintrags - erzeugt eine neue Revision (Kern-Invariante 1). */
  @Post(':id/corrections')
  async correct(@Param('id') id: string, @Body() body: unknown): Promise<TimeEntryRow> {
    const input = correctTimeEntrySchema.parse({
      ...(body as Record<string, unknown>),
      previousEntryId: id,
    });
    return this.time.correctEntry(id, {
      startAt: new Date(input.start),
      endAt: input.end === null ? null : new Date(input.end),
      correctionReason: input.correctionReason,
    });
  }
}
