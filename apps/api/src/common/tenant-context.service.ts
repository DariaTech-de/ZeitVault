import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantContext } from '@zeitvault/types';

/**
 * Haelt den Tenant-Kontext (aus dem Auth-Token abgeleitet) je Request via
 * AsyncLocalStorage. Kein Datenzugriff ohne gueltigen Kontext (Kern-Invariante 3,
 * ADR-0004).
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  /** Setzt den Kontext fuer den aktuellen und alle nachgelagerten Async-Frames. */
  enterWith(context: TenantContext): void {
    this.storage.enterWith(context);
  }

  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  current(): TenantContext | undefined {
    return this.storage.getStore();
  }

  /** Liefert den Kontext oder wirft, wenn keiner gesetzt ist. */
  require(): TenantContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error('Kein Tenant-Kontext im aktuellen Request gesetzt.');
    }
    return context;
  }
}
