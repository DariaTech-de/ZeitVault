import type {
  ArbZgRuleParams,
  BreakInterval,
  Finding,
  RulePackage,
  WorkDayInput,
  WorkInterval,
} from './types';

const MINUTE_MS = 60_000;

/**
 * Dauer eines Intervalls in GANZEN Minuten. Wirft bei ungueltigem Intervall.
 *
 * B-12-Basis (BL-6): Zeitdauern sind niemals Bruchminuten (Float). Die
 * MESSUNG eines Intervalls wird genau einmal kaufmaennisch auf ganze Minuten
 * abgeleitet; wird ein Intervall an Zwischengrenzen zerteilt (lokale
 * Mitternacht, spaeter Paragraf-3b-Fenster), leiten sich die Scheiben aus
 * kumulierten Grenzen ab (sliceIntervalByLocalDay), sodass die Summe stets
 * dieser einen Ableitung entspricht — die Splittung rundet nie selbst.
 * Konfigurierbare RUNDUNG (Betriebsvereinbarung) setzt dagegen am EREIGNIS
 * beim Eintragen an (roundStampTime, Standard 'none'); die mandantenweite
 * Konfiguration folgt mit B-12 (Schnitt 3).
 */
export function intervalMinutes(interval: WorkInterval | BreakInterval): number {
  const ms = interval.end.getTime() - interval.start.getTime();
  if (Number.isNaN(ms) || ms < 0) {
    throw new Error('Ungueltiges Intervall: Ende liegt vor Beginn oder Datum ungueltig.');
  }
  return Math.round(ms / MINUTE_MS);
}

/** Summe der Dauer mehrerer Intervalle in Minuten. */
export function totalMinutes(intervals: readonly (WorkInterval | BreakInterval)[]): number {
  return intervals.reduce((sum, iv) => sum + intervalMinutes(iv), 0);
}

/**
 * Erforderliche Pausenzeit (Minuten) abhaengig von der ARBEITSZEIT (netto).
 *
 * § 4 Satz 1 ArbZG: "Die Arbeit ist durch im voraus feststehende Ruhepausen
 * von mindestens 30 Minuten bei einer Arbeitszeit von MEHR ALS sechs bis zu
 * neun Stunden und 45 Minuten bei einer Arbeitszeit von MEHR ALS neun Stunden
 * insgesamt zu unterbrechen." Die Schwellen sind strikt ("mehr als"):
 * 6:00 h -> 0 min, 6:01 h -> 30 min, 9:00 h -> 30 min, 9:01 h -> 45 min (B-02).
 */
export function requiredBreakMinutes(workedMinutes: number, params: ArbZgRuleParams): number {
  if (workedMinutes > params.breakThreshold2Minutes) return params.breakMinutesTier2;
  if (workedMinutes > params.breakThreshold1Minutes) return params.breakMinutesTier1;
  return 0;
}

/**
 * Anrechenbare Pausenminuten nach § 4 Satz 2 ArbZG: Ruhepausen koennen in
 * Abschnitte von JEWEILS mindestens 15 Minuten aufgeteilt werden; kuerzere
 * Unterbrechungen sind keine Ruhepausen und zaehlen nicht.
 */
export function countableBreakMinutes(
  breaks: readonly BreakInterval[],
  params: ArbZgRuleParams,
): number {
  return breaks.reduce((sum, iv) => {
    const minutes = intervalMinutes(iv);
    return minutes >= params.breakMinSegmentMinutes ? sum + minutes : sum;
  }, 0);
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
        message: `Tägliche Höchstarbeitszeit von ${params.maxDailyMinutesExtended / 60} h überschritten.`,
        details: { workedMinutes, limitMinutes: params.maxDailyMinutesExtended },
      },
    ];
  }
  if (workedMinutes > params.maxDailyMinutesStandard) {
    return [
      {
        code: 'MAX_DAILY_WORKTIME_EXCEEDED',
        severity: 'warning',
        message: `Reguläre tägliche Arbeitszeit von ${params.maxDailyMinutesStandard / 60} h überschritten (Ausgleich erforderlich).`,
        details: { workedMinutes, limitMinutes: params.maxDailyMinutesStandard },
      },
    ];
  }
  return [];
}

