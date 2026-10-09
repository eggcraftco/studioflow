// The eBay screens on the web (1 Oct 2026, package E3).
//
// 1. The rules (lib/studioflow/ebayScreens.ts), compiled with the tree's own TypeScript and run: the
//    card's two times (last connection check, last successful order sync) on the real connection's
//    shape — `lastSuccessAtMs` 0, the order brought in by an import that finished on a Retry — the
//    first-import state, the counts (a dash, never a 0, for a number that could not be read), one
//    attention line per error class with the action that resolves it, the "Open on eBay" link built
//    from the order id alone, and eBay's statuses kept as eBay's (a PARTIAL refund is not a closed sale).
// 2. The Orders list's source filter (lib/studioflow/orderFilters.ts).
// 3. Against a fake Firestore that answers with an order shaped like the real eBay order (cancelled,
//    refunded, a review reason): the list loader carries the source; the order loader's `commerce`
//    stamp, through the block's view and through the block itself rendered to HTML with react-dom,
//    shows eBay's money (commerce.money, one concept per line, payout never invented) only with
//    Financial Info and never the buyer; the card's reads return
//    numbers only (the review queue's names and totals are dropped at the door) and its eBay-orders
//    count is a server-side aggregation over the connector's stamp.
// 4. The gates the screens reuse, read from the source: Orders-off never reaches the order page or
//    the list; the Sync health card's review rows follow Orders and Financial Info.
// 5. Every sentence the new blocks print, in all eleven other languages, through the app's studioT.
// 6. /integrations: eBay is "limited" (available on request), and its three sentences say read-only,
//    preview / import / sync, and name what is NOT part of it, in twelve languages.
//
//   node scripts/check-ebay-screens.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ebay-screens-check-"));

// ---- compiling the tree's modules, with fakes for Firebase
const FAKES = {
  "firebase/firestore": `
    export const recorded = [];
    export const docs = new Map();   // path -> data
    const shape = (q) => ({ path: q.path, filters: (q.constraints || []).filter(c => c.type === "where").map(c => [c.field, c.op, c.value]) });
    export function collection(_db, ...segments) { return { kind: "collection", path: segments.join("/") }; }
    export function doc(_db, ...segments) { return { kind: "doc", path: segments.join("/") }; }
    export function query(base, ...constraints) { return { kind: "query", path: base.path, constraints: [...(base.constraints || []), ...constraints] }; }
    export function where(field, op, value) { return { type: "where", field, op, value }; }
    export function limit(n) { return { type: "limit", n }; }
    export function orderBy(field, dir) { return { type: "orderBy", field, dir }; }
    const snapOf = (p, data) => ({ id: p.split("/").pop(), ref: { path: p }, exists: () => data !== undefined, data: () => data });
    export async function getDocs(q) {
      recorded.push({ op: "getDocs", ...shape(q) });
      const rows = [...docs.entries()].filter(([p]) => p.startsWith(q.path + "/") && p.split("/").length === q.path.split("/").length + 1).map(([p, d]) => snapOf(p, d));
      return { docs: rows, size: rows.length, empty: rows.length === 0, forEach: (f) => rows.forEach(f) };
    }
    export async function getCountFromServer(q) { recorded.push({ op: "count", ...shape(q) }); return { data: () => ({ count: 7 }) }; }
    export async function getDoc(ref) { recorded.push({ op: "getDoc", path: ref.path, filters: [] }); return snapOf(ref.path, docs.get(ref.path)); }
    export function onSnapshot() { return () => {}; }
    export function serverTimestamp() { return { serverTimestamp: true }; }
    export async function setDoc() {} export async function updateDoc() {} export async function deleteDoc() {} export async function addDoc() { return { id: "x" }; }
    export function writeBatch() { return { set() {}, update() {}, delete() {}, async commit() {} }; }
    export async function runTransaction(_db, f) { return f({ get: getDoc, set() {}, update() {} }); }
    export function arrayUnion(...v) { return v; } export function arrayRemove(...v) { return v; } export function deleteField() { return null; } export function increment(n) { return n; }
    export class Timestamp { static fromDate(d) { return d; } static now() { return new Date(); } }
    export function documentId() { return "__name__"; } export function startAfter() { return { type: "startAfter" }; }
  `,
  "firebase/functions": `
    export const called = [];
    export const answers = {};
    export function httpsCallable(_functions, name) { return async (data) => { called.push({ name, data }); return { data: answers[name] ?? { ok: true } }; }; }
  `,
  "@/lib/firebase/client": `export const auth = { currentUser: null }; export const db = {}; export const functions = {}; export const storage = {};`
};
for (const [name, source] of Object.entries(FAKES)) fs.writeFileSync(path.join(tmp, `${name.replace(/[^a-z]/gi, "_")}.mjs`), source);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const compile = (rel) => {
  const out = path.join(tmp, `${path.basename(rel).replace(/\.tsx?$/, "")}.mjs`);
  if (fs.existsSync(out)) return out;
  const tsx = rel.endsWith(".tsx");
  let js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020,
    ...(tsx ? { jsx: ts.JsxEmit.React, jsxFactory: "__h", jsxFragmentFactory: "__F" } : {}) } }).outputText;
  if (tsx) js = `import __React from ${JSON.stringify(reactUrl)};\nconst __h = __React.createElement; const __F = __React.Fragment;\n${js}`;
  js = js.replace(/from "([^"]+)"/g, (whole, spec) => {
    if (FAKES[spec]) return `from "./${spec.replace(/[^a-z]/gi, "_")}.mjs"`;
    if (spec.startsWith("@/lib/studioflow/")) return `from "./${spec.slice("@/lib/studioflow/".length)}.mjs"`;
    if (spec.startsWith("./")) return `from "${spec}.mjs"`;
    return whole;
  });
  fs.writeFileSync(out, js);
  for (const m of js.matchAll(/from "\.\/([A-Za-z]+)\.mjs"/g)) {
    if (fs.existsSync(path.join(tmp, `${m[1]}.mjs`))) continue;
    const dir = path.dirname(rel);
    const candidates = [`lib/studioflow/${m[1]}.ts`, `${dir}/${m[1]}.ts`, `${dir}/${m[1]}.tsx`];
    const dep = candidates.find((c) => fs.existsSync(path.join(root, c)));
    if (dep) compile(dep);
  }
  return out;
};
const load = async (rel) => import(pathToFileURL(compile(rel)).href);
const S = await load("lib/studioflow/ebayScreens.ts");
const O = await load("lib/studioflow/orderFilters.ts");

