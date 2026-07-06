'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import { Avatar, Button, Card, Empty, ErrorNote, Field, PageHead, Row, Select, TextInput, Worklist } from '@/components/fiori/ui';
import {
  type CorrectionRequest,
  type CorrectionStatus,
  createCorrectionRequest,
  decideCorrection,
  fetchCorrections,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};
const STATUS_LABEL: Record<CorrectionStatus, string> = { requested: 'Beantragt', approved: 'Freigegeben', rejected: 'Abgelehnt' };
const STATUS_TONE: Record<CorrectionStatus, 'warning' | 'positive' | 'negative'> = {
  requested: 'warning',
  approved: 'positive',
  rejected: 'negative',
};

export function CorrectionPanel() {
  const { identity } = useAuth();
  const canDecide = identity?.roles.some((r) => r === 'manager' || r === 'admin') ?? false;
  const [items, setItems] = useState<CorrectionRequest[]>([]);
  const [proposedKind, setProposedKind] = useState('clock_out');
  const [when, setWhen] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (id: Identity) => {
    try {
      const all = id.roles.some((r) => r === 'manager' || r === 'admin');
      setItems(await fetchCorrections(id, all ? undefined : id.employeeId));
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const onSubmit = useCallback(async () => {
    if (!identity || !when || reason.trim().length < 3) return;
    setPending(true);
    try {
      await createCorrectionRequest(identity, {
        employeeId: identity.employeeId,
        proposedKind,
        proposedOccurredAt: new Date(when).toISOString(),
        reason,
      });
      setWhen('');
      setReason('');
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Antrag fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }, [identity, proposedKind, when, reason, refresh]);

  const onDecide = useCallback(
    async (id: string, action: 'approve' | 'reject') => {
      if (!identity) return;
      setPending(true);
      try {
        await decideCorrection(identity, id, action);
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
        eyebrow="Self-Service · Zeitkorrektur"
        title="Anpassungsanträge"
        sub="Stempel vergessen? Nachtrag beantragen. Erst die Freigabe durch Vorgesetzte erzeugt den Stempel – append-only, mit Audit-Ereignis (nichts wird überschrieben)."
        right={<StatusPill tone="neutral">{items.filter((i) => i.status === 'requested').length} offen</StatusPill>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="text-base font-semibold">Nachtrag beantragen</h2>
          <div className="mt-4 space-y-3">
            <Field label="Stempelart">
              <Select value={proposedKind} onChange={(e) => setProposedKind(e.target.value)}>
                <option value="clock_in">Kommen</option>
                <option value="break_start">Pause Beginn</option>
                <option value="break_end">Pause Ende</option>
                <option value="clock_out">Gehen</option>
              </Select>
            </Field>
            <Field label="Zeitpunkt">
              <TextInput type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Field label="Begründung">
              <TextInput value={reason} maxLength={500} placeholder="z. B. Ausstempeln vergessen" onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button variant="primary" disabled={pending || !when || reason.trim().length < 3} onClick={() => void onSubmit()}>
              Antrag senden
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Worklist>
            {items.length === 0 ? (
              <Empty>Keine Anträge vorhanden.</Empty>
            ) : (
              items.map((c) => (
                <Row key={c.id} className="cursor-default hover:bg-surface">
                  <Avatar>{(KIND_LABEL[c.proposedKind] ?? '?').slice(0, 2)}</Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusPill>
                      <span className="font-semibold">{KIND_LABEL[c.proposedKind] ?? c.proposedKind} nachtragen</span>
                    </span>
                    <span className="mono mt-1 block text-[12.5px] text-ink-faint">
                      {new Date(c.proposedOccurredAt).toLocaleString('de-DE', { timeZone: 'UTC' })} · {c.reason}
                    </span>
                  </span>
                  {canDecide && c.status === 'requested' && (
                    <span className="flex gap-2">
                      <Button size="sm" disabled={pending} onClick={() => void onDecide(c.id, 'approve')}>
                        Freigeben
                      </Button>
                      <Button size="sm" variant="danger" disabled={pending} onClick={() => void onDecide(c.id, 'reject')}>
                        Ablehnen
                      </Button>
                    </span>
                  )}
                </Row>
              ))
            )}
          </Worklist>
          {error && <ErrorNote>{error}</ErrorNote>}
          <MessageStrip tone="info">
            Bei Freigabe wird der Stempel als neue Revision angelegt; der Antrag und der erzeugte Stempel sind revisionssicher
            protokolliert (GoBD, Kern-Invariante 1 &amp; 2).
          </MessageStrip>
        </div>
      </div>
    </>
  );
}
