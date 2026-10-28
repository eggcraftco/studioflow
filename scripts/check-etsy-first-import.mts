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

// ── ETSY-E2E (24 Oct 2026): found by the end-to-end acceptance on the isolated rig ───────────────
const e2e = await import("../lib/studioflow/etsyFirstImport").catch(() => ({} as Record<string, unknown>)) as Record<string, any>;
const { orderSourceLink } = await import("../lib/studioflow/orderSourceLink");
const settingsPage = readFileSync(join(root, "app/settings/page.tsx"), "utf8");
const ordersPage = readFileSync(join(root, "app/orders/page.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const lang = readFileSync(join(root, "lib/studioflow/language.ts"), "utf8");
const tt = (x: string) => x;
check("E1 phone: a Settings deep link / Etsy return opens the section, not the list", () => {
  const etsyReturn = settingsPage.slice(settingsPage.indexOf('if (params.get("etsy")) {'), settingsPage.indexOf('if (params.get("ebay")) {'));
  assert.match(etsyReturn, /setMobileDetail\(true\)/);
});
check("E2 signed out on the Etsy return: /login keeps ?next= (the ?etsy=connected outcome is not dropped)", () => {
  assert.match(settingsPage, /router\.replace\(`\/login\?next=\$\{encodeURIComponent\(/);
});
check("E3 import notice says how many are waiting for room on the plan", () => {
  assert.equal(typeof e2e.etsyImportNotice, "function", "etsyImportNotice missing");
  const line = e2e.etsyImportNotice({ created: 8, updated: 0, held: 32, failed: 0 }, tt);
  assert.match(line, /^8 imported · 32 are waiting for room on your plan\./);
});
check("E4 a codeless callable failure (INTERNAL) and Etsy's 429 become sentences", () => {
  assert.equal(typeof e2e.etsyActionErrorText, "function", "etsyActionErrorText missing");
  const internal = Object.assign(new Error("INTERNAL"), { code: "functions/internal" });
  assert.equal(e2e.etsyActionErrorText(internal, tt), "Etsy could not be reached. NivaDesk will try again automatically.");
  const limited = Object.assign(new Error("x"), { code: "functions/resource-exhausted", details: { code: "rate_limited" } });
  assert.match(e2e.etsyActionErrorText(limited, tt), /temporarily limiting requests/);
  const quota = Object.assign(new Error("This workspace has used its share of today's Etsy allowance (500 requests)."), { code: "functions/resource-exhausted" });
  assert.match(e2e.etsyActionErrorText(quota, tt), /allowance/);
});
check("E5 Preview/Import follow the server: owner, or admin/member with orders+customers+finance; import owner-only", () => {
  assert.equal(typeof e2e.etsyCanPreview, "function", "etsyCanPreview missing");
  const all = () => true; const noFin = (a: string) => a !== "financialInfo";
  assert.equal(e2e.etsyCanPreview({ role: "owner", access: noFin }), true);
  assert.equal(e2e.etsyCanPreview({ role: "member", access: all }), true);
  assert.equal(e2e.etsyCanPreview({ role: "member", access: noFin }), false);
  assert.equal(e2e.etsyCanPreview({ role: "viewer", access: all }), false);
  assert.equal(e2e.etsyCanPreview({ role: "workflow", access: all }), false);
  assert.equal(e2e.etsyCanPreview({ role: "admin", access: all, assignedProjectsOnly: true }), false);
  assert.match(section, /\{isOwner \? \(\s*<button[\s\S]{0,200}busy === "import"/);
  assert.match(section, /t\("Only the workspace owner can import Etsy orders\."\)/);
});
check("E6 the Etsy panel has its own row layout and never a 'Not supported' Sync health card", () => {
  // SD-4 (28 Oct 2026): the card is mounted, but only shows once the server records Etsy health (never_synced / rows).
  assert.equal((section.match(/<CommerceSyncHealthCard/g) || []).length, 1);
  assert.match(section, /<CommerceSyncHealthCard workspace=\{workspace\} language=\{language\} provider="etsy" onlyWhenInstrumented \/>/);
  assert.match(section, /data-etsy-card=""/);
  assert.match(css, /\[data-etsy-card\] \.settings-rule-list > li \{/);
  assert.match(css, /\[data-etsy-card\] li\[data-etsy-row\]/);
});
check("E7 an Etsy order links back to Etsy (no 'Order link not available')", () => {
  const link = orderSourceLink({ commerce: null, customFields: { Source: "Etsy", "Etsy Receipt ID": "3100000011" } });
  assert.equal(link.kind, "link");
  assert.equal((link as { href: string }).href, "https://www.etsy.com/your/orders/sold?order_id=3100000011");
  assert.equal(orderSourceLink({ commerce: null, customFields: { Source: "Etsy", "Etsy Receipt ID": "javascript:x" } }).kind, "none");
});
check("E8 the parked-orders banner is in the phone list too, and says when there is room", () => {
  const mobile = ordersPage.slice(ordersPage.indexOf('<section className="orders-mobile-list">'));
  assert.match(mobile, /\{heldBanner\}/);
  assert.match(ordersPage, /t\("There is room on your plan now\. Import the waiting orders when you are ready\."\)/);
});
check("E9 the arrival line is not overwritten by the live check; Disconnect says what it really removes", () => {
  assert.match(section, /void checkConnection\(true\)/);
  assert.match(section, /if \(!quiet\) setNotice\(t\("Etsy answered\. This connection is working\."\)\)/);
  assert.doesNotMatch(section, /is a separate request and is not available yet/);
});
check("E10 every new sentence has all eleven translations", () => {
  for (const key of [
    "They are kept safe on the Orders screen.",
    "Only the workspace owner can import Etsy orders.",
    "Disconnecting also removes Etsy's copy of the order details and the remembered buyer matches from NivaDesk. Your orders, notes and production work stay. Nothing is deleted on Etsy.",
    "There is room on your plan now. Import the waiting orders when you are ready.",
    "Etsy order", "Buyer's photo", "Buyer note", "Gift message", "Discount", "Shipping", "Last updated from Etsy",
    "Read-only: this is Etsy's copy of the order. Your own changes go in the cards below.",
    "Completed orders are already shipped on Etsy. They come in marked as dispatched and count as open work until you mark them delivered.",
    "Change what to include", "Estimated profit", "Changed on Etsy", "Delivery address", "Delivery name", "Design name",
    "Your edit in NivaDesk is kept. Update the order yourself if Etsy's version is right.", "No orders match your search.",
    "No costs entered yet. Add materials and labour to see the real profit; the platform fee is an estimate.",
    "Photo attached", "photo attached", "Product photo from Etsy", "View on Etsy", "Product photos open on Etsy.", "Not used on this order",
    "Copied from Etsy and shown in the Etsy order panel above:"
  ]) {
    const at = lang.indexOf(`  ${JSON.stringify(key)}: {`);
    assert.ok(at >= 0, `missing ${key}`);
    const line = lang.slice(at, lang.indexOf("\n", at));
    for (const l of ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"]) {
      assert.ok(line.includes(`"${l}": "`), `${key} lacks ${l}`);
    }
  }
});

check("E11 an Etsy order shows Etsy's own copy: items, options, personalisation, notes; money only with Financial Info", () => {
  const detail = readFileSync(join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
  assert.match(detail, /<EtsySourcePanel source=\{etsySource\} photos=\{etsyPhotos\} language=\{detailLanguage\} showMoney=\{canSeeFinance\} \/>/);
  let panel = "";
  try { panel = readFileSync(join(root, "app/orders/EtsySourcePanel.tsx"), "utf8"); } catch { /* missing */ }
  assert.ok(panel, "EtsySourcePanel.tsx missing");
  assert.match(panel, /\{showMoney \? \(\s*<dl className="etsy-source-panel__money">/);
  assert.match(panel, /etsyPersonalisationLine\(value\)/);
  assert.match(panel, /t\("Read-only: this is Etsy's copy of the order\. Your own changes go in the cards below\."\)/);
});

check("E12 ticking Completed orders says what they will look like (already shipped, count as open work)", () => {
  assert.match(section, /\{rules\.includeCompleted \? \(\s*<p className="muted-copy">\{t\("Completed orders are already shipped on Etsy\./);
});

check("E13 the auto-opened preview says what it includes and how to change it (Completed orders reachable)", () => {
  assert.match(section, /t\("Change what to include"\)/);
  assert.match(section, /rules\.includeCompleted \? t\("Completed orders"\) : ""/);
});
check("E14 an order with no cost entered shows an estimated profit, not a green Final Profit", () => {
  const detail = readFileSync(join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
  assert.match(detail, /orderFinance\.directCost === 0 && orderFinance\.otherExpenses === 0 \? \(/);
  assert.match(detail, /t\("Estimated profit"\)/);
});
check("E15 /integrations no longer says commercial access is 'being arranged'", () => {
  const dir = readFileSync(join(root, "app/integrations/IntegrationsDirectory.tsx"), "utf8");
  const tr = readFileSync(join(root, "lib/publicSite/translations.ts"), "utf8");
  assert.doesNotMatch(dir, /is being arranged with Etsy/);
  assert.doesNotMatch(tr, /"integrations\.note\.etsy": "Available on request while the app's commercial access with Etsy is arranged\."/);
});

check("E16 the Etsy panel shows where Etsy now differs from the seller's kept value (etsySource.differs)", () => {
  const panel = readFileSync(join(root, "app/orders/EtsySourcePanel.tsx"), "utf8");
  assert.match(panel, /\(source\.differs \|\| \[\]\)\.length \?/);
  assert.match(panel, /t\("Changed on Etsy"\)/);
});

const { orderMatchesSearch } = await import("../lib/studioflow/orderFilters");
check("E17 the order search finds an order by the shop's own number (Etsy receipt id)", () => {
  const order = { customerName: "Ava Hall", designName: "Gift Box", customFields: { Source: "Etsy", "Etsy Receipt ID": "3200000203" } } as any;
  assert.equal(orderMatchesSearch(order, "3200000203"), true);
  assert.equal(orderMatchesSearch(order, "Etsy"), false, "the Source field is not an order number");
});

// --- ETSY-E2E night (24 Oct 2026): the coordinator's screen review ---
const night = await import("../lib/studioflow/etsyFirstImport") as any;
const PET = "https://i.etsystatic.com/uploads/3200000201/pet.jpg";
check("E18 a buyer's photo link is split out of the text, never shown as a raw URL", () => {
  assert.equal(typeof night.etsyTextParts, "function", "etsyTextParts missing");
  assert.deepEqual(night.etsyTextParts(`Photo of your pet: ${PET}`), [{ text: "Photo of your pet: " }, { photo: PET }]);
  assert.deepEqual(night.etsyTextParts("Name: ANNA"), [{ text: "Name: ANNA" }]);
  // only Etsy's upload host becomes a photo link; anything else stays text (no link to an arbitrary site)
  assert.deepEqual(night.etsyTextParts("see http://evil.example/x.jpg"), [{ text: "see http://evil.example/x.jpg" }]);
  assert.equal(night.etsyPlainText(`Pet Portrait — Photo of your pet: ${PET}`), "Pet Portrait — Photo of your pet: photo attached");
});
check("E19 the import preview, the Etsy panel and the notes render photo links through EtsyText", () => {
  const section = readFileSync(join(root, "app/settings/EtsyIntegrationSection.tsx"), "utf8");
  const panel = readFileSync(join(root, "app/orders/EtsySourcePanel.tsx"), "utf8");
  const detail = readFileSync(join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
  assert.match(section, /<EtsyText /);
  assert.doesNotMatch(section, /row\.personalization\.map\(etsyPersonalisationLine\)\.join/);
  assert.match(panel, /<EtsyText /);
  assert.match(detail, /<EtsyNotePhotoLinks /);
});
check("E20 the notes card folds the lines NivaDesk copied from Etsy while the Etsy panel shows them; the note itself is untouched", () => {
  assert.equal(typeof night.etsyNoteDisplay, "function", "etsyNoteDisplay missing");
  const note = `Personalisation — Name: ANNA | Photo of your pet: ${PET}\nBuyer note — Please gift wrap\nSeller: use the oak frame`;
  const shown = night.etsyNoteDisplay(note, true);
  assert.equal(shown.text, "Seller: use the oak frame");
  assert.deepEqual(shown.folded, ["Personalisation", "Buyer note"]);
  const plain = night.etsyNoteDisplay(note, false);
  assert.equal(plain.folded.length, 0);
  assert.ok(!plain.text.includes("https://"), "raw link shown in notes");
  assert.ok(plain.text.includes("photo attached"));
  assert.deepEqual(night.etsyNoteDisplay("just my note", true), { text: "just my note", folded: [], photos: [] });
});
check("E21 an Etsy order on a phone: unused Preview/Repair/Estimate/Portal cards move under 'Not used on this order', none removed", () => {
  assert.equal(typeof night.etsyCardFold, "function", "etsyCardFold missing");
  const order = ["preview", "repairIntake", "estimate", "customerPortal", "summary", "workTime", "notes", "customer", "financial", "status"];
  const r = night.etsyCardFold(order, { isEtsy: true, used: { preview: false, repairIntake: false, estimate: false, customerPortal: false } });
  assert.deepEqual(r.main, ["summary", "workTime", "notes", "customer", "financial", "status"]);
  assert.deepEqual(r.folded, ["preview", "repairIntake", "estimate", "customerPortal"]);
  assert.equal(r.main.length + r.folded.length, order.length);
  const used = night.etsyCardFold(order, { isEtsy: true, used: { preview: true, repairIntake: false, estimate: true, customerPortal: false } });
  assert.deepEqual(used.folded, ["repairIntake", "customerPortal"]);
  assert.ok(used.main.includes("preview") && used.main.includes("estimate"));
  const notEtsy = night.etsyCardFold(order, { isEtsy: false, used: {} });
  assert.deepEqual(notEtsy, { main: order, folded: [] });
});
check("E22 the order screen uses the fold on the phone stack and asks Etsy for product photos (never stores them)", () => {
  const detail = readFileSync(join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
  const panel = readFileSync(join(root, "app/orders/EtsySourcePanel.tsx"), "utf8");
  assert.match(detail, /etsyCardFold\(/);
  assert.match(detail, /Not used on this order/);
  assert.match(panel, /getEtsyListingPhotos/);
  assert.doesNotMatch(panel, /setDoc|updateDoc/);
  assert.match(panel, /onError=/, "a broken Etsy image needs a placeholder");
});
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
