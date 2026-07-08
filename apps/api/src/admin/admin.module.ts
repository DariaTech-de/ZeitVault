import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LicensingModule } from '../licensing/licensing.module';
import { RulesModule } from '../rules/rules.module';
import { WorkLocationModule } from '../work-location/work-location.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuditModule, LicensingModule, WorkLocationModule, RulesModule],
  controllers: [AdminController],
  providers: [AdminService, DashboardService],
})
export class AdminModule {}
