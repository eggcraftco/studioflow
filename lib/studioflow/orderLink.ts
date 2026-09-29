// A link to an order's own page that says which workspace the order was listed
// in, and the order page's reading of it.
//
// The active workspace is stored on the account (users/{uid}.activeCompanyId),
// not on the tab, and the order page opens whatever is active when it loads. A
// link opened later — in a new tab, after a switch somewhere else, or by a
// colleague whose active workspace is another one — used to load the order id
// inside that other workspace and fail with "You do not have access to this
// order." The hint lets the page say what actually happened, and it never lets
// the page open anything by itself: the order still loads only in the active
// workspace, a switch is the person's own click (switchActiveWorkspace checks
// the membership), and the Firestore rules decide every read.
//
// No imports: scripts/check-production-panel.mjs compiles and runs this file.

export const ORDER_WORKSPACE_HINT_PARAM = "workspace";

/** /orders/<id>?workspace=<workspace id>, both parts encoded. */
export function orderPageHref(workspaceId: string, orderId: string): string {
  const order = encodeURIComponent(String(orderId || "").trim());
  const workspace = String(workspaceId || "").trim();
  if (!workspace) return `/orders/${order}`;
  return `/orders/${order}?${ORDER_WORKSPACE_HINT_PARAM}=${encodeURIComponent(workspace)}`;
}

/** The workspace a link named, or "" when it named none (every older link). */
export function orderWorkspaceHint(params: { get(name: string): string | null } | null | undefined): string {
  const value = params?.get(ORDER_WORKSPACE_HINT_PARAM);
  return typeof value === "string" ? value.trim() : "";
}

export type OrderWorkspaceDecision =
  | { kind: "open" }
  | { kind: "other-workspace"; workspaceId: string };

/** A hint that names another workspace stops the load; no hint, or the same one, opens as before. */
export function orderWorkspaceDecision(hint: string, activeWorkspaceId: string): OrderWorkspaceDecision {
  const wanted = String(hint || "").trim();
  if (!wanted || wanted === String(activeWorkspaceId || "").trim()) return { kind: "open" };
  return { kind: "other-workspace", workspaceId: wanted };
}
