import { studioLocaleTag, studioT } from "./language";

/**
 * ETSY-E2E r2 (24 Oct 2026), K2: what Etsy says about getting the order to the
 * buyer, as one honest line under the Etsy panel's state. The server writes
 * etsySource.fulfilment; Etsy only ever REPORTS a delivery, and a shipment
 * without a delivery report is "delivery not confirmed", never "delivered".
 * Parts the server does not have are left out (no carrier → no carrier); a
 * shipment without a tracking code says so.
 */
export type EtsyFulfilment = {
  state?: "shipped" | "delivered" | "completed_not_shipped" | "not_shipped" | "cancelled" | string;
  shippedAtMs?: number | null;
  carrier?: string | null;
  trackingCode?: string | null;
  shipments?: unknown[];
  deliveredReportedAtMs?: number | null;
  basis?: string[];
};

export type EtsyFulfilmentLine = { text: string; muted?: string };

function dateText(ms: unknown, language: string): string {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  try {
    return new Intl.DateTimeFormat(studioLocaleTag(language), { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return "";
  }
}

const clean = (value: unknown) => String(value ?? "").trim();

/** The line for this Etsy order, or null when Etsy has said nothing about shipping. */
export function etsyFulfilmentLine(
  source: { fulfilment?: EtsyFulfilment | null; isShipped?: boolean } | null | undefined,
  language: string
): EtsyFulfilmentLine | null {
  if (!source) return null;
  const t = (text: string) => studioT(text, language);
  const f = source.fulfilment;
  if (!f || typeof f !== "object" || !f.state) {
    return source.isShipped ? { text: t("Shipped on Etsy · delivery not confirmed") } : null;
  }
  if (f.state === "delivered") {
    const date = dateText(f.deliveredReportedAtMs, language);
    return { text: [t("Delivered — reported by Etsy"), date].filter(Boolean).join(" · ") };
  }
  if (f.state === "shipped") {
    const carrier = clean(f.carrier);
    const tracking = clean(f.trackingCode);
    const shipment = tracking ? [carrier, tracking].filter(Boolean).join(" ") : [carrier, t("no tracking number")].filter(Boolean).join(" · ");
    const parts = [t("Shipped on Etsy"), dateText(f.shippedAtMs, language), shipment].filter(Boolean);
    return { text: parts.join(" · "), muted: t("Delivery not confirmed") };
  }
  if (f.state === "completed_not_shipped") return { text: t("Completed on Etsy · not marked as shipped") };
  return null;
}
