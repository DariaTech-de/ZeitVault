import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { WorkLocationModule } from '../work-location/work-location.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { SurchargeReportService } from './surcharge-report.service';

@Module({
  imports: [WorkLocationModule, RulesModule],
  controllers: [ReportingController],
  providers: [ReportingService, SurchargeReportService],
})
export class ReportingModule {}
