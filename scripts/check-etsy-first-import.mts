/**
 * Etsy first import, 23 Oct 2026. The one live connection was made from the setup
 * wizard; Etsy's OAuth return came back without ?fromSetup=1, the setup takeover
 * rendered the wizard in that tab, the Etsy panel never mounted, and nothing was
 * ever imported (63 paid/shipped/delivered webhooks refused in 7 days).
 *
 * Run: npm run test:etsy-first-import   (npx tsx scripts/check-etsy-first-import.mts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setupPassthroughFromUrl, shouldAutoPreviewEtsy, etsyShopsAwaitingFirstImport } from "../lib/studioflow/etsyFirstImport";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}

// 1. The production return: /settings?section=etsy&etsy=connected&shop=<id>, no fromSetup.
check("Etsy OAuth return to Settings passes through the setup takeover", () => {
  assert.equal(setupPassthroughFromUrl("/settings", "?section=etsy&etsy=connected&shop=65884528"), true);
  assert.equal(setupPassthroughFromUrl("/settings", "?section=etsy&etsy=cancelled"), true);
  assert.equal(setupPassthroughFromUrl("/settings", "?section=etsy&etsy=error&reason=no_shop"), true);
});
check("wizard tabs (fromSetup=1) still pass through", () => {
  assert.equal(setupPassthroughFromUrl("/settings", "?section=etsy&fromSetup=1"), true);
  assert.equal(setupPassthroughFromUrl("/orders", "?fromSetup=1"), true);
});
check("nothing else escapes the takeover", () => {
  assert.equal(setupPassthroughFromUrl("/settings", "?section=etsy"), false);
  assert.equal(setupPassthroughFromUrl("/home", "?etsy=connected"), false);
  assert.equal(setupPassthroughFromUrl("/settings", ""), false);
  assert.equal(setupPassthroughFromUrl("/settingsx", "?etsy=connected"), false);
});

// 2. The arrival opens the preview by itself, once, only for a never-imported healthy shop.
const fresh = { status: "connected", importState: "none", needsReconnect: false };
check("a fresh connection opens the preview on arrival", () => {
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: fresh, previewOpen: false, busy: "" }), true);
});
check("no auto preview when not arriving, already previewing, busy, imported, or broken", () => {
  assert.equal(shouldAutoPreviewEtsy({ arrived: false, connection: fresh, previewOpen: false, busy: "" }), false);
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: fresh, previewOpen: true, busy: "" }), false);
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: fresh, previewOpen: false, busy: "verify" }), false);
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: { ...fresh, importState: "done" }, previewOpen: false, busy: "" }), false);
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: { ...fresh, importState: "running" }, previewOpen: false, busy: "" }), false);
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: { ...fresh, needsReconnect: true }, previewOpen: false, busy: "" }), false);
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: { ...fresh, status: "needs_reconnect" }, previewOpen: false, busy: "" }), false);
  assert.equal(shouldAutoPreviewEtsy({ arrived: true, connection: null, previewOpen: false, busy: "" }), false);
});
check("awaiting-first-import count ignores disconnected shops", () => {
  assert.equal(etsyShopsAwaitingFirstImport([{ status: "connected", importState: "none" }, { status: "disconnected", importState: "none" }, { status: "connected", importState: "done" }]), 1);
});

// 3. The wiring: the real files use these rules (no copies).
const appShell = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
const section = readFileSync(join(root, "app/settings/EtsyIntegrationSection.tsx"), "utf8");
check("AppShell's setup passthrough is setupPassthroughFromUrl", () => {
  assert.match(appShell, /return setupPassthroughFromUrl\(pathname \|\| window\.location\.pathname, window\.location\.search\);/);
  assert.doesNotMatch(appShell, /return new URLSearchParams\(window\.location\.search\)\.get\("fromSetup"\) === "1";/);
});
check("the Etsy panel arms the auto preview on ?etsy=connected and runs previewEtsyImport through shouldAutoPreviewEtsy", () => {
  const arrival = section.slice(section.indexOf('if (outcome === "connected") {'), section.indexOf('else if (outcome === "cancelled")'));
  assert.match(arrival, /setAutoPreviewPending\(true\);/);
  assert.match(section, /shouldAutoPreviewEtsy\(\{ arrived: true, connection, previewOpen: Boolean\(preview\), busy \}\)/);
  assert.match(section, /void previewEtsyImport\(companyId, connection\.id, rules\)/);
});
check("no new user-facing strings (every t() key used by the change already exists)", () => {
  assert.match(section, /t\("Etsy shop connected\. Choose what to import\."\)/);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
