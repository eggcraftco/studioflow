// Admin Insights ▸ one person's statistics (7 Nov 2026): the shape getAdminUserStats returns and the pure rules
// the page uses. Tested by scripts/check-admin-user-stats.mts.

export type AdminUserApp = "web" | "ios" | "ipados" | "ios_unknown" | "mac" | "android";

export type AdminUserStats = {
  ok: boolean;
  generatedAtMs: number;
  user: {
    uid: string;
    email: string;
    displayName: string;
    createdAtMs: number | null;
    lastSignInMs: number | null;
    lastActiveMs: number | null;
    emailVerified: boolean;
    providers: string[];
    secondFactors: number;
    disabled: boolean;
    admin: boolean;
    staff: boolean;
  };
  workspaces: {
    companyId: string;
    exists: boolean;
    name: string;
    role: string;
    plan: string;
    billingState: string;
    createdAtMs: number | null;
    members: number;
    flagged: string;
    ordersTotal: number | null;
  }[];
  workspacesError: string;
  work: { ordersCreated: number | null; ordersAssigned: number | null; notes: number | null; supportTickets: number | null };
  apps: {
    firstDay: string;
    lastDay: string;
    recordedSinceMs: number | null;
    slotMinutes: number;
    minutes: number;
    activeHours: number;
    activeDays: number;
    sessions: number;
    lastSeenMs: number | null;
    byApp: Partial<Record<AdminUserApp, number>>;
    devices: { device: string; sessions: number }[];
    browsers: { family: string; major?: string; kind?: string; brand?: string; sessions?: number }[];
    days: { date: string; minutes: number }[];
    heatmap: number[][];
    versions: { app: string; version: string; build: string; os: string; sessions: number; lastSeenMs: number }[];
  } | null;
  appsError: string;
};

export const ADMIN_USER_APP_LABELS: Record<string, string> = {
  web: "Web",
  ios: "iPhone",
  ipados: "iPad",
  ios_unknown: "iPhone or iPad (older app)",
  mac: "Mac",
  android: "Android"
};

export const ADMIN_USER_APP_COLORS: Record<string, string> = {
  web: "#0a84ff",
  ios: "#8a5cf6",
  ipados: "#bf5af2",
  ios_unknown: "#a78bfa",
  mac: "#30b0c7",
  android: "#34c759"
};

const PROVIDERS: Record<string, string> = { "google.com": "Google", "apple.com": "Apple", password: "Email + password", "microsoft.com": "Microsoft", phone: "Phone" };

export function providerLabel(id: string): string {
  return PROVIDERS[id] || id;
}

/** 0 → "0 min", 45 → "45 min", 125 → "2 h 05 min". */
export function minutesText(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago", "3 months ago". */
export function timeAgo(ms: number | null | undefined, nowMs: number): string {
  if (!ms || !Number.isFinite(ms)) return "never";
  const diff = Math.max(0, nowMs - ms);
  const min = Math.floor(diff / 60000);
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 18 ? `${months} months ago` : `${Math.round(days / 365)} years ago`;
}

export type UserSignal = { tone: "good" | "warn" | "bad"; text: string };

/**
 * Plain-language signals the owner reads first: is this person active, stuck, or gone?
 * Only from facts on the page; nothing is guessed.
 */
export function userSignals(stats: AdminUserStats, nowMs: number): UserSignal[] {
  const out: UserSignal[] = [];
  const u = stats.user;
  const day = 86400000;
  const lastActive = Math.max(u.lastActiveMs || 0, u.lastSignInMs || 0, stats.apps?.lastSeenMs || 0);
  if (u.disabled) out.push({ tone: "bad", text: "Account disabled" });
  if (!stats.workspaces.length && !stats.workspacesError) out.push({ tone: "warn", text: "No workspace: signed up but never set one up" });
  if (lastActive && nowMs - lastActive < day) out.push({ tone: "good", text: "Active in the last 24 hours" });
  else if (lastActive && nowMs - lastActive < 7 * day) out.push({ tone: "good", text: "Active this week" });
  else if (lastActive && nowMs - lastActive >= 30 * day) out.push({ tone: "bad", text: `Not seen for ${Math.floor((nowMs - lastActive) / day)} days` });
  else if (lastActive) out.push({ tone: "warn", text: `Last seen ${timeAgo(lastActive, nowMs)}` });
  if (u.createdAtMs && u.lastSignInMs && u.lastSignInMs - u.createdAtMs < 10 * 60000 && nowMs - u.createdAtMs > 2 * day) {
    out.push({ tone: "warn", text: "Never came back after signing up" });
  }
  if (stats.apps && stats.apps.activeDays >= 5) out.push({ tone: "good", text: `Used NivaDesk on ${stats.apps.activeDays} of the last 7 days` });
  const appsUsed = Object.keys(stats.apps?.byApp || {}).length;
  if (appsUsed >= 2) out.push({ tone: "good", text: `Uses ${appsUsed} apps` });
  if (!u.emailVerified) out.push({ tone: "warn", text: "Email not verified" });
  if (u.secondFactors > 0) out.push({ tone: "good", text: "Two-step sign-in on" });
  return out;
}

/** Percent of the person's app minutes per app, largest first. */
export function appShares(byApp: Partial<Record<string, number>>): { app: string; label: string; minutes: number; percent: number; color: string }[] {
  const entries = Object.entries(byApp).filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0);
  const total = entries.reduce((a, [, m]) => a + m, 0);
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([app, minutes]) => ({ app, label: ADMIN_USER_APP_LABELS[app] || app, minutes, percent: total ? (minutes / total) * 100 : 0, color: ADMIN_USER_APP_COLORS[app] || "#a2a2a2" }));
}

/** Short id for support conversations: first 6 + last 4 characters. */
export function shortUid(uid: string): string {
  return uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid;
}
