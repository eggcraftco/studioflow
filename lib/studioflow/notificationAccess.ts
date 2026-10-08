// Which member-access key a notification row rides (owner's rule, 8 Oct 2026).
//
// A member whose key for an area is OFF must not see that area's rows anywhere
// they are read: Home "Recent activity", the Activity drawer (bell), its unread
// badge, and the push-click opener. One pure helper, no imports, so
// scripts/check-key-gated-activity.mjs can run it in plain Node; every reader
// imports it through lib/studioflow/notifications.ts.
//
// The map is by `route`, `type`, `source` and `channel` as the server writes
// them (functions `notificationRow` shapes):
//   messages      ← route "customerInbox" · type "customer_message" · channel/source whatsapp|instagram
//   teamChat      ← route "messageThread" · type "message" | "message_mention"
//   bankFeed      ← route "bank" · type "bank_*" (bank_receipt_matched, bank_connection…)
//   inventory     ← route/type naming inventory | stocktake | purchase | supplier
//   financialInfo ← route "dashboard" | "finance" · type payment | refund | invoice_paid |
//                   settlement | finance | dashboard (woocommerce_payment is money, not an order)
//   customers     ← route "customers" · type naming customer (after customer_message is taken)
// Anything else — orders, production, notes, support tickets, deletion
// requests — is not an area key and stays visible.

export type NotificationAccessKey =
  | "messages"
  | "teamChat"
  | "bankFeed"
  | "inventory"
  | "financialInfo"
  | "customers";

export type NotificationAccessRow = {
  route?: string | null;
  type?: string | null;
  source?: string | null;
  channel?: string | null;
};

export type NotificationAccessLike = Partial<Record<NotificationAccessKey, boolean>> | null | undefined;

const lower = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** The access key this row belongs to, or null when no key governs it. */
export function notificationAccessKeyFor(row: NotificationAccessRow): NotificationAccessKey | null {
  const route = lower(row.route);
  const type = lower(row.type);
  const source = lower(row.source);
  const channel = lower(row.channel);
  if (route === "customerinbox" || type === "customer_message") return "messages";
  if (source === "whatsapp" || source === "instagram" || channel === "whatsapp" || channel === "instagram") return "messages";
  if (route === "messagethread" || type === "message" || type === "message_mention") return "teamChat";
  if (route === "bank" || /^bank_|bank_connection|bank_receipt/.test(type)) return "bankFeed";
  if (/inventory|stocktake|purchase|supplier/.test(route) || /inventory|stocktake|purchase|supplier/.test(type)) return "inventory";
  if (route === "dashboard" || route === "finance" || /payment|refund|invoice_paid|settlement|finance|dashboard/.test(type)) return "financialInfo";
  if (route === "customers" || /customer/.test(type)) return "customers";
  return null;
}

/** Only an explicit `false` closes an area; an unknown row, or no access map at all, stays visible. */
export function notificationVisibleForAccess(row: NotificationAccessRow, access: NotificationAccessLike): boolean {
  const key = notificationAccessKeyFor(row);
  if (!key) return true;
  return access?.[key] !== false;
}
