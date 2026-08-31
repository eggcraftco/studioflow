// The other three shop channels' mappers, written to a real Firestore.
//
// Etsy got this treatment first because it was the new one. It is also the one
// with no live sellers. Shopify, WooCommerce and the generic inbound webhook
// have real merchants pointing at them right now, and they run through mappers
// nobody has ever pushed an incomplete order through.
//
// The question each test asks is the one a fake Firestore cannot be asked:
// does the document this mapper produces actually store? Real Firestore
// rejects an undefined field value, and we do not set
// ignoreUndefinedProperties. A shop that omits a field our mapper reads
// without a fallback is a 500 at the webhook and a lost order — and shops omit
// fields constantly. A manual order has no payment method. A digital product
// has no shipping address. A Zapier payload has whatever the person building
// the Zap remembered.

const assert = require("assert");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("firebase-admin");
const index = require("../../index.js");

const {
  mapShopifyOrderToSiparis,
  mapWooCommerceOrderToSiparis,
  mapGenericInboundOrderToSiparis,
  integrationOrderUpdate
} = index._e2e;

const db = admin.firestore();
const CID = "e2e_shops";

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// Write it and read it back. Firestore is the judge, not us.
async function store(id, mapped) {
  const ref = db.collection("siparisler").doc(id);
  await ref.set(mapped, { merge: true });
  return (await ref.get()).data();
}

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
    problems.push(`literal "${value}" at ${path.replace(/\.$/, "")}`);
  } else if (typeof value === "number" && !Number.isFinite(value)) {
    problems.push(`non-finite number at ${path.replace(/\.$/, "")}`);
  }
  return problems;
}

const LINE_FIELDS = ["id", "name", "quantity", "unitPrice", "lineTotal"];
function assertLineItemSchema(order, label) {
  if (!Array.isArray(order.lineItems)) return;
  for (const item of order.lineItems) {
    for (const field of LINE_FIELDS) {
      assert.ok(field in item, `${label}: line item missing ${field} — ${JSON.stringify(item)}`);
    }
    assert.ok(!("total" in item), `${label}: line item carries the old "total" — ${JSON.stringify(item)}`);
  }
}

// ---------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------

const SHOPIFY_FULL = {
  id: 5550001, name: "#1042", order_number: 1042,
  financial_status: "paid", fulfillment_status: null,
  currency: "GBP", total_price: "125.00", subtotal_price: "110.00",
  total_tax: "10.00", total_discounts: "0.00",
  created_at: "2026-08-20T10:00:00Z", updated_at: "2026-08-20T10:10:00Z",
  email: "ada@lovelace.example", phone: "+447700900123",
  note: "Engrave AL inside the band.",
  customer: { id: 991, first_name: "Ada", last_name: "Lovelace", email: "ada@lovelace.example" },
  billing_address: { name: "Ada Lovelace", address1: "12 Analytical Way", city: "London", zip: "EC1A 1BB", country: "United Kingdom", phone: "+447700900123" },
  shipping_address: { name: "Ada Lovelace", address1: "12 Analytical Way", city: "London", zip: "EC1A 1BB", country: "United Kingdom" },
  shipping_lines: [{ title: "Standard", price: "5.00" }],
  line_items: [
    { id: 1, title: "9ct Gold Band", sku: "RING-9CT", quantity: 1, price: "90.00" },
    { id: 2, title: "Gift Box", sku: "BOX", quantity: 2, price: "10.00" }
  ]
};

// Everything Shopify is allowed to leave out: a manual order for a digital
// product, no customer record, no addresses, no shipping, no note.
const SHOPIFY_SPARSE = { id: 5550002, total_price: "40.00", line_items: [{ id: 9, title: "Repair", quantity: 1, price: "40.00" }] };

test("Shopify: a complete order stores in real Firestore", async () => {
  const mapped = mapShopifyOrderToSiparis(SHOPIFY_FULL, CID, true);
  const stored = await store("e2e_shopify_full", mapped);
  assert.ok(stored, "nothing stored");
  assert.strictEqual(stored.companyId, CID);
  assertLineItemSchema(stored, "shopify");
  const problems = structuralProblems(stored);
  assert.strictEqual(problems.length, 0, problems.join("; "));
});

test("Shopify: an order with no customer, address or shipping still stores", async () => {
  const mapped = mapShopifyOrderToSiparis(SHOPIFY_SPARSE, CID, true);
  const stored = await store("e2e_shopify_sparse", mapped);
  assert.ok(stored, "nothing stored");
  assertLineItemSchema(stored, "shopify sparse");
  const problems = structuralProblems(stored);
  assert.strictEqual(problems.length, 0, problems.join("; "));
  assert.notStrictEqual(stored.customerName, "undefined");
});

test("Shopify: a resync keeps the studio's notes", async () => {
  const id = "e2e_shopify_notes";
  await store(id, mapShopifyOrderToSiparis(SHOPIFY_FULL, CID, true));
  await db.collection("siparisler").doc(id).set({ notes: "Bench: sized to M", materialCost: 40 }, { merge: true });
  const existing = (await db.collection("siparisler").doc(id).get()).data();
  const patch = integrationOrderUpdate(mapShopifyOrderToSiparis(SHOPIFY_FULL, CID, false), false, existing);
  await db.collection("siparisler").doc(id).set(patch, { merge: true });
  const after = (await db.collection("siparisler").doc(id).get()).data();
  assert.ok(after.notes.includes("Bench: sized to M"), `studio note lost: ${after.notes}`);
  assert.strictEqual(after.materialCost, 40, "studio cost lost");
});

