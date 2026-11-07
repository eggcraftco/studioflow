// Admin Insights "Google Indexing" page (7 Nov 2026): the shape getSearchIndexStats returns and the pure
// rules the page uses. Tested by scripts/check-admin-search-index.mts.

export type SearchIndexDay = { date: string; clicks: number; impressions: number; ctr: number; position: number };
export type SearchIndexTotals = { clicks: number; impressions: number; ctr: number; position: number };
export type SearchIndexCounts = { inSitemap: number; indexed: number; notIndexed: number; unknown: number; byState: Record<string, number> };

export type SearchIndexLanguage = {
  code: string;
  label: string;
  prefix: string;
  byDate: SearchIndexDay[];
  totals: { current: SearchIndexTotals; previous: SearchIndexTotals };
  error?: string;
  index: SearchIndexCounts;
};

export type SearchIndexUrl = {
  url: string;
  lang: string;
  status: "indexed" | "not_indexed" | "unknown";
  inspectedAtMs: number;
  verdict?: string;
  coverageState?: string;
  indexingState?: string;
  pageFetchState?: string;
  robotsTxtState?: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
  error?: string;
  stale?: boolean;
};

export type SearchIndexSitemap = {
  path: string;
  type: string;
  isSitemapsIndex: boolean;
  isPending: boolean;
  lastSubmitted: string;
  lastDownloaded: string;
  warnings: number;
  errors: number;
  submitted: number;
};

export type SearchIndexResult = {
  ok: boolean;
  needsAccess?: boolean;
  message?: string;
  accessibleSites?: string[];
  property?: string;
  range?: { startDate: string; endDate: string };
  previousRange?: { startDate: string; endDate: string };
  languages?: SearchIndexLanguage[];
  sitemaps?: SearchIndexSitemap[];
  sitemapsError?: string;
  scan?: { scannedAtMs: number; trigger: string; urlCount: number; sitemapTotal?: number; truncated: boolean; inspected: number; errors: number; quotaHit: boolean; nextManualAtMs: number } | null;
  scanRequest?: { ok: boolean; reason?: string; nextAllowedAtMs?: number; message?: string; inspected?: number } | null;
  urls?: SearchIndexUrl[];
  history?: { date: string; byLanguage: Record<string, { inSitemap: number; indexed: number; notIndexed: number; unknown: number }> }[];
  limits?: { inspectionsPerDay: number; inspectionsPerMinute: number; dailyBudget: number; manualGapHours: number };
};

/** Indexed share of the pages that were checked (unknown ones are left out, not counted as missing). */
export function indexedShare(counts: SearchIndexCounts | undefined): number | null {
  if (!counts) return null;
  const checked = counts.indexed + counts.notIndexed;
  return checked > 0 ? (counts.indexed / checked) * 100 : null;
}

export function sumCounts(rows: (SearchIndexCounts | undefined)[]): SearchIndexCounts {
  const out: SearchIndexCounts = { inSitemap: 0, indexed: 0, notIndexed: 0, unknown: 0, byState: {} };
  for (const row of rows) {
    if (!row) continue;
    out.inSitemap += row.inSitemap;
    out.indexed += row.indexed;
    out.notIndexed += row.notIndexed;
    out.unknown += row.unknown;
    for (const [state, n] of Object.entries(row.byState || {})) out.byState[state] = (out.byState[state] || 0) + n;
  }
  return out;
}

/** Sum of the language totals for the period (impression-weighted position, like Google's average). */
export function sumTotals(rows: SearchIndexTotals[]): SearchIndexTotals {
  let clicks = 0;
  let impressions = 0;
  let positionSum = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    positionSum += row.position * row.impressions;
  }
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position: impressions > 0 ? positionSum / impressions : 0 };
}

/** Rank change: positive = moved up toward #1 (a smaller position is better). null when either side has no rank. */
export function positionChange(current: number, previous: number): number | null {
  if (!(current > 0) || !(previous > 0)) return null;
  return previous - current;
}

/** "https://nivadesk.app/de/pricing?x" → "/de/pricing?x"; the bare home page → "/". */
export function urlPath(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname === "nivadesk.app" ? "" : parsed.hostname;
    return `${host}${parsed.pathname || "/"}${parsed.search}`;
  } catch {
    return url;
  }
}

const FETCH_LABELS: Record<string, string> = {
  SUCCESSFUL: "Fetched",
  SOFT_404: "Soft 404",
  BLOCKED_ROBOTS_TXT: "Blocked by robots.txt",
  NOT_FOUND: "Not found (404)",
  ACCESS_DENIED: "Access denied (401)",
  SERVER_ERROR: "Server error (5xx)",
  REDIRECT_ERROR: "Redirect error",
  ACCESS_FORBIDDEN: "Forbidden (403)",
  BLOCKED_4XX: "Blocked (4xx)",
  INTERNAL_CRAWL_ERROR: "Google crawl error",
  INVALID_URL: "Invalid URL"
};

/** One line saying why a page is not indexed, from what URL Inspection returned. */
export function notIndexedReason(entry: SearchIndexUrl): string {
  if (entry.error) return entry.error;
  if (entry.indexingState === "BLOCKED_BY_META_TAG") return "noindex in the page's robots meta tag";
  if (entry.indexingState === "BLOCKED_BY_HTTP_HEADER") return "noindex in the X-Robots-Tag header";
  if (entry.robotsTxtState === "DISALLOWED") return "Blocked by robots.txt";
  const fetch = entry.pageFetchState && entry.pageFetchState !== "SUCCESSFUL" && entry.pageFetchState !== "PAGE_FETCH_STATE_UNSPECIFIED" ? FETCH_LABELS[entry.pageFetchState] || entry.pageFetchState : "";
  const base = entry.coverageState || entry.verdict || "Unknown";
  return fetch ? `${base} · ${fetch}` : base;
}

/** True when Google picked another URL as the canonical of this one. */
export function canonicalElsewhere(entry: SearchIndexUrl): boolean {
  return Boolean(entry.googleCanonical && entry.googleCanonical !== entry.url);
}

/** Can the admin start a scan now? (The server enforces the same gap.) */
export function manualScanState(result: SearchIndexResult | null, nowMs: number): { allowed: boolean; nextAtMs: number | null } {
  const next = result?.scanRequest?.nextAllowedAtMs || result?.scan?.nextManualAtMs || null;
  if (!next || next <= nowMs) return { allowed: true, nextAtMs: null };
  return { allowed: false, nextAtMs: next };
}

const UK_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** 1762493460000 → "7 Nov 2026, 05:31" (UK time). */
export function ukTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  return UK_TIME.format(new Date(ms));
}

/** An RFC 3339 time from Google → "5 Nov 2026, 10:00" (UK time), or "—". */
export function ukTimeFromIso(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ukTime(ms) : "—";
}
