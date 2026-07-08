import type { ArbZgRuleParams, RulePackage } from './types';

/**
 * Regel-Layering (B-09): Gesetz -> Tarifvertrag -> Betriebsvereinbarung ->
 * individuelle Vereinbarung.
 *
 * Dokumentierte Auflösungsreihenfolge:
 *
 * 1. Basis ist IMMER das Gesetz (versioniertes Code-Regelpaket, ADR-0009).
 * 2. Ebenen werden in der Reihenfolge collective_agreement ->
 *    works_agreement -> individual angewendet; eine spaetere Ebene
 *    ueberschreibt je PARAMETER die fruehere (spezifischer gewinnt).
 * 3. Guenstigkeitsprinzip: Jeder Parameter hat eine deklarierte
 *    Schutzrichtung. Eine Abweichung in die UNGUENSTIGERE Richtung ist nur
 *    auf den Ebenen Tarifvertrag/Betriebsvereinbarung zulaessig (§ 7 ArbZG)
 *    und erfordert dort die Referenz auf ein `collective_agreement`-Objekt
 *    (B-08: ohne Referenz nicht aktivierbar). Individuelle Vereinbarungen
 *    duerfen ausschliesslich GUENSTIGER abweichen.
 * 4. Konflikte werfen einen EXPLIZITEN RuleConflictError - keine stille
 *    Priorisierung: (a) zwei Regelsaetze derselben Ebene setzen denselben
 *    Parameter auf verschiedene Werte, (b) eine individuelle Vereinbarung
 *    verschlechtert, (c) eine Abweichung ohne erforderliche Referenz.
 * 5. Gueltigkeit: Quellen wirken nur fuer Daten innerhalb
 *    [validFrom, validTo] - rueckwirkend angelegte Regelsaetze (B-10) wirken
 *    damit automatisch fuer alte Bewertungstage.
 *
 * > Hinweis: Ob eine konkrete ungünstigere Abweichung von einer gesetzlichen
 * > Öffnungsklausel gedeckt ist, ist eine Rechtsfrage des hinterlegten
 * > Tarifwerks - das System erzwingt die REFERENZ und dokumentiert die
 * > Herkunft, ersetzt aber keine Rechtsberatung.
 */

export type RuleLayer = 'law' | 'collective_agreement' | 'works_agreement' | 'individual';

/** Anwendungsreihenfolge der Ebenen (Gesetz zuerst, individuell zuletzt). */
export const RULE_LAYER_ORDER: readonly RuleLayer[] = [
  'law',
  'collective_agreement',
  'works_agreement',
  'individual',
];

/** Abweichender Regelsatz einer Ebene (Teilmenge der Parameter). */
export interface RuleSetSource {
  id?: string;
  name: string;
  layer: Exclude<RuleLayer, 'law'>;
  /** Referenz auf das legitimierende TV-/BV-Objekt (B-08). */
  collectiveAgreementId?: string | null;
  /** Gueltig ab (ISO-Datum, inklusiv). */
  validFrom: string;
  /** Gueltig bis (ISO-Datum, inklusiv) oder null/undefined fuer offen. */
  validTo?: string | null;
  params: Partial<ArbZgRuleParams>;
}

/** Expliziter Regel-Konflikt (B-09) - niemals still priorisieren. */
export class RuleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleConflictError';
  }
}

/**
 * Schutzrichtung je Parameter:
 * - 'lower':  kleinerer Wert schuetzt staerker (z. B. Hoechstarbeitszeit).
 * - 'higher': groesserer Wert schuetzt staerker (z. B. Ruhezeit, Pausen).
 * - 'neutral': keine Schutzrichtung; Abweichung ist dennoch
 *   mitbestimmungspflichtig und erfordert IMMER eine TV-/BV-Referenz,
 *   individuelle Abweichung ist unzulaessig (z. B. Kulanzfrist, ADR-0019).
 */
type Favorability = 'lower' | 'higher' | 'neutral';

