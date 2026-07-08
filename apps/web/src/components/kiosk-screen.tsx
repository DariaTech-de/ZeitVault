'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type KioskIdentifyResult,
  type TerminalStampResult,
  fetchKioskPhotoUrl,
  kioskIdentify,
  kioskStamp,
} from '@/lib/api';

const TOKEN_KEY = 'zeitvault.kiosk.token';

const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};

type Mode = 'nfc' | 'personnel';
type Phase = 'idle' | 'identified' | 'done' | 'error';

interface RecentEntry {
  name: string;
  kind: string;
  at: string; // HH:MM (lokal)
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '·';
}

/** Tageszeitabhängige Begrüßung. */
function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function clockTime(d: Date): string {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function clockDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Kontextabhängige Aktionen (Kommen/Gehen/Pause) je nach aktuellem Status. */
function actionsFor(state: 'out' | 'in' | 'break'): Array<{ kind: string; label: string; tone: 'kommen' | 'gehen' | 'pause' }> {
  if (state === 'out') return [{ kind: 'clock_in', label: 'KOMMEN', tone: 'kommen' }];
  if (state === 'in')
    return [
      { kind: 'clock_out', label: 'GEHEN', tone: 'gehen' },
      { kind: 'break_start', label: 'PAUSE', tone: 'pause' },
    ];
  return [{ kind: 'break_end', label: 'PAUSE BEENDEN', tone: 'pause' }];
}

export function KioskScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');

  const [now, setNow] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<Mode>('nfc');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [person, setPerson] = useState<KioskIdentifyResult | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TerminalStampResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  const photoRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  // Live-Uhr.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const revokePhoto = useCallback(() => {
    if (photoRef.current) {
      URL.revokeObjectURL(photoRef.current);
      photoRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    revokePhoto();
    setPhase('idle');
    setPerson(null);
    setPhotoUrl(null);
    setResult(null);
    setError(null);
    setValue('');
  }, [revokePhoto]);

  useEffect(() => () => revokePhoto(), [revokePhoto]);

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

  const identifier = useCallback((): { nfcUid?: string; personnelNumber?: string } => {
    const v = value.trim();
    return mode === 'nfc' ? { nfcUid: v } : { personnelNumber: v };
  }, [mode, value]);

  const identify = useCallback(async () => {
    if (!token || value.trim().length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const p = await kioskIdentify(token, identifier());
      setPerson(p);
      setPhase('identified');
      revokePhoto();
      setPhotoUrl(null);
      if (p.hasPhoto) {
        const url = await fetchKioskPhotoUrl(token, p.employeeId);
        photoRef.current = url;
        setPhotoUrl(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nicht erkannt.');
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }, [token, value, identifier, revokePhoto]);

  const doStamp = useCallback(
    async (kind: string) => {
      if (!token || !person) return;
      setBusy(true);
      setError(null);
      try {
        const res = await kioskStamp(token, { ...identifier(), kind });
        setResult(res);
        setPhase('done');
        setRecent((prev) =>
          [{ name: res.employeeName, kind: res.kind, at: clockTime(new Date()) }, ...prev].slice(0, 4),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Stempeln fehlgeschlagen.');
        setPhase('error');
      } finally {
        setBusy(false);
      }
    },
    [token, person, identifier],
  );

  // Auto-Reset nach Ergebnis/Fehler (Kiosk-Betrieb).
  useEffect(() => {
    if (phase !== 'done' && phase !== 'error') return;
    const t = setTimeout(reset, phase === 'done' ? 5000 : 3500);
    return () => clearTimeout(t);
  }, [phase, reset]);

  // Fokus zurück aufs Eingabefeld im Leerlauf (für NFC-Reader als Tastatur).
  useEffect(() => {
    if (token && phase === 'idle') inputRef.current?.focus();
  }, [token, phase]);

  // ---- Token-Einrichtung -----------------------------------------------------
  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#0b1220] px-6 py-12 text-center text-white">
        <Brand />
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-left">
          <h1 className="text-lg font-semibold">Terminal einrichten</h1>
          <p className="text-sm text-white/60">
            Geräte-Token aus der Verwaltung einfügen. Es wird lokal auf diesem Gerät gespeichert.
          </p>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Geräte-Token"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/40"
          />
          <button
            type="button"
            onClick={saveToken}
            className="w-full rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-400"
          >
            Terminal aktivieren
          </button>
        </div>
      </main>
    );
  }

  // ---- Betrieb ---------------------------------------------------------------
  return (
    <main className="relative flex min-h-screen flex-col bg-gradient-to-b from-[#0b1220] to-[#0e1729] text-white">
      <style>{`
        @keyframes zvPop { 0% { transform: scale(.82); opacity: 0 } 60% { transform: scale(1.05) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes zvFade { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes zvRing { 0% { transform: scale(1); opacity: .5 } 100% { transform: scale(1.4); opacity: 0 } }
        @keyframes zvOverlay { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {/* Kopfzeile */}
      <header className="flex items-center justify-between px-8 py-5">
        <Brand small />
        <div className="text-right">
          <div className="text-4xl font-semibold tabular-nums leading-none">{clockTime(now)}</div>
          <div className="mt-1 text-sm capitalize text-white/55">{clockDate(now)}</div>
        </div>
      </header>

      {/* Hauptbereich */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 pb-6">
        {phase === 'identified' && person ? (
          <IdentifiedCard person={person} photoUrl={photoUrl} busy={busy} onStamp={doStamp} onCancel={reset} />
        ) : (
          <IdleCard
            mode={mode}
            setMode={(m) => setMode(m)}
            value={value}
            setValue={setValue}
            busy={busy}
            onSubmit={identify}
            inputRef={inputRef}
          />
        )}
      </section>

      {/* Letzte Aktivitäten */}
      {recent.length > 0 && (
        <footer className="border-t border-white/10 px-8 py-4">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">Letzte Aktivitäten</div>
          <ul className="space-y-1.5">
            {recent.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex items-center gap-3 text-sm text-white/75">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[11px] font-semibold">
                  {initials(r.name)}
                </span>
                <span className="tabular-nums text-white/50">{r.at}</span>
                <span className="font-medium">{r.name}</span>
                <span className="text-white/45">· {KIND_LABEL[r.kind] ?? r.kind}</span>
              </li>
            ))}
          </ul>
        </footer>
      )}

      {/* Begrüßungs-Overlay */}
      {phase === 'done' && result && (
        <button
          type="button"
          onClick={reset}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-[#0b1220]/85 px-6 text-center backdrop-blur-md"
          style={{ animation: 'zvOverlay .25s ease-out both' }}
        >
          <div className="relative" style={{ animation: 'zvPop .5s ease-out both' }}>
            <span
              className="absolute inset-0 rounded-full border-2 border-teal-400"
              style={{ animation: 'zvRing 1.6s ease-out infinite' }}
            />
            <Avatar url={photoUrl} name={result.employeeName} size={148} />
          </div>
          <div style={{ animation: 'zvFade .5s ease-out .12s both' }}>
            <h2 className="text-3xl font-semibold sm:text-4xl">
              {greeting(now)}, {result.employeeName}
            </h2>
            <p className="mt-2 text-base text-white/65">Ihre Arbeitszeit für heute wurde erfolgreich erfasst.</p>
            <p className="mt-3 inline-block rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/80">
              {KIND_LABEL[result.kind] ?? result.kind}
            </p>
          </div>
        </button>
      )}

      {/* Fehler-Overlay */}
      {phase === 'error' && (
        <button
          type="button"
          onClick={reset}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0b1220]/85 px-6 text-center backdrop-blur-md"
          style={{ animation: 'zvOverlay .25s ease-out both' }}
        >
          <div className="grid h-24 w-24 place-items-center rounded-full bg-rose-500/15 text-rose-300" style={{ animation: 'zvPop .4s ease-out both' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-12 w-12">
              <path d="M12 8v5M12 16.5v.5" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div className="text-xl font-semibold">Nicht möglich</div>
          <div className="max-w-md text-sm text-white/65">{error}</div>
        </button>
      )}
    </main>
  );
}

// ---- Teilkomponenten ---------------------------------------------------------

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid ${small ? 'h-8 w-8' : 'h-11 w-11'} place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 text-white`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={small ? 'h-4 w-4' : 'h-6 w-6'}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5l3.2 1.9" />
        </svg>
      </span>
      <span className={`font-semibold tracking-tight ${small ? 'text-lg' : 'text-2xl'}`}>
        ZeitVault <span className="font-normal text-white/45">Terminal</span>
      </span>
    </div>
  );
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  return url ? (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover ring-4 ring-white/15"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="grid place-items-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 font-semibold text-white ring-4 ring-white/15"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  );
}

function IdleCard({
  mode,
  setMode,
  value,
  setValue,
  busy,
  onSubmit,
  inputRef,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  value: string;
  setValue: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
      <p className="text-xl font-medium text-white/85">Chip auflegen oder Personalnummer eingeben</p>
      <p className="mt-1 text-sm text-white/45">Fingerabdruck wird lokal am Terminal geprüft.</p>

      <div className="mx-auto mt-6 inline-flex rounded-full bg-white/5 p-1 text-sm">
        {(['nfc', 'personnel'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 font-medium transition ${
              mode === m ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white/80'
            }`}
          >
            {m === 'nfc' ? 'NFC-Chip' : 'Personalnummer'}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
        inputMode={mode === 'personnel' ? 'numeric' : 'text'}
        placeholder={mode === 'nfc' ? 'NFC-UID' : 'Personalnummer'}
        className="mt-5 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-center font-mono text-lg text-white outline-none placeholder:text-white/25 focus:border-teal-400/60"
      />
      <button
        type="button"
        disabled={busy || value.trim().length < 1}
        onClick={onSubmit}
        className="mt-4 w-full rounded-2xl bg-teal-500 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-teal-400 disabled:opacity-40"
      >
        {busy ? 'Prüfe …' : 'Weiter'}
      </button>
    </div>
  );
}

function IdentifiedCard({
  person,
  photoUrl,
  busy,
  onStamp,
  onCancel,
}: {
  person: KioskIdentifyResult;
  photoUrl: string | null;
  busy: boolean;
  onStamp: (kind: string) => void;
  onCancel: () => void;
}) {
  const actions = actionsFor(person.state);
  const toneClass: Record<string, string> = {
    kommen: 'from-emerald-500/90 to-emerald-700/90 hover:from-emerald-500 hover:to-emerald-700',
    gehen: 'from-amber-500/90 to-amber-700/90 hover:from-amber-500 hover:to-amber-700',
    pause: 'from-sky-500/90 to-sky-700/90 hover:from-sky-500 hover:to-sky-700',
  };
  const stateLabel = person.state === 'out' ? 'abwesend' : person.state === 'break' ? 'in Pause' : 'anwesend';

  return (
    <div className="w-full max-w-2xl" style={{ animation: 'zvFade .3s ease-out both' }}>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Avatar url={photoUrl} name={person.employeeName} size={104} />
        <div>
          <div className="text-2xl font-semibold">{person.employeeName}</div>
          <div className="mt-0.5 font-mono text-sm text-white/50">
            Pers.-Nr. {person.personnelNumber} · {stateLabel}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {actions.map((a) => (
          <button
            key={a.kind}
            type="button"
            disabled={busy}
            onClick={() => onStamp(a.kind)}
            className={`flex min-h-[128px] flex-col items-center justify-center gap-2 rounded-3xl bg-gradient-to-br ${toneClass[a.tone]} text-white shadow-lg transition disabled:opacity-50 ${actions.length === 1 ? 'sm:col-span-2' : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-9 w-9">
              {a.tone === 'gehen' ? (
                <>
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
                  <path d="M17 8l4 4-4 4M21 12H10" />
                </>
              ) : a.tone === 'pause' ? (
                <>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </>
              ) : (
                <>
                  <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                  <path d="M13 8l-4 4 4 4M9 12h11" />
                </>
              )}
            </svg>
            <span className="text-2xl font-semibold tracking-wide">{a.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mx-auto mt-6 block rounded-full px-5 py-2 text-sm font-medium text-white/55 hover:bg-white/5 hover:text-white/80"
      >
        Abbrechen
      </button>
    </div>
  );
}
