import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StampingController } from './stamping.controller';
import { StampingService } from './stamping.service';

@Module({
  imports: [AuditModule],
  controllers: [StampingController],
  providers: [StampingService],
})
export class StampingModule {}
