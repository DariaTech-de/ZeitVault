import { Module } from '@nestjs/common';
import { AbsenceModule } from './absence/absence.module';
import { AccountsModule } from './accounts/accounts.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { CorrectionModule } from './correction/correction.module';
import { TenantModule } from './common/tenant.module';
import { DbModule } from './db/db.module';
import { EauModule } from './eau/eau.module';
import { ExportModule } from './export/export.module';
import { HealthModule } from './health/health.module';
import { LicensingModule } from './licensing/licensing.module';
import { MeModule } from './me/me.module';
import { PlatformModule } from './platform/platform.module';
import { ProjectModule } from './project/project.module';
import { ReportingModule } from './reporting/reporting.module';
import { RetentionModule } from './retention/retention.module';
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
    RetentionModule,
    PlatformModule,
    ProjectModule,
    EauModule,
    MeModule,
    CorrectionModule,
    LicensingModule,
  ],
})
export class AppModule {}
