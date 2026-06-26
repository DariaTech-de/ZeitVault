import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [AuditModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