// ---- 1. the rules
const T0 = Date.parse("2026-10-01T10:13:13Z");   // connect (the row's connectedAtMs and lastVerifiedAtMs)
const T1 = Date.parse("2026-10-01T10:20:46Z");   // import #1: refused by the PII scan, paused
const T2 = Date.parse("2026-10-01T10:32:21Z");   // the Retry that brought the order in: import_finished
const live = {
  status: "connected", specStatus: "connected_read_only", lastErrorCode: "", lastErrorAtMs: 0,
  importState: "done", importCounters: { created: 0, updated: 0, held: 0, skipped: 0, failed: 0 },
  importCursor: { complete: true, failedCount: 0 }, connectedAtMs: T0, lastSyncAtMs: 0, lastSuccessAtMs: 0, lastVerifiedAtMs: T0,
  quota: { today: 44, share: 500 }, reauthorizeByMs: 0,
  recentEvents: [{ atMs: T2, type: "import_finished" }, { atMs: T2 - 1000, type: "order_imported" }, { atMs: T1, type: "import_started" }, { atMs: T0, type: "connected" }]
};
expect("live: last successful order sync is the import that finished on the Retry", S.ebayLastOrderSyncAtMs(live), T2);
expect("live: last connection check is the connect", S.ebayLastConnectionCheckAtMs(live), T0);
expect("live: the two lines are different times (the '—' vs '19 minutes ago' of one screen)", S.ebayLastOrderSyncAtMs(live) !== S.ebayLastConnectionCheckAtMs(live), true);
expect("a completed Sync now pass wins when later", S.ebayLastOrderSyncAtMs({ ...live, lastSuccessAtMs: T2 + 5000 }), T2 + 5000);
expect("importFinishedAtMs, once the view carries it", S.ebayLastOrderSyncAtMs({ ...live, recentEvents: [], importFinishedAtMs: T2 }), T2);
expect("a preview or a failed import is not an order sync", S.ebayLastOrderSyncAtMs({ ...live, recentEvents: [{ atMs: T1, type: "import_preview" }, { atMs: T1, type: "sync_partial" }, { atMs: T1, type: "order_import_failed" }] }), 0);
expect("nothing yet -> 0 (the card says Not yet)", S.ebayLastOrderSyncAtMs({ ...live, recentEvents: [] }), 0);
expect("Check now later than the connect", S.ebayLastConnectionCheckAtMs({ ...live, lastVerifiedAtMs: T2 }), T2);
expect("first import done", S.ebayFirstImport(live).state, "done");
expect("first import running while this tab imports", S.ebayFirstImport({ ...live, importState: "running" }, true).state, "running");
expect("first import paused when it waits for the owner", S.ebayFirstImport({ ...live, importState: "running" }, false).state, "paused");
expect("first import not started", S.ebayFirstImport({ ...live, importState: "none" }).state, "none");

const counts = (over = {}) => S.ebayCounts({ connection: live, health: { pendingRetries: 0, deadLetters: 0 }, importedCount: 1, reviewCount: 1, heldCount: 0, ...over });
expect("counts on the live shape", (({ imported, pending, parked, needsReview, failed }) => ({ imported, pending, parked, needsReview, failed }))(counts()), { imported: 1, pending: 0, parked: 0, needsReview: 1, failed: 0 });
expect("unreadable numbers are null (a dash), not 0", (({ imported, pending, parked, needsReview, failed }) => ({ imported, pending, parked, needsReview, failed }))(counts({ health: null, importedCount: null, reviewCount: undefined, heldCount: null })), { imported: null, pending: null, parked: null, needsReview: null, failed: null });
expect("failed = the import's failed ids + dead letters", counts({ connection: { ...live, importCursor: { complete: false, failedCount: 2 } }, health: { pendingRetries: 1, deadLetters: 3 } }).failed, 5);

