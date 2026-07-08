import { addIsoDays } from '../localtime/localtime';
import type { Finding, RulePackage } from './types';

/**
 * Ruhezeit-Ausgleich (B-03, § 5 Abs. 2 ArbZG): In Ausnahmebranchen darf die
 * 11-h-Ruhezeit per TV-Regelsatz auf bis zu 10 h verkuerzt werden - aber nur,
 * wenn JEDE Verkuerzung innerhalb eines Kalendermonats bzw. vier Wochen
 * (Parameter `restCompensationPeriodMonths`/`...Weeks`) durch Verlaengerung
 * einer anderen Ruhezeit auf mindestens `restCompensationMinutes` (12 h)
 * ausgeglichen wird.
 *
 * Bewertung je verkuerzter Ruhezeit (unter `restCompensationBaselineMinutes`,
 * dem gesetzlichen Standard von 11 h, aber ueber dem wirksamen Minimum -
 * darunter ist es bereits REST_PERIOD_TOO_SHORT):
 * - Ausgleichs-Ruhe innerhalb der Frist vorhanden: kein Befund.
 * - Frist abgelaufen ohne Ausgleich: sicherer Verstoss
 *   (REST_COMPENSATION_MISSING).
 * - Frist laeuft noch: Warnung VOR Fristablauf
 *   (REST_COMPENSATION_PENDING mit Frist-Datum).
 *
 * > Hinweis: ersetzt keine Rechtsberatung.
 */

export interface RestPeriod {
  start: Date;
  end: Date;
}

const MINUTE_MS = 60_000;

/** Ruhezeiten zwischen aufeinanderfolgenden ABGESCHLOSSENEN Schichten. */
export function restPeriodsFromShifts(
  shifts: ReadonlyArray<{ startAt: Date; endAt: Date | null }>,
): RestPeriod[] {
  const sorted = [...shifts].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const rests: RestPeriod[] = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const end = sorted[i]!.endAt;
    if (end === null) continue; // offen/unresolved: Ruhe nicht ableitbar (ADR-0019)
    rests.push({ start: end, end: sorted[i + 1]!.startAt });
  }
  return rests;
}

function isoDateOf(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function deadlineFor(reducedEnd: Date, pkg: RulePackage): string {
  const params = pkg.params;
  if (params.restCompensationPeriodMonths > 0) {
    const iso = isoDateOf(reducedEnd);
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1 + params.restCompensationPeriodMonths, d!))
      .toISOString()
      .slice(0, 10);
  }
  return addIsoDays(isoDateOf(reducedEnd), params.restCompensationPeriodWeeks * 7);
}

/** Prueft alle verkuerzten Ruhezeiten des Zeitraums auf ihren Ausgleich. */
export function evaluateRestCompensation(
  restPeriods: readonly RestPeriod[],
  rangeTo: string,
  packageFor: (isoDate: string) => RulePackage,
  today: Date,
): Array<{ date: string; finding: Finding }> {
  const findings: Array<{ date: string; finding: Finding }> = [];
  const sorted = [...restPeriods].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const rest of sorted) {
    const date = isoDateOf(rest.start);
    if (date > rangeTo) continue;
    const pkg = packageFor(date);
    const params = pkg.params;
    const minutes = Math.round((rest.end.getTime() - rest.start.getTime()) / MINUTE_MS);
    const isReduced =
      minutes >= params.minRestMinutes && minutes < params.restCompensationBaselineMinutes;
    if (!isReduced) continue;

    const deadline = deadlineFor(rest.end, pkg);
    const compensated = sorted.some(
      (other) =>
        other.start.getTime() >= rest.end.getTime() &&
        isoDateOf(other.start) <= deadline &&
        Math.round((other.end.getTime() - other.start.getTime()) / MINUTE_MS) >=
          params.restCompensationMinutes,
    );
    if (compensated) continue;

    if (isoDateOf(today) > deadline) {
      findings.push({
        date,
        finding: {
        code: 'REST_COMPENSATION_MISSING',
        severity: 'violation',
        message: `Verkürzte Ruhezeit (${minutes} min am ${date}) wurde nicht innerhalb der Frist (bis ${deadline}) durch eine Ruhezeit von mindestens ${params.restCompensationMinutes / 60} h ausgeglichen (§ 5 Abs. 2 ArbZG).`,
        details: { restMinutes: minutes, requiredCompensationMinutes: params.restCompensationMinutes },
        },
      });
    } else {
      findings.push({
        date,
        finding: {
        code: 'REST_COMPENSATION_PENDING',
        severity: 'warning',
        message: `Verkürzte Ruhezeit (${minutes} min am ${date}): Ausgleich durch eine Ruhezeit von mindestens ${params.restCompensationMinutes / 60} h steht aus (Frist bis ${deadline}).`,
        details: { restMinutes: minutes, requiredCompensationMinutes: params.restCompensationMinutes },
        },
      });
    }
  }
  return findings;
}
