// The Etsy import, run against a real Firestore.
//
// Everything else in test/qa runs against a hand-built fake, and a fake is only
// as honest as whoever wrote it. Ours is silent about the three things most
// likely to break in production:
//
//   1. Real Firestore REJECTS an undefined field value. We never set
//      ignoreUndefinedProperties, so any field the normaliser leaves undefined
//      is a 500 in production and a pass in the unit suite. Etsy omits optional
//      fields freely — a receipt with no buyer name, no address and no shipping
//      line is ordinary, not exotic.
//   2. A merge with a dotted key writes a literal field whose NAME contains a
//      dot, instead of descending into a map. That exact bug ate read receipts
//      for months.
//   3. The fake's where() returns [] every time, so customer matching against
//      real existing customers has never once run. The code that decides
//      whether an Etsy buyer is somebody the studio already knows is, today,
//      completely untested.
//
// Run: firebase emulators:start --only firestore   (then)
//      node test/e2e/etsy-emulator.test.js

const assert = require("assert");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("firebase-admin");
const etsy = require("../../etsy");
const index = require("../../index.js");

const { applyReceipt } = index._e2e;
const db = admin.firestore();

const CID = "e2e_company";
const SHOP = "77001";

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A full receipt, shaped the way Etsy's v3 API actually returns one.
const FULL_RECEIPT = (over = {}) => ({
  receipt_id: 900100,
  status: "paid",
  is_paid: true,
  is_shipped: false,
  buyer_user_id: 4242,
  buyer_email: "a1b2c3@convos.etsy.com",
  name: "Ada Lovelace",
  first_line: "12 Analytical Way",
  second_line: "Flat 4",
  city: "London",
  state: "",
  zip: "EC1A 1BB",
  country_iso: "GB",
  message_from_buyer: "Please engrave 'AL' inside the band.",
  create_timestamp: 1_756_000_000,
  updated_timestamp: 1_756_000_600,
  update_timestamp: 1_756_000_600,
  grandtotal: { amount: 12500, divisor: 100, currency_code: "GBP" },
  subtotal: { amount: 11000, divisor: 100, currency_code: "GBP" },
  total_shipping_cost: { amount: 500, divisor: 100, currency_code: "GBP" },
  total_tax_cost: { amount: 1000, divisor: 100, currency_code: "GBP" },
  total_vat_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  discount_amt: { amount: 0, divisor: 100, currency_code: "GBP" },
  transactions: [
    {
      transaction_id: 5001, listing_id: 991, sku: "RING-9CT", title: "9ct Gold Band",
      quantity: 1, price: { amount: 9000, divisor: 100, currency_code: "GBP" },
      variations: [{ formatted_name: "Size", formatted_value: "M" }]
    },
    {
      transaction_id: 5002, listing_id: 992, sku: "BOX", title: "Gift Box",
      quantity: 2, price: { amount: 1000, divisor: 100, currency_code: "GBP" },
      variations: []
    }
  ],
  ...over
});

// The same receipt with every optional field Etsy is allowed to omit actually
// omitted. This is the one the fake Firestore cannot judge.
const SPARSE_RECEIPT = (over = {}) => ({
  receipt_id: 900200,
  status: "paid",
  create_timestamp: 1_756_100_000,
  update_timestamp: 1_756_100_000,
  grandtotal: { amount: 4000, divisor: 100, currency_code: "GBP" },
  transactions: [
    { transaction_id: 6001, title: "Repair", quantity: 1, price: { amount: 4000, divisor: 100, currency_code: "GBP" } }
  ],
  ...over
});

function connectionFixture(over = {}) {
  return {
    companyId: CID,
    provider: "etsy",
    externalShopId: SHOP,
    externalShopName: "E2E Test Shop",
    shopCurrency: "GBP",
    status: "connected",
    // The state every automatic path actually runs in: the owner has already
    // been through the preview and approved an import. Before that, applyReceipt
    // writes nothing at all — see "nothing lands before the owner has approved".
    importState: "done",
    ...over
  };
}

