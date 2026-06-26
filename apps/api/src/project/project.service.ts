import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { BookProjectTime, CreateProject } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import {
  type ProjectRow,
  type ProjectTimeEntryRow,
  projectTimeEntries,
  projects,
} from '../db/schema';
import { DB, type Database } from '../db/tokens';

export interface ProjectSummary {
  projectId: string;
  totalMinutes: number;
  entryCount: number;
}

@Injectable()
export class ProjectService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  async create(input: CreateProject): Promise<ProjectRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const inserted = await tx
        .insert(projects)
        .values({ tenantId: ctx.tenantId, code: input.code, name: input.name })
        .returning();
      return inserted[0];
    });
    if (!row) {
      throw new Error('Projekt konnte nicht angelegt werden.');
    }
    return row;
  }

  async list(): Promise<ProjectRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(projects)
        .where(eq(projects.tenantId, ctx.tenantId))
        .orderBy(asc(projects.code));
    });
  }

  /** Bucht Projektzeit (append-only); jede Buchung erzeugt ein AuditEvent. */
  async book(projectId: string, input: BookProjectTime): Promise<ProjectTimeEntryRow> {
    const ctx = this.tenantContext.require();
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      const project = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, ctx.tenantId), eq(projects.id, projectId)));
      if (!project[0]) {
        throw new NotFoundException('Projekt nicht gefunden.');
      }
      const inserted = await tx
        .insert(projectTimeEntries)
        .values({
          tenantId: ctx.tenantId,
          employeeId: input.employeeId,
          projectId,
          workDate: input.workDate,
          minutes: input.minutes,
          note: input.note ?? null,
        })
        .returning();
      return inserted[0];
    });
    if (!row) {
      throw new Error('Projektzeit konnte nicht gebucht werden.');
    }
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'project_time.book',
      actorId: ctx.userId,
      subjectType: 'project_time_entry',
      subjectId: row.id,
      payload: { projectId, employeeId: row.employeeId, workDate: row.workDate, minutes: row.minutes },
    });
    return row;
  }

  /** Summe der gebuchten Minuten eines Projekts (Korrekturbuchungen inklusive). */
  async summary(projectId: string): Promise<ProjectSummary> {
    const ctx = this.tenantContext.require();
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(projectTimeEntries)
        .where(
          and(
            eq(projectTimeEntries.tenantId, ctx.tenantId),
            eq(projectTimeEntries.projectId, projectId),
          ),
        );
    });
    return {
      projectId,
      totalMinutes: rows.reduce((sum, r) => sum + r.minutes, 0),
      entryCount: rows.length,
    };
  }
}