const attention = (over = {}, countOver = {}) => {
  const connection = { ...live, ...over };
  return S.ebayAttention({ connection, counts: S.ebayCounts({ connection, health: { pendingRetries: 0, deadLetters: 0 }, importedCount: 1, reviewCount: 0, heldCount: 0, ...countOver }) }).map((a) => `${a.kind}:${a.action}${a.count ? `:${a.count}` : ""}${a.date ? `:${a.date}` : ""}`);
};
expect("healthy, nothing parked or in review -> no attention", attention(), []);
expect("live: the review item -> review link", attention({}, { reviewCount: 1 }), ["review:review:1"]);
expect("token expired -> Reconnect", attention({ status: "reconnect_required", specStatus: "reauthorization_required", lastErrorCode: "credentials_rejected" }), ["reconnect:reconnect"]);
expect("permission missing -> Reconnect", attention({ specStatus: "reauthorization_required", lastErrorCode: "permission_missing" }), ["reconnect:reconnect"]);
expect("authorisation close to expiry -> Reconnect with its date", attention({ lastErrorCode: "refresh_token_expiring", reauthorizeByMs: 1836000000000 }), ["reconnect:reconnect:1836000000000"]);
expect("environment mismatch -> Disconnect", attention({ specStatus: "suspended", lastErrorCode: "environment_mismatch" }), ["environment:disconnect"]);
expect("rate limited -> wait", attention({ specStatus: "degraded", lastErrorCode: "rate_limited" }), ["quota:wait"]);
expect("call budget used up -> wait", attention({ quota: { today: 500, share: 500 } }), ["quota:wait"]);
expect("import failures -> Retry", attention({ importState: "running", lastErrorCode: "partial_pass", importCursor: { complete: false, failedCount: 1 } }), ["failed:retry:1"]);
expect("dead letters -> Sync health", attention({}, { health: { pendingRetries: 0, deadLetters: 2 } }), ["events:health:2"]);
expect("eBay unreachable -> wait", attention({ specStatus: "degraded", lastErrorCode: "provider_unavailable" }), ["transient:wait"]);
expect("plan full -> parked", attention({}, { heldCount: 3 }), ["plan_full:parked:3"]);
const sentences = S.ebayAttention({ connection: { ...live, lastErrorCode: "refresh_token_expiring", reauthorizeByMs: 1 }, counts: counts({ heldCount: 1 }) }).map((a) => a.text);
expect("no attention sentence carries a code", sentences.every((t) => !/_[a-z]/.test(t)), true);

// The link: from the order id alone; a stored URL lends at most its host, and only an eBay one.
expect("link from the id", S.ebayOrderLink("12-34567-89012", ""), "https://www.ebay.co.uk/sh/ord/details?orderid=12-34567-89012");
expect("link keeps the seller's eBay site", S.ebayOrderLink("12-34567-89012", "https://www.ebay.de/mesh/ord/details?orderid=12-34567-89012"), "https://www.ebay.de/sh/ord/details?orderid=12-34567-89012");
expect("link: .com", S.ebayOrderLink("12-34567-89012", "https://www.ebay.com/x"), "https://www.ebay.com/sh/ord/details?orderid=12-34567-89012");
expect("link ignores a foreign host", S.ebayOrderLink("12-34567-89012", "https://evil.example/sh/ord"), "https://www.ebay.co.uk/sh/ord/details?orderid=12-34567-89012");
expect("link ignores a look-alike host", S.ebayOrderLink("12-34567-89012", "https://www.ebay.co.uk.evil.example/"), "https://www.ebay.co.uk/sh/ord/details?orderid=12-34567-89012");
expect("link ignores the stored path and query", S.ebayOrderLink("1234", "https://www.ebay.co.uk/sh/ord/details?orderid=1234&next=https://evil.example"), "https://www.ebay.co.uk/sh/ord/details?orderid=1234");
for (const bad of ["", "javascript:alert(1)", "12 34", "../x", "12/34", "a\"b", "<x>", "-1234", "x".repeat(80), "12-34?x=1"]) {
  expect(`no link for ${JSON.stringify(bad).slice(0, 30)}`, S.ebayOrderLink(bad, "https://www.ebay.co.uk/"), "");
}
const block = (stamp, canSeeFinance = true) => S.ebayOrderBlockView(stamp, { canSeeFinance });
// commerce.money as package E1 states it for the real order after its fix (E1 appendix A): gross 597.10,
// received 451.67, refunds completed 451.67, net 0, balance 0, eBay-collected tax 37.10, payout unknown.
const MONEY_E1 = { version: 1, currency: "GBP", seller_payout: null, seller_payout_known: false, other_currency: [], gross_sale: "597.10", tax_total: "37.10",
  platform_collected_tax: "37.10", seller_tax: null, payments_received: "451.67", payments_pending: "0.00", refunds_completed: "451.67", refunds_pending: "0.00",
  refunded: "451.67", net_collected: "0.00", balance_due: "0.00" };
