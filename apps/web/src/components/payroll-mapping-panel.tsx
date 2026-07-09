'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, ErrorNote, PageHead, TextInput } from '@/components/fiori/ui';
import {
  type PayrollCategory,
  type PayrollMappingEntry,
  fetchPayrollMappings,
  removePayrollMapping,
  setPayrollMapping,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Identity } from '@/lib/identity';

// C-11: Lohnartenmapping in der Oberflaeche pflegbar - Aenderungen sind ohne
// Deployment wirksam (der naechste Export nutzt den gespeicherten Stand).
// C-09: jede Bewertungsart hat ihre eigene Lohnart und optional einen
// eigenen Verguetungsfaktor.
const CATEGORIES: ReadonlyArray<{ key: PayrollCategory; label: string }> = [
  { key: 'work_time', label: 'Vollarbeit' },
  { key: 'on_call_duty', label: 'Bereitschaftsdienst' },
  { key: 'standby', label: 'Rufbereitschaft' },
  { key: 'travel', label: 'Reisezeit' },
  { key: 'vacation', label: 'Urlaub' },
  { key: 'sick', label: 'Krankheit' },
  { key: 'special', label: 'Sonderurlaub' },
];

interface RowState {
  lohnart: string;
  kostenstelle: string;
  ausfallschluessel: string;
  factorPercent: string;
  persisted: boolean;
}

const emptyRow: RowState = {
  lohnart: '',
  kostenstelle: '',
  ausfallschluessel: '',
  factorPercent: '',
  persisted: false,
};

export function PayrollMappingPanel() {
  const { identity } = useAuth();
  const isAdmin = identity?.roles.includes('admin') ?? false;
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async (id: Identity) => {
    try {
      const entries = await fetchPayrollMappings(id);
      const byCategory = new Map<string, PayrollMappingEntry>(entries.map((e) => [e.category, e]));
      const next: Record<string, RowState> = {};
      for (const { key } of CATEGORIES) {
        const entry = byCategory.get(key);
        next[key] = entry
          ? {
              lohnart: entry.lohnart,
              kostenstelle: entry.kostenstelle ?? '',
              ausfallschluessel: entry.ausfallschluessel ?? '',
              factorPercent: entry.factorPercent === null ? '' : String(entry.factorPercent),
              persisted: true,
            }
          : { ...emptyRow };
      }
      setRows(next);
      setError(null);
    } catch {
      setError('Backend nicht erreichbar. Bitte die API starten.');
    }
  }, []);

  useEffect(() => {
    if (identity) void refresh(identity);
  }, [identity, refresh]);

  const update = (category: PayrollCategory, patch: Partial<RowState>): void => {
    setRows((prev) => ({ ...prev, [category]: { ...(prev[category] ?? emptyRow), ...patch } }));
  };

  const save = async (category: PayrollCategory): Promise<void> => {
    if (!identity) return;
    const row = rows[category];
    if (!row || row.lohnart.trim() === '') return;
    setPending(category);
    try {
      await setPayrollMapping(identity, {
        category,
        lohnart: row.lohnart.trim(),
        ...(row.kostenstelle.trim() ? { kostenstelle: row.kostenstelle.trim() } : {}),
        ...(row.ausfallschluessel.trim() ? { ausfallschluessel: row.ausfallschluessel.trim() } : {}),
        ...(row.factorPercent.trim() ? { factorPercent: Number(row.factorPercent) } : {}),
      });
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setPending(null);
    }
  };

  const remove = async (category: PayrollCategory): Promise<void> => {
    if (!identity) return;
    setPending(category);
    try {
      await removePayrollMapping(identity, category);
      await refresh(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Lohnarten"
        sub="Zuordnung Bewertungsart → Lohnartennummer (mandantenweit; Änderungen sind sofort wirksam, kein Deployment nötig). Kategorien ohne Zuordnung werden im Lohnexport nicht ausgegeben, sondern als offen ausgewiesen."
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="px-4 py-3 font-medium">Bewertungsart</th>
              <th className="px-4 py-3 font-medium">Lohnart</th>
              <th className="px-4 py-3 font-medium">Kostenstelle</th>
              <th className="px-4 py-3 font-medium">Ausfallschlüssel</th>
              <th className="px-4 py-3 font-medium">Faktor %</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map(({ key, label }) => {
              const row = rows[key] ?? emptyRow;
              return (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-ink">{label}</td>
                  <td className="px-4 py-2">
                    <TextInput
                      value={row.lohnart}
                      onChange={(e) => update(key, { lohnart: e.target.value })}
                      placeholder="z. B. 100"
                      disabled={!isAdmin}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <TextInput
                      value={row.kostenstelle}
                      onChange={(e) => update(key, { kostenstelle: e.target.value })}
                      disabled={!isAdmin}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <TextInput
                      value={row.ausfallschluessel}
                      onChange={(e) => update(key, { ausfallschluessel: e.target.value })}
                      disabled={!isAdmin}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <TextInput
                      value={row.factorPercent}
                      onChange={(e) => update(key, { factorPercent: e.target.value })}
                      placeholder="100"
                      inputMode="numeric"
                      disabled={!isAdmin}
                    />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {isAdmin ? (
                      <span className="inline-flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void save(key)}
                          disabled={pending === key || row.lohnart.trim() === ''}
                        >
                          Speichern
                        </Button>
                        {row.persisted ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void remove(key)}
                            disabled={pending === key}
                          >
                            Entfernen
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
