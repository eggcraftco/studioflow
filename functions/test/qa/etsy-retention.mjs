// What happens to Etsy's copy of the buyer when the seller disconnects.
//
// Etsy's API Terms: content must not be stored "longer than is reasonably
// necessary to provide service to your application's users". While a shop is
// connected that is easy — the panel is how a jeweller checks what Etsy says
// about an order. After they disconnect there is no service left to justify
// holding Etsy's mirror of their buyers.
//
// The line this test defends runs in both directions. Deleting too little is a
// terms violation. Deleting too much is worse: the ORDERS are the workshop's
// own record of their own sales, needed for their books years after they stop
// selling on Etsy, and a compliance change that quietly eats a customer's
// business records is not compliance.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "eggcraft-studio";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const fns = require("../../index.js");
const etsy = require("../../etsy.js");
const db = admin.firestore();

const companyId = "qa-workspace";
const SHOP = "88001";
const CONN = "conn-retention";
const auth = { uid: "qa-review-uid", token: { email: "review@nivadesk.app" } };

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

const ORDER_A = "etsy_qa-workspace_88001_5001";
const ORDER_B = "etsy_qa-workspace_88001_5002";

await db.collection(etsy.CONNECTION_COLLECTION).doc(CONN).set({
  companyId, provider: "etsy", externalShopId: SHOP, externalShopName: "Retention Test",
  status: "connected", accessTokenEncrypted: "x", refreshTokenEncrypted: "y"
});
for (const [id, receipt] of [[ORDER_A, "5001"], [ORDER_B, "5002"]]) {
  await db.collection("siparisler").doc(id).set({
    companyId, customerName: "Ada Lovelace", designName: "9ct band",
    orderValue: 125, paidAmount: 125, notes: "Bench: sized to M",
    // Etsy's mirror: the buyer's email, address and message, and Etsy's own
    // view of the receipt.
    etsySource: {
      provider: "etsy", shopId: SHOP, receiptId: receipt, status: "paid",
      buyerEmail: "a1b2@convos.etsy.com", buyerNote: "engrave AL",
      address: "12 Analytical Way, London", fetchedAtMs: Date.now()
    }
  });
  await db.collection(etsy.EXTERNAL_ORDER_COLLECTION).doc(`etsy_${companyId}_${SHOP}_${receipt}`).set({
    companyId, provider: "etsy", externalShopId: SHOP, externalOrderId: receipt, nivadeskOrderId: id
  });
}
await db.collection(etsy.CUSTOMER_LINK_COLLECTION).doc("link-1").set({
  companyId, externalShopId: SHOP, externalBuyerId: "4242", customerId: "cust_ada"
});

const result = await fns.disconnectEtsyShop.run({
  data: { companyId, connectionId: CONN }, auth, acceptsStreaming: false
});

ok("disconnect reports success", result?.ok === true, JSON.stringify(result));
ok("it says how many orders it cleared", Number(result?.etsyDataCleared) === 2, JSON.stringify(result));

const a = (await db.collection("siparisler").doc(ORDER_A).get()).data() || {};
const b = (await db.collection("siparisler").doc(ORDER_B).get()).data() || {};

// Gone: Etsy's copy of the buyer.
ok("the Etsy panel is gone from the first order", a.etsySource === undefined, JSON.stringify(a.etsySource));
ok("and from the second", b.etsySource === undefined, JSON.stringify(b.etsySource));
const links = await db.collection(etsy.CUSTOMER_LINK_COLLECTION).where("externalShopId", "==", SHOP).get();
ok("the Etsy buyer-id links are gone", links.size === 0, `${links.size} kaldi`);

// Kept: the workshop's own record. This half matters more than the other.
ok("the order itself survives", Boolean(a.customerName), JSON.stringify(Object.keys(a)));
ok("the money survives", a.orderValue === 125 && a.paidAmount === 125, `${a.orderValue}/${a.paidAmount}`);
ok("the bench's own note survives", a.notes === "Bench: sized to M", String(a.notes));
const ext = await db.collection(etsy.EXTERNAL_ORDER_COLLECTION).where("externalShopId", "==", SHOP).get();
ok("the id mapping survives, so a reconnect does not import twice", ext.size === 2, `${ext.size}`);

// The tokens, which is what disconnect was always for.
const conn = (await db.collection(etsy.CONNECTION_COLLECTION).doc(CONN).get()).data() || {};
ok("the connection is marked disconnected", conn.status === "disconnected", String(conn.status));
ok("the access token is gone", conn.accessTokenEncrypted === undefined, String(conn.accessTokenEncrypted));
ok("the refresh token is gone", conn.refreshTokenEncrypted === undefined, String(conn.refreshTokenEncrypted));

console.log(fail ? `\n${fail} FAILED` : "\nPASS");
process.exit(fail ? 1 : 0);