const stampOf = (over = {}) => ({ provider: "ebay", connectionId: "c", externalId: "12-34567-89012", orderNumber: "12-34567-89012", externalAdminUrl: "https://www.ebay.co.uk/mesh/ord/details?orderid=12-34567-89012",
  platformStatus: "cancelled", paymentStatus: "refunded", fulfillmentStatus: "fulfilled", currency: "GBP", grandTotal: "597.10", lastAppliedAtMs: T2, reviewRequired: true, reviewReasons: ["tax_responsibility_unknown"], connectionDisplayName: "seller-test", money: MONEY_E1, ...over });
expect("live order: closed, eBay's words", (({ platform, payment, fulfilment, cancelled, refunded, closed, reviewReasons }) => ({ platform, payment, fulfilment, cancelled, refunded, closed, reviewReasons }))(S.ebaySourceStatus(stampOf())),
  { platform: "Cancelled on eBay", payment: "Refunded", fulfilment: "Shipped on eBay", cancelled: true, refunded: true, closed: true, reviewReasons: ["Who collects the tax is unknown"] });
expect("a partial refund is NOT a closed sale", S.ebaySourceStatus(stampOf({ platformStatus: "paid", paymentStatus: "partially_refunded" })).closed, false);
expect("a partial refund still shows as a refund", S.ebaySourceStatus(stampOf({ platformStatus: "paid", paymentStatus: "partially_refunded" })).refunded, true);
expect("fully refunded without a cancellation is closed", S.ebaySourceStatus(stampOf({ platformStatus: "fully_refunded", paymentStatus: "refunded" })).closed, true);
expect("a paid order is open", S.ebaySourceStatus(stampOf({ platformStatus: "paid", paymentStatus: "paid", fulfillmentStatus: "unfulfilled" })).closed, false);
expect("a prototype key is a word, never a function", S.ebaySourceStatus(stampOf({ platformStatus: "constructor", paymentStatus: "__proto__", reviewReasons: ["toString"] })).platform, "constructor");
expect("view: live order, owner", (({ connection, number, link, note, payout }) => ({ connection, number, link, note, payout }))(block(stampOf())),
  { connection: "seller-test", number: "12-34567-89012", link: "https://www.ebay.co.uk/sh/ord/details?orderid=12-34567-89012", note: "closed", payout: "unknown" });
const lines = (view) => view.money.map((l) => `${l.key}=${l.amount} ${l.currency}${l.info ? " (info)" : ""}`);
expect("view: eBay's money one concept per line, as stated (pending lines at 0 left out)", lines(block(stampOf())),
  ["gross_sale=597.10 GBP", "payments_received=451.67 GBP", "refunds_completed=451.67 GBP", "net_collected=0.00 GBP", "balance_due=0.00 GBP", "platform_collected_tax=37.10 GBP"]);
expect("view: no Financial Info -> no money, no payout line", (({ money, payout, otherCurrency }) => ({ money, payout, otherCurrency }))(block(stampOf(), false)), { money: [], payout: "", otherCurrency: [] });
expect("view: the payout is never invented (known: false, even with every other figure)", lines(block(stampOf())).some((l) => l.startsWith("seller_payout")), false);
expect("view: a payout the server knows is shown as stated", lines(block(stampOf({ money: { ...MONEY_E1, seller_payout_known: true, seller_payout: "500.00" } }))).includes("seller_payout=500.00 GBP"), true);
expect("view: a figure the server did not state is left out, not shown as 0", lines(block(stampOf({ money: { version: 1, currency: "GBP", gross_sale: "120.00" } }))), ["gross_sale=120.00 GBP"]);
expect("view: pending money shows when there is some", lines(block(stampOf({ money: { ...MONEY_E1, payments_pending: "20.00", refunds_pending: "5.00" } }))).filter((l) => /pending/.test(l)), ["payments_pending=20.00 GBP", "refunds_pending=5.00 GBP"]);
expect("view: eBay's fee and its basis are information only", lines(block(stampOf({ money: { ...MONEY_E1, marketplace_fee: "41.80", fee_basis: "597.10" } }))).filter((l) => /fee/.test(l)), ["marketplace_fee=41.80 GBP (info)", "fee_basis=597.10 GBP (info)"]);
expect("view: other-currency money is listed as stated", block(stampOf({ money: { ...MONEY_E1, other_currency: [{ kind: "refund", currency: "USD", amount: "12.00", status: "REFUNDED" }, { currency: "x", amount: "1" }] } })).otherCurrency, [{ amount: "12.00", currency: "USD" }]);
expect("view: a non-decimal figure is not money", lines(block(stampOf({ money: { version: 1, currency: "GBP", gross_sale: "597.10", balance_due: "lots", net_collected: { $: 1 } } }))), ["gross_sale=597.10 GBP"]);
expect("view: an order applied before E1 shows the platform total as before", lines(block(stampOf({ money: null }))), ["gross_sale=597.10 GBP"]);
expect("view: not an eBay order -> nothing", block(stampOf({ provider: "square" })), null);
expect("view: no stamp -> nothing", block(null), null);

