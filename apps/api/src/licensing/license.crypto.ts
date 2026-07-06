import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { type LicensePayload, licensePayloadSchema } from '@zeitvault/types';

/**
 * Lizenz-Token = `base64url(JSON(payload)).base64url(ed25519-signature)`.
 * Ed25519 (algorithm = null). Signiert wird exakt der base64url-kodierte
 * Payload-String, um Kanonisierungsprobleme zu vermeiden. Der private Schluessel
 * liegt ausschliesslich beim Hersteller; der Server kennt nur den oeffentlichen
 * Schluessel (ADR-0013).
 */

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function toPublicKey(pem: string): KeyObject {
  return createPublicKey(pem);
}

/** Signiert einen Lizenz-Payload mit dem privaten Ed25519-Schluessel (PEM/PKCS8). */
export function signLicenseToken(payload: LicensePayload, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = cryptoSign(null, Buffer.from(payloadB64, 'utf8'), key);
  return `${payloadB64}.${b64url(signature)}`;
}

export type VerifyResult =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: string };

/**
 * Verifiziert Signatur und Struktur eines Lizenz-Tokens. Prueft NICHT die
 * Gueltigkeitsdauer oder den Mandanten – das erfolgt fachlich im Service.
 */
export function verifyLicenseToken(token: string, publicKeyPem: string): VerifyResult {
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'Ungueltiges Token-Format.' };
  }
  const [payloadB64, sigB64] = parts;

  let publicKey: KeyObject;
  try {
    publicKey = toPublicKey(publicKeyPem);
  } catch {
    return { ok: false, reason: 'Oeffentlicher Lizenzschluessel ist nicht konfiguriert oder ungueltig.' };
  }

  let signatureValid = false;
  try {
    signatureValid = cryptoVerify(
      null,
      Buffer.from(payloadB64, 'utf8'),
      publicKey,
      Buffer.from(sigB64, 'base64url'),
    );
  } catch {
    return { ok: false, reason: 'Signatur konnte nicht geprueft werden.' };
  }
  if (!signatureValid) {
    return { ok: false, reason: 'Signatur ungueltig – Lizenz stammt nicht vom Hersteller oder wurde manipuliert.' };
  }

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'Lizenzinhalt ist kein gueltiges JSON.' };
  }
  const parsed = licensePayloadSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: 'Lizenzinhalt entspricht nicht dem erwarteten Schema.' };
  }
  return { ok: true, payload: parsed.data };
}

/** Erzeugt ein Ed25519-Schluesselpaar (PEM). Fuer das Ausstell-Werkzeug/Tests. */
export function generateLicenseKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}
