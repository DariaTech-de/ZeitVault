import { describe, expect, it } from 'vitest';
import { createDeviceToken, hashSecret, parseDeviceToken, safeHashEqual } from './terminal.token';

describe('Terminal-Token', () => {
  it('erzeugt ein Token, aus dem Mandant und Hash rekonstruierbar sind', () => {
    const { token, tokenHash } = createDeviceToken('default');
    const parsed = parseDeviceToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.tenantId).toBe('default');
    expect(parsed?.tokenHash).toBe(tokenHash);
  });

  it('funktioniert mit Mandanten-IDs, die Sonderzeichen enthalten', () => {
    const { token, tokenHash } = createDeviceToken('kunde-müller_2026');
    const parsed = parseDeviceToken(token);
    expect(parsed?.tenantId).toBe('kunde-müller_2026');
    expect(parsed?.tokenHash).toBe(tokenHash);
  });

  it('speichert nur den Hash, nicht das Geheimnis', () => {
    const { token, tokenHash } = createDeviceToken('default');
    const secret = token.slice(token.indexOf('.') + 1);
    expect(tokenHash).toBe(hashSecret(secret));
    expect(tokenHash).not.toContain(secret);
  });

  it('lehnt strukturell defekte Token ab', () => {
    expect(parseDeviceToken('ohnepunkt')).toBeNull();
    expect(parseDeviceToken('.secret')).toBeNull();
    expect(parseDeviceToken('tenant.')).toBeNull();
    expect(parseDeviceToken('')).toBeNull();
  });

  it('zwei Token unterscheiden sich (zufälliges Geheimnis)', () => {
    const a = createDeviceToken('default');
    const b = createDeviceToken('default');
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('safeHashEqual vergleicht korrekt', () => {
    const h = hashSecret('abc');
    expect(safeHashEqual(h, hashSecret('abc'))).toBe(true);
    expect(safeHashEqual(h, hashSecret('xyz'))).toBe(false);
    expect(safeHashEqual(h, 'kurz')).toBe(false);
  });
});
