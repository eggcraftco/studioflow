// The eBay Preview list and the order page's Refresh (1 Oct 2026).
//
// 1. lib/studioflow/ebaySyncRules.ts, compiled with the tree's own TypeScript and run: a Preview row
//    reaches the screen with its own fields only (never a buyer, an e-mail or an address, whatever the
//    answer carries); an order already in NivaDesk cannot be chosen; a choice of more than 500 is sent
//    in turns and the answers add up; every word Refresh can answer has a sentence.
// 2. Every sentence the two components print has all eleven translations in the feature's own table,
//    with its {placeholders} intact.
// 3. The screens call what the server offers: runEbayImport with `orderIds`, refreshEbayOrder (by the NivaDesk
//    order id on the order page, by the connection + eBay order id on a Preview row already in NivaDesk); the
//    list is mounted at E3's "E2 slot" of the eBay card (after the first import) and under the Preview of the
//    first-import card; the Refresh button is mounted on the order page and draws for eBay orders only.
//
//   node scripts/check-ebay-sync.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ebay-sync-check-"));
const source = read("lib/studioflow/ebaySyncRules.ts");
ok("lib/studioflow/ebaySyncRules.ts exists", Boolean(source));
ok("the rules module imports nothing (so it can run here)", !/^import /m.test(source));
fs.writeFileSync(path.join(tmp, "rules.mjs"), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText);
const R = await import(pathToFileURL(path.join(tmp, "rules.mjs")).href);

// ---- 1. the rules
const answer = { rows: [
  { orderId: "12-34567-89012", orderNumber: "12-34567-89012", createdAt: "2026-09-30T10:00:00.000Z", lastModifiedAt: "2026-09-30T11:00:00.000Z", total: "597.10", currency: "gbp", paymentStatus: "PAID", fulfillmentStatus: "FULFILLED", cancelled: true, marketplace: "ebay_gb", lineItems: 2, alreadyImported: false,
    buyer: { username: "ada_l", fullName: "Ada Lovelace" }, email: "ada@example.com", shippingAddress: "10 Analytical Way", buyerUsername: "ada_l" },
  { orderId: "12-34567-89012", orderNumber: "dup" },
  { orderId: "../etc/passwd", orderNumber: "x" },
  { orderId: "22-11111-22222", orderNumber: "22-11111-22222", paymentStatus: "pending", fulfillmentStatus: "not_started", alreadyImported: true, total: 10, currency: "EUR", lineItems: "3" },
  { orderId: "33-11111-22222", paymentStatus: "fully_refunded", fulfillmentStatus: "in_progress", lineItems: -4 },
  null, "row"
], rowsOmitted: 7 };
const rows = R.previewRowsOf(answer);
expect("one row per order, malformed ids dropped", rows.map((r) => r.orderId), ["12-34567-89012", "22-11111-22222", "33-11111-22222"]);
expect("a row carries its own twelve fields and nothing else", Object.keys(rows[0]).sort(), ["alreadyImported", "cancelled", "createdAt", "currency", "fulfillmentStatus", "lastModifiedAt", "lineItems", "marketplace", "orderId", "orderNumber", "paymentStatus", "total"]);
ok("no buyer, e-mail or address survives into a row", !/ada_l|Lovelace|example\.com|Analytical/.test(JSON.stringify(rows)));
expect("currency/site upper-cased, states lower-cased, numbers as text", [rows[0].currency, rows[0].marketplace, rows[0].paymentStatus, rows[1].total, rows[1].lineItems, rows[2].lineItems, rows[2].orderNumber], ["GBP", "EBAY_GB", "paid", "10", 3, 0, "33-11111-22222"]);
expect("omitted rows are counted", R.previewOmittedOf(answer), 7);
expect("no rows when the answer has none", [R.previewRowsOf(null).length, R.previewRowsOf({ rows: "x" }).length, R.previewOmittedOf({})], [0, 0, 0]);
expect("an order already in NivaDesk cannot be chosen", R.selectableIds(rows), ["12-34567-89012", "33-11111-22222"]);
let chosen = R.toggleChosen([], "22-11111-22222", rows);
expect("ticking an imported order chooses nothing", chosen, []);
chosen = R.toggleChosen(R.toggleChosen(chosen, "33-11111-22222", rows), "12-34567-89012", rows);
expect("the choice is asked in the list's order", R.chosenInOrder(chosen, rows), ["12-34567-89012", "33-11111-22222"]);
expect("unticking", R.toggleChosen(chosen, "33-11111-22222", rows), ["12-34567-89012"]);
expect("a stale id never reaches the Import", R.chosenInOrder(["gone-1", "12-34567-89012"], rows), ["12-34567-89012"]);
const many = Array.from({ length: 1201 }, (_, i) => `X${i}`);
expect("more than 500 go in turns of 500", R.chunkIds(many).map((c) => c.length), [500, 500, 201]);
expect("the server's limit is mirrored", R.EBAY_CHOSEN_PER_CALL, 500);
const merged = R.mergeChosenResults([
  { ok: true, complete: true, chosen: 500, outcome: { created: 498, updated: 1, noop: 1, held: 0, skipped: 0, failed: 0, stale: 0 }, failures: [], notFound: [], skipped: {} },
  { ok: true, complete: false, chosen: 3, outcome: { created: 1, updated: 0, noop: 0, held: 0, skipped: 1, failed: 1, stale: 0 }, failures: ["F1"], notFound: ["N1"], skipped: { S1: "awaiting_payment" } }
]);
expect("answers add up", [merged.chosen, merged.outcome.created, merged.outcome.failed, merged.complete, merged.failures, merged.notFound, merged.skipped], [503, 499, 1, false, ["F1"], ["N1"], { S1: "awaiting_payment" }]);
expect("landed = chosen minus failed, not found and skipped", R.landedIds(["A", "F1", "N1", "S1", "B"], merged), ["A", "B"]);
expect("status words", R.rowStatusWords(rows[0]), ["Cancelled", "Paid", "Shipped"]);
expect("status words of an imported unpaid order", R.rowStatusWords(rows[1]), ["Not paid yet", "Not shipped", "Already in NivaDesk"]);
expect("refunds and partial shipping", R.rowStatusWords(rows[2]), ["Refunded", "Partly shipped"]);
expect("an unknown state has no word (never a raw code)", R.rowStatusWords({ ...rows[2], paymentStatus: "constructor", fulfillmentStatus: "__proto__" }), []);
const refreshWords = { updated: "Order refreshed from eBay.", created: "Order refreshed from eBay.", noop: "Already up to date.", duplicate: "Already up to date.", stale: "eBay has an older copy of this order; nothing was changed.", not_found: "eBay no longer has this order.", invalid: "This order could not be refreshed.", skipped: "This order could not be refreshed.", held: "This order could not be refreshed.", "": "This order could not be refreshed." };
for (const [word, sentence] of Object.entries(refreshWords)) expect(`Refresh answer "${word}"`, R.refreshOutcomeSentence(word), sentence);
expect("placeholders are filled, unknown ones kept", R.fillCounts("{count} of {total} {x}", { count: 2, total: 5 }), "2 of 5 {x}");

