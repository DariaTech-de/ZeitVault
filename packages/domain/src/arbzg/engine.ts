import type {
  ArbZgRuleParams,
  BreakInterval,
  Finding,
  RulePackage,
  WorkDayInput,
  WorkInterval,
} from './types';

const MINUTE_MS = 60_000;

/** Dauer eines Intervalls in Minuten. Wirft bei ungueltigem Intervall. */
export function intervalMinutes(interval: WorkInterval | BreakInterval): number {
  const ms = interval.end.getTime() - interval.start.getTime();
  if (Number.isNaN(ms) || ms < 0) {
    throw new Error('Ungueltiges Intervall: Ende liegt vor Beginn oder Datum ungueltig.');
  }
  return ms / MINUTE_MS;
}

/** Summe der Dauer mehrerer Intervalle in Minuten. */
export function totalMinutes(intervals: readonly (WorkInterval | BreakInterval)[]): number {
  return intervals.reduce((sum, iv) => sum + intervalMinutes(iv), 0);
}

/** Erforderliche Pausenzeit (Minuten) abhaengig von der Arbeitsdauer. */
export function requiredBreakMinutes(workedMinutes: number, params: ArbZgRuleParams): number {
  if (workedMinutes >= params.breakThreshold2Minutes) return params.breakMinutesTier2;
  if (workedMinutes >= params.breakThreshold1Minutes) return params.breakMinutesTier1;
  return 0;
}

/** Prueft die taegliche Hoechstarbeitszeit. */
export function evaluateDailyWorkTime(
  workedMinutes: number,
  params: ArbZgRuleParams,
): Finding[] {
  if (workedMinutes > params.maxDailyMinutesExtended) {
    return [
      {
        code: 'MAX_DAILY_WORKTIME_EXTENDED_EXCEEDED',
        severity: 'violation',
        message: `Taegliche Hoechstarbeitszeit von ${params.maxDailyMinutesExtended / 60} h ueberschritten.`,
        details: { workedMinutes, limitMinutes: params.maxDailyMinutesExtended },
      },
    ];
  }
  if (workedMinutes > params.maxDailyMinutesStandard) {
    return [
      {
        code: 'MAX_DAILY_WORKTIME_EXCEEDED',
        severity: 'warning',
        message: `Regulaere taegliche Arbeitszeit von ${params.maxDailyMinutesStandard / 60} h ueberschritten (Ausgleich erforderlich).`,
        details: { workedMinutes, limitMinutes: params.maxDailyMinutesStandard },
      },
    ];
  }
  return [];
}

/** Prueft die Pflichtpausen. */
export function evaluateBreaks(
  workedMinutes: number,
  breakMinutes: number,
  params: ArbZgRuleParams,
): Finding[] {
  const required = requiredBreakMinutes(workedMinutes, params);
  if (required === 0) return [];
  if (breakMinutes <= 0) {
    return [
      {
        code: 'BREAK_MISSING',
        severity: 'violation',
        message: `Pflichtpause von ${required} min fehlt.`,
        details: { workedMinutes, requiredBreakMinutes: required, takenBreakMinutes: 0 },
      },
    ];
  }
  if (breakMinutes < required) {
    return [
      {
        code: 'BREAK_TOO_SHORT',
        severity: 'violation',
        message: `Pause zu kurz: ${breakMinutes} min statt erforderlicher ${required} min.`,
        details: { workedMinutes, requiredBreakMinutes: required, takenBreakMinutes: breakMinutes },
      },
    ];
  }
  return [];
}

/** Prueft die Mindestruhezeit gegenueber dem Ende des Vortags-Einsatzes. */
export function evaluateRestPeriod(
  previousShiftEnd: Date | null,
  currentStart: Date,
  params: ArbZgRuleParams,
): Finding[] {
  if (previousShiftEnd === null) return [];
  const restMinutes = (currentStart.getTime() - previousShiftEnd.getTime()) / MINUTE_MS;
  if (restMinutes < params.minRestMinutes) {
    return [
      {
        code: 'REST_PERIOD_TOO_SHORT',
        severity: 'violation',
        message: `Ruhezeit zu kurz: ${restMinutes} min statt erforderlicher ${params.minRestMinutes} min.`,
        details: { restMinutes, requiredRestMinutes: params.minRestMinutes },
      },
    ];
  }
  return [];
}

function earliestStart(intervals: readonly WorkInterval[]): Date | null {
  let min: Date | null = null;
  for (const iv of intervals) {
    if (min === null || iv.start.getTime() < min.getTime()) {
      min = iv.start;
    }
  }
  return min;
}

/**
 * Bewertet einen Arbeitstag deklarativ gegen ein Regelpaket und liefert alle
 * Befunde (Warnungen + Verstoesse). Eingesetzt sowohl live (beim Stempeln) als
 * auch im Stapellauf (Monatsabschluss/Verstossreport), ARCHITEKTUR.md Paragraf 10.
 */
export function evaluateWorkDay(input: WorkDayInput, rulePackage: RulePackage): Finding[] {
  const params = rulePackage.params;
  const workedMinutes = totalMinutes(input.intervals);
  const breakMinutes = totalMinutes(input.breaks);

  const findings: Finding[] = [];
  findings.push(...evaluateDailyWorkTime(workedMinutes, params));
  findings.push(...evaluateBreaks(workedMinutes, breakMinutes, params));

  const start = earliestStart(input.intervals);
  if (start !== null) {
    findings.push(...evaluateRestPeriod(input.previousShiftEnd, start, params));
  }
  return findings;
}
