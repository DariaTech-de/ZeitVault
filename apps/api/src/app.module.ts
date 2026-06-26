import { Module } from '@nestjs/common';
import { AbsenceModule } from './absence/absence.module';
import { AccountsModule } from './accounts/accounts.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { TenantModule } from './common/tenant.module';
import { DbModule } from './db/db.module';
import { ExportModule } from './export/export.module';
import { HealthModule } from './health/health.module';
import { ReportingModule } from './reporting/reporting.module';
import { StampingModule } from './stamping/stamping.module';
import { TimeModule } from './time/time.module';
import { WorkTimeModule } from './work-time/work-time.module';

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
    WorkTimeModule,
    AbsenceModule,
    AccountsModule,
    ReportingModule,
    ExportModule,
  ],
})
export class AppModule {}
