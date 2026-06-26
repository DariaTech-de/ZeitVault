import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AbsenceController } from './absence.controller';
import { AbsenceService } from './absence.service';

@Module({
  imports: [AuditModule],
  controllers: [AbsenceController],
  providers: [AbsenceService],
})
export class AbsenceModule {}
