import { useId } from 'react';
import type { ReactNode } from 'react';
import type { ModuleResult } from '@vantage/shared';

interface ModuleMeta {
  source: string;
  fetchedAt: string;
}

interface ModuleCardProps<T> {
  title: string;
  /** The module's envelope from /api/location. Leave undefined while it hasn't arrived. */
  result?: ModuleResult<T>;
  /** Force the loading state (also shown whenever `result` is undefined). */
  loading?: boolean;
  /** Shown as a Retry button in the error state. */
  onRetry?: () => void;
  /** Renders the module's own content. Only called when status is "ok". */
  children: (data: T, meta: ModuleMeta) => ReactNode;
}

function formatTime(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Skeleton({ label }: { label: string }) {
  const bar = 'h-3 rounded bg-white/10 animate-pulse motion-reduce:animate-none';
  return (
    <div role="status" className="flex flex-col gap-2.5">
      <span className="sr-only">{label}</span>
      <div className={`${bar} w-3/4`} />
      <div className={`${bar} w-full`} />
      <div className={`${bar} w-1/2`} />
    </div>
  );
}

/**
 * Shared shell for every dashboard module. It owns the five states (loading / ok / not
 * applicable / error / disabled) so individual modules only render their own data.
 */
export default function ModuleCard<T>({ title, result, loading, onRetry, children }: ModuleCardProps<T>) {
  const headingId = useId();
  const isLoading = Boolean(loading) || !result;

  let tone = 'border-white/10 bg-white/[0.03]';
  let body: ReactNode;

  if (!result || isLoading) {
    body = <Skeleton label={title ? `Loading ${title}` : 'Loading'} />;
  } else {
    switch (result.status) {
      case 'ok': {
        const time = formatTime(result.fetchedAt);
        body = (
          <>
            {children(result.data, { source: result.source, fetchedAt: result.fetchedAt })}
            <p className="m-0 mt-3 text-xs text-slate-500">
              Source: {result.source}
              {time ? ` · updated ${time}` : ''}
            </p>
          </>
        );
        break;
      }
      case 'not_applicable':
        tone = 'border-dashed border-white/10 bg-transparent';
        body = <p className="m-0 text-sm text-slate-400">{result.reason}</p>;
        break;
      case 'error':
        tone = 'border-red-400/30 bg-red-950/30';
        body = (
          <div className="flex flex-col items-start gap-2">
            <p className="m-0 text-sm text-red-200">{result.message}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border border-red-300/30 px-3 py-1 text-xs text-red-100 hover:bg-red-400/10"
              >
                Retry
              </button>
            )}
          </div>
        );
        break;
      case 'disabled':
        tone = 'border-dashed border-white/10 bg-transparent';
        body = <p className="m-0 text-sm text-slate-400">This data source is turned off right now.</p>;
        break;
      default: {
        const unreachable: never = result; // a new ModuleResult status must be handled above
        void unreachable;
        body = null;
      }
    }
  }

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-busy={isLoading}
      className={`rounded-xl border p-4 ${tone}`}
    >
      {title && (
        <h3 id={headingId} className="m-0 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
      )}
      {body}
    </section>
  );
}
