import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LicensingModule } from '../licensing/licensing.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuditModule, LicensingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
