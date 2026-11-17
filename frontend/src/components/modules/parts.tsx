// Building blocks shared by the dashboard cards.
import type { ReactNode } from 'react';
import type { SourceResult } from '@vantage/shared/modules/sources';

/** A label/value pair. Use inside <StatGrid>. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="m-0 mt-0.5 text-sm text-slate-100">{value}</dd>
      {hint && <dd className="m-0 text-xs text-slate-400">{hint}</dd>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>;
}

/** The big number at the top of a card. */
export function Headline({ value, label, badge }: { value: ReactNode; label?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="m-0 text-2xl font-semibold leading-tight text-white">{value}</p>
        {label && <p className="m-0 mt-0.5 text-sm text-slate-300">{label}</p>}
      </div>
      {badge}
    </div>
  );
}

export type Tone = 'neutral' | 'good' | 'caution' | 'warning' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'border-white/15 bg-white/5 text-slate-200',
  good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  caution: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  warning: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
  danger: 'border-red-400/40 bg-red-500/15 text-red-200',
};

/** Small colored pill. The text always says what the color means, so color isn't the only cue. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

/**
 * One provider's section inside a combined card (hazards, space). Shows the provider's own
 * state, so one provider being down doesn't hide the others.
 */
export function SourceSection<T>({
  title,
  result,
  children,
}: {
  title: string;
  result: SourceResult<T> | undefined;
  children: (data: T) => ReactNode;
}) {
  if (!result) return null;
  return (
    <section className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="m-0 text-sm font-medium text-slate-200">{title}</h4>
        <span className="shrink-0 text-[11px] text-slate-500">{result.source}</span>
      </div>
      {result.status === 'ok' && children(result.data)}
      {result.status === 'not_applicable' && <p className="m-0 text-sm text-slate-400">{result.reason}</p>}
      {result.status === 'error' && <p className="m-0 text-sm text-red-200">{result.message}</p>}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm text-slate-400">{children}</p>;
}
