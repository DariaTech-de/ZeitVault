import { describe, expect, it } from 'vitest';
import { ARBZG_2026_V1 } from './rule-packages';
import { evaluateRestCompensation, restPeriodsFromShifts } from './rest-compensation';
import type { RulePackage } from './types';

// B-03 (Delta zu Schnitt 1): § 5 Abs. 2 ArbZG - die Verkuerzung der Ruhezeit
// auf bis zu 10 h (Ausnahmebranchen, per TV-Regelsatz) verlangt den AUSGLEICH:
// innerhalb eines Kalendermonats / vier Wochen muss eine andere Ruhezeit auf
// mindestens 12 h verlaengert werden.
const d = (iso: string): Date => new Date(iso);

/** TV-Paket einer Ausnahmebranche: Ruhezeit auf 10 h verkuerzt. */
const reducedPkg: RulePackage = {
  ...ARBZG_2026_V1,
  params: { ...ARBZG_2026_V1.params, minRestMinutes: 10 * 60 },
};
const pkg = () => reducedPkg;

describe('evaluateRestCompensation (B-03)', () => {
  it('verkuerzte Ruhezeit MIT 12-h-Ausgleich innerhalb der Frist: kein Befund', () => {
    const rests = [
      { start: d('2026-06-01T18:00:00Z'), end: d('2026-06-02T04:30:00Z') }, // 10,5 h (verkuerzt)
      { start: d('2026-06-02T14:00:00Z'), end: d('2026-06-03T04:00:00Z') }, // 14 h (Ausgleich)
    ];
    expect(evaluateRestCompensation(rests, '2026-06-30', pkg, d('2026-07-08T00:00:00Z'))).toEqual(
      [],
    );
  });

  it('Frist abgelaufen ohne Ausgleich: sicherer Verstoss', () => {
    const rests = [
      { start: d('2026-04-01T18:00:00Z'), end: d('2026-04-02T04:30:00Z') }, // 10,5 h
      { start: d('2026-04-02T14:00:00Z'), end: d('2026-04-03T01:00:00Z') }, // 11 h (kein Ausgleich)
    ];
    const findings = evaluateRestCompensation(rests, '2026-06-30', pkg, d('2026-07-08T00:00:00Z'));
    expect(findings.map((f) => f.finding.code)).toContain('REST_COMPENSATION_MISSING');
    expect(findings[0]?.finding.severity).toBe('violation');
    expect(findings[0]?.date).toBe('2026-04-01');
  });

  it('Frist laeuft noch: Warnung vor Fristablauf, kein Verstoss', () => {
    const today = d('2026-07-08T00:00:00Z');
    const rests = [
      { start: d('2026-07-01T18:00:00Z'), end: d('2026-07-02T04:30:00Z') }, // 10,5 h, Frist bis 02.08.
    ];
    const findings = evaluateRestCompensation(rests, '2026-07-08', pkg, today);
    expect(findings.map((f) => f.finding.code)).toContain('REST_COMPENSATION_PENDING');
    expect(findings[0]?.finding.severity).toBe('warning');
  });

  it('Ruhezeiten unterhalb des wirksamen Minimums sind KEIN Ausgleichsfall (bereits Verstoss)', () => {
    const rests = [
      { start: d('2026-06-01T18:00:00Z'), end: d('2026-06-02T03:00:00Z') }, // 9 h < 10 h Minimum
    ];
    expect(
      evaluateRestCompensation(rests, '2026-06-30', pkg, d('2026-07-08T00:00:00Z')),
    ).toEqual([]);
  });
});

describe('restPeriodsFromShifts', () => {
  it('liefert die Ruhezeiten zwischen abgeschlossenen Schichten', () => {
    const shifts = [
      { startAt: d('2026-06-01T06:00:00Z'), endAt: d('2026-06-01T14:00:00Z') },
      { startAt: d('2026-06-02T06:00:00Z'), endAt: d('2026-06-02T14:00:00Z') },
      { startAt: d('2026-06-03T06:00:00Z'), endAt: null }, // offen/unresolved
      { startAt: d('2026-06-04T06:00:00Z'), endAt: d('2026-06-04T14:00:00Z') },
    ];
    const rests = restPeriodsFromShifts(shifts);
    // Die Ruhe VOR der offenen Schicht ist ableitbar (beide Grenzen bekannt);
    // die Ruhe NACH ihr nicht (Ende unbekannt, ADR-0019) - sie fehlt.
    expect(rests).toHaveLength(2);
    expect(rests[0]?.start.toISOString()).toBe('2026-06-01T14:00:00.000Z');
    expect(rests[0]?.end.toISOString()).toBe('2026-06-02T06:00:00.000Z');
    expect(rests[1]?.start.toISOString()).toBe('2026-06-02T14:00:00.000Z');
    expect(rests[1]?.end.toISOString()).toBe('2026-06-03T06:00:00.000Z');
  });
});
