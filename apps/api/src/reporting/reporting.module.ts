import { Module } from '@nestjs/common';
import { WorkLocationModule } from '../work-location/work-location.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [WorkLocationModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
