import { describe, expect, it } from 'vitest';
import type { LicensePayload } from '@zeitvault/types';
import { generateLicenseKeypair, signLicenseToken, verifyLicenseToken } from './license.crypto';

function samplePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    licenseId: '00000000-0000-4000-8000-000000000abc',
    tenantId: 'default',
    customer: 'Muster GmbH',
    tier: 'Team 10',
    seats: 10,
    issuedAt: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    features: [],
    ...overrides,
  };
}

describe('Lizenz-Krypto (Ed25519)', () => {
  const { publicKey, privateKey } = generateLicenseKeypair();

  it('signiert und verifiziert ein gültiges Token (Round-Trip)', () => {
    const token = signLicenseToken(samplePayload(), privateKey);
    const result = verifyLicenseToken(token, publicKey);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.seats).toBe(10);
      expect(result.payload.tenantId).toBe('default');
      expect(result.payload.customer).toBe('Muster GmbH');
    }
  });

  it('lehnt ein manipuliertes Payload ab (Signatur passt nicht mehr)', () => {
    const token = signLicenseToken(samplePayload({ seats: 10 }), privateKey);
    const [, sig] = token.split('.');
    // Payload auf 9999 Sitzplätze faken, alte Signatur behalten
    const forgedPayload = Buffer.from(JSON.stringify(samplePayload({ seats: 9999 }))).toString('base64url');
    const forged = `${forgedPayload}.${sig}`;
    const result = verifyLicenseToken(forged, publicKey);
    expect(result.ok).toBe(false);
  });

  it('lehnt ein Token ab, das mit einem fremden Schlüssel signiert wurde', () => {
    const attacker = generateLicenseKeypair();
    const token = signLicenseToken(samplePayload(), attacker.privateKey);
    const result = verifyLicenseToken(token, publicKey);
    expect(result.ok).toBe(false);
  });

  it('lehnt ein strukturell defektes Token ab', () => {
    expect(verifyLicenseToken('nur-ein-teil', publicKey).ok).toBe(false);
    expect(verifyLicenseToken('a.b.c', publicKey).ok).toBe(false);
    expect(verifyLicenseToken('', publicKey).ok).toBe(false);
  });

  it('meldet einen fehlenden/ungültigen öffentlichen Schlüssel als Fehler', () => {
    const token = signLicenseToken(samplePayload(), privateKey);
    const result = verifyLicenseToken(token, '');
    expect(result.ok).toBe(false);
  });

  it('lehnt ein korrekt signiertes Token mit schemawidrigem Payload ab (seats = 0)', () => {
    // Gültig signieren, aber mit ungültigem Inhalt (seats = 0) – die
    // Schemaprüfung nach der Signaturprüfung muss dennoch ablehnen.
    const invalid = { ...samplePayload(), seats: 0 } as unknown as LicensePayload;
    const token = signLicenseToken(invalid, privateKey);
    const result = verifyLicenseToken(token, publicKey);
    expect(result.ok).toBe(false);
  });
});
