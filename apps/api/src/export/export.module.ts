import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RulesModule } from '../rules/rules.module';
import { WorkLocationModule } from '../work-location/work-location.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { PayrollMappingService } from './payroll-mapping.service';

@Module({
  imports: [AuditModule, WorkLocationModule, RulesModule],
  controllers: [ExportController],
  providers: [ExportService, PayrollMappingService],
})
export class ExportModule {}
