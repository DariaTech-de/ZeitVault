import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkLocationModule } from '../work-location/work-location.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [AuditModule, WorkLocationModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
