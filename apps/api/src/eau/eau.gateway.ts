import { Injectable, Logger } from '@nestjs/common';

export interface EauSubmission {
  requestId: string;
  employeeId: string;
  from: string;
  to: string;
}

export interface EauSubmissionResult {
  externalRef: string;
}

/**
 * Port zum zertifizierten eAU-Gateway (SV-Meldeverfahren). Die konkrete
 * Anbindung (Übertragung, Verschlüsselung, Zertifikate) erfolgt über einen
 * externen, zertifizierten Dienst und ist organisatorisch zu beschaffen. Diese
 * Abstraktion erlaubt das spätere Einsetzen der echten Implementierung, ohne die
 * Anwendung zu ändern.
 */
export abstract class EauGateway {
  abstract submit(submission: EauSubmission): Promise<EauSubmissionResult>;
}

/**
 * Platzhalter-Adapter: KONTAKTIERT KEIN echtes Gateway (zertifizierter Dienst
 * blockiert, Roadmap-Abhängigkeit). Erzeugt nur eine synthetische Referenz,
 * damit der Statusfluss end-to-end demonstrierbar ist. In Produktion durch die
 * zertifizierte Implementierung ersetzen.
 */
@Injectable()
export class StubEauGateway extends EauGateway {
  private readonly logger = new Logger(StubEauGateway.name);

  async submit(submission: EauSubmission): Promise<EauSubmissionResult> {
    this.logger.warn(
      'eAU-Gateway ist ein Platzhalter (zertifizierter Dienst blockiert) - keine reale Übertragung.',
    );
    const token = submission.requestId.replace(/-/g, '').slice(0, 12).toUpperCase();
    return { externalRef: `STUB-${token}` };
  }
}