// ---- 2. the source filter
const ord = (over) => ({ customerName: "x", designName: "y", status: "Not Yet", paymentDate: null, dueDate: null, remainingAmount: 0, customFields: {}, ...over });
expect("source: the engine's stamp", O.orderSourceOf(ord({ commerceProvider: "ebay" })), "ebay");
expect("source: an older order's Source field", O.orderSourceOf(ord({ customFields: { Source: "eBay" } })), "ebay");
expect("source: WooCommerce spelled two ways", [O.orderSourceOf(ord({ customFields: { Source: "WooCommerce" } })), O.orderSourceOf(ord({ commerceProvider: "woo" }))], ["woocommerce", "woocommerce"]);
expect("source: the public order form", O.orderSourceOf(ord({ orderSource: "inbound" })), "inbound");
expect("source: anything else was added by hand", [O.orderSourceOf(ord({})), O.orderSourceOf(ord({ customFields: { Source: "constructor" } }))], ["manual", "manual"]);
const list = [ord({ commerceProvider: "ebay", status: "Cancelled" }), ord({ customFields: { Source: "Shopify" } }), ord({}), ord({})];
expect("filter: eBay only", O.filterAndSortOrders(list, "", "all", "recent", "ebay").length, 1);
expect("filter: all sources", O.filterAndSortOrders(list, "", "all", "recent", "all").length, 4);
expect("filter: the default argument keeps the old behaviour", O.filterAndSortOrders(list, "", "all", "recent").length, 4);
expect("menu offers only the sources present", O.orderSourcesPresent(list), ["ebay", "shopify", "manual"]);
expect("count per source", [O.sourceFilterCount(list, "ebay"), O.sourceFilterCount(list, "manual"), O.sourceFilterCount(list, "all")], [1, 2, 4]);
expect("the cancelled eBay order is not active work", O.filterAndSortOrders(list, "", "active", "recent", "ebay").length, 0);
expect("menu ids are unique", new Set(O.ORDER_SOURCE_FILTERS.map((f) => f.id)).size, O.ORDER_SOURCE_FILTERS.length);

// ---- 3. a fake Firestore with the real order's shape
const FS = await import(pathToFileURL(path.join(tmp, "firebase_firestore.mjs")).href);
const FN = await import(pathToFileURL(path.join(tmp, "firebase_functions.mjs")).href);
const F = await load("lib/studioflow/firestore.ts");
const WS = "ws-ebay-check";
const BUYER = "buyer_user_77";
const EBAY_ORDER_ID = `ebay_${WS}_12-34567-89012`;
FS.docs.set(`siparisler/${EBAY_ORDER_ID}`, {
  companyId: WS, customerName: BUYER, shippingName: BUYER, shippingCountry: "US", emailAddress: "", whatsappNumber: "", shippingPhone: "", shippingStreetAddress: "", shippingCity: "", shippingPostalCode: "",
  status: "Cancelled", designStatus: "Not Yet", orderValue: 597.1, paidAmount: 145.43, refundedAmount: 451.67, remainingAmount: 0, deliveryCost: 10, taxAmount: 74.2, taxAmountKnown: true, taxResponsibility: "unknown",
  paymentDate: new Date(T1), deliveryTime: 45, designName: "Watch, Strap", lineItems: [{ id: "1", name: "Watch", quantity: 1, unitPrice: 550, lineTotal: 550 }, { id: "2", name: "Shipping & other", quantity: 1, unitPrice: 47.1, lineTotal: 47.1 }],
  customFields: { Source: "eBay", "eBay Order ID": "12-34567-89012", "eBay Buyer": BUYER, "eBay Total": "597.10", "eBay Currency": "GBP" },
  commerce: { schemaVersion: 1, provider: "ebay", connectionId: `${WS}__seller`, externalId: "12-34567-89012", orderNumber: "12-34567-89012", externalAdminUrl: "https://www.ebay.co.uk/mesh/ord/details?orderid=12-34567-89012",
    platformStatus: "cancelled", paymentStatus: "refunded", fulfillmentStatus: "fulfilled", currency: "GBP", grandTotal: "597.10", lastAppliedAtMs: T2, reviewRequired: true, reviewReasons: ["tax_responsibility_unknown"],
    providerDisplayName: "eBay", connectionDisplayName: "seller-test", lastEventOrigin: "import", externalUpdatedAt: "2026-10-01T09:00:00.000Z", money: MONEY_E1 }
});
FS.docs.set("siparisler/manual-1", { companyId: WS, customerName: "Walk-in", status: "In Progress", orderValue: 100, paidAmount: 0, remainingAmount: 100, customFields: {} });
const FULL = { orders: true, dashboard: true, schedule: true, customers: true, messages: true, notes: true, quickReply: true, settings: true, clientFiles: true, financialInfo: true, exportData: true, bankFeed: false, assignedProjectsOnly: false, manageProjectAssignments: false };
const SHAPES = {
  owner: { role: "owner", memberAccess: { ...FULL, bankFeed: true } },
  member: { role: "member", memberAccess: FULL },
  financeOff: { role: "member", memberAccess: { ...FULL, financialInfo: false } },
  ordersOff: { role: "member", memberAccess: { ...FULL, orders: false } }
};
const ctx = (shape) => ({ id: WS, name: "Check", ownerUid: "owner-uid", roleLabel: shape.role, ...shape });
const rows = await F.loadRecentOrders(WS, ctx(SHAPES.owner), "owner-uid");
expect("list loader: the eBay order carries its source", rows.filter((r) => r.commerceProvider === "ebay").map((r) => r.id), [EBAY_ORDER_ID]);
expect("list loader: a hand-made order has none", rows.filter((r) => r.id === "manual-1").map((r) => [r.commerceProvider, r.orderSource]), [["", ""]]);
expect("list + filter: eBay picks the eBay order", O.filterAndSortOrders(rows, "", "all", "recent", "ebay").map((r) => r.id), [EBAY_ORDER_ID]);
expect("list: the refunded order is not an unpaid balance", O.filterAndSortOrders(rows, "", "unpaidBalance", "recent", "ebay").length, 0);

