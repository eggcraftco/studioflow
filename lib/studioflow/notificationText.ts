// held-notify-i18n (25 Oct 2026): notification text a client says in the reader's language. Kept apart from
// notifications.ts (Firestore listener) so the shell can import it without the listener module.
import { studioImportPhrase } from "@/lib/studioflow/countLabel";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import type { StudioActivityNotification } from "@/lib/studioflow/notifications";

const HELD_ORDERS_PLAN_FULL = "Your plan is full, so new store orders are being kept safe rather than imported. Mark finished work delivered to make room, or choose a plan.";

/**
 * held-notify-i18n (25 Oct 2026): the "store orders are waiting" row is said in the reader's language with the
 * held-orders band's own words (counted phrase + plan-full sentence). A row without params.count (written before the
 * server change) keeps the server's English title and message.
 */
export function localizeActivityNotification(item: StudioActivityNotification, language: string | null | undefined): StudioActivityNotification {
  if (item.type === "payment_received" && item.paymentNotice) return localizePaymentNotice(item, language || "English");
  if (item.type !== "integration_orders_held" || !item.heldCount) return item;
  return { ...item, title: studioImportPhrase(item.heldCount, "heldStoreOrdersWaiting", language), message: studioT(HELD_ORDERS_PLAN_FULL, language || "English") };
}


/**
 * SL-30 (4 Nov 2026): "Payment received" — a Stripe payment link was paid. Said in the reader's language from the
 * row's figures: the amount in their own number format, what the link was for, and the order's number. A row
 * without figures keeps the server's English.
 */
function localizePaymentNotice(item: StudioActivityNotification, language: string): StudioActivityNotification {
  const notice = item.paymentNotice;
  if (!notice) return item;
  const code = notice.currency.toUpperCase();
  const digits = code === "JPY" ? 0 : 2;
  let amount = `${(notice.amountMinor / (digits ? 100 : 1)).toFixed(digits)} ${code}`.trim();
  try {
    amount = new Intl.NumberFormat(studioLocaleTag(language), { style: "currency", currency: code }).format(notice.amountMinor / (digits ? 100 : 1));
  } catch {
    // An unreadable code keeps the plain figure above.
  }
  const order = notice.projectNumber ? studioT("Order {reference}", language).replace("{reference}", `#${notice.projectNumber}`) : "";
  return { ...item, title: studioT("Payment received", language), message: [amount, notice.label, order].filter(Boolean).join(" · ") };
}
