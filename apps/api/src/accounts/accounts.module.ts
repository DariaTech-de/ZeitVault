import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [AuditModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