// ---------------------------------------------------------------------------
// WooCommerce
// ---------------------------------------------------------------------------

const WOO_FULL = {
  id: 8801, number: "8801", status: "processing", currency: "GBP",
  total: "125.00", total_tax: "10.00", shipping_total: "5.00", discount_total: "0.00",
  date_created: "2026-08-20T10:00:00", date_paid: "2026-08-20T10:01:00",
  payment_method: "ppcp", payment_method_title: "PayPal",
  customer_note: "Engrave AL inside the band.",
  billing: { first_name: "Ada", last_name: "Lovelace", email: "ada@lovelace.example", phone: "+447700900123", address_1: "12 Analytical Way", city: "London", postcode: "EC1A 1BB", country: "GB" },
  shipping: { first_name: "Ada", last_name: "Lovelace", address_1: "12 Analytical Way", city: "London", postcode: "EC1A 1BB", country: "GB" },
  line_items: [
    { id: 1, name: "9ct Gold Band", sku: "RING-9CT", quantity: 1, total: "90.00", total_tax: "0.00" },
    { id: 2, name: "Gift Box", sku: "BOX", quantity: 2, total: "20.00", total_tax: "0.00" }
  ],
  meta_data: []
};

// Woo sends an empty shipping object for "ship to billing", and a manually
// created order has no payment method and no meta at all.
const WOO_SPARSE = { id: 8802, total: "40.00", line_items: [{ id: 9, name: "Repair", quantity: 1, total: "40.00" }], shipping: {}, billing: {} };

test("WooCommerce: a complete order stores in real Firestore", async () => {
  const mapped = mapWooCommerceOrderToSiparis(WOO_FULL, CID, true, 21);
  const stored = await store("e2e_woo_full", mapped);
  assert.ok(stored, "nothing stored");
  assertLineItemSchema(stored, "woo");
  const problems = structuralProblems(stored);
  assert.strictEqual(problems.length, 0, problems.join("; "));
});

test("WooCommerce: an order with empty billing and shipping still stores", async () => {
  const mapped = mapWooCommerceOrderToSiparis(WOO_SPARSE, CID, true, 21);
  const stored = await store("e2e_woo_sparse", mapped);
  assert.ok(stored, "nothing stored");
  assertLineItemSchema(stored, "woo sparse");
  const problems = structuralProblems(stored);
  assert.strictEqual(problems.length, 0, problems.join("; "));
});

test("WooCommerce: the workspace's default delivery time is used, not a stray zero", async () => {
  // The bug this guards was real: wooMetaValue returns "" for a missing meta and
  // wooNumber("") is 0, a finite number, so the fallback never fired and every
  // incoming order looked due immediately.
  const stored = await store("e2e_woo_delivery", mapWooCommerceOrderToSiparis(WOO_SPARSE, CID, true, 21));
  assert.strictEqual(Number(stored.deliveryTime), 21, `delivery time was ${stored.deliveryTime}`);
});

// ---------------------------------------------------------------------------
// Generic inbound (Zapier, the merchant's own site)
// ---------------------------------------------------------------------------

const INBOUND_FULL = {
  id: "ZAP-1", status: "paid", currency: "GBP", total: "125.00",
  customerName: "Ada Lovelace", email: "ada@lovelace.example", phone: "+447700900123",
  note: "Engrave AL inside the band.",
  billing: { name: "Ada Lovelace", address1: "12 Analytical Way", city: "London", postcode: "EC1A 1BB", country: "GB" },
  items: [{ name: "9ct Gold Band", quantity: 1, price: "90.00" }, { name: "Gift Box", quantity: 2, price: "10.00" }]
};

// The payload somebody built in a hurry.
const INBOUND_SPARSE = { id: "ZAP-2", total: "40.00" };

test("Inbound: a complete payload stores in real Firestore", async () => {
  const stored = await store("e2e_inbound_full", mapGenericInboundOrderToSiparis(INBOUND_FULL, CID, true));
  assert.ok(stored, "nothing stored");
  assertLineItemSchema(stored, "inbound");
  const problems = structuralProblems(stored);
  assert.strictEqual(problems.length, 0, problems.join("; "));
});

test("Inbound: a payload with nothing but an id and a total still stores", async () => {
  const stored = await store("e2e_inbound_sparse", mapGenericInboundOrderToSiparis(INBOUND_SPARSE, CID, true));
  assert.ok(stored, "nothing stored");
  const problems = structuralProblems(stored);
  assert.strictEqual(problems.length, 0, problems.join("; "));
  assert.notStrictEqual(stored.customerName, "undefined");
});

// ---------------------------------------------------------------------------

(async () => {
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
  await db.recursiveDelete(db.collection("siparisler")).catch(() => {});
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
  await db.recursiveDelete(db.collection("siparisler")).catch(() => {});
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
