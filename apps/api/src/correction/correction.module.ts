import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CorrectionController } from './correction.controller';
import { CorrectionService } from './correction.service';

@Module({
  imports: [AuditModule],
  controllers: [CorrectionController],
  providers: [CorrectionService],
})
export class CorrectionModule {}
