import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { LicenseStatus } from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { loadEnv } from '../config/env';
import { employees, licenses } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { verifyLicenseToken } from './license.crypto';

@Injectable()
export class LicensingService {
  private readonly env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
  ) {}

  /** Aktive (nicht gesperrte/anonymisierte) Mitarbeitende des Mandanten. */
  private async countActiveEmployees(tenantId: string): Promise<number> {
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return tx
        .select({ n: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.status, 'active')));
    });
    return rows[0]?.n ?? 0;
  }

  /**
   * Administration lädt ein signiertes Lizenz-Token hoch. Signatur und Mandant
   * werden geprüft; genau eine Lizenz je Mandant (Upsert). Erzeugt ein
   * unveränderliches AuditEvent (license.activate, Kern-Invariante 2).
   */
  async activate(token: string): Promise<LicenseStatus> {
    const ctx = this.tenantContext.require();
    const result = verifyLicenseToken(token, this.env.LICENSE_PUBLIC_KEY);
    if (!result.ok) {
      throw new BadRequestException(result.reason);
    }
    const p = result.payload;
    if (p.tenantId !== ctx.tenantId) {
      throw new BadRequestException('Lizenz ist für einen anderen Mandanten ausgestellt.');
    }
    if (new Date(p.validUntil).getTime() <= Date.now()) {
      throw new BadRequestException(`Lizenz ist bereits abgelaufen (gültig bis ${p.validUntil}).`);
    }

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      await tx
        .insert(licenses)
        .values({
          tenantId: ctx.tenantId,
          licenseId: p.licenseId,
          customer: p.customer,
          tier: p.tier,
          seats: p.seats,
          issuedAt: new Date(p.issuedAt),
          validUntil: new Date(p.validUntil),
          features: p.features,
          token,
          activatedBy: ctx.userId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: licenses.tenantId,
          set: {
            licenseId: p.licenseId,
            customer: p.customer,
            tier: p.tier,
            seats: p.seats,
            issuedAt: new Date(p.issuedAt),
            validUntil: new Date(p.validUntil),
            features: p.features,
            token,
            activatedBy: ctx.userId,
            updatedAt: new Date(),
          },
        });
    });

    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'license.activate',
      actorId: ctx.userId,
      subjectType: 'license',
      subjectId: p.licenseId,
      payload: { tier: p.tier, seats: p.seats, validUntil: p.validUntil, customer: p.customer },
    });

    return this.status();
  }

  /** Live-Status inkl. Sitzplatznutzung. Verifiziert das gespeicherte Token erneut. */
  async status(): Promise<LicenseStatus> {
    const ctx = this.tenantContext.require();
    const grace = this.env.LICENSE_GRACE_SEATS;
    const seatsUsed = await this.countActiveEmployees(ctx.tenantId);

    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return tx.select().from(licenses).where(eq(licenses.tenantId, ctx.tenantId));
    });
    const row = rows[0];

    const testMode = (reason: string): LicenseStatus => ({
      licensed: false,
      valid: false,
      tier: 'Testmodus',
      customer: null,
      seats: grace,
      seatsUsed,
      seatsRemaining: Math.max(0, grace - seatsUsed),
      validUntil: null,
      reason,
    });

    if (!row) {
      return testMode(`Keine Lizenz hinterlegt – Testmodus mit ${grace} Sitzplätzen.`);
    }

    const verified = verifyLicenseToken(row.token, this.env.LICENSE_PUBLIC_KEY);
    if (!verified.ok) {
      return testMode(`Hinterlegte Lizenz nicht verifizierbar (${verified.reason}) – Testmodus.`);
    }
    const now = Date.now();
    const expired = new Date(row.validUntil).getTime() <= now;
    if (expired) {
      return {
        licensed: true,
        valid: false,
        tier: row.tier,
        customer: row.customer,
        seats: grace,
        seatsUsed,
        seatsRemaining: Math.max(0, grace - seatsUsed),
        validUntil: row.validUntil.toISOString(),
        reason: `Lizenz abgelaufen am ${row.validUntil.toISOString().slice(0, 10)} – Testmodus mit ${grace} Sitzplätzen.`,
      };
    }
    return {
      licensed: true,
      valid: true,
      tier: row.tier,
      customer: row.customer,
      seats: row.seats,
      seatsUsed,
      seatsRemaining: Math.max(0, row.seats - seatsUsed),
      validUntil: row.validUntil.toISOString(),
      reason: `Lizenz „${row.tier}" gültig bis ${row.validUntil.toISOString().slice(0, 10)}.`,
    };
  }

  /**
   * Stellt vor dem Anlegen/Aktivieren eines Mitarbeitenden sicher, dass noch ein
   * Sitzplatz frei ist. Wirft 409, wenn das Kontingent erschöpft ist.
   */
  async assertSeatAvailable(): Promise<void> {
    const status = await this.status();
    if (status.seatsUsed >= status.seats) {
      throw new ConflictException(
        `Lizenzlimit erreicht: ${status.seatsUsed}/${status.seats} Sitzplätze belegt. ` +
          'Bitte eine größere Lizenz aktivieren, um weitere Mitarbeitende anzulegen.',
      );
    }
  }
}
