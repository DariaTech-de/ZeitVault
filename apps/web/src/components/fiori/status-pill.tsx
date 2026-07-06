import { type VariantProps, cva } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const pill = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-tight',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-3 text-ink-muted',
        positive: 'bg-pos-bg text-pos',
        warning: 'bg-warn-bg text-warn',
        negative: 'bg-neg-bg text-neg',
        info: 'bg-info-bg text-info',
        solid: 'bg-primary text-on-primary',
      },
      dot: { true: '', false: '' },
    },
    defaultVariants: { tone: 'neutral', dot: true },
  },
);

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof pill> & { dot?: boolean };

/** Semantischer Objektstatus (Fiori ObjectStatus). Der Punkt kodiert den Zustand zusätzlich zur Farbe. */
export function StatusPill({ className, tone, dot = true, children, ...props }: StatusPillProps) {
  return (
    <span className={cn(pill({ tone }), className)} {...props}>
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', tone === 'solid' ? 'bg-on-primary' : 'bg-current')}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
