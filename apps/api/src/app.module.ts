import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { TenantModule } from './common/tenant.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { StampingModule } from './stamping/stamping.module';
import { TimeModule } from './time/time.module';

/**
 * Modularer Monolith (ARCHITEKTUR.md Paragraf 6). Weitere Domaenen-Module
 * (Abwesenheit, Konten, Workflow, Reporting, Export) werden hier ergaenzt.
 */
@Module({
  imports: [
    DbModule,
    TenantModule,
    AuditModule,
    HealthModule,
    TimeModule,
    StampingModule,
    AdminModule,
  ],
})
export class AppModule {}
