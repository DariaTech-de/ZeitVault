import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EauController } from './eau.controller';
import { EauGateway, StubEauGateway } from './eau.gateway';
import { EauService } from './eau.service';

@Module({
  imports: [AuditModule],
  controllers: [EauController],
  providers: [
    EauService,
    // Port -> Platzhalter-Adapter. Produktion: zertifizierte Implementierung.
    { provide: EauGateway, useClass: StubEauGateway },
  ],
})
export class EauModule {}
