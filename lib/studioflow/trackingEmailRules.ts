// "Send the tracking details to the customer by e-mail?" — the rules the Shipping & Tracking
// card follows, with no Firebase import so scripts/check-tracking-email.mjs can compile and run
// them.
//
// The server (functions/orders/trackingEmail.js, callable sendOrderTrackingEmail) is the only
// thing that sends, and only on the member's explicit Send. It keeps one record per order:
// companies/{companyId}/trackingResults/{orderId}.trackingEmail (server-only, the row the live
// panel already listens to) with a copy on the order itself. This file decides, from that record,
// whether saving a number should OFFER an e-mail, and how the last result reads on the card.

export type TrackingEmailStatus = "sent" | "failed";

export type TrackingEmailRecord = {
  trackingNumber: string;
  carrier: string;
  to: string;
  recipientSource: "order" | "member";
  status: TrackingEmailStatus;
  sentAtMs: number;
  failedAtMs: number;
  messageId: string;
  attempts: number;
  lastError: string;
  link: string;
};

export function cleanTrackingNumber(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

/** The record as Firestore hands it back, or null when there is none worth showing. */
export function trackingEmailRecordFrom(value: unknown): TrackingEmailRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const trackingNumber = cleanTrackingNumber(raw.trackingNumber);
  const status = raw.status === "sent" ? "sent" : raw.status === "failed" ? "failed" : null;
  if (!trackingNumber || !status) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const link = String(raw.link ?? "");
  return {
    trackingNumber,
    carrier: String(raw.carrier ?? "").trim(),
    to: String(raw.to ?? "").trim().toLowerCase(),
    recipientSource: raw.recipientSource === "member" ? "member" : "order",
    status,
    sentAtMs: num(raw.sentAtMs),
    failedAtMs: num(raw.failedAtMs),
    messageId: String(raw.messageId ?? ""),
    attempts: Math.max(0, Math.trunc(num(raw.attempts))),
    lastError: String(raw.lastError ?? "").trim(),
    link: /^https:\/\//i.test(link) ? link : ""
  };
}

/**
 * The record for the number the order carries NOW. One written for a previous number is history,
 * not this number's result, and is not shown against it.
 */
export function currentTrackingEmail(orderTrackingNumber: string, record: TrackingEmailRecord | null): TrackingEmailRecord | null {
  const current = cleanTrackingNumber(orderTrackingNumber);
  if (!current || !record) return null;
  return record.trackingNumber === current ? record : null;
}

/**
 * Whether saving this number should ask "Send the tracking details to the customer by e-mail?".
 *
 * Yes for a new number and for a number whose last send failed; no when this exact number was
 * already sent — the card then shows "Sent … · Resend" instead, and only that button sends again.
 * The question is asked, never answered: declining sends nothing, and so does closing the tab.
 */
export function shouldOfferTrackingEmail(savedTrackingNumber: string, record: TrackingEmailRecord | null): boolean {
  const number = cleanTrackingNumber(savedTrackingNumber);
  if (!number) return false;
  const current = currentTrackingEmail(number, record);
  return !current || current.status === "failed";
}

/**
 * The sentence under the tracking panel. Returned as a key and its values so the card can pass
 * the key through studioT and keep the address and time untranslated.
 */
export function trackingEmailResultLine(record: TrackingEmailRecord | null): { key: string; to: string; atMs: number; error: string } | null {
  if (!record) return null;
  if (record.status === "sent") return { key: "Tracking details e-mailed to {to} on {at}.", to: record.to, atMs: record.sentAtMs, error: "" };
  return { key: "Tracking e-mail to {to} failed on {at}: {error}", to: record.to, atMs: record.failedAtMs, error: record.lastError || "unknown error" };
}

/** Fills {to}, {at} and {error} in a translated line. */
export function fillResultLine(translated: string, values: { to: string; at: string; error: string }): string {
  return translated.replace("{to}", values.to).replace("{at}", values.at).replace("{error}", values.error);
}

/** A plausible single address, as the server checks it: one @, a dotted domain, no separators. */
export function isPlausibleEmail(value: string): boolean {
  const email = String(value || "").trim();
  if (!email || email.length > 240) return false;
  if (/[\s,;<>"'()\\]/.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
