import { Injectable, Logger } from '@nestjs/common';
import type { AppendAuditEvent } from '@zeitvault/types';
import { loadEnv } from '../config/env';

/**
 * Schreibt Audit-Ereignisse an den getrennten Ledger-Service (ADR-0006,
 * Kern-Invariante 2). Bewusst ueber die Vertrauensgrenze hinweg per HTTP, damit
 * die Anwendung ihren eigenen Audit-Trail nicht direkt manipulieren kann.
 */
@Injectable()
export class AuditClient {
  private readonly logger = new Logger(AuditClient.name);
  private readonly baseUrl = loadEnv().LEDGER_URL;

  async append(event: AppendAuditEvent): Promise<void> {
    const response = await fetch(`${this.baseUrl}/audit/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      this.logger.error(`Audit-Ledger antwortete mit Status ${response.status}`);
      throw new Error(`Audit-Ereignis konnte nicht geschrieben werden (HTTP ${response.status}).`);
    }
  }
}
