// The Faz 1 list query, against the Firestore emulator rather than a fake: the
// page is ordered newest first, the cursor does not skip orders that share a
// date (paymentDate is a day, so several orders have the identical value), one
// workspace never sees another's orders, and the whole read writes nothing.
//
// Run: firebase emulators:exec --only firestore "node functions/test/qa/sales-query.test.mjs"
import { createRequire } from "module";
const require = createRequire(import.meta.url);

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require("firebase-admin");
const { createSalesFunctions } = require("../../sales");
const { resetSalesFlagCache } = require("../../sales/flags");
const { ENGINE_VERSION } = require("../../finance/engine");

admin.initializeApp({ projectId: "sales-query-test" });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log("PASS ", name); }
  catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 200)); }
};

const CID = "c-sales", OTHER = "c-other";
const DAY = Timestamp.fromMillis(Date.parse("2026-09-10T00:00:00.000Z"));
const OLDER = Timestamp.fromMillis(Date.parse("2026-09-01T00:00:00.000Z"));

const order = (id, companyId, paymentDate, extra = {}) => ({
  companyId, customerName: "Alex Morgan", paymentDate,
  lineItems: [{ id: `${id}-l1`, name: "Seamaster 300", quantity: 1, unitPrice: 1200, lineTotal: 1200 }],
  paidAmount: 1200, remainingAmount: 0, finance: { engineVersion: ENGINE_VERSION, revenue: 1200 }, ...extra
});

// Five orders on the same day plus two older ones: the cursor has to carry the
// document id, or the second page would skip everything sharing that date.
const SAME_DAY = ["s1", "s2", "s3", "s4", "s5"];
const OLDER_IDS = ["s6", "s7"];
for (const id of SAME_DAY) await db.collection("siparisler").doc(id).set(order(id, CID, DAY));
for (const id of OLDER_IDS) await db.collection("siparisler").doc(id).set(order(id, CID, OLDER));
await db.collection("siparisler").doc("x1").set(order("x1", OTHER, DAY));
await db.collection("companies").doc(CID).set({ name: "Sales Co", ownerUid: "u1", members: { u1: { role: "owner" } } });
await db.collection("companySettings").doc(CID).set({ seciliParaBirimi: "£" });
await db.collection("appConfig").doc("sales").set({ enabled: true, workspaces: { [CID]: true } });
resetSalesFlagCache();

const fns = createSalesFunctions({
  admin, HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } }, onCall: (_options, handler) => handler,
  requireWorkspaceMember: async ({ data }) => ({ uid: "u1", companyId: String(data?.companyId || ""), companyData: { ownerUid: "u1" } }),
  memberAccessFor: () => ({ orders: true, financialInfo: true }),
  roleFor: () => "owner",
  engineVersion: ENGINE_VERSION
});
const auth = { uid: "u1", token: {} };

await check("one page comes back newest first, and only this workspace's orders", async () => {
  const page = await fns.listSalesRows({ auth, data: { companyId: CID, limit: 3 } });
  const { strictEqual, ok } = await import("assert");
  strictEqual(page.rows.length, 3);
  ok(page.rows.every((row) => row.orderId !== "x1"), "another workspace's order leaked");
  const dates = page.rows.map((row) => row.orderDateMs);
  ok(dates.every((value, index) => index === 0 || dates[index - 1] >= value), "rows are not newest first");
});

await check("paging reaches every order exactly once, including the ones sharing a date", async () => {
  const { deepStrictEqual } = await import("assert");
  const seen = [];
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const answer = await fns.listSalesRows({ auth, data: { companyId: CID, limit: 2, cursor } });
    seen.push(...answer.rows.map((row) => row.orderId));
    cursor = answer.nextCursor;
    if (!cursor) break;
  }
  deepStrictEqual([...seen].sort(), [...SAME_DAY, ...OLDER_IDS].sort());
  deepStrictEqual(seen.length, new Set(seen).size, "an order came back twice");
});

await check("a filter never skips a match: every WooCommerce order is reached across pages", async () => {
  const { deepStrictEqual } = await import("assert");
  // Two channel orders sit among the manual ones, far enough apart that a page
  // boundary falls between them.
  for (const [id, day] of [["w1", DAY], ["w2", OLDER]]) {
    await db.collection("siparisler").doc(id).set(order(id, CID, day, { commerce: { provider: "woocommerce", externalId: id } }));
  }
  const seen = [];
  let cursor = null;
  for (let page = 0; page < 12; page += 1) {
    const answer = await fns.listSalesRows({ auth, data: { companyId: CID, limit: 1, channel: "woocommerce", cursor } });
    seen.push(...answer.rows.map((row) => row.orderId));
    cursor = answer.nextCursor;
    if (!cursor) break;
  }
  deepStrictEqual([...new Set(seen)].sort(), ["w1", "w2"], "a filtered page dropped a matching order");
  deepStrictEqual(seen.length, new Set(seen).size, "a filtered page returned an order twice");
});

await check("a page that filters everything out still moves the cursor on", async () => {
  const { ok, strictEqual } = await import("assert");
  const answer = await fns.listSalesRows({ auth, data: { companyId: CID, limit: 1, channel: "etsy" } });
  strictEqual(answer.rows.length, 0, "no Etsy order exists");
  ok(answer.hasMore === true && answer.nextCursor, "an empty filtered page must hand back a cursor, or the client stops early");
});

await check("the read writes nothing: no side document, and the orders are untouched", async () => {
  const { strictEqual, deepStrictEqual } = await import("assert");
  const before = await db.collection("siparisler").doc("s1").get();
  const rootsBefore = (await db.listCollections()).map((collection) => collection.id).sort();
  await fns.listSalesRows({ auth, data: { companyId: CID, limit: 50 } });
  await fns.getSalesCapability({ auth, data: { companyId: CID } });
  const after = await db.collection("siparisler").doc("s1").get();
  strictEqual(after.updateTime.isEqual(before.updateTime), true, "the list changed an order");
  for (const collection of ["salesOrders", "salesProducts", "salesSettings"]) {
    const snap = await db.collection("companies").doc(CID).collection(collection).get();
    strictEqual(snap.size, 0, `the read created ${collection}`);
  }
  // Nothing anywhere: no stock, no payment, no notification, no activation or
  // retention record, and no new root collection of any kind.
  const rootsAfter = (await db.listCollections()).map((collection) => collection.id).sort();
  deepStrictEqual(rootsAfter, rootsBefore, "the read created a root collection");
  for (const collection of ["inventoryItems", "inventoryMovements", "notifications", "retention", "retentionMessages", "feedbackState", "deviceTokens"]) {
    strictEqual((await db.collection("companies").doc(CID).collection(collection).get()).size, 0, `the read wrote ${collection}`);
  }
  for (const collection of ["commerceEvents", "commerceHealth", "feedback", "supportTickets", "retentionLog"]) {
    strictEqual((await db.collection(collection).get()).size, 0, `the read wrote ${collection}`);
  }
});

console.log(failures === 0 ? "\n✅ SALES QUERY GEÇTİ" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
