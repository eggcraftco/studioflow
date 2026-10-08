// Page access by member key (audit gap 9, 8 Oct 2026).
//
// One table answers two questions: which member-access key hides a sidebar
// item (components/AppShell.tsx) and which key a page checks again when it
// loads, so a typed URL cannot reach a screen the sidebar would not offer.
// The page check is the one that matters — the sidebar is only a courtesy.
//
// Pure (type-only import) so scripts/check-role-editor-safety.mjs can run it
// in plain Node, like messagingAccess.ts.
import type { WorkspaceMemberAccessKey } from "./firestore";

export type PageAccessLike = Partial<Record<WorkspaceMemberAccessKey, boolean>> | null | undefined;

export const PAGE_ACCESS_BY_PATH: Record<string, WorkspaceMemberAccessKey> = {
  "/orders": "orders",
  // Production is a view of the same work Orders holds, so it rides the same
  // permission: no orders access, no board.
  "/production": "orders",
  "/dashboard": "dashboard",
  "/bank": "bankFeed",
  // Inventory has its own key since the 8 Oct 2026 addendum.
  "/inventory": "inventory",
  "/schedule": "schedule",
  "/team-schedule": "schedule",
  "/customers": "customers",
  // Two messaging surfaces, two keys: the team's own messages ride `teamChat`,
  // the customer inbox rides `messages`. The one sidebar item that serves both
  // is decided in navItemHidden (visible when either is allowed) and its href
  // in the render (messagesNavHref: the allowed tab).
  "/messages": "teamChat",
  "/inbox": "messages",
  "/notes": "notes",
  "/quick-reply": "quickReply",
  "/settings": "settings",
  "/files": "clientFiles",
  "/export": "exportData",
  "/team": "teamAccess",
};

/** The member-access key a page checks, or null for pages without one (/home, /plan). */
export function pageAccessKeyForPath(path: string): WorkspaceMemberAccessKey | null {
  const clean = (path.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (PAGE_ACCESS_BY_PATH[clean]) return PAGE_ACCESS_BY_PATH[clean];
  const base = Object.keys(PAGE_ACCESS_BY_PATH).find(known => clean.startsWith(`${known}/`));
  return base ? PAGE_ACCESS_BY_PATH[base] : null;
}

/** Same rule as workspaceAccessAllows for the page keys: only an explicit false closes a page. */
export function pageAccessAllows(access: PageAccessLike, path: string): boolean {
  const key = pageAccessKeyForPath(path);
  if (!key) return true;
  return access?.[key] !== false;
}

// Where a closed page sends the member: the first page the owner left open, in
// the order the sidebar lists them. /home carries no key and is the last resort,
// so two closed pages can never bounce each other.
const LANDING_ORDER = ["/orders", "/dashboard", "/customers", "/schedule", "/notes", "/inbox", "/messages", "/files", "/inventory", "/quick-reply", "/settings"] as const;

export function pageAccessLandingFor(access: PageAccessLike): string {
  for (const path of LANDING_ORDER) if (pageAccessAllows(access, path)) return path;
  return "/home";
}

/** The redirect for `path` when its key is false: the first allowed landing, never `path` itself. */
export function pageAccessRedirectFor(path: string, access: PageAccessLike): string {
  const landing = pageAccessLandingFor(access);
  return landing === path ? "/home" : landing;
}