const detail = await F.loadOrderDetail(WS, EBAY_ORDER_ID, false, ctx(SHAPES.owner));
expect("detail loader: the stamp is the eBay one", [detail.commerce?.provider, detail.commerce?.grandTotal, detail.commerce?.reviewReasons], ["ebay", "597.10", ["tax_responsibility_unknown"]]);
expect("detail loader: carries commerce.money as stored", detail.commerce?.money?.net_collected, "0.00");
const { renderToStaticMarkup } = require("react-dom/server");
const { EbayOrderBlock } = await load("app/orders/EbayOrderBlock.tsx");
const React = require("react");
const canSeeFinanceOf = (shape) => F.workspaceAccessAllows(shape.memberAccess, "financialInfo");
const html = {};
for (const [name, shape] of Object.entries(SHAPES)) {
  if (!F.workspaceAccessAllows(shape.memberAccess, "orders")) continue;   // the order page turns Orders-off away (checked below)
  html[name] = renderToStaticMarkup(React.createElement(EbayOrderBlock, { stamp: detail.commerce, canSeeFinance: canSeeFinanceOf(shape), language: "English" }));
}
expect("block: rendered for every shape that can open the order", Object.keys(html), ["owner", "member", "financeOff"]);
expect("block: owner sees eBay's money, worded by Intl", ["£597.10", "£451.67", "£37.10", "Balance due", "Net collected", "Tax collected by eBay"].every((m) => html.owner.includes(m)), true);
expect("block: owner sees the payout as not known, never a figure", html.owner.includes("Not known: eBay") && !/Seller payout<\/dt><dd>£/.test(html.owner), true);
expect("block: Financial Info off -> no money anywhere in the block", ["597", "451", "145.43", "37.10", "£", "GBP", "Balance due", "Seller payout"].some((m) => html.financeOff.includes(m)), false);
expect("block: Financial Info off is marked", html.financeOff.includes('data-ebay-money="hidden"'), true);
expect("block: no shape sees the buyer", Object.values(html).some((h) => h.includes(BUYER)), false);
expect("block: the link opens the order on eBay, safely", /href="https:\/\/www\.ebay\.co\.uk\/sh\/ord\/details\?orderid=12-34567-89012" target="_blank" rel="noopener noreferrer"/.test(html.owner), true);
expect("block: a closed sale says so", html.owner.includes('data-ebay-order-block="closed"') && html.owner.includes("It is not live production work"), true);
expect("block: eBay's statuses are eBay's", ["Cancelled on eBay", "eBay payment", "Refunded", "Shipped on eBay", "Who collects the tax is unknown"].every((w) => html.owner.includes(w)), true);
const unescape = (h) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const tr = unescape(renderToStaticMarkup(React.createElement(EbayOrderBlock, { stamp: detail.commerce, canSeeFinance: true, language: "Türkçe" })));
expect("block in Turkish", tr.includes("eBay'de iptal edildi") && tr.includes("eBay'de aç"), true);
const open = renderToStaticMarkup(React.createElement(EbayOrderBlock, { stamp: { ...detail.commerce, platformStatus: "paid", paymentStatus: "partially_refunded" }, canSeeFinance: true, language: "English" }));
expect("block: a partial refund is not shown as closed", open.includes('data-ebay-order-block="open"') && !open.includes("It is not live production work"), true);
expect("block: nothing for a Square order", renderToStaticMarkup(React.createElement(EbayOrderBlock, { stamp: { ...detail.commerce, provider: "square" }, canSeeFinance: true, language: "English" })), "");

// The card's reads: numbers only.
const E = await load("lib/studioflow/ebay.ts");
FN.answers.listCommerceReviewQueue = { ok: true, items: [{ provider: "ebay", orderId: EBAY_ORDER_ID, customerName: BUYER, grandTotal: "597.10", currency: "GBP", reasons: ["tax_responsibility_unknown"] }, { provider: "square", orderId: "s1", customerName: "Somebody", grandTotal: "10.00" }] };
FN.answers.listHeldIntegrationOrders = { ok: true, held: [{ provider: "ebay", externalId: "a" }, { provider: "shopify", externalId: "b" }] };
FN.answers.getCommerceHealth = { ok: true, connections: [{ provider: "ebay", connectionId: "c1", health: { orders: { state: "fresh", pendingRetries: 1, deadLetters: 0 } } }] };
expect("card: review queue -> a number (names and totals dropped)", await E.countEbayReviewItems(WS), 1);
expect("card: parked -> eBay's only", await E.countEbayHeldOrders(WS), 1);
expect("card: health -> this connection's orders row", (await E.getEbayHealthOrders(WS, "c1"))?.pendingRetries, 1);
FS.recorded.length = 0;
expect("card: eBay orders counted by the database", await E.countEbayOrders(WS), 7);
expect("card: the count is an aggregation over the connector's stamp", FS.recorded, [{ op: "count", path: "siparisler", filters: [["companyId", "==", WS], ["commerce.provider", "==", "ebay"]] }]);

