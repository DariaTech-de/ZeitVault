import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkLocationController } from './work-location.controller';
import { WorkLocationService } from './work-location.service';

@Module({
  imports: [AuditModule],
  controllers: [WorkLocationController],
  providers: [WorkLocationService],
  exports: [WorkLocationService],
})
export class WorkLocationModule {}