async function wipe() {
  const collections = [
    "siparisler", "musteriler", "companies", "companySettings",
    etsy.CONNECTION_COLLECTION, etsy.EXTERNAL_ORDER_COLLECTION, etsy.CUSTOMER_LINK_COLLECTION,
    "heldIntegrationOrders"
  ];
  for (const name of collections) {
    // Subcollections (syncLog) go with the parent via recursiveDelete.
    await db.recursiveDelete(db.collection(name)).catch(() => {});
  }
}

async function seed({ connection = {}, customers = [], plan = "pro" } = {}) {
  await wipe();
  await db.collection("companies").doc(CID).set({
    name: "E2E Studio", plan, ownerUid: "e2e_owner", subscriptionStatus: "active"
  });
  await db.collection("companySettings").doc(CID).set({ defaultDeliveryTime: 21 });
  const connRef = db.collection(etsy.CONNECTION_COLLECTION).doc("e2e_conn");
  await connRef.set(connectionFixture(connection));
  for (const customer of customers) {
    await db.collection("musteriler").doc(customer.id).set({ companyId: CID, ...customer.data });
  }
  const snap = await connRef.get();
  return { connRef, connData: snap.data() };
}

async function apply(receipt, opts = {}) {
  const { connRef, connData } = opts.seeded || (await seed(opts.seed || {}));
  return {
    outcome: await applyReceipt({
      companyId: CID,
      connectionRef: connRef,
      connectionData: connData,
      receipt,
      defaultDeliveryTime: 21,
      ...opts.args
    }),
    connRef,
    connData
  };
}

