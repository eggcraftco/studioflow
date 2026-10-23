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

// ── ETSY-E2E (24 Oct 2026): rules found by the end-to-end acceptance ──────────

/**
 * Mirrors the server's previewEtsyImport gate (H16): the owner, or an admin/member
 * with Orders, Customers and Financial Info and no assigned-projects limit. Everyone
 * else was shown a Preview button the server then refused.
 */
export function etsyCanPreview(input: {
  role: string | null | undefined;
  access: (area: "orders" | "customers" | "financialInfo") => boolean;
  assignedProjectsOnly?: boolean;
}): boolean {
  const role = String(input.role || "").toLowerCase();
  if (role === "owner") return true;
  if (role !== "admin" && role !== "member") return false;
  if (input.assignedProjectsOnly) return false;
  return input.access("orders") && input.access("customers") && input.access("financialInfo");
}

/** What an import did, in one line — including the orders parked for room on the plan. */
export function etsyImportNotice(
  outcome: { created?: number; updated?: number; held?: number; failed?: number } | null | undefined,
  t: (text: string) => string
): string {
  const created = Number(outcome?.created || 0);
  const updated = Number(outcome?.updated || 0);
  const held = Number(outcome?.held || 0);
  const failed = Number(outcome?.failed || 0);
  const parts = [`${created} ${t("imported")}`];
  if (updated) parts.push(`${updated} ${t("updated")}`);
  if (held) parts.push(`${held} ${t("are waiting for room on your plan.")} ${t("They are kept safe on the Orders screen.")}`);
  if (failed) parts.push(`${failed} ${t("need review. No records were lost; you can run the preview again.")}`);
  return parts.join(" · ");
}

/**
 * A failed Etsy action, in words. A callable that throws something other than an
 * HttpsError reaches the browser as the bare code "INTERNAL" — which is what a
 * seller saw when Etsy kept answering 429. Codes never reach the screen.
 */
export function etsyActionErrorText(error: unknown, t: (text: string) => string): string {
  const code = String((error as { code?: unknown } | null)?.code || "");
  const message = error instanceof Error ? error.message : "";
  // The server names Etsy's failure in details.code (rate_limited, upstream, network, auth_expired);
  // the sentence is this app's own, in the seller's language.
  const detail = String(((error as { details?: { code?: unknown } } | null)?.details || {}).code || "");
  if (detail === "rate_limited") return t("Etsy is temporarily limiting requests. NivaDesk will continue automatically; no action is needed.");
  if (detail === "upstream" || detail === "network") return t("Etsy could not be reached. NivaDesk will try again automatically.");
  if (detail === "auth_expired") return t("We could not refresh this Etsy connection. Existing NivaDesk orders are safe. Reconnect Etsy to continue receiving updates.");
  if (detail === "token_unreadable") return t("The stored Etsy access could not be read. Reconnect the shop to continue.");
  if (code === "functions/internal" || code === "functions/unavailable" || code === "functions/deadline-exceeded" || /^(INTERNAL|internal|UNAVAILABLE)$/.test(message.trim())) {
    return t("Etsy could not be reached. NivaDesk will try again automatically.");
  }
  if (code === "functions/resource-exhausted" && /rate|limit/i.test(message) && !/allowance/i.test(message)) {
    return t("Etsy is temporarily limiting requests. NivaDesk will continue automatically; no action is needed.");
  }
  return message || t("Something went wrong. Try again.");
}

/** Etsy's own label for a personalisation answer is "Personalization"; the row already says "Personalisation". */
export function etsyPersonalisationLine(line: string): string {
  return String(line || "").replace(/^\s*personali[sz]ation\s*:\s*/i, "");
}