// ---- 2. translations
const components = ["app/settings/EbayPreviewList.tsx", "app/orders/EbayOrderRefreshButton.tsx"];
const printed = new Set();
for (const rel of components) {
  const text = read(rel);
  ok(`${rel} exists`, Boolean(text));
  for (const m of text.matchAll(/\bt\("([^"]+)"\)/g)) printed.add(m[1]);
}
for (const word of ["Cancelled", "Paid", "Not paid yet", "Payment failed", "Refunded", "Partly refunded", "Shipped", "Partly shipped", "Not shipped", "Already in NivaDesk"]) printed.add(word);
for (const sentence of new Set(Object.values(refreshWords))) printed.add(sentence);
printed.delete("Could not load."); // the app's own sentence (language.ts), the ebayCallableErrorText fallback
ok(`at least 25 sentences are printed (${printed.size})`, printed.size >= 25);
for (const sentence of printed) {
  const row = R.EBAY_SYNC_TEXT[sentence];
  if (!row) { failures.push(`no translation row for "${sentence}"`); continue; }
  for (const language of R.EBAY_SYNC_LANGUAGES) {
    checks += 1;
    const value = row[language];
    if (!value || !value.trim()) { failures.push(`"${sentence}" has no ${language}`); continue; }
    const wanted = (sentence.match(/\{\w+\}/g) || []).sort().join(",");
    const got = (value.match(/\{\w+\}/g) || []).sort().join(",");
    if (wanted !== got) failures.push(`"${sentence}" in ${language} lost a placeholder: ${got} vs ${wanted}`);
  }
}
expect("the lookup is own-property only", [R.ebaySyncText("constructor", "Deutsch"), R.ebaySyncText("Order", "toString"), R.ebaySyncText("Order", "Deutsch")], ["", "", "Bestellung"]);

// ---- 3. what the screens call, and where they are mounted
const client = read("lib/studioflow/ebaySync.ts");
ok("the chosen import is runEbayImport with orderIds", /"runEbayImport"\)\(\{ companyId, connectionId, orderIds: batch/.test(client));
ok("Refresh is the refreshEbayOrder callable", /"refreshEbayOrder"\)\(\{ companyId, orderId \}\)/.test(client));
ok("Refresh by the connection and the eBay order id", /"refreshEbayOrder"\)\(\{ companyId, connectionId, ebayOrderId \}\)/.test(client));
const list = read("app/settings/EbayPreviewList.tsx");
ok("the list imports only the chosen rows", /importChosenEbayOrders\(companyId, connectionId, picked,/.test(list) && /chosenInOrder\(chosen, rows\)/.test(list));
ok("the list never names a buyer field", !/buyer|username|address|email|phone/i.test(list.replace(/\/\/.*$/gm, "")));
ok("a row already in NivaDesk offers Refresh, by its eBay order id", /row\.alreadyImported \? \(/.test(list) && /refreshEbayOrderByEbayId\(companyId, connectionId, orderId\)/.test(list));
const button = read("app/orders/EbayOrderRefreshButton.tsx");
ok("Refresh draws for eBay orders only", /provider \|\| ""\) !== "ebay"\) return null/.test(button));
const section = read("app/settings/EbayIntegrationSection.tsx");
ok("the list is mounted at E3's E2 slot, after the first import", /E2 slot:[^\n]*\n\s*\{isOwner && importDone && preview \? \(\s*<EbayPreviewList /.test(section));
ok("and under the Preview of the first-import card", /\{preview \? \(\s*<EbayPreviewList /.test(section));
const detail = read("app/orders/OrderDetailContent.tsx");
ok("the order page mounts Refresh beside the eBay buyer strip", /<RestrictedBuyerAddress [^\n]*\/>\n\s*<EbayOrderRefreshButton order=\{order\} language=\{detailLanguage\} \/>/.test(detail));

if (failures.length) { console.log(`❌ ${failures.length} of ${checks} checks failed:\n - ${failures.join("\n - ")}`); process.exit(1); }
console.log(`✅ eBay sync screens: ${checks} checks passed`);
