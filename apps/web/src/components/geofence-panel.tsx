'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import { Button, Card, Empty, ErrorNote, Field, PageHead, TextInput, Worklist } from '@/components/fiori/ui';
import {
  type GeofenceReviewStamp,
  type GeofenceSite,
  type LocationCheck,
  createGeofenceSite,
  deactivateGeofenceSite,
  fetchGeofenceReview,
  fetchGeofenceSites,
  fetchGeofenceSettings,
  flagStamp,
  setGeofenceEnabled,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};
const CHECK_LABEL: Record<LocationCheck, string> = {
  not_required: 'nicht geprüft',
  inside: 'im Standort',
  outside: 'außerhalb',
  no_signal: 'ohne Signal',
};
const CHECK_TONE: Record<LocationCheck, 'neutral' | 'positive' | 'negative' | 'warning'> = {
  not_required: 'neutral',
  inside: 'positive',
  outside: 'negative',
  no_signal: 'warning',
};

export function GeofencePanel() {
  const { identity } = useAuth();
  const isAdmin = identity?.roles.includes('admin') ?? false;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sites, setSites] = useState<GeofenceSite[]>([]);
  const [review, setReview] = useState<GeofenceReviewStamp[]>([]);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radiusMeters: '100' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (id: Identity) => {
    try {
      const [s, sl, rv] = await Promise.all([fetchGeofenceSettings(id), fetchGeofenceSites(id), fetchGeofenceReview(id)]);
      setEnabled(s.enabled);
      setSites(sl);
      setReview(rv);
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const toggle = useCallback(async () => {
    if (!identity || enabled === null) return;
    setPending(true);
    try {
      await setGeofenceEnabled(identity, !enabled);
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Umschalten fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, enabled, refresh]);

  const addSite = useCallback(async () => {
    if (!identity) return;
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    const radius = Number(form.radiusMeters);
    if (form.name.trim().length === 0 || Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radius)) return;
    setPending(true);
    try {
      await createGeofenceSite(identity, { name: form.name.trim(), latitude: lat, longitude: lng, radiusMeters: radius });
      setForm({ name: '', latitude: '', longitude: '', radiusMeters: '100' });
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Standort konnte nicht angelegt werden.');
    } finally {
      setPending(false);
    }
  }, [identity, form, refresh]);

  const removeSite = useCallback(
    async (id: string) => {
      if (!identity) return;
      setPending(true);
      try {
        await deactivateGeofenceSite(identity, id);
        await refresh(identity);
      } finally {
        setPending(false);
      }
    },
    [identity, refresh],
  );

  const toggleFlag = useCallback(
    async (s: GeofenceReviewStamp) => {
      if (!identity) return;
      setPending(true);
      try {
        await flagStamp(identity, { eventId: s.eventId, flagged: !s.flagged });
        await refresh(identity);
      } finally {
        setPending(false);
      }
    },
    [identity, refresh],
  );

  const openFlags = review.filter((r) => r.locationCheck === 'outside' || r.locationCheck === 'no_signal').length;

  return (
    <>
      <PageHead
        eyebrow="Verwaltung · Standort-Prüfung"
        title="Standort-Prüfung (Geofencing)"
        sub="Optional: prüft beim Stempeln, ob sich Mitarbeitende an einem hinterlegten Standort befinden. Standardmäßig deaktiviert – Aktivierung nur nach Betriebsvereinbarung (Mitbestimmung, BetrVG § 87)."
        right={enabled !== null && <StatusPill tone={enabled ? 'positive' : 'neutral'}>{enabled ? 'Aktiv' : 'Deaktiviert'}</StatusPill>}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <MessageStrip tone={enabled ? 'warning' : 'info'}>
        {enabled
          ? 'Standort-Prüfung ist aktiv. Standortdaten werden ausschließlich als Prüfergebnis (im Standort / außerhalb / ohne Signal) und gerundete Distanz gespeichert – keine rohen Koordinaten. Nur mit gültiger Betriebsvereinbarung betreiben.'
          : 'Standort-Prüfung ist deaktiviert. Es werden keine Standortdaten erhoben oder ausgewertet (Datensparsamkeit, Kern-Invariante 5).'}
      </MessageStrip>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Status</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {enabled ? 'Beim Stempeln wird die Position gegen die Standorte geprüft.' : 'Aktivieren Sie die Prüfung nur mit Betriebsvereinbarung.'}
            </p>
            {isAdmin ? (
              <Button className="mt-3" variant={enabled ? 'danger' : 'primary'} disabled={pending || enabled === null} onClick={() => void toggle()}>
                {enabled ? 'Deaktivieren' : 'Aktivieren'}
              </Button>
            ) : (
              <p className="mt-3 text-[13px] text-ink-faint">Nur die Administration kann die Prüfung schalten.</p>
            )}
          </Card>

          {isAdmin && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">Standort hinzufügen</h2>
              <div className="mt-3 space-y-3">
                <Field label="Bezeichnung">
                  <TextInput value={form.name} maxLength={120} placeholder="z. B. Zentrale Berlin" onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Breite (lat)">
                    <TextInput value={form.latitude} inputMode="decimal" placeholder="52.520008" onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
                  </Field>
                  <Field label="Länge (lng)">
                    <TextInput value={form.longitude} inputMode="decimal" placeholder="13.404954" onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
                  </Field>
                </div>
                <Field label="Radius (Meter)">
                  <TextInput value={form.radiusMeters} inputMode="numeric" placeholder="100" onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} />
                </Field>
                <Button disabled={pending} onClick={() => void addSite()}>
                  Standort anlegen
                </Button>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Standorte</h2>
            <Worklist>
              {sites.length === 0 ? (
                <Empty>Keine Standorte hinterlegt.</Empty>
              ) : (
                sites.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{s.name}</span>
                        {!s.active && <StatusPill tone="neutral">inaktiv</StatusPill>}
                      </span>
                      <span className="mono mt-0.5 block text-[12.5px] text-ink-faint">
                        {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)} · Radius {s.radiusMeters} m
                      </span>
                    </span>
                    {isAdmin && s.active && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => void removeSite(s.id)}>
                        Deaktivieren
                      </Button>
                    )}
                  </div>
                ))
              )}
            </Worklist>
          </div>

          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              Stempel-Prüfung
              {openFlags > 0 && <StatusPill tone="negative">{openFlags} auffällig</StatusPill>}
            </h2>
            <Worklist>
              {review.length === 0 ? (
                <Empty>Keine geprüften Stempel vorhanden.</Empty>
              ) : (
                review.map((r) => {
                  const alert = r.locationCheck === 'outside' || r.locationCheck === 'no_signal';
                  return (
                    <div key={r.eventId} className="flex items-center gap-3 border-b border-l-[3px] border-line px-4 py-3 last:border-b-0" style={alert ? { borderLeftColor: 'var(--neg)' } : undefined}>
                      <span className={alert ? 'zv-blink grid h-2.5 w-2.5 place-items-center rounded-full' : 'grid h-2.5 w-2.5 place-items-center rounded-full'} style={{ background: alert ? 'var(--neg)' : 'var(--pos)' }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={CHECK_TONE[r.locationCheck]}>{CHECK_LABEL[r.locationCheck]}</StatusPill>
                          <span className="font-semibold">{KIND_LABEL[r.kind] ?? r.kind}</span>
                          {r.flagged && <StatusPill tone="solid">gekennzeichnet</StatusPill>}
                        </span>
                        <span className="mono mt-0.5 block text-[12.5px] text-ink-faint">
                          {new Date(r.occurredAt).toLocaleString('de-DE', { timeZone: 'UTC' })}
                          {r.siteName ? ` · ${r.siteName}` : ''}
                          {r.distanceM !== null ? ` · ${r.distanceM} m` : ''}
                        </span>
                      </span>
                      <Button size="sm" variant={r.flagged ? 'ghost' : 'default'} disabled={pending} onClick={() => void toggleFlag(r)}>
                        {r.flagged ? 'Kennzeichnung entfernen' : 'Kennzeichnen'}
                      </Button>
                    </div>
                  );
                })
              )}
            </Worklist>
          </div>
        </div>
      </div>
    </>
  );
}
