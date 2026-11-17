// The admin on/off switch for data providers, backed by the data_sources table.
//
// An admin turns a provider off (PATCH /api/admin/data-sources/:id). Within a minute:
//   • a card fed only by that provider answers { status: "disabled" },
//   • a combined card (hazards, space) just drops that provider's row.
// A provider that has no row in the table, and any database problem, count as "enabled":
// a broken admin table must never take the dashboard down.
import type { ModuleId } from "@vantage/shared";

/** data_sources.name values. Keep in sync with the seed migration and each SubSource's `source`. */
export const MODULE_PROVIDERS: Record<ModuleId, readonly string[]> = {
  weather: ["Open-Meteo"],
  airQuality: ["Open-Meteo"],
  ocean: ["Open-Meteo"],
  hazards: ["NWS", "USGS"],
  space: ["Launch Library 2", "N2YO", "NOAA SWPC"],
  // Computed locally or read from files: nothing to switch off.
  astronomy: [],
  skyConditions: [],
};

export interface ProviderSwitchOptions {
  /** Returns the names of the providers that are switched off. */
  loadDisabled: () => Promise<string[]>;
  /** How long one database answer is reused. */
  ttlMs?: number;
  now?: () => number;
  logError?: (message: string, error: unknown) => void;
}

export interface ProviderSwitch {
  isProviderEnabled(name: string): Promise<boolean>;
  /** False only when the module has providers and every one of them is off. */
  isModuleEnabled(id: ModuleId): Promise<boolean>;
  /** Forget the cached answer (call after an admin changes a provider). */
  invalidate(): void;
}

export function createProviderSwitch(options: ProviderSwitchOptions): ProviderSwitch {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  const logError = options.logError ?? ((message, error) => console.error(message, error));
  let cached: { disabled: Set<string>; expires: number } | null = null;
  let loading: Promise<Set<string>> | null = null;

  async function disabledSet(): Promise<Set<string>> {
    if (cached && cached.expires > now()) return cached.disabled;
    loading ??= options
      .loadDisabled()
      .then((names) => new Set(names))
      .catch((error) => {
        logError("[providers] couldn't read data_sources; treating every provider as enabled:", error);
        return new Set<string>();
      })
      .then((disabled) => {
        cached = { disabled, expires: now() + ttlMs };
        loading = null;
        return disabled;
      });
    return loading;
  }

  return {
    async isProviderEnabled(name) {
      return !(await disabledSet()).has(name);
    },
    async isModuleEnabled(id) {
      const providers = MODULE_PROVIDERS[id];
      if (providers.length === 0) return true;
      const disabled = await disabledSet();
      return providers.some((name) => !disabled.has(name));
    },
    invalidate() {
      cached = null;
    },
  };
}
