// eBay listings → Inventory and eBay orders → stock on the web (package E4, 1 Oct 2026).
//
// 1. lib/studioflow/ebayInventoryRules.ts, compiled with the tree's own TypeScript and run: a Preview row, a link and
//    an order-stock answer reach the screen with their own fields only (no buyer, no high bidder, a picture only from
//    eBay's picture host); nothing is chosen for the person (only a single SKU match starts as "link", an ambiguous
//    row starts empty); a counted card needs the person's own count (eBay's number is never a default; 0 is allowed;
//    "2,5" is 2.5); a one-off card cannot stand for a listing that sells more than one; the order page offers
//    "Reserve stock" only for a linked line with no stock record (or a blocked one) and "Item returned" only for goods
//    that went out on an order whose sale was undone; eBay carrier codes → the couriers NivaDesk's tracking speaks.
// 2. Every sentence the five screens print has all eleven translations in the feature's own table, placeholders intact.
// 3. The screens are mounted where the package says, call what the server offers, gate on the server's answer, and
//    nothing here names an eBay call that writes.
//
//   node scripts/check-ebay-inventory.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => { checks += 1; if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`); };
const ok = (name, condition) => { checks += 1; if (!condition) failures.push(name); };
const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf8") : "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ebay-inventory-check-"));
const source = read("lib/studioflow/ebayInventoryRules.ts");
ok("lib/studioflow/ebayInventoryRules.ts exists", Boolean(source));
ok("the rules module imports nothing (so it can run here)", !/^import /m.test(source));
fs.writeFileSync(path.join(tmp, "rules.mjs"), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText);
const R = await import(pathToFileURL(path.join(tmp, "rules.mjs")).href);

