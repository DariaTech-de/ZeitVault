import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { NotificationRow } from '../db/schema';
import { NotificationsService } from './notifications.service';

const uuidSchema = z.string().uuid();

/** Fuehrungskraft-Inbox fuer praeventive Verstosswarnungen (B-13). */
@ApiTags('Benachrichtigungen')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles('manager', 'admin')
  async listOpen(): Promise<NotificationRow[]> {
    return this.notificationsService.listOpen();
  }

  @Post(':id/read')
  @Roles('manager', 'admin')
  async markRead(@Param('id') id: string): Promise<{ ok: true }> {
    await this.notificationsService.markRead(uuidSchema.parse(id));
    return { ok: true };
  }
}
