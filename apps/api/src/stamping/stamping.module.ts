import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GeofenceModule } from '../geofence/geofence.module';
import { StampingController } from './stamping.controller';
import { StampingService } from './stamping.service';

@Module({
  imports: [AuditModule, GeofenceModule],
  controllers: [StampingController],
  providers: [StampingService],
  exports: [StampingService],
})
export class StampingModule {}
