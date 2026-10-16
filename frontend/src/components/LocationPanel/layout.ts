// Single source of truth for dashboard geometry. The panel (CSS) and the globe's
// camera padding (JS) both read these, so the globe always centers in the space
// the dashboard leaves free.

/** Dashboard width on desktop (px). */
export const PANEL_WIDTH = 420;
/** Dashboard height on mobile, as a fraction of the viewport. */
export const SHEET_HEIGHT_RATIO = 0.5;
/** Matches Tailwind's `md` breakpoint: >= this is "desktop" (side panel), below is a bottom sheet. */
export const DESKTOP_MIN_WIDTH = 768;
/** Slide duration shared by the panel's CSS transition and the globe's camera ease. */
export const PANEL_TRANSITION_MS = 500;
