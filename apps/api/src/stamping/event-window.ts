import { and, asc, eq, gte, inArray, lte, notInArray } from 'drizzle-orm';
import { type StampEventRow, stampEvents } from '../db/schema';
import type { Database } from '../db/tokens';

/**
 * Zeitfenster-Laden von Stempel-Ereignissen MIT Korrektur-Abschluss.
 *
 * Ein Korrektur-Ereignis (corrects_event_id) traegt den KORRIGIERTEN
 * Zeitpunkt; es kann daher beliebig weit ausserhalb des Ladefensters seines
 * Originals liegen. Wuerde nur nach occurred_at gefenstert, erschiene das
 * korrigierte Original in allen Fenstern ohne die Korrektur wieder als
 * wirksam (Doppelzaehlung im Lohn, ungueltige Schichtfolgen, GoBD-widrig).
 * Deshalb wird jede geladene Menge transitiv um die Ereignisse ergaenzt, die
 * geladene Ereignisse korrigieren (Fixpunkt; Korrekturketten sind endlich,
 * jede Runde ergaenzt mindestens eine neue Zeile).
 */

/** Abfrage-faehige Drizzle-Instanz (Datenbank oder laufende Transaktion). */
export type Queryable = Pick<Database, 'select'>;

/**
 * Ergaenzt eine geladene Ereignismenge um alle (transitiven) Korrekturen der
 * enthaltenen Ereignisse. Zeilenform-agnostisch: `fetchCorrectors` liefert die
 * noch fehlenden Korrektur-Zeilen zur uebergebenen id-Menge.
 */
export async function closeOverCorrections<T extends { id: string }>(
  initial: readonly T[],
  fetchCorrectors: (loadedIds: string[]) => Promise<T[]>,
): Promise<T[]> {
  const byId = new Map(initial.map((r) => [r.id, r] as const));
  while (byId.size > 0) {
    const more = (await fetchCorrectors([...byId.keys()])).filter((r) => !byId.has(r.id));
    if (more.length === 0) break;
    for (const r of more) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** Standard-Fetcher fuer vollstaendige stamp_events-Zeilen. */
export function stampCorrectorFetcher(
  q: Queryable,
  tenantId: string,
  employeeId?: string,
): (loadedIds: string[]) => Promise<StampEventRow[]> {
  return (loadedIds) =>
    q
      .select()
      .from(stampEvents)
      .where(
        and(
          eq(stampEvents.tenantId, tenantId),
          ...(employeeId ? [eq(stampEvents.employeeId, employeeId)] : []),
          inArray(stampEvents.correctsEventId, loadedIds),
          notInArray(stampEvents.id, loadedIds),
        ),
      );
}

/**
 * Laedt die Ereignisse eines Mitarbeitenden im Fenster [from, to] und
 * schliesst die Menge ueber Korrektur-Verweise ab; chronologisch sortiert.
 */
export async function loadEmployeeEventWindow(
  q: Queryable,
  tenantId: string,
  employeeId: string,
  from: Date,
  to: Date,
): Promise<StampEventRow[]> {
  const base = await q
    .select()
    .from(stampEvents)
    .where(
      and(
        eq(stampEvents.tenantId, tenantId),
        eq(stampEvents.employeeId, employeeId),
        gte(stampEvents.occurredAt, from),
        lte(stampEvents.occurredAt, to),
      ),
    )
    .orderBy(asc(stampEvents.occurredAt));
  const closed = await closeOverCorrections(base, stampCorrectorFetcher(q, tenantId, employeeId));
  return closed.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
