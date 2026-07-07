import type { LocationCheck, StampLocation } from '@zeitvault/types';

export interface SitePoint {
  id: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine-Distanz zwischen zwei Koordinaten in Metern. */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeofenceEvaluation {
  check: LocationCheck;
  siteId: string | null;
  distanceM: number | null;
}

/**
 * Bewertet eine Position gegen die aktiven Standorte: 'inside', wenn sie im
 * Radius des NÄCHSTGELEGENEN Standorts liegt, sonst 'outside'. Ohne Position
 * 'no_signal', ohne Standorte 'outside'. Der getroffene Standort und die
 * gerundete Distanz werden zurückgegeben (Datensparsamkeit: keine Rohkoordinaten).
 */
export function evaluateGeofence(
  location: StampLocation | undefined,
  sites: SitePoint[],
): GeofenceEvaluation {
  if (!location) {
    return { check: 'no_signal', siteId: null, distanceM: null };
  }
  if (sites.length === 0) {
    return { check: 'outside', siteId: null, distanceM: null };
  }
  let nearest: SitePoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const site of sites) {
    const d = distanceMeters(location, site);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = site;
    }
  }
  if (!nearest) {
    return { check: 'outside', siteId: null, distanceM: null };
  }
  const distanceM = Math.round(nearestDistance);
  const inside = nearestDistance <= nearest.radiusM;
  return { check: inside ? 'inside' : 'outside', siteId: nearest.id, distanceM };
}
