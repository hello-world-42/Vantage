import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { GeocodeResult } from '@vantage/shared';
import { geocode } from '../../api/client';

interface SearchProps {
  onSelect: (result: GeocodeResult) => void;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export default function Search({ onSelect }: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const skipNextSearch = useRef(false); // set when we fill the input from a chosen result

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= MIN_CHARS;

  // Debounced lookup; in-flight requests are aborted when the query changes.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (trimmed.length < MIN_CHARS) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const found = await geocode(trimmed, controller.signal);
        setResults(found);
        setActive(-1);
        setStatus('ready');
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus('error');
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  function choose(result: GeocodeResult) {
    skipNextSearch.current = true;
    setQuery(result.name);
    setOpen(false);
    setActive(-1);
    onSelect(result);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const count = results.length;
    if (e.key === 'ArrowDown' && count) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % count);
    } else if (e.key === 'ArrowUp' && count) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? count - 1 : i - 1));
    } else if (e.key === 'Enter' && open && count) {
      e.preventDefault();
      choose(results[active >= 0 ? active : 0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const currentStatus: Status = hasQuery ? status : 'idle';
  const showList = open && currentStatus === 'ready' && results.length > 0;
  const message =
    !open || !hasQuery
      ? null
      : currentStatus === 'loading'
        ? 'Searching…'
        : currentStatus === 'error'
          ? 'Search is unavailable right now.'
          : currentStatus === 'ready' && results.length === 0
            ? 'No places found.'
            : null;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 shadow-lg backdrop-blur focus-within:border-sky-400/60 focus-within:ring-2 focus-within:ring-sky-400/30">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-slate-400" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="text"
          role="combobox"
          aria-label="Search for a place"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search a place…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              setResults([]);
              setStatus('idle');
            }}
            className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-slate-200"
          >
            ×
          </button>
        )}
      </div>

      {(showList || message) && (
        <div className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-xl border border-white/10 bg-slate-950/90 shadow-xl backdrop-blur">
          {message && (
            <p role="status" className="px-3 py-2.5 text-sm text-slate-400">
              {message}
            </p>
          )}
          {showList && (
            <ul id={listId} role="listbox" aria-label="Search results" className="max-h-72 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li
                  key={r.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so the input's blur doesn't close the list first
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(r);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-sky-400/15' : ''}`}
                >
                  <div className="truncate text-sm text-slate-100">{r.name}</div>
                  {r.context && <div className="truncate text-xs text-slate-400">{r.context}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
