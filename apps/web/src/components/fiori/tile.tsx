import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Accent = 'primary' | 'teal' | 'warn' | 'neg' | 'none';

const accentIcon: Record<Accent, string> = {
  primary: 'bg-primary-weak text-primary',
  teal: 'bg-teal-weak text-teal',
  warn: 'bg-warn-bg text-warn',
  neg: 'bg-neg-bg text-neg',
  none: 'bg-surface-3 text-ink-muted',
};

export interface TileProps {
  title: string;
  icon?: ReactNode;
  accent?: Accent;
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

/** Launchpad-Kachel (Fiori Tile). Klickbar als Link oder Button, sonst statisch. */
export function Tile({ title, icon, accent = 'none', href, onClick, className, children }: TileProps) {
  const interactive = Boolean(href || onClick);
  const cls = cn(
    'group flex min-h-[150px] w-full flex-col rounded-card border border-line bg-surface p-[17px] text-left',
    '[box-shadow:var(--shadow-sm)] transition duration-200',
    interactive &&
      'hover:-translate-y-0.5 hover:border-line-strong hover:[box-shadow:var(--shadow)] motion-reduce:transform-none',
    className,
  );
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-ink-muted">{title}</span>
        {icon && (
          <span className={cn('grid h-[30px] w-[30px] place-items-center rounded-lg', accentIcon[accent])}>
            {icon}
          </span>
        )}
      </div>
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** Großer Kennzahlwert innerhalb einer Kachel (nach unten gedrückt). */
export function TileValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mono mt-auto text-[34px] font-bold leading-none tracking-tight', className)}>
      {children}
    </div>
  );
}

export function TileSub({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 text-[12.5px] text-ink-faint">{children}</div>;
}

export function TileFoot({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
}

/** Ring-/Donut-Anzeige (z. B. Resturlaub). value/max in gleicher Einheit. */
export function Donut({
  value,
  max,
  colorVar = '--primary',
}: {
  value: number;
  max: number;
  colorVar?: string;
}) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <svg width="72" height="72" viewBox="0 0 42 42" aria-hidden="true">
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
      <circle
        cx="21"
        cy="21"
        r={r}
        fill="none"
        stroke={`var(${colorVar})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${frac * circ} ${circ}`}
        transform="rotate(-90 21 21)"
      />
    </svg>
  );
}

/** Kompakte Balkenreihe (z. B. Verstöße je Tag). */
export function Bars({ data }: { data: number[] }) {
  const mx = Math.max(1, ...data);
  return (
    <div className="mt-auto flex h-14 items-end gap-1.5">
      {data.map((v, i) => (
        <div
          key={i}
          className={cn('flex-1 rounded-t', v >= 3 ? 'bg-neg' : 'bg-warn')}
          style={{ height: `${(v / mx) * 100 || 8}%`, opacity: v ? 1 : 0.25 }}
        />
      ))}
    </div>
  );
}
