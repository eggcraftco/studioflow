// Onboarding telemetry, the rules a browser applies before anything leaves it (30 Oct 2026).
//
// The server (functions/lifecycle/onboardingTelemetry.js) has the final say on what is
// stored; this file only keeps the browser from sending what the server would refuse or
// already has: nothing after an account's first 30 days, each happening once per tab
// (once per day for the daily ones), and a section name — never a path, which can carry
// an order id or a search.
//
// Pure: no Firebase, no window. Checked by scripts/check-onboarding-events.mts.

export type OnboardingEventName =
  | "app_opened"
  | "setup_step_viewed"
  | "setup_finished"
  | "screen_viewed"
  | "order_form_opened"
  | "checklist_item_opened"
  | "store_connect_started"
  | "plan_page_viewed"
  | "checkout_started"
  | "error_shown";

export type OnboardingEvent = { name: OnboardingEventName; props: Record<string, string> };

export const RECORD_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The events that may repeat on a later day; the rest are once per account. */
const DAILY: ReadonlySet<OnboardingEventName> = new Set([
  "app_opened", "screen_viewed", "order_form_opened", "store_connect_started", "plan_page_viewed", "checkout_started", "error_shown"
]);

/** Whether an account is young enough to be measured, by Firebase Auth's creation time. */
export function inRecordingWindow(creationTime: string | undefined | null, nowMs: number): boolean {
  const created = Date.parse(String(creationTime || ""));
  if (!Number.isFinite(created)) return false;
  return nowMs - created < RECORD_WINDOW_DAYS * DAY_MS;
}

/** The key that keeps one tab from sending the same happening twice. */
export function onboardingEventKey(event: OnboardingEvent, nowMs: number): string {
  const props = Object.keys(event.props).sort().map(key => `${key}=${event.props[key]}`).join("&");
  const period = DAILY.has(event.name) ? new Date(nowMs).toISOString().slice(0, 10) : "once";
  return `${event.name}|${props}|${period}`;
}

/** Top-level app routes, by their first path segment. */
const SCREEN_BY_SEGMENT: Record<string, string> = {
  home: "dashboard",
  // /dashboard is the money overview; the apps send their Dashboard tab as "finance" too.
  dashboard: "finance",
  orders: "orders",
  customers: "customers",
  production: "production",
  inventory: "inventory",
  files: "files",
  finance: "finance",
  banking: "banking",
  bank: "banking",
  integrations: "integrations",
  settings: "settings",
  plan: "plans",
  plans: "plans",
  billing: "plans",
  calendar: "calendar",
  schedule: "calendar",
  team: "settings",
  "quick-reply": "messages",
  notes: "notes",
  messages: "messages",
  inbox: "messages",
  reports: "reports",
  sales: "sales",
  guide: "help",
  help: "help"
};

/**
 * The section a path belongs to, or "" for a page that is not part of the app
 * (the public site, /login, /admin). Only the first segment is read, so
 * /orders?orderId=… and /customers/abc123 never send more than "orders" / "customers".
 */
export function screenForPath(pathname: string | null | undefined): string {
  const segment = String(pathname || "").split("?")[0].split("#")[0].split("/").filter(Boolean)[0] || "";
  if (!segment) return "";
  if (["admin", "login", "signup", "pricing", "privacy", "terms", "invite", "pay", "p", "e", "f", "portal"].includes(segment)) return "";
  return SCREEN_BY_SEGMENT[segment.toLowerCase()] || "other";
}

/** A Firebase error code as the server accepts it ("functions/unavailable"), never a message. */
export function errorCodeOf(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_\-/.]{0,47}$/.test(code) ? code : "unknown";
}
