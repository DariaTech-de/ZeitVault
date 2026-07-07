import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StampingModule } from '../stamping/stamping.module';
import { KioskController } from './kiosk.controller';
import { TerminalController } from './terminal.controller';
import { TerminalGuard } from './terminal.guard';
import { TerminalService } from './terminal.service';

@Module({
  imports: [AuditModule, StampingModule],
  controllers: [TerminalController, KioskController],
  providers: [TerminalService, TerminalGuard],
})
export class TerminalModule {}
