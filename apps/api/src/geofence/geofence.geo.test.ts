import { describe, expect, it } from 'vitest';
import { distanceMeters, evaluateGeofence } from './geofence.geo';

// Referenzpunkt: DariaTech-Standort (Beispielkoordinaten)
const SITE = { id: 'site-1', latitude: 52.520008, longitude: 13.404954, radiusM: 100 };

describe('Geofence-Geometrie', () => {
  it('berechnet Distanz 0 für identische Punkte', () => {
    expect(distanceMeters(SITE, SITE)).toBeCloseTo(0, 5);
  });

  it('berechnet eine plausible Distanz (~1,5 km Nord)', () => {
    // 0.0135° Breitengrad ≈ 1,5 km
    const d = distanceMeters(SITE, { latitude: 52.520008 + 0.0135, longitude: 13.404954 });
    expect(d).toBeGreaterThan(1400);
    expect(d).toBeLessThan(1600);
  });

  it("erkennt eine Position im Radius als 'inside'", () => {
    // ~11 m nördlich (0.0001°) – innerhalb 100 m
    const res = evaluateGeofence({ latitude: 52.520008 + 0.0001, longitude: 13.404954 }, [SITE]);
    expect(res.check).toBe('inside');
    expect(res.siteId).toBe('site-1');
    expect(res.distanceM).toBeLessThanOrEqual(100);
  });

  it("erkennt eine Position außerhalb des Radius als 'outside'", () => {
    const res = evaluateGeofence({ latitude: 52.520008 + 0.01, longitude: 13.404954 }, [SITE]);
    expect(res.check).toBe('outside');
    expect(res.siteId).toBe('site-1');
    expect(res.distanceM).toBeGreaterThan(100);
  });

  it("liefert 'no_signal' ohne Position", () => {
    expect(evaluateGeofence(undefined, [SITE]).check).toBe('no_signal');
  });

  it("liefert 'outside' ohne definierte Standorte", () => {
    const res = evaluateGeofence({ latitude: 52.52, longitude: 13.4 }, []);
    expect(res.check).toBe('outside');
    expect(res.siteId).toBeNull();
  });

  it('wählt den nächstgelegenen von mehreren Standorten', () => {
    const far = { id: 'far', latitude: 48.0, longitude: 11.0, radiusM: 100 };
    const near = { id: 'near', latitude: 52.520008, longitude: 13.404954, radiusM: 100 };
    const res = evaluateGeofence({ latitude: 52.520009, longitude: 13.404955 }, [far, near]);
    expect(res.siteId).toBe('near');
    expect(res.check).toBe('inside');
  });
});
