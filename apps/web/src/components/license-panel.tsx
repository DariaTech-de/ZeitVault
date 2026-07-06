'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import { Donut } from '@/components/fiori/tile';
import { Button, Card, ErrorNote, Field, PageHead, TextInput } from '@/components/fiori/ui';
import { type LicenseStatus, activateLicense, createEmployee, fetchLicenseStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

export function LicensePanel() {
  const { identity } = useAuth();
  const isAdmin = identity?.roles.includes('admin') ?? false;
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [token, setToken] = useState('');
  const [personnelNumber, setPersonnelNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (id: Identity) => {
    try {
      setStatus(await fetchLicenseStatus(id));
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const onActivate = useCallback(async () => {
    if (!identity || token.trim().length === 0) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const next = await activateLicense(identity, token.trim());
      setStatus(next);
      setToken('');
      setNotice(`Lizenz aktiviert: ${next.tier} · ${next.seats} Sitzplätze.`);
    } catch (err) {
      setError(parseError(err, 'Lizenz konnte nicht aktiviert werden.'));
    } finally {
      setPending(false);
    }
  }, [identity, token]);

  const onCreateEmployee = useCallback(async () => {
    if (!identity || personnelNumber.trim().length === 0 || displayName.trim().length === 0) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await createEmployee(identity, { personnelNumber: personnelNumber.trim(), displayName: displayName.trim() });
      setPersonnelNumber('');
      setDisplayName('');
      setNotice(`Mitarbeitende/r angelegt: ${displayName.trim()}.`);
      await refresh(identity);
    } catch (err) {
      setError(parseError(err, 'Mitarbeitende/r konnte nicht angelegt werden.'));
    } finally {
      setPending(false);
    }
  }, [identity, personnelNumber, displayName, refresh]);

  const tone = status ? (status.valid ? 'positive' : status.licensed ? 'warning' : 'neutral') : 'neutral';
  const full = status ? status.seatsUsed >= status.seats : false;

  return (
    <>
      <PageHead
        eyebrow="Verwaltung · Lizenzierung"
        title="Lizenz und Sitzplätze"
        sub="ZeitVault wird pro Mitarbeitenden (Sitzplatz) lizenziert. Die Lizenz ist ein signiertes Offline-Token; ist das Kontingent belegt, können keine weiteren Mitarbeitenden angelegt werden."
        right={status && <StatusPill tone={tone}>{status.valid ? 'Lizenz gültig' : status.licensed ? 'Abgelaufen' : 'Testmodus'}</StatusPill>}
      />

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && (
        <div className="mb-4">
          <MessageStrip tone="positive">{notice}</MessageStrip>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="text-base font-semibold">Sitzplätze</h2>
          {status ? (
            <>
              <div className="mt-4 flex items-center gap-5">
                <Donut value={status.seatsUsed} max={status.seats} colorVar={full ? '--neg' : '--primary'} />
                <div>
                  <div className="mono text-2xl font-semibold">
                    {status.seatsUsed}
                    <span className="text-ink-faint"> / {status.seats}</span>
                  </div>
                  <div className="text-[13px] text-ink-muted">belegt / verfügbar</div>
                  <div className="mono mt-1 text-[13px] text-ink-faint">{status.seatsRemaining} frei</div>
                </div>
              </div>
              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <Line k="Paket" v={status.tier} />
                {status.customer && <Line k="Kunde" v={status.customer} />}
                <Line k="Gültig bis" v={status.validUntil ? status.validUntil.slice(0, 10) : '—'} />
              </dl>
              <div className="mt-4">
                <MessageStrip tone={status.valid ? 'info' : 'warning'}>{status.reason}</MessageStrip>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">Lade Lizenzstatus …</p>
          )}
        </Card>

        <div className="space-y-5">
          {isAdmin ? (
            <>
              <Card className="p-5">
                <h2 className="text-base font-semibold">Lizenz aktivieren</h2>
                <p className="mt-1 text-[13px] text-ink-muted">
                  Signiertes Lizenz-Token des Herstellers einfügen. Signatur, Mandant und Laufzeit werden geprüft.
                </p>
                <div className="mt-3 space-y-3">
                  <Field label="Lizenz-Token">
                    <textarea
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      rows={4}
                      placeholder="base64url(payload).base64url(signature)"
                      className="mono w-full resize-y rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
                    />
                  </Field>
                  <Button variant="primary" disabled={pending || token.trim().length === 0} onClick={() => void onActivate()}>
                    Lizenz aktivieren
                  </Button>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">Mitarbeitende/n anlegen</h2>
                <p className="mt-1 text-[13px] text-ink-muted">Belegt einen Sitzplatz. Bei erschöpftem Kontingent wird die Anlage abgelehnt.</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Personalnummer">
                    <TextInput value={personnelNumber} maxLength={64} placeholder="z. B. 1005" onChange={(e) => setPersonnelNumber(e.target.value)} />
                  </Field>
                  <Field label="Name">
                    <TextInput value={displayName} maxLength={200} placeholder="Vor- und Nachname" onChange={(e) => setDisplayName(e.target.value)} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Button
                    disabled={pending || full || personnelNumber.trim().length === 0 || displayName.trim().length === 0}
                    onClick={() => void onCreateEmployee()}
                  >
                    {full ? 'Kein Sitzplatz frei' : 'Anlegen'}
                  </Button>
                </div>
              </Card>
            </>
          ) : (
            <MessageStrip tone="info">Die Lizenzverwaltung ist der Administration vorbehalten. Sie sehen den aktuellen Status links.</MessageStrip>
          )}

          <MessageStrip tone="info">
            Die Lizenz wird offline mit dem hinterlegten öffentlichen Schlüssel geprüft (kein Phone-Home). Jede Aktivierung erzeugt ein
            revisionssicheres Audit-Ereignis.
          </MessageStrip>
        </div>
      </div>
    </>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-faint">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function parseError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    // API liefert "HTTP 409: {json}"; die Server-Meldung extrahieren.
    const match = err.message.match(/\{.*\}/s);
    if (match) {
      try {
        const body = JSON.parse(match[0]) as { message?: string | string[] };
        if (body.message) return Array.isArray(body.message) ? body.message.join(', ') : body.message;
      } catch {
        /* ignore */
      }
    }
    return err.message;
  }
  return fallback;
}
