import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Finding } from '@zeitvault/domain';
import { TenantContextService } from '../common/tenant-context.service';
import { type NotificationRow, notifications } from '../db/schema';
import { DB, type Database } from '../db/tokens';

/**
 * Verstosswarnungen (B-13): Die Pruefung laeuft beim ERFASSEN (Live-Befunde
 * der Stempel-Antwort); Verstoesse erreichen zusaetzlich die Fuehrungskraft
 * ueber diese Inbox (Rolle 'manager' - eine personenscharfe FK-Zuordnung
 * existiert noch nicht als Stammdatum). "Planen" existiert im Produkt noch
 * nicht; die Anbindung folgt mit der Schichtplanung.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Legt je Verstoss-Befund eine Warnung fuer die Fuehrungskraft an. */
  async notifyViolations(employeeId: string, findings: readonly Finding[]): Promise<void> {
    const violations = findings.filter((f) => f.severity === 'violation');
    if (violations.length === 0) return;
    const ctx = this.tenantContext.require();
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      await tx.insert(notifications).values(
        violations.map((f) => ({
          tenantId: ctx.tenantId,
          employeeId,
          code: f.code,
          severity: f.severity,
          message: f.message,
        })),
      );
    });
  }

  /** Offene (ungelesene) Warnungen der Fuehrungskraft-Inbox. */
  async listOpen(): Promise<NotificationRow[]> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.tenantId, ctx.tenantId), isNull(notifications.readAt)))
        .orderBy(desc(notifications.createdAt))
        .limit(200);
    });
  }

  /** Markiert eine Warnung als gelesen. */
  async markRead(id: string): Promise<void> {
    const ctx = this.tenantContext.require();
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.id, id)));
    });
  }
}