export const PARAM_FAVORABILITY: Readonly<Record<keyof ArbZgRuleParams, Favorability>> = {
  maxDailyMinutesStandard: 'lower',
  maxDailyMinutesExtended: 'lower',
  minRestMinutes: 'higher',
  // Niedrigere Schwelle = Pause frueher erforderlich = schuetzender.
  breakThreshold1Minutes: 'lower',
  breakMinutesTier1: 'higher',
  breakThreshold2Minutes: 'lower',
  breakMinutesTier2: 'higher',
  // Kleinere Mindestabschnitte liessen Mikro-Pausen als Ruhepausen zaehlen.
  breakMinSegmentMinutes: 'higher',
  maxContinuousWorkMinutes: 'lower',
  openShiftGraceMinutes: 'neutral',
  // Branchenfenster (Baecker 22-5): tarifgebunden, keine Schutzrichtung.
  arbzgNightStartMinute: 'neutral',
  arbzgNightEndMinute: 'neutral',
};

/** Ist `candidate` gegenueber `current` eine Verschlechterung fuer Beschaeftigte? */
function isLessProtective(
  key: keyof ArbZgRuleParams,
  candidate: number,
  current: number,
): boolean {
  const direction = PARAM_FAVORABILITY[key];
  if (direction === 'lower') return candidate > current;
  if (direction === 'higher') return candidate < current;
  return false;
}

/** Herkunft eines wirksamen Parameters (Ebene + Regelsatz). */
export interface ParamProvenance {
  layer: RuleLayer;
  source: string;
}

export interface ResolvedRuleParams {
  params: ArbZgRuleParams;
  provenance: Record<keyof ArbZgRuleParams, ParamProvenance>;
}

function activeOn(source: RuleSetSource, isoDate: string): boolean {
  const to = source.validTo ?? null;
  return source.validFrom <= isoDate && (to === null || to >= isoDate);
}

const PARAM_KEYS = Object.keys(PARAM_FAVORABILITY) as ReadonlyArray<keyof ArbZgRuleParams>;

/**
 * Loest die fuer ein Datum wirksamen Parameter aus Gesetz + abweichenden
 * Regelsaetzen auf (Reihenfolge und Konfliktregeln siehe Modulkommentar).
 */
export function resolveEffectiveParams(
  isoDate: string,
  lawPackage: RulePackage,
  sources: readonly RuleSetSource[],
): ResolvedRuleParams {
  const params: ArbZgRuleParams = { ...lawPackage.params };
  const provenance = Object.fromEntries(
    PARAM_KEYS.map((key) => [key, { layer: 'law', source: lawPackage.id }]),
  ) as Record<keyof ArbZgRuleParams, ParamProvenance>;

  for (const layer of ['collective_agreement', 'works_agreement', 'individual'] as const) {
    const layerSources = sources.filter((s) => s.layer === layer && activeOn(s, isoDate));
    for (const key of PARAM_KEYS) {
      const setters = layerSources.filter((s) => s.params[key] !== undefined);
      if (setters.length === 0) continue;
      const values = new Set(setters.map((s) => s.params[key]));
      if (values.size > 1) {
        throw new RuleConflictError(
          `Regel-Konflikt auf Ebene '${layer}': Parameter '${key}' wird am ${isoDate} ` +
            `unterschiedlich gesetzt (${setters.map((s) => `'${s.name}'`).join(', ')}). ` +
            'Keine stille Priorisierung - Regelsaetze bereinigen.',
        );
      }
      const setter = setters[0]!;
      const value = setter.params[key]!;
      const direction = PARAM_FAVORABILITY[key];
      const worsens = isLessProtective(key, value, params[key]);

      if (layer === 'individual' && (worsens || direction === 'neutral')) {
        throw new RuleConflictError(
          direction === 'neutral'
            ? `Parameter '${key}' ist mitbestimmungspflichtig und kann nicht individuell ` +
              `vereinbart werden ('${setter.name}').`
            : `Günstigkeitsprinzip verletzt: Individuelle Vereinbarung '${setter.name}' setzt ` +
              `'${key}' auf ${value} und verschlechtert damit die wirksame Regelung (${params[key]}).`,
        );
      }
      if (
        layer !== 'individual' &&
        (worsens || direction === 'neutral') &&
        !setter.collectiveAgreementId
      ) {
        throw new RuleConflictError(
          `Regelsatz '${setter.name}' weicht bei '${key}' ab, referenziert aber kein ` +
            'collective_agreement-Objekt - ohne Referenz nicht aktivierbar (B-08, § 7 ArbZG).',
        );
      }

      params[key] = value;
      provenance[key] = { layer, source: setter.name };
    }
  }
  return { params, provenance };
}
