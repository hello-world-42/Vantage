// Shared by cards that combine several providers (hazards, space).
/* ───────────────────────── Sub-sources ───────────────────────── */

/**
 * A card that combines several providers (hazards, space) reports each provider
 * separately, so one failing provider shows as unavailable inside the card
 * instead of failing the whole card.
 */
export type SourceResult<T> =
  | { status: "ok"; source: string; data: T }
  | { status: "not_applicable"; source: string; reason: string }
  | { status: "error"; source: string; message: string };
