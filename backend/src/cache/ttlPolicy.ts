// How long each module's results stay cached. The ONLY place TTLs are set.
import type { ModuleId } from "@vantage/shared";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export const TTL_SECONDS: Record<ModuleId, number> = {
  hazards: 5 * MINUTE, //       alerts and quakes change quickly
  weather: 10 * MINUTE,
  airQuality: 30 * MINUTE,
  ocean: 30 * MINUTE,
  space: 1 * HOUR, //          N2YO / Launch Library have tiny hourly quotas
  astronomy: 6 * HOUR, //       sun/moon times barely change within a day
  skyConditions: 24 * HOUR, //  light pollution / population are static grids
};
