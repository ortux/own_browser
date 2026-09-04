/**
 * Centralized constants for the Zyphora browser.
 * Magic numbers previously scattered across 10+ files.
 */

// ── Navigation ──────────────────────────────────────────────────────────────
/** Max entries in the HTTPS upgrade attempt set per webContents before clearing. */
export const HTTPS_UPGRADE_CAP = 100;
/** Max entries in the tracking-param strip attempt set per webContents before clearing. */
export const PARAM_STRIP_CAP = 100;

// ── Database ────────────────────────────────────────────────────────────────
/** Deduplication window for history entries (ms). */
export const HISTORY_DEDUP_WINDOW_MS = 30_000;
/** Maximum number of history rows to retain. */
export const HISTORY_MAX_ROWS = 50_000;

// ── Ad blocker ──────────────────────────────────────────────────────────────
/** Max sites tracked for per-site block stats. */
export const MAX_TRACKED_SITES = 300;
/** Max blocked requests stored per site. */
export const MAX_BLOCKED_REQUESTS_PER_SITE = 50;
/** Filter list cache max age (ms). */
export const ADBLOCK_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Downloads ───────────────────────────────────────────────────────────────
/** Max download records kept in memory. */
export const MAX_DOWNLOAD_RECORDS = 500;

// ── Permissions ─────────────────────────────────────────────────────────────
/** Permission prompt auto-deny timeout (ms). */
export const PERMISSION_TIMEOUT_MS = 60_000;

// ── Session ─────────────────────────────────────────────────────────────────
/** Max tabs allowed in a session. */
export const MAX_TABS = 100;

// ── Agent ───────────────────────────────────────────────────────────────────
/** Max entries in the agent action history ring buffer. */
export const AGENT_HISTORY_CAP = 60;

// ── UI ──────────────────────────────────────────────────────────────────────
/** Debounce delay for suggestion loading in the address bar (ms). */
export const SUGGESTION_DEBOUNCE_MS = 120;
