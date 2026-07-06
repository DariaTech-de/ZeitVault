import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'warning' | 'negative' | 'positive';

const toneMap: Record<Tone, { box: string; icon: string }> = {
  info: { box: 'bg-info-bg border-info/25', icon: 'text-info' },
  warning: { box: 'bg-warn-bg border-warn/30', icon: 'text-warn' },
  negative: { box: 'bg-neg-bg border-neg/30', icon: 'text-neg' },
  positive: { box: 'bg-pos-bg border-pos/30', icon: 'text-pos' },
};

const icons: Record<Tone, ReactNode> = {
  info: <path d="M12 8h.01M11 12h1v4h1" />,
  positive: <path d="M8 12l3 3 5-6" />,
  warning: <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  negative: <path d="M12 8v5M12 16h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />,
};

/** Fiori MessageStrip: kontextsensitiver Hinweis mit semantischer Farbe und Icon. */
export function MessageStrip({
  tone = 'info',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const t = toneMap[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm text-ink', t.box)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', t.icon)}
        aria-hidden="true"
      >
        {tone === 'info' && <circle cx="12" cy="12" r="9" />}
        {icons[tone]}
      </svg>
      <div>{children}</div>
    </div>
  );
}
