import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { loadEnv } from '../config/env';
import { type PlatformInfo, resolvePlatformInfo } from './feature-flags';

/**
 * Öffentliche Plattform-Metadaten (ohne Tenant-Kontext, ohne Geheimnisse):
 * Betriebsmodell und wirksame Feature-Flags. Erlaubt der Web-/Mobile-App, die
 * Oberfläche modusabhängig zu schalten (z. B. Registrierung nur im Cloud-Modus).
 */
@ApiTags('Plattform')
@Controller('info')
export class PlatformController {
  @Get()
  info(): PlatformInfo {
    return resolvePlatformInfo(loadEnv());
  }
}
