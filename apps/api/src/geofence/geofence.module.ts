import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GeofenceController } from './geofence.controller';
import { GeofenceService } from './geofence.service';

@Module({
  imports: [AuditModule],
  controllers: [GeofenceController],
  providers: [GeofenceService],
  exports: [GeofenceService],
})
export class GeofenceModule {}
