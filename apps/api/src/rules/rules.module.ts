import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkLocationModule } from '../work-location/work-location.module';
import { ReprocessingService } from './reprocessing.service';
import { RuleResolutionService } from './rule-resolution.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [AuditModule, WorkLocationModule],
  controllers: [RulesController],
  providers: [RulesService, RuleResolutionService, ReprocessingService],
  exports: [RuleResolutionService, ReprocessingService],
})
export class RulesModule {}
