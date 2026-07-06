import { type VariantProps, cva } from 'class-variance-authority';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/* ---------------- Button ---------------- */
const button = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-semibold transition disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary [box-shadow:var(--shadow-sm)] hover:bg-primary-hover',
        default: 'border border-line bg-surface-2 text-ink hover:border-line-strong',
        danger: 'border border-line bg-surface-2 text-neg hover:border-line-strong',
        ghost: 'text-ink-muted hover:bg-surface-3 hover:text-ink',
      },
      size: { sm: 'h-8 px-3', md: 'h-[38px] px-4', lg: 'h-11 px-5 text-sm' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

/* ---------------- Card ---------------- */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface [box-shadow:var(--shadow-sm)]', className)} {...props} />;
}

/* ---------------- Page scaffolding ---------------- */
export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1200px] px-5 pb-16 pt-7">{children}</main>;
}

export function PageHead({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{eyebrow}</div>
        <h1 className="mt-1.5 text-[27px] font-semibold">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[60ch] text-sm text-ink-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/* ---------------- Object page header + facets ---------------- */
export function ObjectHeader({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-t-card border border-line bg-gradient-to-b from-surface-2 to-surface px-5 py-[18px]">
      {children}
    </div>
  );
}
export function Facets({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-px overflow-hidden border-x border-line bg-line sm:grid-cols-4">{children}</div>;
}
export function Facet({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="bg-surface px-5 py-[15px]">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">{k}</div>
      <div className="mt-1.5 text-base font-semibold">{v}</div>
    </div>
  );
}

/* ---------------- KPI row ---------------- */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">{children}</div>;
}
export function Kpi({ k, v, tone }: { k: string; v: ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className="bg-surface px-5 py-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">{k}</div>
      <div className={cn('mono mt-1.5 text-2xl font-bold tracking-tight', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{v}</div>
    </div>
  );
}

/* ---------------- Filter bar ---------------- */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[9px] border border-line bg-surface px-3.5 py-3 [box-shadow:var(--shadow-sm)]">
      {children}
    </div>
  );
}
export function FilterLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{children}</span>;
}
export function Chip({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
        active
          ? 'border-primary/35 bg-primary-weak text-primary'
          : 'border-line bg-surface-2 text-ink-muted hover:text-ink',
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Worklist ---------------- */
export function Worklist({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-card border border-line bg-surface [box-shadow:var(--shadow-sm)]', className)}>
      {children}
    </div>
  );
}
export function Row({
  selected,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-selected={selected}
      className={cn(
        'flex w-full items-center gap-3 border-b border-l-[3px] border-line border-l-transparent px-4 py-3 text-left transition last:border-b-0',
        selected ? 'border-l-primary bg-primary-weak' : 'hover:bg-surface-2',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
export function Avatar({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-surface-3 text-[12.5px] font-semibold text-ink-muted">
      {children}
    </span>
  );
}

/* ---------------- Form fields ---------------- */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
const control =
  'w-full rounded-[9px] border border-line bg-surface-2 px-2.5 py-2 text-sm text-ink outline-none transition focus:border-primary focus:bg-surface';
export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, className)} {...props} />;
}

/* ---------------- Misc ---------------- */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-6 text-sm text-ink-faint">{children}</p>;
}
export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-neg-bg px-3 py-2 text-sm text-neg">{children}</p>;
}
export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface [box-shadow:var(--shadow-sm)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
