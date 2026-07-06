'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import {
  Avatar,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  PageHead,
  Row,
  Select,
  TextInput,
  Worklist,
} from '@/components/fiori/ui';
import {
  type AbsenceAction,
  type AbsenceRequest,
  type AbsenceStatus,
  type AbsenceType,
  createAbsence,
  decideAbsence,
  fetchAbsences,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

const TYPE_LABEL: Record<AbsenceType, string> = { vacation: 'Urlaub', sick: 'Krankheit', special: 'Sonderurlaub' };
const STATUS_LABEL: Record<AbsenceStatus, string> = {
  requested: 'Beantragt',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
};
const STATUS_TONE: Record<AbsenceStatus, 'warning' | 'positive' | 'negative' | 'neutral'> = {
  requested: 'warning',
  approved: 'positive',
  rejected: 'negative',
  cancelled: 'neutral',
};

export function AbsencePanel() {
  const { identity } = useAuth();
  const canApprove = identity?.roles.some((r) => r === 'manager' || r === 'admin') ?? false;
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [type, setType] = useState<AbsenceType>('vacation');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (id: Identity) => {
    try {
      const all = id.roles.some((r) => r === 'manager' || r === 'admin');
      setRequests(await fetchAbsences(id, all ? undefined : id.employeeId));
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const onSubmit = useCallback(async () => {
    if (!identity || !from || !to) return;
    setPending(true);
    try {
      await createAbsence(identity, { type, from, to, reason: reason || undefined });
      setFrom('');
      setTo('');
      setReason('');
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Antrag fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, type, from, to, reason, refresh]);

  const onDecide = useCallback(
    async (id: string, action: AbsenceAction) => {
      if (!identity) return;
      setPending(true);
      try {
        await decideAbsence(identity, id, action);
        await refresh(identity);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
      } finally {
        setPending(false);
      }
    },
    [identity, refresh],
  );

  return (
    <>
      <PageHead
        eyebrow="Self-Service · Abwesenheit"
        title="Abwesenheiten"
        sub="Urlaub, Krankheit und Sonderurlaub beantragen. Genehmigungen durch Vorgesetzte erzeugen ein revisionssicheres Audit-Ereignis."
        right={<StatusPill tone="neutral">{requests.filter((r) => r.status === 'requested').length} offen</StatusPill>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="text-base font-semibold">Antrag stellen</h2>
          <div className="mt-4 space-y-3">
            <Field label="Art">
              <Select value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
                <option value="vacation">Urlaub</option>
                <option value="sick">Krankheit</option>
                <option value="special">Sonderurlaub</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Von">
                <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Bis">
                <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <Field label="Begründung (optional)">
              <TextInput value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button variant="primary" disabled={pending || !from || !to} onClick={() => void onSubmit()}>
              Antrag stellen
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Worklist>
            {requests.length === 0 ? (
              <Empty>Keine Anträge vorhanden.</Empty>
            ) : (
              requests.map((req) => (
                <Row key={req.id} className="cursor-default hover:bg-surface">
                  <Avatar>{TYPE_LABEL[req.type].slice(0, 2)}</Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <StatusPill tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</StatusPill>
                      <span className="font-semibold">{TYPE_LABEL[req.type]}</span>
                    </span>
                    <span className="mono mt-1 block text-[12.5px] text-ink-faint">
                      {req.fromDate} – {req.toDate}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    {canApprove && req.status === 'requested' && (
                      <>
                        <Button size="sm" disabled={pending} onClick={() => void onDecide(req.id, 'approve')}>
                          Genehmigen
                        </Button>
                        <Button size="sm" variant="danger" disabled={pending} onClick={() => void onDecide(req.id, 'reject')}>
                          Ablehnen
                        </Button>
                      </>
                    )}
                    {(req.status === 'requested' || req.status === 'approved') && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => void onDecide(req.id, 'cancel')}>
                        Stornieren
                      </Button>
                    )}
                  </span>
                </Row>
              ))
            )}
          </Worklist>
          {error && <ErrorNote>{error}</ErrorNote>}
          <MessageStrip tone="info">
            Ein genehmigter oder abgelehnter Antrag ist nachvollziehbar protokolliert. Stornierungen sind für eigene bzw.
            vorgesetzte Rollen möglich.
          </MessageStrip>
        </div>
      </div>
    </>
  );
}
