// A cancelled Etsy order has to actually be cancelled.
//
// After a receipt has been imported, a buyer cancellation reached nothing. Two
// separate reasons, and both had to be fixed or the order stayed live in the
// workshop with its full value still counting as revenue:
//
//   * Under the default import rules, classify() answers "unsupported /
//     cancelled_at_source" and the applier returned before doing anything. That
//     rule is about what to PULL IN, not about whether a studio may be told an
//     order it already holds is dead.
//   * With includeCancelled on, the update went through — but `status` is
//     deliberately not a shop-owned field (otherwise every resync would drag a
//     job back out of production), so the mapper's "Cancelled" was stripped
//     from the patch.
//
// The third thing these pin is what a cancellation must NOT do: move money. The
// sale happened. If the money came back that is a refund, and refunds have
// their own field.
const assert = require("assert");
const etsy = require("../../etsy");
const customerMatch = require("../../etsyCustomerMatch");
const { createEtsySyncFunctions } = require("../../etsySync");
const { integrationOrderUpdate } = require("../../integrationOrderFields");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const DELETE = Symbol("delete");
const SERVER_TS = Symbol("ts");
const INCREMENT = (n) => ({ __increment: n });

function applyPatch(target, patch, nowMs) {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) delete out[key];
    else if (value === SERVER_TS) out[key] = nowMs;
    else if (value && typeof value === "object" && "__increment" in value) {
      out[key] = (Number(out[key]) || 0) + value.__increment;
    } else out[key] = value;
  }
  return out;
}

function makeWorld(nowRef) {
  const docs = new Map();
  const events = [];
  function handle(path) {
    return {
      path,
      get: async () => ({
        exists: docs.has(path),
        data: () => (docs.has(path) ? { ...docs.get(path) } : undefined),
        ref: handle(path)
      }),
      set: async (patch, options = {}) => {
        const base = options.merge && docs.has(path) ? docs.get(path) : {};
        docs.set(path, applyPatch(base, patch, nowRef.value));
      },
      collection: () => ({ add: async (row) => { events.push(row); } })
    };
  }
  const firestore = () => ({
    collection: (name) => ({
      doc: (id) => handle(`${name}/${id}`),
      where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }), get: async () => ({ docs: [] }) })
    })
  });
  return {
    admin: {
      firestore: Object.assign(firestore, {
        FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE, increment: INCREMENT }
      })
    },
    docs, events, handle
  };
}

const RECEIPT = (over = {}) => ({
  receipt_id: 555, status: "paid", is_paid: true, buyer_user_id: 987,
  buyer_email: "relay@etsy.com", name: "Ada Lovelace", country_iso: "GB",
  create_timestamp: 1_756_000_000, update_timestamp: 1_756_000_600,
  grandtotal: { amount: 12500, divisor: 100, currency_code: "GBP" },
  subtotal: { amount: 12000, divisor: 100, currency_code: "GBP" },
  total_shipping_cost: { amount: 500, divisor: 100, currency_code: "GBP" },
  total_tax_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  total_vat_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  discount_amt: { amount: 0, divisor: 100, currency_code: "GBP" },
  transactions: [{
    transaction_id: 1, listing_id: 9, sku: "RING", title: "Ring", quantity: 1,
    price: { amount: 12000, divisor: 100, currency_code: "GBP" }, variations: []
  }],
  ...over
});

