// Admin Insights ▸ Live (29 Oct 2026) — how the in-app presence answer of getSitePresence is read on
// screen. Pure and dependency-free so scripts/check-admin-live-presence.mts imports the same file the
// page uses. The server rules live in functions insights/presence.js; this file only names and formats.

export type PresenceBucket = { sessions: number; members: number; unidentified: number; people: number };
export type PresenceApp = "web" | "ios" | "ipados" | "ios_unknown" | "mac" | "android";
export type PresencePlatform = "web" | "mac" | "ios" | "android";

export type PresenceCounts = PresenceBucket & {
  byPlatform: Record<PresencePlatform, PresenceBucket>;
  byApp?: Record<PresenceApp, PresenceBucket>;
};

export type PresenceLive = PresenceCounts & {
  view: "business" | "qa";
  windowSeconds: number;
  hiddenSessions: number;
  staffSessions: number;
  devices: { device: string; sessions: number }[];
  versions: { platform: string; appVersion: string; appBuild: string; sessions: number }[];
  systems: { platform: string; os: string; browser: string; sessions: number }[];
};

export type PresenceHistory = {
  hourly: (PresenceCounts & { hour: string; startMs: number })[];
  daily: (PresenceCounts & { date: string })[];
  recordedSinceMs: number | null;
  truncated?: boolean;
};

export type PresenceEngagement = {
  accounts: number;
  hiddenAccounts: number;
  neverActive: number;
  dau: number;
  wau: number;
  mau: number;
  stickiness: number | null;
  error?: string;
};

export type PresenceAnswer = {
  active?: number;
  platforms?: Record<string, number>;
  live?: PresenceLive;
  history?: PresenceHistory;
  engagement?: PresenceEngagement;
  exclusion?: { view: string; flaggedWorkspaces: number | null; readable: boolean };
  retentionDays?: number;
};

/** The apps in the order the owner lists them. */
export const PRESENCE_APPS: { key: PresenceApp; label: string; short: string; color: string }[] = [
  { key: "web", label: "Web", short: "Web", color: "#0a84ff" },
  { key: "ios", label: "iOS (iPhone)", short: "iPhone", color: "#8a5cf6" },
  { key: "ipados", label: "iPadOS (iPad)", short: "iPad", color: "#bf5af2" },
  { key: "ios_unknown", label: "iPhone or iPad (older app)", short: "iPhone/iPad (older app)", color: "#a78bfa" },
  { key: "mac", label: "macOS", short: "Mac", color: "#30b0c7" },
  { key: "android", label: "Android", short: "Android", color: "#34c759" }
];

const PLATFORM_APP: Record<PresencePlatform, PresenceApp> = { web: "web", mac: "mac", ios: "ios_unknown", android: "android" };

/**
 * Per-app counts. A server that already sends `byApp` is read as is; an older answer (byPlatform only)
 * cannot tell iPhone from iPad, so all of iOS lands on the "older app" row instead of being guessed.
 */
export function appBuckets(counts: PresenceCounts | undefined | null): Record<PresenceApp, PresenceBucket> {
  const empty = (): PresenceBucket => ({ sessions: 0, members: 0, unidentified: 0, people: 0 });
  const out = Object.fromEntries(PRESENCE_APPS.map(app => [app.key, empty()])) as Record<PresenceApp, PresenceBucket>;
  if (!counts) return out;
  if (counts.byApp) {
    for (const app of PRESENCE_APPS) if (counts.byApp[app.key]) out[app.key] = { ...counts.byApp[app.key] };
    return out;
  }
  for (const [platform, bucket] of Object.entries(counts.byPlatform || {})) {
    const app = PLATFORM_APP[platform as PresencePlatform];
    if (app && bucket) out[app] = { ...bucket };
  }
  return out;
}

const DEVICE_LABELS: Record<string, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  mac: "Mac",
  android_phone: "Android phone",
  android_tablet: "Android tablet",
  desktop: "Browser · desktop",
  mobile: "Browser · phone",
  tablet: "Browser · tablet",
  ios_unknown: "iPhone or iPad (not reported)",
  android_unknown: "Android (phone or tablet not reported)",
  web_unknown: "Browser (screen size not reported)",
  mac_unknown: "Mac"
};

export function deviceLabel(device: string): string {
  return DEVICE_LABELS[device] || device.replace(/_/g, " ");
}

/**
 * Apple build numbers (CFBundleVersion) of the released apps — the URLSession user agent carries the
 * build even on apps that report nothing else. 18–29 shipped as 2.0; from the project file history.
 */
const APPLE_BUILD_VERSIONS: Record<string, string> = { "30": "2.1", "31": "2.2", "32": "2.2", "33": "2.3" };

export function appleVersionForBuild(build: string): string {
  if (APPLE_BUILD_VERSIONS[build]) return APPLE_BUILD_VERSIONS[build];
  const n = Number(build);
  if (Number.isInteger(n) && n >= 18 && n <= 29) return "2.0";
  return "";
}

/** "2.3 (33)", "2.4 (34)", "build 29 Oct 17:20 UTC", "not reported". */
export function versionLabel(platform: string, appVersion: string, appBuild: string): string {
  if (platform === "web") {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(appBuild || "");
    if (!m) return appBuild ? `build ${appBuild}` : "build not reported";
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
    const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return `build ${day} ${m[4]}:${m[5]} UTC`;
  }
  const version = appVersion || ((platform === "ios" || platform === "mac") ? appleVersionForBuild(appBuild) : "");
  if (version && appBuild) return `${version} (${appBuild})`;
  if (version) return version;
  if (appBuild) return `build ${appBuild}`;
  return "not reported";
}

export const PLATFORM_LABELS: Record<string, string> = { web: "Web", mac: "macOS", ios: "iOS / iPadOS", android: "Android" };

/** Local hour label for a bucket start ("14:00"). */
export function hourLabel(startMs: number, locale = "en-GB"): string {
  return new Date(startMs).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** "Wed 29" for a YYYY-MM-DD UK day key. */
export function dayLabel(date: string, locale = "en-GB"): string {
  const ms = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(ms)) return date;
  return new Date(ms).toLocaleDateString(locale, { weekday: "short", day: "numeric", timeZone: "UTC" });
}

/** "31.4%" or "—" (no monthly actives, so no ratio). */
export function stickinessLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

/** Peak bucket of a history series, for the "busiest hour/day" line; null when nothing was recorded. */
export function peakOf<T extends { people: number }>(series: T[]): T | null {
  let best: T | null = null;
  for (const item of series || []) if (item.people > 0 && (!best || item.people > best.people)) best = item;
  return best;
}

/** True when the answer comes from a server without the Live fields (before the functions deploy). */
export function isLegacyPresence(answer: PresenceAnswer | null | undefined): boolean {
  return Boolean(answer) && !answer?.live;
}

// ---------------------------------------------------------------- CSV

/** One CSV cell: quoted when needed, formula-leading characters neutralised for spreadsheets. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Browser download of a CSV text (UTF-8 with BOM so spreadsheets read non-ASCII names). */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