// ---- 1. rules
const LINK = (n) => `c1__seller__1100000000${String(n).padStart(2, "0")}__${"a".repeat(20)}`;
const answer = { rows: [
  { linkId: LINK(1), itemId: "110000000001", variationKey: "-", title: "Rolex Datejust 1601", sku: "W-1601-A", listedQuantity: 1, priceKind: "fixed", price: { value: "4250.00", currency: "gbp" }, pictureUrl: "https://i.ebayimg.com/images/g/abc/s-l140.jpg",
    state: "sku_match", candidates: [{ id: "A", number: "INV-00001", name: "Rolex", sku: "W-1601-A", status: "available", trackingType: "unique", reason: "sku" }], proposed: { name: "Rolex Datejust 1601", trackingType: "unique" },
    highBidder: "bidder_x", buyer: { username: "ada" }, email: "ada@example.com" },
  { linkId: LINK(1), title: "duplicate" },
  { linkId: "../../etc", title: "bad id" },
  { linkId: LINK(2), itemId: "110000000002", title: "Strap", sku: "STRAP", listedQuantity: 9, state: "ambiguous", ambiguity: "sku_on_several_cards", candidates: [{ id: "B1", name: "a" }, { id: "B2", name: "b" }], pictureUrl: "https://pictures.example.com/x.jpg", proposed: { trackingType: "quantity" } },
  { linkId: LINK(3), itemId: "110000000003", title: "Dial", sku: "", listedQuantity: 1, state: "no_sku", suggestions: [{ id: "D", name: "Vintage dial", trackingType: "unique", reason: "name" }], proposed: { trackingType: "unique" } },
  { linkId: LINK(4), itemId: "110000000004", title: "Linked one", state: "linked", linkedItem: { id: "L", number: "INV-00009", name: "Linked" } },
  { linkId: LINK(5), itemId: "110000000005", title: "Weird", state: "<script>" }
] };
const rows = R.listingRowsOf(answer);
expect("one row per link id, malformed ids dropped", rows.map((r) => r.itemId), ["110000000001", "110000000002", "110000000003", "110000000004", "110000000005"]);
ok("no buyer, e-mail or high bidder survives into a row", !/bidder_x|ada@|"ada"/.test(JSON.stringify(rows)));
expect("currency upper-cased; a picture only from eBay's host", [rows[0].price.currency, rows[0].pictureUrl.startsWith("https://i.ebayimg.com/"), rows[1].pictureUrl], ["GBP", true, ""]);
expect("an unknown state is not trusted", rows[4].state, "no_match");
expect("a single SKU match starts as 'link to that card'; an ambiguous row and a no-SKU row start with nothing chosen", [R.startingDecision(rows[0]).action, R.startingDecision(rows[0]).inventoryItemId, R.startingDecision(rows[1]).action, R.startingDecision(rows[2]).action], ["link", "A", "", ""]);
expect("a linked row cannot be chosen again", [R.canChoose(rows[3]), R.canChoose(rows[0])], [false, true]);
const blank = { action: "", inventoryItemId: "", trackingType: "quantity", onHand: "", category: "" };
expect("problems: no action, no card, no count, a bad count, a one-off card for nine", [
  R.decisionProblem(rows[1], blank), R.decisionProblem(rows[1], { ...blank, action: "link" }), R.decisionProblem(rows[1], { ...blank, action: "create" }),
  R.decisionProblem(rows[1], { ...blank, action: "create", onHand: "lots" }), R.decisionProblem(rows[1], { ...blank, action: "create", trackingType: "unique" }),
  R.decisionProblem(rows[1], { ...blank, action: "create", onHand: "0" })
], ["action_required", "card_required", "count_required", "count_invalid", "one_off_card_for_many", ""]);
const decisions = { [LINK(1)]: R.startingDecision(rows[0]), [LINK(2)]: { ...blank, action: "create", onHand: "2,5", category: "Straps" }, [LINK(3)]: blank, [LINK(4)]: { ...blank, action: "link", inventoryItemId: "X" } };
expect("Import sends only the chosen rows that are ready, in the list's order; '2,5' is 2.5; eBay's 9 is never sent as a count", R.decisionsToSend(rows, [LINK(3), LINK(2), LINK(1), LINK(4)], decisions), [
  { linkId: LINK(1), action: "link", inventoryItemId: "A" },
  { linkId: LINK(2), action: "create", trackingType: "quantity", onHand: 2.5, category: "Straps" }
]);
expect("more than 200 go in turns", R.chunk(Array.from({ length: 450 }, (_, i) => i)).map((c) => c.length), [200, 200, 50]);
expect("filters and counts", [R.filterRows(rows, "needs_choice").map((r) => r.itemId), R.countsOf(rows)], [["110000000002", "110000000003", "110000000005"], { all: 5, needs_choice: 3, sku_match: 1, linked: 1 }]);
expect("an unknown reason word gets the general sentence, never the word", [R.reasonSentence("count_required"), R.reasonSentence("<b>raw</b>")], ["Type how many you have on the shelf (0 is allowed).", "This could not be done."]);
expect("eBay carriers → NivaDesk couriers (the server's table)", ["RoyalMail", "Parcelforce", "DHL", "DHLEXPRESS", "FedEx", "UPS", "Hermes", "Yodel", "DHLGlobalMail", "", null].map(R.courierForEbayCarrier),
  ["Royal Mail", "Parcelforce", "DHL", "DHL", "FedEx", "UPS", "Auto Detect", "Auto Detect", "Auto Detect", "Auto Detect", "Auto Detect"]);
const stock = R.orderStockViewOf({ enabled: true, canEdit: true, money: false, refunded: true, address: "elsewhere", lines: [
  { lineItemId: "L1", title: "Watch", quantity: 1, link: { linkId: LINK(1), inventoryItemId: "A", card: { id: "A", number: "INV-00001", name: "Rolex" } }, stock: { state: "sold", reservedQty: 0, soldQty: 1, returnedQty: 0, inventoryItemId: "A", card: { id: "A", number: "INV-00001", name: "Rolex" } }, needsReturnDecision: true },
  { lineItemId: "L2", title: "Strap", quantity: 3, link: { linkId: LINK(2), inventoryItemId: "S" }, stock: null, beforeLink: true },
  { lineItemId: "L3", title: "Ring", quantity: 2, link: { linkId: LINK(3), inventoryItemId: "R" }, stock: { state: "none", reservedQty: 0, soldQty: 0, returnedQty: 0, blocked: { reason: "not_enough_stock", atMs: 1 } } },
  { lineItemId: "L4", title: "Unlinked", quantity: 1, link: null, stock: null },
  { lineItemId: "L5", title: "Reserved", quantity: 2, link: { linkId: LINK(4), inventoryItemId: "S" }, stock: { state: "reserved", reservedQty: 2, soldQty: 0, returnedQty: 0 } }
], packages: [{ id: "F1", trackingNumber: "RM 1234 5678 9GB", carrierCode: "RoyalMail", lines: [{ lineItemId: "L1", quantity: 1 }], followProblem: true, onOrder: true }, { id: "F2", trackingNumber: "<img src=x>", carrierCode: "Hermes", followed: true, followProblem: true }] });
expect("a tracking number is letters and digits (spaces removed); anything else is dropped; couriers mapped", stock.packages.map((p) => [p.trackingNumber, p.courier]), [["RM123456789GB", "Royal Mail"], ["", "Auto Detect"]]);
expect("a failed attempt to follow is a problem, never 'followed'; 'followed' wins over a stale problem flag", stock.packages.map((p) => [p.followed, p.followProblem, p.onOrder]), [[false, true, true], [true, false, false]]);
expect("the address is restricted unless the server says it is on the order", stock.address, "restricted");
expect("line words", stock.lines.map((l) => R.lineStockSentence(l).sentence), ["Sold from stock ({sold}) · {card}", "Placed before the listing was linked — stock not taken", "Could not take stock: {reason}", "Not linked to a stock card", "Reserved {reserved} of {quantity} on {card}"]);
expect("buttons: Item returned only for goods that went out on an undone sale; Reserve only for a linked line with no record or a blocked one", stock.lines.map((l) => R.lineActions(stock, l)), [
  { reserve: false, returned: true }, { reserve: true, returned: false }, { reserve: true, returned: false }, { reserve: false, returned: false }, { reserve: false, returned: false }]);
