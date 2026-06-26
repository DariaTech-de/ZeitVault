import { Module } from '@nestjs/common';
import { WorkTimeController } from './work-time.controller';
import { WorkTimeService } from './work-time.service';

@Module({
  controllers: [WorkTimeController],
  providers: [WorkTimeService],
})
export class WorkTimeModule {}
