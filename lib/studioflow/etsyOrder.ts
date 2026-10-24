// Etsy API Terms compliance (24 Oct 2026).
//
// Etsy's API Terms (§5) forbid "sending to Etsy Members order, delivery and
// tracking information, whether via email, text or otherwise". The server
// refuses status/tracking e-mails/SMS and inbox replies for Etsy orders; the
// web says so before the seller tries. This file is the ONE place the web
// decides "is this an Etsy order?" and holds the sentences the screens show.

export type EtsyOrderLike = {
  id?: string | null;
  etsySource?: unknown;
  commerce?: { provider?: string | null } | null;
  commerceProvider?: string | null;
  customFields?: Record<string, string | undefined> | null;
} | null | undefined;

/**
 * True when the order came from Etsy: it carries Etsy's copy (`etsySource`),
 * the channel stamp says Etsy, the legacy "Source" field says Etsy, or its id
 * is the importer's deterministic `etsy_…` document id.
 */
export function isEtsyOrder(order: EtsyOrderLike): boolean {
  if (!order || typeof order !== "object") return false;
  const source = order.etsySource;
  if (source && typeof source === "object") return true;
  const provider = String(order.commerce?.provider ?? order.commerceProvider ?? "").trim().toLowerCase();
  if (provider === "etsy") return true;
  const field = String(order.customFields?.["Source"] ?? "").trim().toLowerCase();
  if (field === "etsy") return true;
  return isEtsyOrderId(order.id);
}

/** The importer's document id for an Etsy receipt starts with "etsy_" — enough on its own. */
export function isEtsyOrderId(orderId: unknown): boolean {
  return typeof orderId === "string" && orderId.startsWith("etsy_");
}

/**
 * T1 — Etsy's required trademark notice. NEVER translated, NEVER reworded:
 * the screens that show it carry the literal string too (a test reads them).
 */
export const ETSY_TRADEMARK_NOTICE =
  "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.";

export const ETSY_CONTACT_EMAIL = "contact@nivadesk.co.uk";

/** T7 — Automatic Updates / tracking e-mail on an Etsy order. */
export const ETSY_NO_BUYER_UPDATES_NOTE =
  "Etsy order — NivaDesk does not send status, delivery or tracking messages to Etsy buyers (Etsy's API terms). Add tracking on Etsy; Etsy tells the buyer.";
/** M2 — copy link on an Etsy order. */
export const ETSY_COPY_LINK_NOTE =
  "Etsy order — NivaDesk does not send this link to the buyer. If you share it yourself, use Etsy Messages.";
/** M3 — Quick Reply draft for an Etsy order. */
export const ETSY_QUICK_REPLY_NOTE =
  "Etsy order — NivaDesk does not send this reply to the buyer. Paste it into Etsy Messages yourself.";
/** M4 — inbox conversation linked to an Etsy order. */
export const ETSY_INBOX_NOTE =
  "This conversation is linked to an Etsy order. NivaDesk can't send replies here (Etsy's API terms) — reply in Etsy Messages. Reading, linking and notes still work.";
/** M5 — DHL shipment draft for an Etsy order. */
export const ETSY_DHL_EMAIL_NOTE = "Etsy order — the buyer's e-mail is not sent to DHL.";

/** The server's refusal reason for an inbox reply on an Etsy-linked conversation. */
export const ETSY_ORDER_MESSAGING_REASON = "etsy_order_messaging";

/**
 * The inbox REPLY refusal map: the server's `details.reason` for a refused
 * sendCustomerInboxReply → the sentence the composer shows (a translation key).
 * A screen opened before the conversation was linked to an Etsy order still
 * gets a clear sentence instead of a generic failure.
 */
export const INBOX_REPLY_REFUSALS: Readonly<Record<string, string>> = {
  [ETSY_ORDER_MESSAGING_REASON]: ETSY_INBOX_NOTE
};

/** The refusal sentence (untranslated key) for a refused inbox reply, or "" when the reason is not one we map. */
export function inboxReplyRefusalText(error: unknown): string {
  const details = (error as { details?: unknown } | null)?.details;
  const reason = details && typeof details === "object" ? String((details as { reason?: unknown }).reason ?? "") : "";
  return (reason && INBOX_REPLY_REFUSALS[reason]) || "";
}
