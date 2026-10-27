/**
 * ETSY-UI-1 (27 Oct 2026, owner-approved design): the Etsy order block, the jump bar, the Etsy note on Shipping &
 * Tracking — and the card system they must not disturb.
 *
 *  A. The rules (lib/studioflow/etsyOrderView.ts): the tax line is COMPUTED from Etsy's stored figures, the header
 *     chips come from the snapshot, no "Ship by" is invented, photos match their line, Etsy links are Etsy's.
 *  B. The block drawn (server render of EtsySourcePanel): header, lines, photo states, Copy, totals, footer,
 *     every existing compliance text; money only with Financial Info.
 *  C. The card system: the 19 card ids and the layout format are unchanged; a saved layout (hidden cards,
 *     own widths/heights/colours, a phone order, renamed titles) is read, normalised twice to the same thing, never
 *     mutated, and the jump bar lists exactly its visible cards in their saved order under their own titles. The new
 *     code reaches no layout write.
 *  D. The page wiring (source): jump bar under the header from the cards the page draws; Customize cards with the
 *     hidden count through the existing entry; the Etsy block in the page flow (no sticky, no inner scroll); the
 *     Etsy note on Shipping & Tracking only for Etsy orders.
 *  E. Every new string in all 11 languages, through the table (studioT), redefining no existing key; RTL-safe CSS.
 *
 * Run: npx tsx scripts/check-etsy-ui-1.mts
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => { try { return readFileSync(join(root, path), "utf8"); } catch { return ""; } };
let failed = 0; let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`); }
}
(globalThis as Record<string, unknown>).React = React;

const view = await import("../lib/studioflow/etsyOrderView").catch(() => ({})) as Record<string, any>;
const need = (name: string) => { assert.ok(name in view, `lib/studioflow/etsyOrderView.ts: ${name} missing`); return view[name]; };
const panelModule = await import("../app/orders/EtsySourcePanel").catch((error) => ({ loadError: error })) as Record<string, any>;
const languageModule = await import("../lib/studioflow/language") as Record<string, any>;
const studioT = languageModule.studioT as (text: string, language: string) => string;
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];

// ── A. rules ───────────────────────────────────────────────────────────────
await check("A1 tax INSIDE the total: items + shipping = total → 'included' (UK VAT shape, Etsy stub shape)", () => {
  const mode = need("etsyTaxMode");
  assert.equal(mode({ subtotal: 114, shipping: 3.95, tax: 19.66, grandTotal: 117.95 }), "included");
  // the brief's reading: subtotal BEFORE the coupon, discount subtracted
  assert.equal(mode({ subtotal: 50, discount: 10, shipping: 5, tax: 7.5, grandTotal: 45 }), "included");
  // Etsy's documented reading: subtotal already net of the coupon
  assert.equal(mode({ subtotal: 40, discount: 10, shipping: 5, tax: 7.5, grandTotal: 45 }), "included");
  assert.equal(mode({ subtotal: "114.00", shipping: "3.95", tax: "19.66", grandTotal: "117.95" }), "included", "numbers as text");
  assert.equal(mode({ subtotal: 33.33, shipping: 3.33, tax: 6.11, grandTotal: 36.67 }), "included", "1-cent rounding");
});
await check("A2 tax ON TOP: items + shipping + tax = total → 'added' (US sales-tax shape)", () => {
  const mode = need("etsyTaxMode");
  assert.equal(mode({ subtotal: 50, shipping: 5, tax: 4.4, grandTotal: 59.4 }), "added");
  assert.equal(mode({ subtotal: 40, discount: 10, shipping: 5, tax: 3.2, grandTotal: 48.2 }), "added");
  assert.equal(mode({ subtotal: 50, discount: 10, shipping: 5, tax: 3.2, grandTotal: 48.2 }), "added");
});
await check("A3 neither adds up (gift wrap, partial figures) → 'unclaimed'; no tax → 'none'; no claim from a missing total", () => {
  const mode = need("etsyTaxMode");
  assert.equal(mode({ subtotal: 50, shipping: 5, tax: 9.17, grandTotal: 58 }), "unclaimed");
  assert.equal(mode({ subtotal: 50, shipping: 5, tax: 9.17 }), "unclaimed");
  assert.equal(mode({ subtotal: 50, shipping: 5, tax: 0, grandTotal: 55 }), "none");
  assert.equal(mode({ subtotal: 50, shipping: 5, grandTotal: 55 }), "none");
  assert.equal(mode(null), "none");
  // a coincidence (tax equal to the discount) cannot flip the documented reading
  assert.equal(mode({ subtotal: 40, discount: 5, shipping: 5, tax: 5, grandTotal: 45 }), "included");
});
await check("A4 header chips come from the snapshot: Paid / Not paid, Dispatched / Not dispatched on Etsy, Cancelled, Refunded", () => {
  const chips = (s: unknown) => need("etsyStatusChips")(s).map((c: { key: string }) => c.key);
  assert.deepEqual(chips({ isPaid: true, isShipped: false }), ["Paid on Etsy", "Not dispatched on Etsy"]);
  assert.deepEqual(chips({ isPaid: false }), ["Not paid on Etsy", "Not dispatched on Etsy"]);
  assert.deepEqual(chips({ isPaid: true, isShipped: true }), ["Paid on Etsy", "Dispatched on Etsy"]);
  assert.deepEqual(chips({ isPaid: true, isCancelled: true }), ["Cancelled on Etsy", "Paid on Etsy"], "a cancelled order is not 'not dispatched'");
  assert.deepEqual(chips({ isPaid: true, isShipped: true, isRefunded: true }), ["Refunded on Etsy", "Paid on Etsy", "Dispatched on Etsy"]);
  assert.deepEqual(chips(null), []);
});
await check("A5 no invented 'Ship by': the snapshot stores no Etsy ship date, so no chip (and the due date is not used for one)", () => {
  assert.equal(need("ETSY_SHIP_BY_STORED"), false);
  const panel = read("app/orders/EtsySourcePanel.tsx");
  assert.ok(panel.includes("etsyOrderView"), "the panel does not use the ETSY-UI-1 rules");
  assert.doesNotMatch(panel, /Ship by|expected_?ship|shipBy|dueDate|deliveryDueDate/i);
});
await check("A6 a photo matches its own line (transaction first, then listing); Etsy links are Etsy's", () => {
  const forItem = need("etsyPhotoForItem");
  const rows = [{ transactionId: "t1", listingId: "L" }, { transactionId: "t2", listingId: "L" }, { transactionId: "t3", listingId: "M" }];
  assert.equal(forItem(rows, { transactionId: "t2", listingId: "L" }), rows[1]);
  assert.equal(forItem(rows, { listingId: "M" }), rows[2]);
  assert.equal(forItem(rows, { transactionId: "zz", listingId: "L" }), rows[0]);
  assert.equal(forItem(rows, { listingId: "Q" }), undefined);
  const link = need("etsyOrderLink");
  assert.equal(link({ viewOnEtsyUrl: "https://www.etsy.com/your/orders/sold?order_id=3100000096" }), "https://www.etsy.com/your/orders/sold?order_id=3100000096");
  assert.equal(link({ viewOnEtsyUrl: "https://evil.example/your/orders/sold" }), "");
  assert.equal(link({ viewOnEtsyUrl: "javascript:alert(1)" }), "");
  assert.equal(need("etsyAddTrackingLink")({}), "https://www.etsy.com/your/orders/sold");
});

// ── B. the block drawn ─────────────────────────────────────────────────────
const H = 3600_000;
const IMG = (n: number) => `https://i.etsystatic.com/9/r/il/stub/${n}/il_570xN.${n}_1.jpg`;
const TWO_LINES = {
  receiptId: "3100000096", isPaid: true, isShipped: false, currency: "GBP",
  subtotal: 114, discount: 0, shipping: 3.95, tax: 19.66, grandTotal: 117.95,
  buyerNote: "Could you gift wrap it please? It's a birthday present.", giftMessage: "Happy birthday Arthur!",
  fetchedAtMs: Date.UTC(2026, 9, 27, 10, 14), viewOnEtsyUrl: "https://www.etsy.com/your/orders/sold?order_id=3100000096",
  items: [
    { transactionId: "t1", listingId: "111", title: "Hand-stamped Sterling Silver Name Necklace", quantity: 1, unitPrice: 42, currency: "GBP",
      options: [{ name: "Chain length", value: "20 in" }, { name: "Finish", value: "Polished" }], personalization: [{ name: "Personalization", value: "Personalization: ARTHUR" }] },
    { transactionId: "t2", listingId: "222", title: "Birth Flower Ring", quantity: 2, unitPrice: 36, currency: "GBP",
      options: [{ name: "Ring size", value: "L" }, { name: "Month", value: "October" }], personalization: [] }
  ]
};
const fresh = (transactionId: string, listingId: string, n: number) => ({ transactionId, listingId, url: IMG(n), thumbUrl: IMG(n), listingUrl: `https://www.etsy.com/listing/${listingId}`, expiresAtMs: Date.now() + H });
const draw = (source: unknown, photos: unknown, showMoney = true, language = "English") => {
  assert.ok(panelModule.EtsySourcePanel, `EtsySourcePanel did not load: ${panelModule.loadError?.message}`);
  return renderToStaticMarkup(React.createElement(panelModule.EtsySourcePanel, { source, photos, language, showMoney }));
};
const PHOTOS = { photos: [fresh("t1", "111", 1), fresh("t2", "222", 2)], reason: "", loading: false };

await check("B1 header: Etsy badge, 'Order #', snapshot chips, 'as of', 'Open in Etsy' (viewOnEtsyUrl); no Ship-by chip", () => {
  const html = draw(TWO_LINES, PHOTOS);
  assert.match(html, /class="etsy-source-panel__badge"[^>]*>Etsy</);
  assert.match(html, /Order #3100000096/);
  assert.match(html, /data-etsy-chip="Paid on Etsy"/);
  assert.match(html, /data-etsy-chip="Not dispatched on Etsy"/);
  assert.match(html, /data-etsy-asof="">as of 27 Oct 2026/);
  assert.match(html, /href="https:\/\/www\.etsy\.com\/your\/orders\/sold\?order_id=3100000096"[^>]*>Open in Etsy ↗/);
  assert.doesNotMatch(html, /Ship by/i);
});
await check("B2 each line: an enlarge button over Etsy's photo, 'qty × title', unit price, option chips, personalisation + Copy, listing link", () => {
  const html = draw(TWO_LINES, PHOTOS);
  assert.equal((html.match(/aria-label="Enlarge the Etsy photo of /g) || []).length, 2);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /<img src="https:\/\/i\.etsystatic\.com\/9\/r\/il\/stub\/1\//);
  assert.match(html, /1 × Hand-stamped Sterling Silver Name Necklace/);
  assert.match(html, /2 × Birth Flower Ring/);
  assert.match(html, /£36\.00 each/);
  assert.match(html, /class="etsy-option-chip"[^>]*>Chain length: 20 in</);
  assert.match(html, /data-etsy-personalisation=""/);
  assert.match(html, /ARTHUR/);
  assert.doesNotMatch(html, />Personalization: ARTHUR</, "the 'Personalization:' prefix is Etsy's label, not the buyer's text");
  assert.match(html, /aria-label="Copy personalisation"[^>]*>Copy</);
  assert.equal((html.match(/View listing on Etsy ↗/g) || []).length, 2);
});
await check("B3 photo states: skeleton while asked; placeholder + 'View on Etsy' when unavailable (quota / gone / disconnected)", () => {
  const loading = draw(TWO_LINES, { photos: [], reason: "", loading: true });
  assert.equal((loading.match(/data-etsy-photo-state="loading"/g) || []).length, 2);
  assert.match(loading, /aria-label="Loading the photo from Etsy"/);
  assert.doesNotMatch(loading, /<img /);
  for (const reason of ["quota", "not_connected", "unavailable"]) {
    const html = draw(TWO_LINES, { photos: [], reason, loading: false });
    assert.equal((html.match(/data-etsy-photo-state="placeholder"/g) || []).length, 2, reason);
    assert.match(html, /data-etsy-photo-placeholder=""/);
    assert.match(html, /href="https:\/\/www\.etsy\.com\/listing\/111"/);
    assert.match(html, /View on Etsy/);
    assert.match(html, /Product photos open on Etsy\./);
    assert.doesNotMatch(html, /Enlarge the Etsy photo/);
  }
  const expired = draw(TWO_LINES, { photos: [{ ...fresh("t1", "111", 1), expiresAtMs: Date.now() - 1 }], reason: "", loading: false });
  assert.doesNotMatch(expired, /<img /, "an expired photo is never drawn");
});
await check("B4 side: buyer note, gift message, 'Totals from Etsy' with the COMPUTED tax line", () => {
  const html = draw(TWO_LINES, PHOTOS);
  assert.match(html, /Buyer note<\/span><span dir="auto">Could you gift wrap it please\?/);
  assert.match(html, /Gift message<\/span><span dir="auto">Happy birthday Arthur!/);
  assert.match(html, /Totals from Etsy/);
  assert.match(html, /data-etsy-tax="included"><dt>VAT included<\/dt><dd>£19\.66/);
  assert.doesNotMatch(html, /<dt>Tax<\/dt>/);
  const added = draw({ ...TWO_LINES, currency: "USD", subtotal: 50, shipping: 5, tax: 4.4, grandTotal: 59.4 }, PHOTOS);
  assert.match(added, /data-etsy-tax="added"><dt>Tax<\/dt>/);
  assert.ok(added.indexOf('data-etsy-tax="added"') < added.indexOf('class="is-total"'), "added tax sits above the total");
  assert.doesNotMatch(added, /VAT included/);
  const unclaimed = draw({ ...TWO_LINES, subtotal: 50, shipping: 5, tax: 9.17, grandTotal: 58 }, PHOTOS);
  assert.match(unclaimed, /data-etsy-tax="unclaimed"><dt>Tax reported by Etsy<\/dt>/);
  assert.doesNotMatch(unclaimed, /VAT included|<dt>Tax<\/dt>/);
});
await check("B5 money only with Financial Info: no unit price, no totals, no tax without it", () => {
  const html = draw(TWO_LINES, PHOTOS, false);
  assert.doesNotMatch(html, /£|Totals from Etsy|VAT included|etsy-source-panel__price|etsy-source-panel__money/);
  assert.match(html, /2 × Birth Flower Ring/);
});
await check("B6 footer keeps every existing text: read-only note, last update, photo freshness, Etsy trademark verbatim", () => {
  const html = draw(TWO_LINES, PHOTOS);
  assert.match(html, /Read-only: this is Etsy&#x27;s copy of the order\. Your own changes go in the cards below\./);
  assert.match(html, /Last updated from Etsy/);
  assert.match(html, /Photos come live from Etsy and are refreshed at least every 6 hours; they are not saved in NivaDesk\./);
  assert.ok(html.includes("The term &#x27;Etsy&#x27; is a trademark of Etsy, Inc. This Application uses Etsy&#x27;s API, but is not endorsed or certified by Etsy."), "T1");
  const tr = draw(TWO_LINES, PHOTOS, true, "Türkçe");
  assert.ok(tr.includes("The term &#x27;Etsy&#x27; is a trademark of Etsy, Inc."), "T1 stays English in Türkçe");
  assert.match(tr, /Etsy&#x27;de ödendi/);
});
await check("B7 the enlarged photo is an accessible dialog: role=dialog, aria-modal, labelled, Close button, Esc, focus kept inside and returned", () => {
  const panel = read("app/orders/EtsySourcePanel.tsx");
  const box = panel.slice(panel.indexOf("function EtsyPhotoLightbox"), panel.indexOf("function EtsySourcePanelBody"));
  assert.ok(box.length > 200, "EtsyPhotoLightbox missing");
  assert.match(box, /role="dialog" aria-modal="true" aria-labelledby="etsy-lightbox-title"/);
  assert.match(box, /aria-label=\{t\("Close photo"\)\}/);
  assert.match(box, /event\.key === "Escape"/);
  assert.match(box, /closeRef\.current\?\.focus\(\)/);
  assert.match(box, /event\.key !== "Tab"/);
  assert.match(box, /createPortal\(/);
  assert.match(panel, /opener\.focus\(\)/, "focus returns to the photo that opened it");
  assert.doesNotMatch(panel, /setDoc|updateDoc|addDoc|deleteDoc|localStorage|indexedDB/, "the block stores nothing");
});

// ── C. the card system ─────────────────────────────────────────────────────
const layoutSource = read("lib/studioflow/cardLayouts.ts");
const from = layoutSource.indexOf("export const ORDER_WORKSPACE_LAYOUT_KEY");
const to = layoutSource.indexOf("function friendlyCardLayoutError");
const tmp = join(mkdtempSync(join(tmpdir(), "etsy-ui-1-layouts-")), "layouts.mjs");
writeFileSync(tmp, ts.transpileModule(`${layoutSource.slice(from, to)}\nexport { layoutFromWorkspaceSettings };\n`,
  { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText);
const layouts = await import(pathToFileURL(tmp).href) as Record<string, any>;
const IDS_19 = ["preview", "repairIntake", "estimate", "customerPortal", "summary", "customer", "invoiceItems", "materials", "priority",
  "delivery", "notes", "clientFiles", "todo", "workTime", "financial", "status", "shipping", "schedule", "historyLog"];

// A real saved shape: a member's profile snapshot with hidden cards, own widths/heights/colours and a phone order.
const SAVED = {
  kartYerlesimi: [["summary", "shipping", "notes", "preview"], ["customer", "invoiceItems", "materials", "delivery", "repairIntake"], ["financial", "status", "todo", "historyLog", "clientFiles", "workTime"], ["priority", "estimate", "customerPortal", "schedule"]],
  phoneKartSirasi: ["status", "summary", "shipping", "financial", "customer", "notes", "todo", "preview", "invoiceItems", "materials", "delivery", "repairIntake", "historyLog", "clientFiles", "workTime", "priority", "estimate", "customerPortal", "schedule"],
  sutunGenislikleri: [420, 300, 360, 280],
  kartYukseklikleri: { summary: 260, shipping: 520 },
  kartRenkleri: { shipping: "Orange", financial: "Purple" },
  visibility: { priority: false, estimate: false, customerPortal: false, schedule: false, repairIntake: false, delivery: false, clientFiles: false }
};
const RENAMED: Record<string, string> = { materials: "Metals & Stones", summary: "Job Sheet", preview: "Design" };
const CARD_LABELS_FALLBACK: Record<string, string> = { preview: "Preview", summary: "Order Summary", customer: "Customer & Communication", invoiceItems: "Invoice Items", materials: "Materials & Inventory", notes: "Notes", todo: "To Do", workTime: "Work Time", financial: "Financial Info", status: "Production Status", shipping: "Shipping & Tracking", historyLog: "History / Log" };
const deepFreeze = <T,>(value: T): T => { if (value && typeof value === "object") { Object.values(value as object).forEach(deepFreeze); Object.freeze(value); } return value; };
// The page's own derivation (OrderDetailContent desktopColumns / visibleMobileCards), applied to the normalised layout.
const pageVisible = (layout: any, canShow: (id: string) => boolean) => ({
  desktop: layout.columns.map((column: string[]) => column.filter((id) => layout.visibility[id] && canShow(id))).flat(),
  phone: layout.mobileCardOrder.filter((id: string) => layout.visibility[id] && canShow(id))
});

await check("C1 ORDER_DETAIL_CARD_IDS and the layout format are unchanged (19 ids; columns, widths, heights, colours, visibility, phone order)", () => {
  assert.deepEqual([...layouts.ORDER_DETAIL_CARD_IDS], IDS_19);
  const keys = Object.keys(layouts.normalizeOrderDetailCardLayout({})).sort();
  assert.deepEqual(keys, ["cardColors", "cardHeights", "cardOrder", "columnWidths", "columns", "mobileCardOrder", "visibility"]);
  assert.equal(layouts.ORDER_WORKSPACE_LAYOUT_KEY, "__workspaceLayoutV1");
});
await check("C2 a saved layout (hidden cards, widths, heights, colours, phone order) reads back unchanged and normalises to itself", () => {
  const json = JSON.stringify(SAVED);
  const first = layouts.layoutFromOrderWorkspaceSnapshotJSON(json, "etsy_3100000096");
  assert.deepEqual(first.columnWidths, [420, 300, 360, 280]);
  assert.deepEqual(first.cardHeights, { summary: 260, shipping: 520 });
  assert.deepEqual(first.cardColors, { shipping: "Orange", financial: "Purple" });
  assert.equal(first.visibility.priority, false);
  assert.deepEqual(first.columns.slice(0, 4).map((c: string[]) => c.slice(0, 2)), [["summary", "shipping"], ["customer", "invoiceItems"], ["financial", "status"], ["priority", "estimate"]]);
  const again = layouts.normalizeOrderDetailCardLayout(deepFreeze(JSON.parse(JSON.stringify(first))));
  assert.deepEqual(again, first, "normalising the normalised layout changed it");
  const settings = { workspaceUserProfilesJSON: JSON.stringify([{ userId: "member-a", snapshotJSON: json }]) };
  assert.deepEqual(layouts.layoutFromWorkspaceSettings(settings, "member-a", "owner", "etsy_3100000096", ""), first, "the member's own saved layout");
});
await check("C3 the jump bar lists exactly the visible cards, in the saved order, under the user's own titles; nothing is written or mutated", () => {
  const targets = need("orderJumpTargets");
  const layout = deepFreeze(layouts.layoutFromOrderWorkspaceSnapshotJSON(JSON.stringify(SAVED), "etsy_3100000096"));
  const before = JSON.stringify(layout);
  const labelOf = (id: string) => RENAMED[id] || CARD_LABELS_FALLBACK[id] || id;
  const owner = pageVisible(layout, () => true);
  const desktop = targets(owner.desktop, labelOf, { etsyBlock: true, etsyLabel: "From Etsy" });
  assert.deepEqual(desktop.map((t: { id: string }) => t.id), ["etsy", "summary", "shipping", "notes", "preview", "customer", "invoiceItems", "materials", "financial", "status", "todo", "historyLog", "workTime"]);
  assert.deepEqual(desktop.slice(0, 2).map((t: { label: string }) => t.label), ["From Etsy", "Job Sheet"]);
  assert.equal(desktop.find((t: { id: string }) => t.id === "materials").label, "Metals & Stones");
  for (const hidden of ["priority", "estimate", "customerPortal", "schedule", "repairIntake", "delivery", "clientFiles"]) {
    assert.ok(!desktop.some((t: { id: string }) => t.id === hidden), `${hidden} is hidden but listed`);
  }
  const phone = targets(owner.phone, labelOf, { etsyBlock: false, etsyLabel: "From Etsy" });
  assert.deepEqual(phone.map((t: { id: string }) => t.id).slice(0, 4), ["status", "summary", "shipping", "financial"], "phone order");
  assert.equal(JSON.stringify(layout), before, "the layout object changed");
  assert.equal(need("hiddenCardCount")(IDS_19, layout.visibility), 7);
});
await check("C4 Financial Info gating carries over: a member without it gets no 'Financial Info' link (the page never draws that card)", () => {
  const layout = layouts.layoutFromOrderWorkspaceSnapshotJSON(JSON.stringify(SAVED), "etsy_3100000096");
  const member = pageVisible(layout, (id) => id !== "financial");
  const list = need("orderJumpTargets")(member.desktop, (id: string) => id, { etsyBlock: true, etsyLabel: "From Etsy" });
  assert.ok(!list.some((t: { id: string }) => t.id === "financial"));
  const detail = read("app/orders/OrderDetailContent.tsx");
  assert.match(detail, /if \(cardId === "financial"\) return canSeeFinance;/, "canShowOrderCard still gates the money card");
});
await check("C5 the new code reaches no layout write: no persistLayout / save*CardLayout / setDoc in the jump bar, the Etsy block or the rules", () => {
  const detail = read("app/orders/OrderDetailContent.tsx");
  const start = detail.indexOf("function openCustomizeCards()");
  const end = detail.indexOf("<DetailLanguageContext.Provider value={detailLanguage}>", start);
  assert.ok(start > 0 && end > start, "jump bar section not found");
  const section = detail.slice(start, end);
  assert.match(section, /function jumpToOrderCard/);
  assert.doesNotMatch(section, /persistLayout|saveOrderDetailCardLayout|saveIndependentOrderCardLayout|saveTypeOrderCardLayout|resetIndependentOrderCardLayout|setCardLayout|setDoc|updateDoc|httpsCallable/);
  for (const file of ["lib/studioflow/etsyOrderView.ts", "app/orders/EtsySourcePanel.tsx"]) {
    assert.doesNotMatch(read(file), /cardLayouts|persistLayout|CardLayout\(|setDoc|updateDoc/, file);
  }
});

// ── D. page wiring ─────────────────────────────────────────────────────────
const detail = read("app/orders/OrderDetailContent.tsx");
await check("D1 the jump bar sits under the order header (inside the sticky head, after the tab bar) on every order", () => {
  assert.match(detail, /\{renderOrderTabs\(\)\}\s*\{renderJumpBar\(\)\}\s*<\/div>/);
  assert.match(detail, /<nav className="order-jump-bar__links" aria-label=\{t\("Jump to a card"\)\}>/);
});
await check("D2 it is built from the cards the page draws (desktop columns / phone stack incl. the Etsy fold) and their own titles", () => {
  assert.match(detail, /: desktopColumns\.flatMap\(column => column\.cards\)/);
  assert.match(detail, /\? \[\.\.\.mobileCardFold\.main, \.\.\.mobileCardFold\.folded\]/);
  assert.match(detail, /orderJumpTargets\(jumpCardOrder, cardId => cardLabel\(cardId as OrderDetailCardId\)/);
  assert.match(detail, /const fold = mobileCardFold;/, "the phone stack and the jump bar share one fold");
  assert.match(detail, /if \(fold && !fold\.open\) fold\.open = true;/, "a folded card opens before the jump");
});
await check("D3 Customize cards next to it is the existing entry (one handler for Actions and the bar) with the hidden count", () => {
  assert.match(detail, /const hiddenCards = hiddenCardCount\(customizeCardOrder, cardLayout\.visibility\);/);
  assert.equal((detail.match(/onClick=\{openCustomizeCards\}/g) || []).length, 2);
  assert.match(detail, /t\("\{count\} hidden"\)\.replace\("\{count\}", String\(hiddenCards\)\)/);
});
await check("D4 the Etsy block stays in the page flow above the cards: no sticky/fixed, no max-height, no inner scroll", () => {
  assert.match(detail, /<div ref=\{etsyBlockRef\} className="order-etsy-block" id="order-etsy-block">\s*<EtsySourcePanel source=\{etsySource\} photos=\{etsyPhotos\} language=\{detailLanguage\} showMoney=\{canSeeFinance\} \/>/);
  assert.ok(detail.indexOf('className="order-etsy-block"') < detail.indexOf('id="order-tab-panel-overview"'), "the block is above the cards");
  const css = read("app/globals.css");
  const rules = css.match(/[^}]*(?:\.order-etsy-block|\.etsy-source-panel)[^{]*\{[^}]*\}/g) || [];
  assert.ok(rules.length > 10, "Etsy block CSS not found");
  for (const rule of rules) {
    assert.doesNotMatch(rule, /position:\s*(sticky|fixed)|overflow(-y)?:\s*(auto|scroll)|max-height:(?!\s*none)/, rule.trim().slice(0, 90));
  }
});
await check("D5 Shipping & Tracking: Etsy orders only, says NivaDesk cannot mark it dispatched on Etsy, links to add tracking on Etsy", () => {
  assert.match(detail, /\{etsyBuyerMessagingBlocked \? \(\s*<div className="order-etsy-tracking-note" data-etsy-tracking-note="" role="note">\s*<p>\{t\("NivaDesk reads Etsy orders but can't mark them dispatched on Etsy\. Add the tracking number on Etsy too\."\)\}<\/p>\s*<a href=\{etsyAddTrackingLink\(etsySource\)\} target="_blank" rel="noopener noreferrer">\{t\("Add tracking on Etsy"\)\} ↗<\/a>/);
  const shipping = detail.slice(detail.indexOf('case "shipping":'), detail.indexOf('case "schedule":'));
  assert.ok(shipping.includes("data-etsy-tracking-note"), "the note is not on the Shipping & Tracking card");
});

// ── E. texts ───────────────────────────────────────────────────────────────
await check("E1 every new string has all 11 translations through studioT, and RTL Arabic is present", async () => {
  const mod = await import("../lib/studioflow/etsyOrderViewTranslations").catch(() => ({})) as Record<string, any>;
  const table = mod.ETSY_ORDER_VIEW_TRANSLATIONS as Record<string, Record<string, string>> | undefined;
  assert.ok(table && Object.keys(table).length >= 20, "ETSY_ORDER_VIEW_TRANSLATIONS missing");
  for (const key of Object.keys(table)) {
    for (const language of LANGUAGES) {
      const value = studioT(key, language);
      assert.ok(value && value !== key, `${key} / ${language} falls back to English`);
      if (key.includes("{")) for (const slot of key.match(/\{[a-z]+\}/g) || []) assert.ok(value.includes(slot), `${key} / ${language} lost ${slot}`);
    }
  }
  const used = read("app/orders/EtsySourcePanel.tsx") + read("app/orders/OrderDetailContent.tsx") + read("lib/studioflow/etsyOrderView.ts");
  for (const key of Object.keys(table)) assert.ok(used.includes(`"${key}"`), `${key} is not used on screen`);
});
await check("E2 the new table only ADDS keys: none of them was already defined elsewhere (so nothing that reads well changes)", async () => {
  const mod = await import("../lib/studioflow/etsyOrderViewTranslations").catch(() => ({})) as Record<string, any>;
  const keys = Object.keys(mod.ETSY_ORDER_VIEW_TRANSLATIONS || {});
  assert.ok(keys.length, "table missing");
  const dir = join(root, "lib/studioflow");
  const others = readdirSync(dir).filter((f) => /\.ts$/.test(f) && f !== "etsyOrderViewTranslations.ts").map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  for (const key of keys) assert.ok(!others.includes(`${JSON.stringify(key)}:`), `${key} already defined elsewhere`);
  const lang = read("lib/studioflow/language.ts");
  assert.ok(lang.indexOf("mergeIntoTranslations(ETSY_ORDER_VIEW_TRANSLATIONS)") > lang.indexOf("mergeIntoTranslations(CHANNEL_SHIPPING_COST_TRANSLATIONS)"), "merged last, per language");
});
await check("E3 RTL: the new CSS uses logical directions only (no left/right margins, paddings, positions or text-align)", () => {
  const css = read("app/globals.css");
  const block = css.slice(css.indexOf("/* ==== ETSY-UI-1"));
  assert.ok(block.length > 1000, "ETSY-UI-1 CSS block missing");
  assert.doesNotMatch(block, /(margin|padding|border)-(left|right)\s*:|text-align:\s*(left|right)|[\s;{](left|right)\s*:\s*-?\d/);
});

// ── F. Phase B: list thumbnails (no new server function, a session budget) and the list toggle ───────────
const thumbs = await import("../lib/studioflow/etsyListThumbnails").catch(() => ({})) as Record<string, any>;
const photosLib = await import("../lib/studioflow/etsyListingPhotos") as Record<string, any>;
await check("F1 list photos: one getEtsyListingPhotos call per order per session; a miss / quota stop is not asked again; an expired photo is", async () => {
  assert.equal(typeof thumbs.requestEtsyListThumbnail, "function", "requestEtsyListThumbnail missing");
  thumbs.clearEtsyListThumbnails(); photosLib.clearEtsyPhotoCache();
  let clock = 1_000_000; const now = () => clock;
  const calls: string[] = [];
  const answer = (id: string) => id === "a"
    ? { ok: true, fetchedAtMs: clock, expiresAtMs: clock + 6 * H, photos: [{ transactionId: "1", listingId: "1", url: IMG(1), thumbUrl: IMG(1), fetchedAtMs: clock, expiresAtMs: clock + 6 * H }] }
    : { ok: true, reason: "quota", photos: [] };
  const call = async (id: string) => { calls.push(id); if (id === "c") throw new Error("functions/unavailable"); return answer(id); };
  await Promise.all([thumbs.requestEtsyListThumbnail("a", call, now), thumbs.requestEtsyListThumbnail("a", call, now)]);
  await thumbs.requestEtsyListThumbnail("b", call, now); await thumbs.requestEtsyListThumbnail("b", call, now);
  await thumbs.requestEtsyListThumbnail("c", call, now); await thumbs.requestEtsyListThumbnail("c", call, now);
  assert.deepEqual(calls, ["a", "b", "c"], "rows scrolled past again must not ask again");
  assert.ok(thumbs.etsyListThumbnail(await thumbs.requestEtsyListThumbnail("a", call, now), clock), "the photo is shown");
  clock += 6 * H;
  assert.equal(thumbs.etsyListThumbnail(await photosLib.loadEtsyListingPhotos("zz", async () => ({ photos: [] }), now), clock), undefined);
  await thumbs.requestEtsyListThumbnail("a", call, now);
  assert.equal(calls.filter((id) => id === "a").length, 2, "an expired photo is asked for once more");
  // the order page and the list share the fresh-answer cache: opening order "a" now costs nothing
  const before = calls.length;
  await photosLib.loadEtsyListingPhotos("a", call, now);
  assert.equal(calls.length, before, "the order page reused the list's fresh answer");
});
await check("F2 the row asks only while on screen (IntersectionObserver + dwell) and only for Etsy orders on the Orders page", () => {
  const thumb = read("components/EtsyListThumbnail.tsx");
  assert.match(thumb, /new IntersectionObserver\(/);
  assert.match(thumb, /entries\.some\(\(entry\) => entry\.isIntersecting\)/);
  assert.match(thumb, /requestEtsyListThumbnail\(orderId, callGetEtsyListingPhotos\)/);
  assert.equal((thumb.match(/httpsCallable/g) || []).length, 2, "one callable, getEtsyListingPhotos");
  assert.match(thumb, /"getEtsyListingPhotos"/);
  assert.doesNotMatch(thumb, /setDoc|updateDoc|localStorage|indexedDB/);
  const card = read("components/OrderListCard.tsx");
  assert.match(card, /etsyPhoto && isEtsyOrder\(\{ id: order\.id, customFields: order\.customFields \}\) \? \(\s*<EtsyListThumbnail /);
  const page = read("app/orders/page.tsx");
  assert.equal((page.match(/<OrderListCard[^>]*?\n\s*(key=\{order\.id\}\n\s*)?order=\{order\}\n\s*etsyPhoto\n/g) || []).length, 2, "both Orders lists");
  assert.doesNotMatch(read("app/schedule/page.tsx"), /etsyPhoto/, "the schedule list does not ask Etsy");
});
await check("F3 hide/show the order list from the order header: the Orders page's existing collapse, wide layouts only", () => {
  const page = read("app/orders/page.tsx");
  assert.match(page, /orderListToggle=\{\{ collapsed: sidebar\.collapsed, onToggle: \(\) => sidebar\.setCollapsed\(value => !value\) \}\}/);
  assert.match(detail, /aria-label=\{orderListToggle\.collapsed \? t\("Expand order list"\) : t\("Collapse order list"\)\}/);
  assert.match(detail, /aria-expanded=\{!orderListToggle\.collapsed\}/);
  assert.doesNotMatch(read("app/orders/[orderId]/page.tsx"), /orderListToggle/, "the phone order page has no list to hide");
  assert.match(read("app/globals.css"), /@media \(max-width: 640px\) \{ \.order-list-toggle \{ display: none; \} \}/);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