function build(nowRef, world) {
  const connect = {
    loadConnection: async (id, companyId) => ({
      ref: world.handle(`etsyConnections/${id}`),
      data: { externalShopId: "222", externalShopName: "Ada Studio", shopCurrency: "GBP", companyId }
    }),
    callEtsy: async () => ({ results: [], count: 0 }),
    writeSyncEvent: async (_ref, event) => { world.events.push(event); }
  };
  return createEtsySyncFunctions({
    admin: world.admin,
    onCall: (_o, handler) => handler,
    HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } },
    etsy, customerMatch, connect,
    requireWorkspaceMember: async () => ({ uid: "u1", companyId: "c1" }),
    requireWorkspaceOwner: async () => ({ uid: "u1", companyId: "c1" }),
    orderDocRef: (id) => world.handle(`siparisler/${id}`),
    integrationOrderUpdate,
    integrationOrderCapacity: async () => ({ allowed: true }),
    holdIntegrationOrder: async () => {},
    upsertIntegrationCustomer: async () => {},
    reconcileLineItems: (items) => items,
    resolveDefaultDeliveryTime: () => 30,
    companySettingsDocRef: () => world.handle("companySettings/c1"),
    customersOfCompany: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    sendPushNotificationToCompany: async () => {},
    now: () => nowRef.value
  });
}

/** Imports a receipt, then delivers a second one, and hands back the order. */
async function importThen(first, second, rules) {
  const nowRef = { value: 1_756_000_000_000 };
  const world = makeWorld(nowRef);
  const fns = build(nowRef, world);
  const apply = fns._internal.applyReceipt;
  const connection = { ref: world.handle("etsyConnections/conn1"), data: { externalShopId: "222", companyId: "c1", importState: "done", importRules: rules } };

  await apply({ companyId: "c1", shopId: "222", connectionRef: connection.ref, connectionData: connection.data, receipt: first });
  const orderPath = [...world.docs.keys()].find((key) => key.startsWith("siparisler/"));
  assert.ok(orderPath, "the first receipt created an order");

  // What the studio did after the import, which must survive.
  world.docs.set(orderPath, { ...world.docs.get(orderPath), designStatus: "In Progress", notes: "bench notes" });

  const result = second
    ? await apply({ companyId: "c1", shopId: "222", connectionRef: connection.ref, connectionData: connection.data, receipt: second })
    : null;
  return { order: world.docs.get(orderPath), result, world, orderPath };
}

const CANCELLED = RECEIPT({ status: "canceled", update_timestamp: 1_756_001_000 });
const DEFAULT_RULES = { includeCancelled: false, includeCompleted: true, includeUnpaid: false };
const CANCEL_RULES = { includeCancelled: true, includeCompleted: true, includeUnpaid: false };

check("a cancellation reaches the order under the DEFAULT import rules", async () => {
  const { order } = await importThen(RECEIPT(), CANCELLED, DEFAULT_RULES);
  assert.strictEqual(order.status, "Cancelled");
});

check("and under includeCancelled, where the patch used to strip it", async () => {
  const { order } = await importThen(RECEIPT(), CANCELLED, CANCEL_RULES);
  assert.strictEqual(order.status, "Cancelled");
});

check("a cancellation does not rewrite a paid order as unpaid", async () => {
  // The sale happened. If the money came back that is a refund, which has its
  // own field — turning paidAmount to zero here would erase a real payment.
  //
  // The receipt is cancelled AND is_paid has gone false, which is the shape
  // that actually moves the number: the mapper writes paidAmount from is_paid,
  // so letting the ordinary money patch run on a cancellation zeroes it. A
  // cancelled-but-still-paid receipt does not exercise this at all, which is
  // how the first version of this check passed while the money patch was still
  // going through.
  const before = await importThen(RECEIPT(), null, DEFAULT_RULES);
  const paidBefore = before.order.paidAmount;
  assert.ok(paidBefore > 0, "the import recorded the payment");

  const cancelledUnpaid = RECEIPT({ status: "canceled", is_paid: false, update_timestamp: 1_756_001_000 });
  const { order } = await importThen(RECEIPT(), cancelledUnpaid, DEFAULT_RULES);
  assert.strictEqual(order.status, "Cancelled");
  assert.strictEqual(order.paidAmount, paidBefore, "the payment must survive the cancellation");
  assert.strictEqual(order.orderValue, before.order.orderValue);
});

