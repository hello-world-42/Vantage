// Per-provider budget for outbound requests, so a busy afternoon can't burn through
// a provider's hourly quota (N2YO: 100/hour, Launch Library free tier: 15/hour).
//
//   const n2yo = createThrottle({ name: "N2YO", limit: 90, windowMs: HOUR });
//   n2yo.take();            // throws ThrottledError once 90 calls were made in the last hour
//
// In-memory and per process. That's enough for one server; with several instances each
// would get its own budget, so lower the limits (or move this to Redis) at that point.

export class ThrottledError extends Error {
  constructor(
    public readonly provider: string,
    /** Milliseconds until a request is allowed again. */
    public readonly retryAfterMs: number,
  ) {
    super(`${provider} request budget is used up; try again in ${Math.ceil(retryAfterMs / 1000)} s.`);
    this.name = "ThrottledError";
  }
}

export interface ThrottleOptions {
  /** Provider name used in errors. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface Throttle {
  /** Spend one request, or throw ThrottledError if the budget is used up. */
  take(): void;
  /** Requests left in the current window. */
  remaining(): number;
}

export function createThrottle(options: ThrottleOptions): Throttle {
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new RangeError("limit must be a positive integer");
  if (!(options.windowMs > 0)) throw new RangeError("windowMs must be positive");
  const now = options.now ?? Date.now;
  // Sliding window: timestamps of the requests made within the last windowMs, oldest first.
  const sent: number[] = [];

  const prune = (t: number) => {
    while (sent.length > 0 && sent[0] <= t - options.windowMs) sent.shift();
  };

  return {
    take() {
      const t = now();
      prune(t);
      if (sent.length >= options.limit) {
        throw new ThrottledError(options.name, sent[0] + options.windowMs - t);
      }
      sent.push(t);
    },
    remaining() {
      prune(now());
      return options.limit - sent.length;
    },
  };
}
