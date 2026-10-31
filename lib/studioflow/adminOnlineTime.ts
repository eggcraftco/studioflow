// Admin Insights ▸ Online time (31 Oct 2026): how the `leaderboard` answer of getSitePresence is read on
// screen. Pure and dependency-free (apart from the app names it shares with Live) so
// scripts/check-admin-online-time.mts imports the same file the page uses. The counting rules live in
// functions insights/presence.js (leaderboardSummary); this file only names and formats.

import { PRESENCE_APPS, type PresenceApp } from "./adminLivePresence";

export type OnlinePeriod = "today" | "yesterday" | "7d";

export type OnlinePerson = {
  uid: string;
  minutes: number;
  activeHours: number;
  sessions: number;
  lastSeenMs: number | null;
  byApp: Partial<Record<PresenceApp, number>>;
  devices: { device: string; sessions: number }[];
  internal: "" | "staff" | "workspace";
  email: string;
  name: string;
  accountFound: boolean | null;
  workspaceId: string;
  workspace: string;
  workspaceFlag: string;
};

export type OnlineLeaderboard = {
  view: "business" | "qa";
  period: OnlinePeriod;
  firstDay: string;
  lastDay: string;
  startMs: number;
  endMs: number;
  open: boolean;
  slotMinutes: number;
  recordedSinceMs: number | null;
  totalPeople: number;
  totalMinutes: number;
  limit: number;
  people: OnlinePerson[];
  unidentified: { sessions: number; minutes: number; activeHours: number; byApp: Partial<Record<PresenceApp, number>>; lastSeenMs: number | null };
  hidden: { people: number; sessions: number; minutes: number };
  exclusion?: { view: string; flaggedWorkspaces: number | null; readable: boolean };
  accountsReadable?: boolean;
  workspacesReadable?: boolean;
  truncated?: boolean;
  retentionDays?: number;
};

export const ONLINE_PERIODS: { key: OnlinePeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" }
];

/** Within this long of the last heartbeat a person is shown as in an app now (Live's window). */
export const ONLINE_NOW_MS = 2 * 60000;

/** "0 min", "45 min", "3 h 05 min", "26 h 10 min" — hours never roll into days, so rows compare at a glance. */
export function durationLabel(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, "0")} min` : `${h} h`;
}

/** "in an app now", "12 min ago", "3 h ago", "Thu 29 Oct, 14:05". */
export function lastSeenLabel(ms: number | null | undefined, nowMs: number, locale = "en-GB"): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const age = nowMs - ms;
  if (age <= ONLINE_NOW_MS) return "in an app now";
  if (age < 60 * 60000) return `${Math.max(1, Math.floor(age / 60000))} min ago`;
  if (age < 24 * 3600000) return `${Math.floor(age / 3600000)} h ago`;
  return new Date(ms).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function isOnlineNow(ms: number | null | undefined, nowMs: number): boolean {
  return Boolean(ms) && nowMs - Number(ms) <= ONLINE_NOW_MS;
}

/** The apps a row used, in the owner's order, with their minutes; apps with no time are left out. */
export function appSplit(byApp: Partial<Record<PresenceApp, number>> | null | undefined) {
  return PRESENCE_APPS
    .map(app => ({ ...app, minutes: Math.max(0, Number(byApp?.[app.key]) || 0) }))
    .filter(app => app.minutes > 0);
}

/** "Web 2 h 10 min · Mac 1 h". */
export function appSplitLabel(byApp: Partial<Record<PresenceApp, number>> | null | undefined): string {
  return appSplit(byApp).map(app => `${app.short} ${durationLabel(app.minutes)}`).join(" · ");
}

/** The address when there is one; otherwise the name; otherwise why there is neither. */
export function personLabel(person: Pick<OnlinePerson, "email" | "name" | "accountFound">): string {
  if (person.email) return person.email;
  if (person.name) return person.name;
  if (person.accountFound === false) return "Deleted account";
  return "Account without an address";
}

export function internalLabel(person: Pick<OnlinePerson, "internal" | "workspaceFlag">): string {
  if (person.internal === "staff") return "NivaDesk staff";
  if (person.internal === "workspace") return person.workspaceFlag ? `Flagged workspace · ${person.workspaceFlag}` : "Flagged workspace";
  return "";
}

/** "Today so far (UK)", "Yesterday · Thu 29 Oct", "Sat 24 – Fri 30 Oct (UK days)". */
export function periodRangeLabel(board: Pick<OnlineLeaderboard, "period" | "firstDay" | "lastDay">, locale = "en-GB"): string {
  const day = (key: string) => {
    const ms = Date.parse(`${key}T12:00:00Z`);
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : key;
  };
  if (board.period === "today") return "Today so far (UK)";
  if (board.period === "yesterday") return `Yesterday · ${day(board.firstDay)}`;
  return `${day(board.firstDay)} – ${day(board.lastDay)} (UK days)`;
}

/**
 * What the minutes cover. Minute counting starts with the server update that writes the 2-minute
 * slots; before it there are only active hours, so the list is ranked by those and says so.
 */
export function coverage(board: Pick<OnlineLeaderboard, "recordedSinceMs" | "startMs" | "slotMinutes">): "none" | "partial" | "full" {
  if (board.recordedSinceMs === null || board.recordedSinceMs === undefined) return "none";
  return board.recordedSinceMs > board.startMs + (board.slotMinutes || 2) * 60000 ? "partial" : "full";
}

/** True when the answer comes from a server that does not know the list yet (before the functions deploy). */
export function isLegacyLeaderboard(answer: { leaderboard?: unknown } | null | undefined): boolean {
  return Boolean(answer) && !answer?.leaderboard;
}

/** Bar length of a row against the longest row, 0–100; by active hours when no minutes exist yet. */
export function barPercent(person: Pick<OnlinePerson, "minutes" | "activeHours">, people: Pick<OnlinePerson, "minutes" | "activeHours">[], byHours: boolean): number {
  const value = (p: Pick<OnlinePerson, "minutes" | "activeHours">) => (byHours ? p.activeHours : p.minutes);
  const max = Math.max(0, ...people.map(value));
  return max > 0 ? Math.round((value(person) / max) * 1000) / 10 : 0;
}