// Walk a stored document looking for the two shapes real Firestore permits but
// we never intend to write: a field name containing a dot, and a value that
// came out of the normaliser as the string "undefined" or "NaN".
function structuralProblems(value, path = "") {
  const problems = [];
  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !value.toDate) {
    for (const [key, child] of Object.entries(value)) {
      if (key.includes(".")) problems.push(`dotted field name at ${path}${key}`);
      problems.push(...structuralProblems(child, `${path}${key}.`));
    }
  } else if (Array.isArray(value)) {
    value.forEach((child, i) => problems.push(...structuralProblems(child, `${path}${i}.`)));
  } else if (value === "undefined" || value === "NaN") {
    problems.push(`literal "${value}" stored at ${path.replace(/\.$/, "")}`);
  } else if (typeof value === "number" && !Number.isFinite(value)) {
    problems.push(`non-finite number at ${path.replace(/\.$/, "")}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("a complete receipt lands as an order real Firestore accepts", async () => {
  const { outcome } = await apply(FULL_RECEIPT());
  assert.strictEqual(outcome.status, "created");

  const orderId = etsy.nivadeskOrderIdFor(CID, SHOP, "900100");
  assert.strictEqual(outcome.orderId, orderId);

  const snap = await db.collection("siparisler").doc(orderId).get();
  assert.ok(snap.exists, "order document was not written");
  const order = snap.data();

  assert.strictEqual(order.companyId, CID);
  assert.strictEqual(order.customerName, "Ada Lovelace");

  // The shared line-item schema, spelled the way every client reads it.
  assert.ok(Array.isArray(order.lineItems), "lineItems missing");
  // Two products plus the reconciled remainder: the transactions sum to 110 and
  // the buyer paid 125, so 15 of shipping and tax gets its own line rather than
  // vanishing out of the invoice.
  assert.strictEqual(order.lineItems.length, 3, JSON.stringify(order.lineItems));
  const remainder = order.lineItems.find((i) => i.name === "Shipping & other");
  assert.ok(remainder, "the unexplained 15 did not get a line");
  assert.strictEqual(remainder.lineTotal, 15);
  for (const item of order.lineItems) {
    for (const field of ["id", "name", "quantity", "unitPrice", "lineTotal"]) {
      assert.ok(field in item, `line item missing ${field}: ${JSON.stringify(item)}`);
    }
    assert.ok(!("total" in item), `line item still carries the old "total" field: ${JSON.stringify(item)}`);
  }
  const band = order.lineItems.find((i) => String(i.name).includes("Gold Band"));
  assert.strictEqual(band.unitPrice, 90);
  assert.strictEqual(band.lineTotal, 90);
  const box = order.lineItems.find((i) => String(i.name).includes("Gift Box"));
  assert.strictEqual(box.quantity, 2);
  assert.strictEqual(box.lineTotal, 20);

  // The source panel, and the marker every client uses to say "this came from
  // a shop, do not let the studio edit the money".
  assert.ok(order.etsySource, "etsySource panel missing");
  assert.strictEqual(String(order.etsySource.receiptId), "900100");
  assert.strictEqual(order.customFields?.Source, "Etsy");
});

test("a receipt with every optional field omitted does not blow up", async () => {
  // This is the test the fake Firestore cannot run. If the normaliser leaves a
  // single field undefined, the emulator throws here and production would 500
  // on a perfectly ordinary Etsy receipt.
  const { outcome } = await apply(SPARSE_RECEIPT());
  assert.strictEqual(outcome.status, "created", `sparse receipt did not import: ${JSON.stringify(outcome)}`);

  const snap = await db.collection("siparisler").doc(outcome.orderId).get();
  const order = snap.data();
  assert.ok(order, "sparse receipt wrote no order");
  // A missing buyer name must become something a human can read in a list, not
  // an empty cell and not the string "undefined".
  assert.notStrictEqual(order.customerName, "undefined");
  assert.notStrictEqual(order.customerName, undefined);
});

test("nothing lands with a dotted field name or a stringified undefined", async () => {
  await apply(FULL_RECEIPT());
  const { outcome } = await apply(SPARSE_RECEIPT(), { seeded: await (async () => {
    const ref = db.collection(etsy.CONNECTION_COLLECTION).doc("e2e_conn");
    return { connRef: ref, connData: (await ref.get()).data() };
  })() });

  for (const collection of ["siparisler", "musteriler", etsy.EXTERNAL_ORDER_COLLECTION]) {
    const docs = await db.collection(collection).get();
    for (const doc of docs.docs) {
      const problems = structuralProblems(doc.data());
      assert.strictEqual(problems.length, 0, `${collection}/${doc.id}: ${problems.join("; ")}`);
    }
  }
  assert.ok(outcome.orderId);
});

test("the same receipt twice is one order and one customer", async () => {
  const seeded = await seed();
  const first = await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT(), defaultDeliveryTime: 21
  });
  const second = await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT(), defaultDeliveryTime: 21
  });
  assert.strictEqual(first.status, "created");
  assert.strictEqual(second.status, "updated");
  assert.strictEqual(first.orderId, second.orderId);

  const orders = await db.collection("siparisler").get();
  assert.strictEqual(orders.size, 1, `expected one order, found ${orders.size}`);
  const customers = await db.collection("musteriler").get();
  assert.ok(customers.size <= 1, `expected at most one customer, found ${customers.size}`);
});

test("a re-sync does not touch the studio's own work", async () => {
  const seeded = await seed();
  const first = await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT(), defaultDeliveryTime: 21
  });

  // The studio does its half of the job.
  const orderRef = db.collection("siparisler").doc(first.orderId);
  await orderRef.set({
    notes: "Wax model cast Tuesday.",
    isDispatched: "Yes",
    materialCost: 42.5,
    assignedToUid: "bench_1",
    priority: "High"
  }, { merge: true });

  // Etsy sends the same order again, one penny cheaper and now shipped.
  const updated = FULL_RECEIPT({
    update_timestamp: 1_756_000_900,
    is_shipped: true,
    grandtotal: { amount: 12400, divisor: 100, currency_code: "GBP" }
  });
  await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: updated, defaultDeliveryTime: 21
  });

  const after = (await orderRef.get()).data();
  // Nothing the bench wrote is gone. The buyer's words are still there too —
  // kept alongside, because losing either one is a real cost to somebody.
  assert.ok(after.notes.includes("Wax model cast Tuesday."), `the shop overwrote the studio's notes: ${after.notes}`);
  assert.ok(after.notes.includes("engrave 'AL'"), `the buyer's note was lost: ${after.notes}`);
  assert.strictEqual(after.materialCost, 42.5, "the shop overwrote the studio's costs");
  assert.strictEqual(after.assignedToUid, "bench_1", "the shop reassigned the bench");
  assert.strictEqual(after.priority, "High", "the shop overwrote priority");

  // And it settles. A note that keeps appending its own copy on every webhook
  // is the same bug wearing the opposite coat: after the buyer's words are in
  // the field, further syncs of the same words must add nothing.
  for (const stamp of [1_756_001_200, 1_756_001_500]) {
    await applyReceipt({
      companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
      receipt: FULL_RECEIPT({ update_timestamp: stamp, is_shipped: true }), defaultDeliveryTime: 21
    });
  }
  const settled = (await orderRef.get()).data();
  assert.strictEqual(settled.notes, after.notes, `the note grew on resync:\n${settled.notes}`);
  const occurrences = settled.notes.split("engrave 'AL'").length - 1;
  assert.strictEqual(occurrences, 1, `the buyer note is stored ${occurrences} times`);
});

