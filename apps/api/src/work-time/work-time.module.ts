import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkTimeController } from './work-time.controller';
import { WorkTimeService } from './work-time.service';

@Module({
  imports: [AuditModule],
  controllers: [WorkTimeController],
  providers: [WorkTimeService],
})
export class WorkTimeModule {}
