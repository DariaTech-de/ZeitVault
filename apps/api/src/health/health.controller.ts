import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/** Liveness/Readiness fuer Kubernetes-Probes (ARCHITEKTUR.md Paragraf 16). Ohne Tenant-Kontext erreichbar. */
@ApiTags('System')
@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'ok'; service: string } {
    return { status: 'ok', service: 'zeitvault-api' };
  }
}
