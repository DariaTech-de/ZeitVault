import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LicensingController } from './licensing.controller';
import { LicensingService } from './licensing.service';

@Module({
  imports: [AuditModule],
  controllers: [LicensingController],
  providers: [LicensingService],
  exports: [LicensingService],
})
export class LicensingModule {}
