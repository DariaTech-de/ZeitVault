import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RuleResolutionService } from './rule-resolution.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [AuditModule],
  controllers: [RulesController],
  providers: [RulesService, RuleResolutionService],
  exports: [RuleResolutionService],
})
export class RulesModule {}
