import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { WorkLocationModule } from '../work-location/work-location.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [WorkLocationModule, RulesModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
