import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  KioskIdentify,
  KioskIdentifyResult,
  MapNfc,
  NfcMapping,
  StampKind,
  TerminalStamp,
  TerminalStampResult,
  TerminalSummary,
} from '@zeitvault/types';
import { AuditClient } from '../audit/audit.client';
import { TenantContextService } from '../common/tenant-context.service';
import { employeePhotos, employees, nfcCredentials, terminals } from '../db/schema';
import { DB, type Database } from '../db/tokens';
import { StampingService } from '../stamping/stamping.service';
import { createDeviceToken, safeHashEqual } from './terminal.token';

const NEXT_KIND: Record<'out' | 'in' | 'break', StampKind> = {
  out: 'clock_in',
  in: 'clock_out',
  break: 'break_end',
};

@Injectable()
export class TerminalService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditClient,
    private readonly stamping: StampingService,
  ) {}

  private tx<T>(fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0], tenantId: string) => Promise<T>): Promise<T> {
    const ctx = this.tenantContext.require();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return fn(tx, ctx.tenantId);
    });
  }

  /** Registriert ein Terminal und gibt das Geräte-Token EINMALIG zurück. */
  async registerDevice(name: string): Promise<{ id: string; name: string; token: string }> {
    const ctx = this.tenantContext.require();
    const { token, tokenHash } = createDeviceToken(ctx.tenantId);
    const row = await this.tx(async (tx, tenantId) => {
      const inserted = await tx.insert(terminals).values({ tenantId, name, tokenHash }).returning();
      return inserted[0];
    });
    if (!row) throw new Error('Terminal konnte nicht registriert werden.');
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'terminal.register',
      actorId: ctx.userId,
      subjectType: 'terminal',
      subjectId: row.id,
      payload: { name },
    });
    return { id: row.id, name: row.name, token };
  }

  async listDevices(): Promise<TerminalSummary[]> {
    const rows = await this.tx((tx, tenantId) =>
      tx.select().from(terminals).where(eq(terminals.tenantId, tenantId)).orderBy(desc(terminals.createdAt)),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async deactivateDevice(id: string): Promise<void> {
    await this.tx(async (tx, tenantId) => {
      await tx.update(terminals).set({ active: false }).where(and(eq(terminals.tenantId, tenantId), eq(terminals.id, id)));
    });
  }

  /** Ordnet eine NFC-UID einem Mitarbeitenden zu (Upsert je Mandant+UID). */
  async mapNfc(input: MapNfc): Promise<void> {
    const ctx = this.tenantContext.require();
    await this.tx(async (tx, tenantId) => {
      await tx
        .insert(nfcCredentials)
        .values({ tenantId, uid: input.uid, employeeId: input.employeeId, active: true })
        .onConflictDoUpdate({
          target: [nfcCredentials.tenantId, nfcCredentials.uid],
          set: { employeeId: input.employeeId, active: true },
        });
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      action: 'nfc.map',
      actorId: ctx.userId,
      subjectType: 'nfc_credential',
      subjectId: input.uid,
      payload: { employeeId: input.employeeId },
    });
  }

  async listNfc(): Promise<NfcMapping[]> {
    return this.tx(async (tx, tenantId) => {
      const rows = await tx
        .select({
          uid: nfcCredentials.uid,
          employeeId: nfcCredentials.employeeId,
          active: nfcCredentials.active,
          employeeName: employees.displayName,
        })
        .from(nfcCredentials)
        .leftJoin(employees, eq(employees.id, nfcCredentials.employeeId))
        .where(eq(nfcCredentials.tenantId, tenantId))
        .orderBy(desc(nfcCredentials.createdAt));
      return rows.map((r) => ({ uid: r.uid, employeeId: r.employeeId, employeeName: r.employeeName ?? null, active: r.active }));
    });
  }

  /**
   * Prüft ein Geräte-Token gegen die Terminals des (bereits gesetzten) Mandanten.
   * Wird vom TerminalGuard aufgerufen. Aktualisiert last_seen_at.
   */
  async verifyTerminal(tokenHash: string): Promise<{ id: string } | null> {
    return this.tx(async (tx, tenantId) => {
      const rows = await tx
        .select()
        .from(terminals)
        .where(and(eq(terminals.tenantId, tenantId), eq(terminals.active, true)));
      const match = rows.find((r) => safeHashEqual(r.tokenHash, tokenHash));
      if (!match) return null;
      await tx.update(terminals).set({ lastSeenAt: new Date() }).where(eq(terminals.id, match.id));
      return { id: match.id };
    });
  }

  /**
   * Identifiziert eine Person am Terminal OHNE zu stempeln – für die Anzeige von
   * Foto/Name/Status und die Auswahl Kommen/Gehen/Pause vor dem Bestätigen.
   */
  async identify(input: KioskIdentify): Promise<KioskIdentifyResult> {
    const employee = await this.resolveEmployee(input);
    const today = await this.stamping.today(employee.id);
    const hasPhoto = await this.photoExists(employee.id);
    return {
      employeeId: employee.id,
      employeeName: employee.displayName,
      personnelNumber: employee.personnelNumber,
      hasPhoto,
      state: today.status.state,
      suggestedKind: NEXT_KIND[today.status.state],
    };
  }

  /** Stempelvorgang vom Terminal (NFC, Personalnummer oder lokaler Fingerabdruck). */
  async stamp(input: TerminalStamp): Promise<TerminalStampResult> {
    const employee = await this.resolveEmployee(input);
    const kind = input.kind ?? (await this.nextKind(employee.id));
    const result = await this.stamping.stamp({ employeeId: employee.id, kind, source: 'terminal' });
    const hasPhoto = await this.photoExists(employee.id);
    return {
      employeeId: employee.id,
      employeeName: employee.displayName,
      personnelNumber: employee.personnelNumber,
      hasPhoto,
      kind,
      state: result.status.state,
      occurredAt: result.event.occurredAt.toISOString(),
    };
  }

  /** Foto (Anzeigebild) des Mitarbeitenden für die Terminal-Begrüßung (RLS). */
  async getEmployeePhoto(employeeId: string): Promise<{ contentType: string; data: Buffer } | null> {
    return this.tx(async (tx, tenantId) => {
      const rows = await tx
        .select({ contentType: employeePhotos.contentType, data: employeePhotos.data })
        .from(employeePhotos)
        .where(and(eq(employeePhotos.tenantId, tenantId), eq(employeePhotos.employeeId, employeeId)));
      const row = rows[0];
      return row ? { contentType: row.contentType, data: row.data } : null;
    });
  }

  private async photoExists(employeeId: string): Promise<boolean> {
    return this.tx(async (tx, tenantId) => {
      const rows = await tx
        .select({ id: employeePhotos.employeeId })
        .from(employeePhotos)
        .where(and(eq(employeePhotos.tenantId, tenantId), eq(employeePhotos.employeeId, employeeId)));
      return rows.length > 0;
    });
  }

  private async resolveEmployee(input: {
    nfcUid?: string;
    personnelNumber?: string;
    employeeId?: string;
  }): Promise<{ id: string; displayName: string; personnelNumber: string }> {
    return this.tx(async (tx, tenantId) => {
      let employeeId = input.employeeId;
      if (input.nfcUid) {
        const cred = await tx
          .select()
          .from(nfcCredentials)
          .where(
            and(
              eq(nfcCredentials.tenantId, tenantId),
              eq(nfcCredentials.uid, input.nfcUid),
              eq(nfcCredentials.active, true),
            ),
          );
        if (!cred[0]) throw new NotFoundException('Unbekannter NFC-Chip.');
        employeeId = cred[0].employeeId;
      } else if (input.personnelNumber) {
        const byNr = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.tenantId, tenantId), eq(employees.personnelNumber, input.personnelNumber)));
        if (!byNr[0]) throw new NotFoundException('Unbekannte Personalnummer.');
        employeeId = byNr[0].id;
      }
      if (!employeeId) throw new BadRequestException('Kein Mitarbeitender ermittelt.');
      const emp = await tx
        .select({ id: employees.id, displayName: employees.displayName, personnelNumber: employees.personnelNumber, status: employees.status })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)));
      const row = emp[0];
      if (!row) throw new NotFoundException('Mitarbeitender nicht gefunden.');
      if (row.status !== 'active') throw new UnauthorizedException('Mitarbeitender ist nicht aktiv.');
      return { id: row.id, displayName: row.displayName, personnelNumber: row.personnelNumber };
    });
  }

  private async nextKind(employeeId: string): Promise<StampKind> {
    const today = await this.stamping.today(employeeId);
    return NEXT_KIND[today.status.state];
  }
}
