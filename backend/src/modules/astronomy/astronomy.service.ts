// The astronomy card: sun and moon for the selected cell, computed locally (suncalc).
// AstronomyAPI (astronomyApi.client.ts) isn't needed for this; it stays unused unless the
// team wants something suncalc can't do, like planet positions.
import type { AstronomyData } from "@vantage/shared/modules/astronomy";
import { TTL_SECONDS } from "../../cache/ttlPolicy.js";
import type { ModuleDefinition } from "../../aggregator/moduleRegistry.js";
import { computeAstronomy } from "./suncalc.service.js";

export function createAstronomyModule(now: () => Date = () => new Date()): ModuleDefinition<AstronomyData> {
  return {
    id: "astronomy",
    label: "Sun and moon",
    scope: "cell",
    // Short TTL: the sun's position and day/night state move. Computing it costs well under a millisecond.
    ttlSeconds: TTL_SECONDS.astronomy,
    async fetch({ cell }) {
      return { status: "ok", source: "suncalc", data: computeAstronomy(cell.lat, cell.lng, now()) };
    },
  };
}
