import { Global, Module } from '@nestjs/common';
import { TokenVerifier } from '../auth/token-verifier';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [TenantContextService, TokenVerifier, TenantGuard],
  exports: [TenantContextService, TokenVerifier, TenantGuard],
})
export class TenantModule {}
