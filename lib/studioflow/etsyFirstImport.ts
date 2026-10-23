// Etsy first-import path (23 Oct 2026). Pure rules, so a script can hold them.
//
// What went wrong in production: the one live Etsy connection was made from the
// setup wizard 34 seconds after sign-up. The wizard opens /settings?section=etsy
// in a new tab with ?fromSetup=1 so that tab shows the real page; Etsy's OAuth
// callback then sends the browser back to /settings?section=etsy&etsy=connected
// — WITHOUT fromSetup — and because setup was still unfinished on an empty
// workspace, the setup takeover rendered the wizard again in that tab. The Etsy
// panel never mounted, so "Etsy shop connected. Choose what to import." was never
// shown, and the seller finished setup with "later" and left. Seven weeks later
// the shop was still connected, importState "none", and every paid order Etsy
// sent (63 webhook deliveries in the last 7 days alone) was refused at the
// first-import gate.

/**
 * Whether this tab must show the real page even while setup is unfinished.
 * `fromSetup=1` (a tab the wizard opened) — and a provider's return to Settings
 * (`?etsy=connected|cancelled|error`): that tab exists to say what happened to a
 * connection the seller just made, and only the Settings panel can say it.
 */
export function setupPassthroughFromUrl(pathname: string, search: string): boolean {
  const params = new URLSearchParams(search || "");
  if (params.get("fromSetup") === "1") return true;
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  return onSettings && params.has("etsy");
}

export type EtsyArrivalConnection = {
  status?: string;
  importState?: string;
  needsReconnect?: boolean;
} | null | undefined;

/**
 * Open the preview by itself when the seller has just connected a shop that has
 * never been imported: the list of their own Etsy orders is the first thing they
 * should see, not a set of filters above a "Preview" button. Read-only — nothing
 * is imported until the owner ticks and confirms the list.
 */
export function shouldAutoPreviewEtsy(input: {
  arrived: boolean;
  connection: EtsyArrivalConnection;
  previewOpen: boolean;
  busy: string;
}): boolean {
  const { arrived, connection, previewOpen, busy } = input;
  if (!arrived || previewOpen || busy) return false;
  if (!connection) return false;
  if (String(connection.status || "") !== "connected" || connection.needsReconnect) return false;
  return String(connection.importState || "none") === "none";
}

/** Live shops (not disconnected) that are connected but have never been imported. */
export function etsyShopsAwaitingFirstImport(
  shops: { status: string; importState?: string }[],
): number {
  return shops.filter((shop) => shop.status !== "disconnected" && String(shop.importState || "none") === "none").length;
}