check("a cancellation already recorded is not written again on every sweep", async () => {
  // The sweep re-reads the same receipt every fifteen minutes. Without the
  // guard each pass appends another "Order cancelled" line, and the history
  // fills with the same sentence.
  const nowRef = { value: 1_756_000_000_000 };
  const world = makeWorld(nowRef);
  const fns = build(nowRef, world);
  const apply = fns._internal.applyReceipt;
  const connection = {
    ref: world.handle("etsyConnections/conn1"),
    data: { externalShopId: "222", companyId: "c1", importState: "done", importRules: CANCEL_RULES }
  };
  await apply({ companyId: "c1", shopId: "222", connectionRef: connection.ref, connectionData: connection.data, receipt: RECEIPT() });
  const orderPath = [...world.docs.keys()].find((key) => key.startsWith("siparisler/"));

  for (const stamp of [1_756_001_000, 1_756_002_000, 1_756_003_000]) {
    await apply({
      companyId: "c1", shopId: "222", connectionRef: connection.ref, connectionData: connection.data,
      receipt: RECEIPT({ status: "canceled", update_timestamp: stamp })
    });
  }
  const entries = (world.docs.get(orderPath).historyLog || []).filter((row) => row && row.title === "Order cancelled");
  assert.strictEqual(entries.length, 1, `the cancellation was recorded ${entries.length} times`);
});

check("the studio's own work survives the cancellation", async () => {
  const { order } = await importThen(RECEIPT(), CANCELLED, DEFAULT_RULES);
  assert.strictEqual(order.designStatus, "In Progress");
  assert.strictEqual(order.notes, "bench notes");
});

check("the cancellation is written into the history, in the shape the clients read", async () => {
  const { order } = await importThen(RECEIPT(), CANCELLED, DEFAULT_RULES);
  const entry = (order.historyLog || []).find((row) => row && row.title === "Order cancelled");
  assert.ok(entry, "there is a history entry");
  assert.ok(entry.createdAt instanceof Date, "createdAt is a date; createdAtMs renders as no date at all");
  assert.strictEqual(entry.newValue, "Cancelled");
});

check("nothing at Etsy un-cancels an order on the studio's behalf", async () => {
  const { order } = await importThen(CANCELLED, RECEIPT({ update_timestamp: 1_756_002_000 }), CANCEL_RULES);
  assert.notStrictEqual(order.status, "Not Yet");
});

check("a cancelled receipt the workspace never had is still kept out", async () => {
  // The import rule still means what it says for a receipt nobody holds.
  const nowRef = { value: 1_756_000_000_000 };
  const world = makeWorld(nowRef);
  const fns = build(nowRef, world);
  const result = await fns._internal.applyReceipt({
    companyId: "c1", shopId: "222",
    connectionRef: world.handle("etsyConnections/conn1"),
    connectionData: { externalShopId: "222", companyId: "c1", importState: "done", importRules: DEFAULT_RULES },
    receipt: CANCELLED
  });
  assert.strictEqual(result.status, "skipped");
  assert.strictEqual(result.reason, "cancelled_at_source");
  assert.ok(![...world.docs.keys()].some((key) => key.startsWith("siparisler/")), "no order was created");
});

check("the carve-out is only for cancellation, not for every unsupported receipt", async () => {
  // A receipt with no line items is one we genuinely cannot map. Letting it
  // through on the strength of "we hold this order" would write a broken update
  // over a good one.
  const broken = RECEIPT({ transactions: [], update_timestamp: 1_756_001_000 });
  const { result, order } = await importThen(RECEIPT(), broken, DEFAULT_RULES);
  assert.strictEqual(result.status, "skipped");
  assert.notStrictEqual(result.reason, "cancelled_at_source");
  assert.strictEqual(order.designStatus, "In Progress", "the good order was left alone");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ ETSY CANCELLATION GEÇTİ");
})();
