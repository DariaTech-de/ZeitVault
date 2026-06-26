import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../common/tenant.guard';
import { MeResponse, MeService } from './me.service';

@ApiTags('Profil')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** Aktueller Auth-Kontext (Tenant/Rollen) und verknüpfter Mitarbeiter. */
  @Get()
  async profile(): Promise<MeResponse> {
    return this.me.me();
  }
}
