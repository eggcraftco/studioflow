// When the Sync health card shows at all (SD-4, 28 Oct 2026).
//
// Every channel's card renders the server's answer (functions/commerce/health.js healthCardState):
// not_connected · not_supported · never_synced · rows. The Etsy section mounts the card before every server
// records Etsy health: the live server answers `not_supported` for a connected Etsy shop (nothing writes
// commerceHealth for it), the SD-ETSY server answers `never_synced` and then `rows` once its webhook, sweep,
// Sync now or import records a pass. A "Not supported" frame under Etsy is exactly what ETSY-E2E removed
// (scripts/check-etsy-first-import.mts E6), so a card mounted with `onlyWhenInstrumented` stays out until the
// server says it measures this channel — and while it loads, and when the read fails (no empty frame, no error).
// Without the flag nothing changes: Woo, Shopify, Square and eBay keep every state as before.

export type HealthCardVisibilityInput = {
  onlyWhenInstrumented: boolean;
  /** The first answer has arrived (or failed). */
  loaded: boolean;
  /** The read failed. */
  failed: boolean;
  /** The server's card.state for this provider ("" when it sent none). */
  state: string;
  /** This provider's health rows in the answer. */
  rowCount: number;
};

export function healthCardShown({ onlyWhenInstrumented, loaded, failed, state, rowCount }: HealthCardVisibilityInput): boolean {
  if (!onlyWhenInstrumented) return true;
  if (!loaded || failed) return false;
  if (rowCount > 0) return true;
  return state === "never_synced" || state === "rows";
}
