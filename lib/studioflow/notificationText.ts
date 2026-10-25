// held-notify-i18n (25 Oct 2026): notification text a client says in the reader's language. Kept apart from
// notifications.ts (Firestore listener) so the shell can import it without the listener module.
import { studioImportPhrase } from "@/lib/studioflow/countLabel";
import { studioT } from "@/lib/studioflow/language";
import type { StudioActivityNotification } from "@/lib/studioflow/notifications";

const HELD_ORDERS_PLAN_FULL = "Your plan is full, so new store orders are being kept safe rather than imported. Mark finished work delivered to make room, or choose a plan.";

/**
 * held-notify-i18n (25 Oct 2026): the "store orders are waiting" row is said in the reader's language with the
 * held-orders band's own words (counted phrase + plan-full sentence). A row without params.count (written before the
 * server change) keeps the server's English title and message.
 */
export function localizeActivityNotification(item: StudioActivityNotification, language: string | null | undefined): StudioActivityNotification {
  if (item.type !== "integration_orders_held" || !item.heldCount) return item;
  return { ...item, title: studioImportPhrase(item.heldCount, "heldStoreOrdersWaiting", language), message: studioT(HELD_ORDERS_PLAN_FULL, language || "English") };
}

