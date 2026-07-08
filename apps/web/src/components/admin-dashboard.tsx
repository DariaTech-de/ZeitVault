'use client';

import { useEffect, useState } from 'react';
import { EmployeePhotoAvatar } from '@/components/employee-photo';
import { PageHead } from '@/components/fiori/ui';
import { type DashboardData, fetchDashboard } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const KIND_LABEL: Record<string, string> = {
  clock_in: 'Kommen',
  break_start: 'Pause Beginn',
  break_end: 'Pause Ende',
  clock_out: 'Gehen',
};
const SOURCE_LABEL: Record<string, string> = { web: 'Web', mobile: 'Mobil', terminal: 'Terminal' };

function hours(min: number): string {
  return `${(min / 60).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}
function weekdayShort(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' });
}

export function AdminDashboard() {
  const { identity } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    fetchDashboard(identity)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(() => setError('Dashboard konnte nicht geladen werden (Manager/Admin-Rolle nötig; API erreichbar?).'));
  }, [identity]);

  return (
    <>
      <PageHead eyebrow="Verwaltung" title="Dashboard" sub="Kennzahlen und jüngste Aktivität – aus Live-Daten berechnet." />

      {error && (
        <div className="rounded-card border border-line bg-neg-bg px-5 py-4 text-sm text-neg">{error}</div>
      )}

      {!data ? (
        !error && <div className="rounded-card border border-dashed border-line bg-surface px-5 py-16 text-center text-sm text-ink-faint">Wird geladen …</div>
      ) : (
        <div className="space-y-5">
          {/* KPI-Kacheln */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Mitarbeitende" value={String(data.kpis.employees)} tone="primary" icon="users" />
            <Kpi label="Aktuell anwesend" value={String(data.kpis.presentNow)} tone="positive" icon="pulse" />
            <Kpi label="Offene Genehmigungen" value={String(data.kpis.pendingApprovals)} tone={data.kpis.pendingApprovals > 0 ? 'warning' : 'muted'} icon="inbox" />
            <Kpi label="Stunden (Woche)" value={hours(data.kpis.weekMinutes)} tone="teal" icon="clock" />
          </div>

          {/* Chart + Feed */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <Card title="Erfasste Arbeitszeit · 14 Tage">
              <ActivityChart data={data.activity} />
            </Card>
            <Card title="Letzte Stempelungen">
              {data.recentStamps.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-2.5">
                  {data.recentStamps.map((s, i) => (
                    <li key={`${s.employeeId}-${i}`} className="flex items-center gap-3">
                      {identity && (
                        <EmployeePhotoAvatar
                          identity={identity}
                          employee={{ id: s.employeeId, displayName: s.employeeName, hasPhoto: s.hasPhoto }}
                          size={34}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{s.employeeName}</span>
                        <span className="text-[12px] text-ink-faint">
                          {KIND_LABEL[s.kind] ?? s.kind} · {SOURCE_LABEL[s.source] ?? s.source}
                        </span>
                      </span>
                      <span className="mono shrink-0 text-[12px] text-ink-muted">{timeOf(s.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Tabelle + Projekte */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            <Card title="Letzte Projektbuchungen">
              {data.recentBookings.length === 0 ? (
                <Empty hint="Noch keine Projektzeiten gebucht." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[12px] uppercase tracking-wide text-ink-faint">
                        <th className="pb-2 font-semibold">Mitarbeiter</th>
                        <th className="pb-2 font-semibold">Projekt</th>
                        <th className="pb-2 text-right font-semibold">Dauer</th>
                        <th className="pb-2 text-right font-semibold">Datum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.recentBookings.map((b, i) => (
                        <tr key={i}>
                          <td className="py-2.5 font-medium text-ink">{b.employeeName}</td>
                          <td className="py-2.5 text-ink-muted">{b.projectName}</td>
                          <td className="mono py-2.5 text-right text-ink">{hours(b.minutes)}</td>
                          <td className="mono py-2.5 text-right text-ink-faint">{b.workDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Projekte · gebuchte Zeit">
              {data.projects.length === 0 ? (
                <Empty hint="Keine Projekte angelegt." />
              ) : (
                <ul className="space-y-3">
                  {data.projects.map((p) => {
                    const max = Math.max(...data.projects.map((x) => x.bookedMinutes), 1);
                    const pct = Math.round((p.bookedMinutes / max) * 100);
                    return (
                      <li key={p.id}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate font-medium text-ink">{p.name}</span>
                          <span className="mono shrink-0 text-[12px] text-ink-muted">{hours(p.bookedMinutes)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-teal" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Teilkomponenten ---------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 [box-shadow:var(--shadow-sm)]">
      <h3 className="mb-4 text-[12.5px] font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ hint = 'Noch keine Aktivität.' }: { hint?: string }) {
  return <p className="py-6 text-center text-sm text-ink-faint">{hint}</p>;
}

const TONE: Record<string, { chip: string; icon: string }> = {
  primary: { chip: 'bg-primary-weak text-primary', icon: 'text-primary' },
  teal: { chip: 'bg-teal/15 text-teal', icon: 'text-teal' },
  positive: { chip: 'bg-pos-bg text-pos', icon: 'text-pos' },
  warning: { chip: 'bg-warn-bg text-warn', icon: 'text-warn' },
  muted: { chip: 'bg-surface-2 text-ink-muted', icon: 'text-ink-muted' },
};

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: keyof typeof TONE | string; icon: string }) {
  const t = TONE[tone] ?? TONE.muted;
  return (
    <div className="rounded-card border border-line bg-surface p-5 [box-shadow:var(--shadow-sm)]">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-ink-muted">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${t.chip}`}>
          <KpiIcon name={icon} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-ink">{value}</div>
    </div>
  );
}

function KpiIcon({ name }: { name: string }) {
  const p: Record<string, React.ReactNode> = {
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 8a3 3 0 0 1 0 6M20.5 19a5.5 5.5 0 0 0-4-5.3" />
      </>
    ),
    pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
    inbox: (
      <>
        <path d="M3 13h5l1.5 2.5h5L16 13h5" />
        <path d="M4 13l2-8h12l2 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5l3 1.8" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      {p[name] ?? p.clock}
    </svg>
  );
}

/** Kompakter SVG-Flächenchart (ohne externe Bibliothek), theme-fähig. */
function ActivityChart({ data }: { data: { date: string; minutes: number }[] }) {
  const W = 560;
  const H = 190;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = data.length;
  const max = Math.max(...data.map((d) => d.minutes), 60);
  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (min: number) => pad.t + innerH - (min / max) * innerH;

  const pts = data.map((d, i) => [x(i), y(d.minutes)] as const);
  const line = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;
  const total = data.reduce((s, d) => s + d.minutes, 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-ink">{hours(total)}</span>
        <span className="text-[12px] text-ink-faint">gesamt · 14 Tage</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label="Arbeitszeit je Tag">
        <defs>
          <linearGradient id="zvArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-teal, #14b8a6)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-teal, #14b8a6)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#zvArea)" />
        <path d={line} fill="none" stroke="var(--color-teal, #14b8a6)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={i === n - 1 ? 3.2 : 0} fill="var(--color-teal, #14b8a6)" />
        ))}
        {data.map((d, i) =>
          i % 3 === 0 || i === n - 1 ? (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-faint" style={{ fontSize: 10 }}>
              {weekdayShort(d.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
