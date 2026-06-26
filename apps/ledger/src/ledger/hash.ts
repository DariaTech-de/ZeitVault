import { createHash } from 'node:crypto';

/** Felder, die in den Hash eines Audit-Ereignisses eingehen. */
export interface HashableEvent {
  sequence: number;
  tenantId: string;
  action: string;
  actorId: string;
  subjectType: string;
  subjectId: string;
  /** ISO-8601-Zeitstempel als String (exakt so gehasht, daher als Text persistiert). */
  recordedAt: string;
  payload: Record<string, unknown>;
  /** Hash des Vorgaengers oder null fuer das erste Ereignis. */
  prevHash: string | null;
}

/** Deterministische JSON-Serialisierung mit rekursiv sortierten Schluesseln. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Berechnet den SHA-256-Hash eines Ereignisses inklusive `prevHash`. Dadurch
 * entsteht eine fortlaufende, manipulationsevidente Kette (ADR-0006).
 */
export function computeEventHash(event: HashableEvent): string {
  const canonical = [
    String(event.sequence),
    event.tenantId,
    event.action,
    event.actorId,
    event.subjectType,
    event.subjectId,
    event.recordedAt,
    stableStringify(event.payload),
    event.prevHash ?? '',
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
