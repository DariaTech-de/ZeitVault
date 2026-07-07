'use client';

import { useCallback, useEffect, useState } from 'react';
import { type TerminalStampResult, kioskStamp } from '@/lib/api';

const TOKEN_KEY = 'zeitvault.kiosk.token';
const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};
const STATE_LABEL: Record<string, string> = { out: 'abwesend', in: 'anwesend', break: 'in Pause' };

export function KioskScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [uid, setUid] = useState('');
  const [result, setResult] = useState<TerminalStampResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  const saveToken = useCallback(() => {
    const t = tokenInput.trim();
    if (!t) return;
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
    setToken(t);
    setTokenInput('');
  }, [tokenInput]);

  const stamp = useCallback(async () => {
    if (!token || uid.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await kioskStamp(token, { nfcUid: uid.trim() });
      setResult(res);
      setUid('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stempeln fehlgeschlagen.';
      setError(message.replace(/^HTTP \d+:\s*/, '').slice(0, 200));
    } finally {
      setBusy(false);
    }
  }, [token, uid]);

  // Auto-Reset der Anzeige nach ein paar Sekunden (Kiosk-Betrieb).
  useEffect(() => {
    if (!result && !error) return;
    const done = () => {
      setResult(null);
      setError(null);
    };
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      if (Date.now() - start > 4000) done();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result, error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-surface-2 to-bg px-6 py-12 text-center">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-teal text-white [box-shadow:var(--shadow-sm)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-6 w-6">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5l3.2 1.9" />
          </svg>
        </span>
        <span className="text-2xl font-semibold tracking-tight">ZeitVault Terminal</span>
      </div>

      {!token ? (
        <div className="w-full max-w-md space-y-3 rounded-card border border-line bg-surface p-6 text-left [box-shadow:var(--shadow-sm)]">
          <h1 className="text-lg font-semibold">Terminal einrichten</h1>
          <p className="text-sm text-ink-muted">Geräte-Token aus der Verwaltung einfügen. Es wird lokal auf diesem Gerät gespeichert.</p>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Geräte-Token"
            className="mono w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-line-strong"
          />
          <button
            type="button"
            onClick={saveToken}
            className="w-full rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary [box-shadow:var(--shadow-sm)] hover:bg-primary-hover"
          >
            Terminal aktivieren
          </button>
        </div>
      ) : (
        <div className="w-full max-w-lg space-y-6">
          {result ? (
            <div className="rounded-card border border-line bg-surface p-8 [box-shadow:var(--shadow-sm)]">
              <div className="grid mx-auto mb-3 h-14 w-14 place-items-center rounded-full bg-pos-bg text-pos">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-8 w-8">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-2xl font-semibold">{result.employeeName}</div>
              <div className="mono mt-1 text-sm text-ink-faint">Personalnr. {result.personnelNumber}</div>
              <div className="mt-4 text-xl font-semibold text-primary">{KIND_LABEL[result.kind] ?? result.kind}</div>
              <div className="mt-1 text-sm text-ink-muted">Status: {STATE_LABEL[result.state] ?? result.state}</div>
            </div>
          ) : error ? (
            <div className="rounded-card border border-line bg-neg-bg p-8 text-neg [box-shadow:var(--shadow-sm)]">
              <div className="text-lg font-semibold">Nicht möglich</div>
              <div className="mt-2 text-sm">{error}</div>
            </div>
          ) : (
            <div className="rounded-card border border-line bg-surface p-8 [box-shadow:var(--shadow-sm)]">
              <p className="text-lg font-medium text-ink-muted">Chip an das Terminal halten</p>
              <p className="mt-1 text-sm text-ink-faint">oder NFC-UID eingeben und bestätigen</p>
              <input
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void stamp();
                }}
                placeholder="NFC-UID"
                className="mono mt-5 w-full rounded-[10px] border border-line bg-surface-2 px-4 py-3 text-center text-lg outline-none focus:border-line-strong"
              />
              <button
                type="button"
                disabled={busy || uid.trim().length < 2}
                onClick={() => void stamp()}
                className="mt-4 w-full rounded-[10px] bg-primary px-4 py-3 text-base font-semibold text-on-primary [box-shadow:var(--shadow-sm)] hover:bg-primary-hover disabled:opacity-50"
              >
                Stempeln
              </button>
            </div>
          )}
          <p className="text-xs text-ink-faint">
            Fingerabdruck wird lokal am Terminal geprüft. Standardmäßig keine Standortdaten.
          </p>
        </div>
      )}
    </main>
  );
}
