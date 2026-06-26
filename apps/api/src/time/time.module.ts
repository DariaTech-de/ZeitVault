import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TimeController } from './time.controller';
import { TimeService } from './time.service';

@Module({
  imports: [AuditModule],
  controllers: [TimeController],
  providers: [TimeService],
})
export class TimeModule {}
