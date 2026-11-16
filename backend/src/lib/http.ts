/**
 * Outbound HTTP for data-module clients: every upstream call gets a timeout.
 *
 *   const data = await fetchJson<MyResponse>(url, { timeoutMs: 5000, signal: context.signal });
 *
 * - The timeout covers the whole request, including reading the body.
 * - Pass the aggregator's `context.signal` so a request stops when the aggregator gives up.
 * - Errors are HttpRequestError with a `code`. Messages never include the URL,
 *   because some URLs carry API keys in the query string (Mapbox, FIRMS, N2YO).
 */

export const DEFAULT_TIMEOUT_MS = 5_000;

export type HttpErrorCode = "timeout" | "aborted" | "network" | "http" | "invalid_response";

export class HttpRequestError extends Error {
  constructor(
    public readonly code: HttpErrorCode,
    message: string,
    /** The upstream HTTP status, for code "http". */
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export interface HttpOptions {
  /** Defaults to 5 seconds. */
  timeoutMs?: number;
  /** The caller's signal, usually the aggregator's context.signal. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Name used in error messages, e.g. "Open-Meteo". Defaults to "Upstream service". */
  service?: string;
  /** Injected in tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

async function request<T>(
  url: string | URL,
  options: HttpOptions,
  accept: string,
  readBody: (response: Response) => Promise<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive number");
  }
  const service = options.service ?? "Upstream service";
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  const transport = options.fetch ?? fetch;

  // Explain an abort by whichever signal fired: the timeout or the caller.
  const abortError = () =>
    timeoutSignal.aborted
      ? new HttpRequestError("timeout", `${service} timed out after ${timeoutMs} ms.`)
      : new HttpRequestError("aborted", `${service} request was cancelled.`);

  let response: Response;
  try {
    response = await transport(url, { headers: { Accept: accept, ...options.headers }, signal });
  } catch {
    if (signal.aborted) throw abortError();
    throw new HttpRequestError("network", `Could not reach ${service}.`);
  }

  if (!response.ok) {
    // Drain the body so the connection can be reused, but never surface it.
    await response.body?.cancel().catch(() => {});
    throw new HttpRequestError("http", `${service} responded with HTTP ${response.status}.`, response.status);
  }

  try {
    return await readBody(response);
  } catch {
    if (signal.aborted) throw abortError();
    throw new HttpRequestError("invalid_response", `${service} sent a response that couldn't be read.`);
  }
}

/** GET a URL and parse the body as JSON. Validate the result with zod in the caller. */
export function fetchJson<T = unknown>(url: string | URL, options: HttpOptions = {}): Promise<T> {
  return request(url, options, "application/json", (response) => response.json() as Promise<T>);
}

/** GET a URL and return the body as text (CSV from FIRMS, RSS/CAP from GVP). */
export function fetchText(url: string | URL, options: HttpOptions = {}): Promise<string> {
  return request(url, options, "*/*", (response) => response.text());
}
