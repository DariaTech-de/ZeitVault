import { Module } from '@nestjs/common';
import { AuditClient } from './audit.client';

@Module({
  providers: [AuditClient],
  exports: [AuditClient],
})
export class AuditModule {}
