import { Global, Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { TokenVerifier } from '../auth/token-verifier';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [TenantContextService, TokenVerifier, TenantGuard, RolesGuard],
  exports: [TenantContextService, TokenVerifier, TenantGuard, RolesGuard],
})
export class TenantModule {}
