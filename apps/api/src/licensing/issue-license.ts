/**
 * Werkzeug zum Ausstellen einer ZeitVault-Lizenz (nur beim Hersteller).
 *
 * Der private Ed25519-Schlüssel liegt NIEMALS im Repository. Er wird über
 * `LICENSE_PRIVATE_KEY` (PEM, Zeilenumbrüche als \n) oder `LICENSE_PRIVATE_KEY_FILE`
 * (Pfad) bereitgestellt. Der zugehörige öffentliche Schlüssel wird beim Kunden
 * als `LICENSE_PUBLIC_KEY` konfiguriert (ADR-0013).
 *
 * Nutzung:
 *   # Einmalig Schlüsselpaar erzeugen (öffentlichen Teil ausliefern/konfigurieren):
 *   tsx src/licensing/issue-license.ts --genkey
 *
 *   # Lizenz signieren:
 *   LICENSE_PRIVATE_KEY_FILE=./license-private.pem \
 *   tsx src/licensing/issue-license.ts \
 *     --tenant default --customer "Muster GmbH" --tier "Team 10" --seats 10 --days 365
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { LicensePayload } from '@zeitvault/types';
import { generateLicenseKeypair, signLicenseToken } from './license.crypto';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadPrivateKey(): string {
  const inline = process.env.LICENSE_PRIVATE_KEY;
  const file = process.env.LICENSE_PRIVATE_KEY_FILE;
  if (inline && inline.trim()) return inline.replace(/\\n/g, '\n');
  if (file) return readFileSync(file, 'utf8');
  throw new Error(
    'Kein privater Schlüssel: LICENSE_PRIVATE_KEY (PEM) oder LICENSE_PRIVATE_KEY_FILE (Pfad) setzen. Für ein neues Paar: --genkey.',
  );
}

function main(): void {
  if (process.argv.includes('--genkey')) {
    const { publicKey, privateKey } = generateLicenseKeypair();
    process.stderr.write(
      '# Neues Ed25519-Schlüsselpaar. Öffentlichen Schlüssel beim Kunden als LICENSE_PUBLIC_KEY setzen,\n' +
        '# privaten Schlüssel SICHER verwahren (OpenBao/SOPS), NIE committen.\n\n',
    );
    process.stdout.write(`### PUBLIC KEY (LICENSE_PUBLIC_KEY) ###\n${publicKey}\n`);
    process.stdout.write(`### PRIVATE KEY (geheim) ###\n${privateKey}\n`);
    return;
  }

  const tenantId = arg('tenant') ?? 'default';
  const customer = arg('customer') ?? 'Unbenannter Kunde';
  const tier = arg('tier') ?? 'Team';
  const seats = Number(arg('seats') ?? '5');
  const days = Number(arg('days') ?? '365');
  if (!Number.isInteger(seats) || seats <= 0) throw new Error('--seats muss eine positive Ganzzahl sein.');
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days muss positiv sein.');

  const now = new Date();
  const validUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const payload: LicensePayload = {
    licenseId: randomUUID(),
    tenantId,
    customer,
    tier,
    seats,
    issuedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
    features: [],
  };

  const token = signLicenseToken(payload, loadPrivateKey());
  process.stderr.write(
    `# Lizenz für ${customer} (${tier}, ${seats} Sitzplätze), gültig bis ${validUntil.toISOString().slice(0, 10)}\n`,
  );
  process.stdout.write(`${token}\n`);
}

main();
