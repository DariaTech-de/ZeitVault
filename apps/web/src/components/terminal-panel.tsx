'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import { Button, Card, Empty, ErrorNote, Field, PageHead, Select, TextInput, Worklist } from '@/components/fiori/ui';
import {
  type EmployeeSummary,
  type NfcMapping,
  type TerminalSummary,
  deactivateTerminal,
  fetchEmployees,
  fetchNfcMappings,
  fetchTerminals,
  mapNfc,
  registerTerminal,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

export function TerminalPanel() {
  const { identity } = useAuth();
  const isAdmin = identity?.roles.includes('admin') ?? false;
  const [terminals, setTerminals] = useState<TerminalSummary[]>([]);
  const [nfc, setNfc] = useState<NfcMapping[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [issuedToken, setIssuedToken] = useState<{ name: string; token: string } | null>(null);
  const [nfcUid, setNfcUid] = useState('');
  const [nfcEmployee, setNfcEmployee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (id: Identity) => {
    try {
      const [t, n, e] = await Promise.all([fetchTerminals(id), fetchNfcMappings(id), fetchEmployees(id)]);
      setTerminals(t);
      setNfc(n);
      setEmployees(e);
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const onRegister = useCallback(async () => {
    if (!identity || newName.trim().length === 0) return;
    setPending(true);
    try {
      const created = await registerTerminal(identity, newName.trim());
      setIssuedToken({ name: created.name, token: created.token });
      setNewName('');
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, newName, refresh]);

  const onDeactivate = useCallback(
    async (id: string) => {
      if (!identity) return;
      setPending(true);
      try {
        await deactivateTerminal(identity, id);
        await refresh(identity);
      } finally {
        setPending(false);
      }
    },
    [identity, refresh],
  );

  const onMapNfc = useCallback(async () => {
    if (!identity || nfcUid.trim().length < 2 || !nfcEmployee) return;
    setPending(true);
    try {
      await mapNfc(identity, { uid: nfcUid.trim(), employeeId: nfcEmployee });
      setNfcUid('');
      setNfcEmployee('');
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zuordnung fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, nfcUid, nfcEmployee, refresh]);

  return (
    <>
      <PageHead
        eyebrow="Verwaltung · Terminals"
        title="Terminals und NFC-Chips"
        sub="Zeiterfassungs-Terminals am Eingang. Mitarbeitende stempeln per NFC-Chip oder Fingerabdruck. Fingerabdrücke werden ausschließlich lokal am Terminal abgeglichen – der Server erhält keine biometrischen Daten."
        right={<StatusPill tone="neutral">{terminals.filter((t) => t.active).length} aktiv</StatusPill>}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {issuedToken && (
        <div className="mb-5">
          <MessageStrip tone="warning">
            Geräte-Token für „{issuedToken.name}" – jetzt sicher im Terminal hinterlegen. Es wird aus Sicherheitsgründen nur
            EINMAL angezeigt:
            <span className="mono mt-2 block break-all rounded-[8px] border border-line bg-surface px-3 py-2 text-[12.5px]">
              {issuedToken.token}
            </span>
          </MessageStrip>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          {isAdmin && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">Terminal registrieren</h2>
              <div className="mt-3 space-y-3">
                <Field label="Bezeichnung">
                  <TextInput value={newName} maxLength={120} placeholder="z. B. Eingang Haupttor" onChange={(e) => setNewName(e.target.value)} />
                </Field>
                <Button variant="primary" disabled={pending || newName.trim().length === 0} onClick={() => void onRegister()}>
                  Registrieren
                </Button>
              </div>
            </Card>
          )}

          {isAdmin && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">NFC-Chip zuordnen</h2>
              <div className="mt-3 space-y-3">
                <Field label="NFC-UID">
                  <TextInput value={nfcUid} maxLength={128} placeholder="z. B. 04A1B2C3D4" onChange={(e) => setNfcUid(e.target.value)} />
                </Field>
                <Field label="Mitarbeiter/in">
                  <Select value={nfcEmployee} onChange={(e) => setNfcEmployee(e.target.value)}>
                    <option value="">— auswählen —</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.personnelNumber} · {e.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button disabled={pending || nfcUid.trim().length < 2 || !nfcEmployee} onClick={() => void onMapNfc()}>
                  Zuordnen
                </Button>
              </div>
            </Card>
          )}

          <MessageStrip tone="info">
            Das Terminal öffnet die Kiosk-Ansicht unter <span className="mono">/kiosk</span> und meldet sich mit dem Geräte-Token
            an – ohne Nutzer-Login.
          </MessageStrip>
        </div>

        <div className="space-y-5">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Terminals</h2>
            <Worklist>
              {terminals.length === 0 ? (
                <Empty>Keine Terminals registriert.</Empty>
              ) : (
                terminals.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{t.name}</span>
                        <StatusPill tone={t.active ? 'positive' : 'neutral'}>{t.active ? 'aktiv' : 'deaktiviert'}</StatusPill>
                      </span>
                      <span className="mono mt-0.5 block text-[12.5px] text-ink-faint">
                        {t.lastSeenAt ? `zuletzt aktiv ${new Date(t.lastSeenAt).toLocaleString('de-DE', { timeZone: 'UTC' })}` : 'noch nie verbunden'}
                      </span>
                    </span>
                    {isAdmin && t.active && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => void onDeactivate(t.id)}>
                        Deaktivieren
                      </Button>
                    )}
                  </div>
                ))
              )}
            </Worklist>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">NFC-Zuordnungen</h2>
            <Worklist>
              {nfc.length === 0 ? (
                <Empty>Keine NFC-Chips zugeordnet.</Empty>
              ) : (
                nfc.map((n) => (
                  <div key={n.uid} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span className="mono rounded-[8px] bg-surface-3 px-2 py-1 text-[12.5px] text-ink-muted">{n.uid}</span>
                    <span className="min-w-0 flex-1 font-medium">{n.employeeName ?? n.employeeId}</span>
                    <StatusPill tone={n.active ? 'positive' : 'neutral'}>{n.active ? 'aktiv' : 'inaktiv'}</StatusPill>
                  </div>
                ))
              )}
            </Worklist>
          </div>
        </div>
      </div>
    </>
  );
}
