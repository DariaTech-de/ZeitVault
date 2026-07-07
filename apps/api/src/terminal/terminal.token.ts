import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Geräte-Token eines Terminals. Format: `<base64url(tenantId)>.<secret>`.
 * Der Mandant ist im Token kodiert (nicht geheim), damit die Authentifizierung
 * den RLS-Kontext setzen kann; die Sicherheit liegt im `secret`, von dem der
 * Server nur den SHA-256-Hash speichert (ADR-0015).
 */

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function createDeviceToken(tenantId: string): { token: string; tokenHash: string } {
  const secret = randomBytes(32).toString('base64url');
  const token = `${Buffer.from(tenantId, 'utf8').toString('base64url')}.${secret}`;
  return { token, tokenHash: hashSecret(secret) };
}

export interface ParsedToken {
  tenantId: string;
  tokenHash: string;
}

export function parseDeviceToken(token: string): ParsedToken | null {
  const trimmed = token.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  const b64Tenant = trimmed.slice(0, dot);
  const secret = trimmed.slice(dot + 1);
  let tenantId: string;
  try {
    tenantId = Buffer.from(b64Tenant, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!tenantId || tenantId.length > 64) return null;
  return { tenantId, tokenHash: hashSecret(secret) };
}

/** Konstantzeit-Vergleich zweier Hex-Hashes gleicher Länge. */
export function safeHashEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
