import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ARBZG_2026_V1,
  DEFAULT_RULE_PACKAGES,
  RuleConflictError,
  type ResolvedRuleParams,
  resolveEffectiveParams,
  selectRulePackage,
} from '@zeitvault/domain';
import {
  createCollectiveAgreementSchema,
  createRuleSetSchema,
} from '@zeitvault/types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/tenant.guard';
import type { CollectiveAgreementRow, RuleSetRow } from '../db/schema';
import { RuleResolutionService } from './rule-resolution.service';
import { RulesService } from './rules.service';

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Verwaltung der Regelschicht: Tarifwerke und versionierte Regelsätze (B-08/B-09/B-10). */
@ApiTags('Regelwerk')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('rules')
export class RulesController {
  constructor(
    private readonly rules: RulesService,
    private readonly resolution: RuleResolutionService,
  ) {}

  @Post('agreements')
  @Roles('admin')
  async createAgreement(@Body() body: unknown): Promise<CollectiveAgreementRow> {
    return this.rules.createAgreement(createCollectiveAgreementSchema.parse(body));
  }

  @Get('agreements')
  @Roles('manager', 'admin')
  async listAgreements(): Promise<CollectiveAgreementRow[]> {
    return this.rules.listAgreements();
  }

  @Delete('agreements/:id')
  @Roles('admin')
  async deactivateAgreement(@Param('id') id: string): Promise<{ ok: true }> {
    await this.rules.deactivateAgreement(uuidSchema.parse(id));
    return { ok: true };
  }

  @Post('rule-sets')
  @Roles('admin')
  async createRuleSet(@Body() body: unknown): Promise<RuleSetRow> {
    return this.rules.createRuleSet(createRuleSetSchema.parse(body));
  }

  @Get('rule-sets')
  @Roles('manager', 'admin')
  async listRuleSets(): Promise<RuleSetRow[]> {
    return this.rules.listRuleSets();
  }

  @Delete('rule-sets/:id')
  @Roles('admin')
  async deactivateRuleSet(@Param('id') id: string): Promise<{ ok: true }> {
    await this.rules.deactivateRuleSet(uuidSchema.parse(id));
    return { ok: true };
  }

  /**
   * Wirksame Parameter + Herkunft je Parameter fuer ein Datum (B-09-AK:
   * Aufloesungsreihenfolge dokumentiert und nachvollziehbar).
   */
  @Get('effective')
  @Roles('manager', 'admin')
  async effective(
    @Query('date') date: string,
    @Query('employeeId') employeeId?: string,
  ): Promise<ResolvedRuleParams> {
    const isoDate = isoDateSchema.parse(date);
    const sources = await this.resolution.loadSources(
      employeeId ? uuidSchema.parse(employeeId) : undefined,
    );
    const law = selectRulePackage(DEFAULT_RULE_PACKAGES, isoDate) ?? ARBZG_2026_V1;
    try {
      return resolveEffectiveParams(isoDate, law, sources);
    } catch (err) {
      if (err instanceof RuleConflictError) throw new ConflictException(err.message);
      throw err;
    }
  }
}
