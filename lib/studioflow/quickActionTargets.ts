// Where a Home quick action may go (F2, 2.5 r8 test, 8 Nov 2026).
//
// Rule, the same on Android, iPhone/iPad/Mac and here: a quick action never opens a screen that is not in this
// person's menu — a button that leads nowhere (or to a "not included in your plan" page) is worse than no button.
// "Generate AI reply" opened /messages for everybody, and on Free that page says Messages is not included — while AI
// Replies, the screen that actually writes replies, is right there in the menu. It now opens /messages where the
// menu has team messages, /quick-reply where only that is, and is not shown otherwise. The other actions show only
// when their page is in the menu, by the same conditions the sidebar uses (components/AppShell.tsx navItemHidden).
// "Upload file" also needs the upload itself: on Free and Starter the Files page lists files but uploading is locked
// (client_files), and a viewer may not upload — the button would land on a page with nothing to press.
//
// Pure (type-only imports), so scripts/check-quick-action-targets.mts runs it in plain Node.
import { pageAccessAllows, type PageAccessLike } from "./pageAccess";

export type QuickActionMenu = {
  memberAccess: PageAccessLike;
  features?: { bank_feed?: boolean; messages?: boolean } | null;
  /** The workspace's own switch for the AI Replies menu item (false hides it). */
  quickReplyMenuEnabled?: boolean;
  /** Whether the Files page offers an upload: the plan's client_files and a role that may manage files
   *  (app/files/page.tsx canUploadClientFiles). False hides "Upload file". */
  canUploadFiles?: boolean;
};

/** The page each quick action opens (New order is the toolbar's own form and is gated by the create permission). */
export const QUICK_ACTION_PATHS = {
  customer: "/customers?new=1",
  note: "/notes?new=1",
  file: "/files?upload=1",
  inventory: "/inventory?new=1",
  reviewSpending: "/bank",
  receipt: "/bank?receipt=1",
} as const;

export type QuickActionTargetId = keyof typeof QUICK_ACTION_PATHS | "aiReply";

/** Whether this page is in the menu: the sidebar's conditions, plan and member access. */
export function quickActionPathOpens(path: string, menu: QuickActionMenu): boolean {
  const base = path.split("?")[0];
  if (!pageAccessAllows(menu.memberAccess, base)) return false;
  if (base === "/bank") return menu.features?.bank_feed === true;
  if (base === "/messages") return menu.features?.messages === true;
  if (base === "/quick-reply") return menu.quickReplyMenuEnabled !== false;
  if (base === "/files") return menu.canUploadFiles !== false;
  // Inventory also needs Orders (the server's inventory callables check the Orders area).
  if (base === "/inventory") return pageAccessAllows(menu.memberAccess, "/orders");
  return true;
}

export function aiReplyPath(menu: QuickActionMenu): "/messages" | "/quick-reply" | null {
  if (quickActionPathOpens("/messages", menu)) return "/messages";
  if (quickActionPathOpens("/quick-reply", menu)) return "/quick-reply";
  return null;
}

/** Each quick action's page for this person, or null where it must not show. */
export function quickActionTargets(menu: QuickActionMenu): Record<QuickActionTargetId, string | null> {
  const out = {} as Record<QuickActionTargetId, string | null>;
  for (const [id, path] of Object.entries(QUICK_ACTION_PATHS) as [keyof typeof QUICK_ACTION_PATHS, string][]) {
    out[id] = quickActionPathOpens(path, menu) ? path : null;
  }
  out.aiReply = aiReplyPath(menu);
  return out;
}
