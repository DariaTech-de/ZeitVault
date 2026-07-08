import type { StampKind } from './types';

/**
 * Rundung von Stempelzeiten (B-12): Gerundet wird — wenn ueberhaupt — am
 * EREIGNIS beim Eintragen, nie nachtraeglich je Intervall oder je Zeitscheibe.
 * Nur so bleibt die Rundung eine dokumentierte Erfassungsregel statt einer
 * systematischen Verzerrung: Zwischengrenzen (lokale Mitternacht, spaeter
 * Paragraf-3b-Fenster) erzeugen Zeitscheiben, und je Scheibe zu runden wuerde
 * sich mit Nachtarbeit korreliert aufsummieren.
 *
 * Der Standard ist IMMER 'none' (keine Rundung). Ein anderer Modus ist eine
 * bewusste, je Mandant/Betriebsvereinbarung konfigurierte Erfassungsregel;
 * die Konfigurationsanbindung folgt mit B-12 (Regelschicht, Schnitt 3).
 */
export type StampRoundingMode = 'none' | 'nearest_minute' | 'down_minute' | 'up_minute';

/**
 * Rundungsregel je Ereignisart. Asymmetrische Betriebsvereinbarungs-Regeln
 * (z. B. Kommen aufrunden, Gehen abrunden — oder umgekehrt) sind damit
 * abbildbar; fachlich zulaessig sind sie nur per Betriebsvereinbarung und
 * NIE als Voreinstellung.
 */
export type StampRoundingConfig = Readonly<Record<StampKind, StampRoundingMode>>;

/** Voreinstellung: keine Rundung, fuer keine Ereignisart. */
export const NO_STAMP_ROUNDING: StampRoundingConfig = {
  clock_in: 'none',
  break_start: 'none',
  break_end: 'none',
  clock_out: 'none',
};

const MINUTE_MS = 60_000;

/** Rundet einen Zeitstempel gemaess Modus auf die ganze Minute. */
export function roundStampTime(at: Date, mode: StampRoundingMode): Date {
  const ms = at.getTime();
  if (Number.isNaN(ms)) {
    throw new Error('Ungueltiger Zeitstempel.');
  }
  switch (mode) {
    case 'none':
      return at;
    case 'nearest_minute':
      return new Date(Math.round(ms / MINUTE_MS) * MINUTE_MS);
    case 'down_minute':
      return new Date(Math.floor(ms / MINUTE_MS) * MINUTE_MS);
    case 'up_minute':
      return new Date(Math.ceil(ms / MINUTE_MS) * MINUTE_MS);
  }
}

/** Wendet die je Ereignisart konfigurierte Rundung an (Standard: keine). */
export function applyStampRounding(
  kind: StampKind,
  at: Date,
  config: StampRoundingConfig = NO_STAMP_ROUNDING,
): Date {
  return roundStampTime(at, config[kind]);
}

/**
 * Rundungskonfiguration aus dem wirksamen Regelwerk (B-12): die vier
 * `rounding*`-Parameter eines aufgeloesten Regelpakets als StampRoundingConfig.
 */
export function stampRoundingConfigFrom(params: {
  roundingClockIn: StampRoundingMode;
  roundingBreakStart: StampRoundingMode;
  roundingBreakEnd: StampRoundingMode;
  roundingClockOut: StampRoundingMode;
}): StampRoundingConfig {
  return {
    clock_in: params.roundingClockIn,
    break_start: params.roundingBreakStart,
    break_end: params.roundingBreakEnd,
    clock_out: params.roundingClockOut,
  };
}