/**
 * Prueft die Pflichtpausen (§ 4 Satz 1 + 2 ArbZG). Bezugsgroesse ist die
 * Arbeitszeit (netto, ohne Pausen); angerechnet werden nur Pausenabschnitte
 * von jeweils mindestens 15 Minuten (Satz 2).
 */
export function evaluateBreaks(
  workedMinutes: number,
  breaks: readonly BreakInterval[],
  params: ArbZgRuleParams,
): Finding[] {
  const required = requiredBreakMinutes(workedMinutes, params);
  if (required === 0) return [];
  const taken = totalMinutes(breaks);
  const countable = countableBreakMinutes(breaks, params);
  if (countable <= 0) {
    return [
      {
        code: 'BREAK_MISSING',
        severity: 'violation',
        message:
          taken > 0
            ? `Pflichtpause von ${required} min fehlt: ${taken} min Unterbrechung, aber kein Abschnitt erreicht ${params.breakMinSegmentMinutes} min (§ 4 Satz 2 ArbZG).`
            : `Pflichtpause von ${required} min fehlt.`,
        details: {
          workedMinutes,
          requiredBreakMinutes: required,
          takenBreakMinutes: taken,
          countableBreakMinutes: 0,
        },
      },
    ];
  }
  if (countable < required) {
    return [
      {
        code: 'BREAK_TOO_SHORT',
        severity: 'violation',
        message: `Pause zu kurz: ${countable} min anrechenbar statt erforderlicher ${required} min.`,
        details: {
          workedMinutes,
          requiredBreakMinutes: required,
          takenBreakMinutes: taken,
          countableBreakMinutes: countable,
        },
      },
    ];
  }
  return [];
}

/**
 * § 4 Satz 3 ArbZG: "Laenger als sechs Stunden hintereinander duerfen
 * Arbeitnehmer nicht ohne Ruhepause beschaeftigt werden." Ein Arbeitsblock
 * wird nur durch eine Unterbrechung von mindestens 15 Minuten (Satz 2)
 * beendet; kuerzere Luecken setzen den Block fort (gezaehlt wird die
 * Arbeitszeit im Block, nicht die Luecke).
 */
export function evaluateContinuousWork(
  intervals: readonly WorkInterval[],
  params: ArbZgRuleParams,
): Finding[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  let stretch = 0;
  let longest = 0;
  let previousEnd: Date | null = null;
  for (const iv of sorted) {
    const gapMinutes =
      previousEnd === null ? Infinity : (iv.start.getTime() - previousEnd.getTime()) / MINUTE_MS;
    if (gapMinutes >= params.breakMinSegmentMinutes) {
      stretch = 0;
    }
    stretch += intervalMinutes(iv);
    if (stretch > longest) longest = stretch;
    previousEnd = iv.end;
  }
  if (longest > params.maxContinuousWorkMinutes) {
    return [
      {
        code: 'CONTINUOUS_WORK_EXCEEDED',
        severity: 'violation',
        message: `Mehr als ${params.maxContinuousWorkMinutes / 60} h hintereinander ohne Ruhepause gearbeitet (§ 4 Satz 3 ArbZG).`,
        details: {
          longestStretchMinutes: longest,
          limitMinutes: params.maxContinuousWorkMinutes,
        },
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
  // Bezugsgroesse ist die Arbeitszeit (netto): input.intervals enthalten nur
  // Arbeit, Pausen liegen getrennt in input.breaks (B-02).
  const workedMinutes = totalMinutes(input.intervals);

  const findings: Finding[] = [];
  findings.push(...evaluateDailyWorkTime(workedMinutes, params));
  findings.push(...evaluateBreaks(workedMinutes, input.breaks, params));
  findings.push(...evaluateContinuousWork(input.intervals, params));

  const start = earliestStart(input.intervals);
  if (start !== null) {
    findings.push(...evaluateRestPeriod(input.previousShiftEnd, start, params));
  }
  return findings;
}