// ---- 4. the gates, from the source
const card = read("app/settings/EbayIntegrationSection.tsx");
const health = read("app/settings/CommerceSyncHealthCard.tsx");
// (A marketplace row's own currency code — "EBAY_GB · GBP" in the sites list — is not an amount.)
expect("card: never prints a buyer or an amount", /customerName|grandTotal|paidAmount|orderValue|remainingAmount|refundedAmount/.test(card), false);
expect("card: reads the counts through the number-only helpers", ["countEbayReviewItems(companyId)", "countEbayHeldOrders(companyId)", "countEbayOrders(companyId)", "getEbayHealthOrders(companyId, live.id)"].every((c) => card.includes(c)), true);
expect("card: two separate times", card.includes('t("Last connection check")') && card.includes('t("Last successful order sync")') && !card.includes('t("Last successful sync")'), true);
expect("card: Preview, Sync now, Retry, Reconnect, Disconnect", ['t("Preview")', 't("Sync now")', 't("Retry")', 't("Reconnect eBay")', 't("Disconnect eBay")'].every((c) => card.includes(c)), true);
expect("card: the slot E2's selectable Preview list mounts in", card.includes("E2 slot"), true);
expect("card: Orders-off gets the counts as numbers, not links into a list it cannot open", card.includes('canOpenOrders ? "/orders?source=ebay" : undefined') && card.includes('canOpenOrders ? "/orders" : undefined') && /const canOpenOrders = workspaceAccessAllows\(workspace\.memberAccess, "orders"\)/.test(card), true);
expect("card: the two times carry the clock and a relative time worded by Intl in the person's language", card.includes("new Intl.RelativeTimeFormat(locale") && card.includes("{relative} · {clock}"), true);
expect("health: a bare callable code word is never the message on screen", health.includes('setError(message && !/^[a-z]+(-[a-z]+)*$/.test(message) ? message : t("Could not load."))'), true);
expect("card: faults red, things to look at amber", card.includes('item.kind === "plan_full" || item.kind === "review" || item.kind === "quota" || item.kind === "transient"'), true);
expect("card: Sync health keeps its lists but not a second freshness answer", card.includes('provider="ebay" freshness={false}'), true);
expect("health: review row name follows Orders", health.includes("canSeeOrders && row.customerName"), true);
expect("health: review row total follows Orders + Financial Info", health.includes("canSeeMoney && row.grandTotal") && /const canSeeMoney = canSeeOrders && workspaceAccessAllows\(workspace\.memberAccess, "financialInfo"\)/.test(health), true);
expect("health: the eBay review reason has words", health.includes('tax_responsibility_unknown: "Who collects the tax is unknown"'), true);
const detailPage = read("app/orders/[orderId]/page.tsx");
const listPage = read("app/orders/page.tsx");
expect("Orders-off: the order page turns the member away", /if \(!workspaceAccessAllows\(loadedWorkspace\.memberAccess, "orders"\)\) \{[\s\S]{0,120}setOrder\(null\)/.test(detailPage), true);
expect("Orders-off: the list turns the member away", /if \(!workspaceAccessAllows\(loadedWorkspace\.memberAccess, "orders"\)\) \{\s*router\.replace/.test(listPage), true);
const screen = read("app/orders/OrderDetailContent.tsx");
expect("order page: the block gets Financial Info", screen.includes("<EbayOrderBlock stamp={order.commerce} canSeeFinance={canSeeFinance}"), true);
expect("order page: the channel strip leaves eBay to the block", screen.includes('if (stamp?.provider === "ebay" || (!stamp && source === "eBay")) return null;'), true);
expect("order page: the channel strip's total follows Financial Info", screen.includes("<ChannelSourceStrip order={order} showMoney={canSeeFinance} />") && screen.includes("{total && showMoney ?"), true);
expect("orders list: ?source=ebay is honoured, and only a known word", listPage.includes('searchParams.get("source")') && listPage.includes("ORDER_SOURCE_FILTERS.some(item => item.id === source)"), true);
expect("orders list: the filter bar gets the source", (listPage.match(/onSourceChange=\{setOrderSource\}/g) || []).length, 2);
const bar = read("components/OrderQuickFilterBar.tsx");
expect("filter bar: the quick-filter counts are within the chosen source (the top count is the list's length)", bar.includes("quickFilterCount(inSource, id)") && bar.includes("const selectedCount = countFor(filter);"), true);
expect("filter bar: the source counts are within the chosen filter", bar.includes("sourceFilterCount(inFilter, item.id)"), true);
expect("filter bar: no source section without a choice to make", bar.includes('onSourceChange && (sourcesPresent.length > 1 || source !== "all")'), true);

// ---- 5. every sentence, in all eleven languages
for (const rel of ["lib/studioflow/macTranslations.ts", "lib/studioflow/settingsContentTranslations.ts", "lib/studioflow/shippingTranslations.ts", "lib/studioflow/trackingEmailTranslations.ts", "lib/studioflow/screenGapTranslations.ts"]) compile(rel);
const { studioT } = await load("lib/studioflow/language.ts");
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const BRANDS = new Set(["eBay", "Shopify", "WooCommerce", "Etsy", "Square", "Amazon"]);
// The same word in that language (checked by hand), not a missing translation.
const SAME_WORD = { "Workspace": ["Deutsch"], "Source": ["Français"], "Website": ["Deutsch"], "Production": ["Français"] };
// Words the card printed before this package; their gaps are older than it and not on its screens' new lines.
const OLDER = new Set(["Sandbox", "Smart", "Order Filters", "Order filters", "Open order filters", "Close order filters", "Dead letters"]);
const said = new Set();
for (const rel of ["app/settings/EbayIntegrationSection.tsx", "app/orders/EbayOrderBlock.tsx", "components/OrderQuickFilterBar.tsx"]) {
  for (const m of read(rel).matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) said.add(m[1].replace(/\\"/g, "\""));
}
for (const m of card.matchAll(/tile\([^,]+, "([^"]+)"/g)) said.add(m[1]);
for (const s of S.EBAY_SCREEN_SENTENCES) said.add(s);
for (const m of read("lib/studioflow/ebayScreens.ts").matchAll(/text: "([^"]+)"/g)) said.add(m[1]);
for (const m of read("lib/studioflow/ebayScreens.ts").matchAll(/\? "([A-Z][^"]+)" : "([A-Z][^"]+)"/g)) { said.add(m[1]); said.add(m[2]); }
for (const item of O.ORDER_SOURCE_FILTERS) said.add(item.label);
said.add("The connection's freshness is on the eBay card above.");
const untranslated = [];
for (const s of said) {
  if (BRANDS.has(s) || OLDER.has(s)) continue;
  const absent = LANGUAGES.filter((language) => studioT(s, language) === s && !(SAME_WORD[s] || []).includes(language));
  if (absent.length) untranslated.push(`${s.slice(0, 80)} — ${absent.length === 11 ? "no entry" : `missing ${absent.join(", ")}`}`);
}
checks += said.size;
if (untranslated.length) failures.push(`${untranslated.length} of ${said.size} sentences are not in all twelve languages:\n    ${untranslated.join("\n    ")}`);
expect("Arabic renders through the same table", studioT("Last successful order sync", "العربية (Arabic)"), "آخر مزامنة ناجحة للطلبات");

// ---- 6. /integrations
const dir = read("app/integrations/IntegrationsDirectory.tsx");
const row = dir.split("\n").find((l) => l.includes('name: "eBay"')) || "";
expect("/integrations: eBay is available on request (limited), not coming soon", /state: "limited"/.test(row) && !/comingSoon/.test(row), true);
expect("/integrations: eBay's three sentences come from the translation table", ['summary: { key: "integrations.summary.ebay" }', 'detail: { key: "integrations.detail.ebay" }', 'note: "integrations.note.ebay"'].every((k) => row.includes(k)), true);
const P = await load("lib/publicSite/translations.ts");
const EN = P.PUBLIC_SITE_EN;
expect("/integrations EN: read-only, preview / import / sync", /read-only/i.test(EN["integrations.detail.ebay"]) && /preview/.test(EN["integrations.detail.ebay"]) && /import/.test(EN["integrations.detail.ebay"]) && /sync/.test(EN["integrations.detail.ebay"]), true);
expect("/integrations EN: names what is not part of it", ["Listings", "prices", "stock", "fees and payouts", "messages", "tracking uploads"].every((w) => EN["integrations.detail.ebay"].includes(w)), true);
expect("/integrations EN: no test-environment wording left", /test environment|sandbox/i.test(`${EN["integrations.note.ebay"]} ${EN["integrations.detail.ebay"]} ${EN["integrations.summary.ebay"]}`), false);
expect("/integrations EN: nothing is written to eBay", /nothing is written to eBay/.test(EN["integrations.note.ebay"]), true);
for (const language of LANGUAGES) {
  const table = P.PUBLIC_SITE_TRANSLATIONS[language] || {};
  for (const key of ["integrations.summary.ebay", "integrations.detail.ebay", "integrations.note.ebay"]) {
    expect(`/integrations ${language} ${key}: translated`, Boolean(table[key]) && table[key] !== EN[key], true);
  }
  expect(`/integrations ${language}: the old test-environment note is gone`, /test|Test|тест|テスト|测试|الاختبار|टेस्ट|Testumgebung|essai|prueba|testes/.test(table["integrations.note.ebay"] || ""), false);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-ebay-screens: ${failures.length} failure(s) of ${checks} checks`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-ebay-screens: all ${checks} checks pass — the card's two times and server-only counts, one fix per error class, the source filter, the order's eBay block behind Financial Info and without the buyer (rendered), ${said.size} sentences in twelve languages, /integrations read-only in twelve languages`);