expect("nothing is offered without the right to change stock", R.lineActions({ ...stock, canEdit: false }, stock.lines[1]), { reserve: false, returned: false });
expect("fill keeps an unknown placeholder", R.fill("{a} {b}", { a: 1 }), "1 {b}");

// ---- 2. translations
const screens = ["app/inventory/EbayListingsPanel.tsx", "app/inventory/EbayItemLinks.tsx", "app/orders/EbayOrderStock.tsx", "app/settings/EbayInventoryLine.tsx", "app/inventory/InventoryContent.tsx", "app/orders/OrderShipmentsPanel.tsx"];
const used = new Set();
for (const file of screens) {
  const code = read(file);
  ok(`${file} exists`, Boolean(code));
  if (file.endsWith("InventoryContent.tsx")) { used.add("eBay listings"); continue; }
  if (file.endsWith("OrderShipmentsPanel.tsx")) { const m = /ebayInventoryT\("([^"]+)", language\)/.exec(code); ok("the DHL panel's restricted-address sentence comes from the feature table", Boolean(m)); if (m) used.add(m[1]); continue; }
  for (const m of code.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) used.add(m[1]);
}
// the sentences the rules hand to the screens
for (const l of stock.lines) used.add(R.lineStockSentence(l).sentence);
for (const s of ["Sent {sold} of {quantity} · {reserved} still reserved on {card}", "Sent, then cancelled — {sold} still counted as sold", "Cancelled — the reservation was given back", "Cancelled before stock was taken", "Returned to the shelf ({returned})", "Stock not taken yet"]) used.add(s);
for (const r of rows) used.add(R.rowStateSentence(r));
for (const m of read("app/inventory/EbayListingsPanel.tsx").matchAll(/\["\w+", "([^"]+)"\]/g)) used.add(m[1]);   // the filter tabs
for (const s of ["Check: the SKU matches only if capitals are ignored", "Check: the card with this SKU is no longer on the shelf", "No card has this SKU", "The linked card no longer exists"]) used.add(s);
for (const reason of ["listing_not_in_preview", "preview_too_old", "already_linked", "card_not_found", "card_required", "customer_item", "card_not_on_shelf", "made_card_not_on_shelf", "one_off_card_for_many", "tracking_type_required", "count_required", "count_invalid", "action_required", "chosen_twice", "not_enough_stock", "held_by_another_order", "card_not_available", "reservation_missing", "card_missing", "not_enough_on_hand", "card_not_sold", "stock_refused", "listing_scope_missing", "listing_token_rejected", "reconnect_required", "rate_limited", "provider_unavailable", "listing_read_refused", "call_not_allowed", "failed"]) used.add(R.reasonSentence(reason));
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
let missing = 0;
for (const sentence of used) {
  const row = R.EBAY_INVENTORY_TEXT[sentence];
  if (!row) { failures.push(`no translations for "${sentence}"`); missing += 1; continue; }
  for (const lang of R.EBAY_INVENTORY_LANGUAGES) {
    checks += 1;
    const out = row[lang];
    if (!out || !out.trim()) failures.push(`"${sentence}" has no ${lang}`);
    else if (placeholders(out) !== placeholders(sentence)) failures.push(`"${sentence}" in ${lang} changes its placeholders: ${out}`);
  }
}
ok(`${used.size} sentences, all in the table`, missing === 0);
expect("the lookup is own-property only", [R.ebayInventoryText("constructor", "Türkçe"), R.ebayInventoryText("Linked", "Deutsch"), R.ebayInventoryText("Linked", "Klingon")], ["", "Verknüpft", ""]);

// ---- 3. wiring
const inv = read("app/inventory/InventoryContent.tsx");
ok("Inventory has an 'ebay' tab rendering EbayListingsPanel", /tab === "ebay" \? \(\s*<EbayListingsPanel/.test(inv));
ok("the Inventory entry shows only when the server says the feature is on (or the panel is open)", /ebayListingsOn \|\| tab === "ebay"/.test(inv) && /getEbayListingLinks\(workspace\.id\)\.then/.test(inv));
ok("/inventory?panel=ebay opens the panel", /get\("panel"\) === "ebay"\) setTab\("ebay"\)/.test(inv));
ok("the item panel mounts the card's eBay section", /<EbayItemLinks workspace=\{workspace\} item=\{item\}/.test(read("app/inventory/ItemDetailPanel.tsx")));
const orderPage = read("app/orders/OrderDetailContent.tsx");
ok("the order page mounts the order's stock + shipments under eBay's block, with the finance and edit gates", /<EbayOrderRefreshButton[^>]*\/>\s*\{\/\*[^*]*\*\/\}\s*<EbayOrderStock workspace=\{workspace\} currencySymbol=\{moneySymbol\(moneySettings\)\} order=\{order\} language=\{detailLanguage\} canSeeFinance=\{canSeeFinance\} canEditOrder=\{canEditOrderFully\}/.test(orderPage));
ok("the DHL panel is told when the address is not on an eBay order", /addressRestricted=\{order\.commerce\?\.provider === "ebay"/.test(orderPage));
const dhl = read("app/orders/OrderShipmentsPanel.tsx");
ok("…and then offers no 'Prepare a DHL shipment'", /can\?\.prepare && connected && !addressRestricted \? \(/.test(dhl));
ok("the eBay settings card mounts the inventory line", /<EbayInventoryLine companyId=\{companyId\} connectionId=\{connection\.id\}/.test(read("app/settings/EbayIntegrationSection.tsx")));
const lib = read("lib/studioflow/ebayInventory.ts");
for (const fn of ["getEbayListingLinks", "previewEbayListings", "importEbayListings", "changeEbayListingLink", "getEbayOrderStock", "updateEbayOrderStock"]) ok(`the screens call ${fn}`, lib.includes(`"${fn}"`));
ok("Follow in NivaDesk saves the number and courier on the order, then registerTracking (the order tracking card's own path)", /updateOrderFromWeb\(workspace, \{ orderId: order\.id, details: \{ trackingNumber, courier \} \}\);\s*const answer = await registerOrderTrackingFromWeb\(workspace, \{ orderId: order\.id, trackingNumber, courier, language \}\)/.test(read("app/orders/EbayOrderStock.tsx")));
const all = screens.map(read).join("\n") + lib + source;
ok("nothing names an eBay call that writes", !/ReviseInventoryStatus|ReviseFixedPriceItem|bulk_update_price_quantity|bulkUpdatePriceQuantity|shipping_fulfillment|createShippingFulfillment|bulkMigrateListing|CompleteSale|EndItem/.test(all));
ok("a picture is loaded without a referrer, lazily", /referrerPolicy="no-referrer"/.test(read("app/inventory/EbayListingsPanel.tsx")) && /loading="lazy"/.test(read("app/inventory/EbayItemLinks.tsx")));
ok("prices are drawn only when the server sent them for this person", /money && row\.price \?/.test(read("app/inventory/EbayListingsPanel.tsx")) && /money && link\.price \?/.test(read("app/inventory/EbayItemLinks.tsx")));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(failures.map((f) => `FAIL ${f}`).join("\n")); console.log(`\n${failures.length} failed of ${checks}`); process.exit(1); }
console.log(`ebay inventory screens: ${checks} checks passed`);