test("an older webhook arriving late does not roll the order backwards", async () => {
  const seeded = await seed();
  await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT({ update_timestamp: 1_756_009_000 }), defaultDeliveryTime: 21
  });
  const late = await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT({ update_timestamp: 1_756_000_100 }), defaultDeliveryTime: 21
  });
  assert.strictEqual(late.status, "stale", `late delivery was applied: ${JSON.stringify(late)}`);
});

test("an Etsy buyer who is already a customer does not become a second one", async () => {
  // The path the fake Firestore has never executed: a real where() query over
  // real customer documents.
  const seeded = await seed({
    customers: [{
      id: "cust_ada",
      data: { name: "Ada Lovelace", email: "ada@lovelace.example", phone: "+44 7700 900123", companyId: CID }
    }]
  });
  await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT(), defaultDeliveryTime: 21
  });

  const customers = await db.collection("musteriler").get();
  const names = customers.docs.map((d) => String(d.data().name || ""));
  // Either it matched Ada, or it sent the pair to review and created nobody.
  // What it must not do is quietly create a second Ada Lovelace.
  const adas = names.filter((n) => n.toLowerCase().includes("ada lovelace"));
  assert.ok(adas.length <= 1, `duplicate customer created: ${JSON.stringify(names)}`);
});

test("the syncLog records the import, in a real subcollection", async () => {
  const seeded = await seed();
  const result = await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT(), defaultDeliveryTime: 21
  });
  const log = await seeded.connRef.collection("syncLog").get();
  assert.ok(log.size >= 1, "no sync event recorded");
  const types = log.docs.map((d) => d.data().type);
  assert.ok(types.includes("order_imported"), `syncLog types: ${JSON.stringify(types)}`);
  assert.ok(result.orderId);
});

test("a cancelled receipt is marked cancelled, not silently paid", async () => {
  const seeded = await seed();
  const result = await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT({ receipt_id: 900300, status: "canceled" }), defaultDeliveryTime: 21
  });
  assert.strictEqual(result.status, "created");
  const order = (await db.collection("siparisler").doc(result.orderId).get()).data();
  assert.strictEqual(order.status, "Cancelled", `cancelled receipt stored status ${order.status}`);
});

// The panel says "Choose what to import" and hides Sync now until the owner has
// been through the preview. The server did not agree: a shop connected but
// never imported has no importRules, so the rules gate was skipped whole and
// the 15-minute sweep and every webhook wrote orders behind the seller's back.
test("nothing lands before the owner has approved a first import", async () => {
  const seeded = await seed({ connection: { importState: "none" } });
  const result = await applyReceipt({
    companyId: CID, connectionRef: seeded.connRef, connectionData: seeded.connData,
    receipt: FULL_RECEIPT({ receipt_id: 900400 }), defaultDeliveryTime: 21
  });
  assert.strictEqual(result.status, "skipped", `expected skipped, got ${result.status}`);
  assert.strictEqual(result.reason, "awaiting_first_import");
  const orders = await db.collection("siparisler").where("companyId", "==", CID).get();
  assert.strictEqual(orders.size, 0, `${orders.size} orders were written without approval`);
});

// ---------------------------------------------------------------------------

(async () => {
  // Fail loudly rather than quietly writing to production.
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FIRESTORE_EMULATOR_HOST is not set — refusing to run against live Firestore.");
    process.exit(1);
  }
  try {
    await db.collection("__ping").doc("x").get();
  } catch (error) {
    console.error(`Firestore emulator not reachable at ${process.env.FIRESTORE_EMULATOR_HOST}: ${error.message}`);
    process.exit(1);
  }

  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL  ${name}`);
      console.log(`      ${error && error.message ? error.message : error}`);
    }
  }
  await wipe().catch(() => {});
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
