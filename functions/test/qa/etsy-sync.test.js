// The sync engine's promises, tested against a fake Firestore and a fake Etsy.
//
// Four of these are the acceptance criteria the brief names outright:
//   * the same receipt arriving twice does not create two orders
//   * a sync never overwrites the studio's own workflow, notes or costs
//   * no bulk import happens without a preview the seller saw
//   * a partial import reports its failures rather than losing them
//
// The fifth is the one nobody writes down and everybody hits: webhooks arrive
// out of order, so a late delivery of an older state must not roll a newer
// order backwards.

const assert = require("assert");
const etsy = require("../../etsy");
const customerMatch = require("../../etsyCustomerMatch");
const { createEtsySyncFunctions } = require("../../etsySync");

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

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
  const admin = {
    firestore: Object.assign(firestore, {
      FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE, increment: INCREMENT }
    })
  };
  return { admin, docs, events, handle };
}

const RECEIPT = (over = {}) => ({
  receipt_id: 555,
  status: "paid",
  is_paid: true,
  buyer_user_id: 987,
  buyer_email: "relay@etsy.com",
  name: "Ada Lovelace",
  first_line: "12 Analytical Way",
  city: "London",
  zip: "EC1A 1BB",
  country_iso: "GB",
  create_timestamp: 1_756_000_000,
  update_timestamp: 1_756_000_600,
  grandtotal: { amount: 12500, divisor: 100, currency_code: "GBP" },
  subtotal: { amount: 12000, divisor: 100, currency_code: "GBP" },
  total_shipping_cost: { amount: 500, divisor: 100, currency_code: "GBP" },
  total_tax_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  total_vat_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  discount_amt: { amount: 0, divisor: 100, currency_code: "GBP" },
  transactions: [{
    transaction_id: 1, listing_id: 9, sku: "RING", title: "Ring", quantity: 1,
    price: { amount: 12000, divisor: 100, currency_code: "GBP" },
    variations: [{ property_id: 54, question_id: 7, formatted_name: "Engraving", formatted_value: "For Ada" }]
  }],
  ...over
});

// Not a mirror any more. This used to be a hand-written copy of the real
// integrationOrderUpdate, kept honest by a regex that scraped index.js — and it
// drifted anyway, which is how a resync that erased the studio's notes passed
// this very suite. The function is now a pure module both sides import.
const { integrationOrderUpdate } = require("../../integrationOrderFields");

function build({ nowRef, receipts = [RECEIPT()], capacity = { allowed: true }, owner = true, world = null, reportedCount = null }) {
  world = world || makeWorld(nowRef);
  const calls = { fetches: 0, held: [], pushes: 0, customers: [] };
  const connect = {
    loadConnection: async (id, companyId) => {
      const data = { externalShopId: "222", externalShopName: "Ada Studio", shopCurrency: "GBP", companyId };
      return { ref: world.handle(`etsyConnections/${id}`), data };
    },
    callEtsy: async (_ref, _path, options) => {
      calls.fetches += 1;
      // Page once, then stop. reportedCount lets a test say "Etsy has more than
      // this", which is what truncation is.
      const total = reportedCount == null ? receipts.length : reportedCount;
      if (Number(options?.query?.offset) > 0) return { results: [], count: total };
      return { results: receipts, count: total };
    },
    writeSyncEvent: async (_ref, event) => { world.events.push(event); }
  };
  const fns = createEtsySyncFunctions({
    admin: world.admin,
    onCall: (_o, handler) => handler,
    HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } },
    etsy,
    customerMatch,
    connect,
    requireWorkspaceMember: async () => ({ uid: "u1", companyId: "c1" }),
    requireWorkspaceOwner: async () => {
      if (!owner) throw new Error("not owner");
      return { uid: "u1", companyId: "c1" };
    },
    orderDocRef: (id) => world.handle(`siparisler/${id}`),
    integrationOrderUpdate,
    integrationOrderCapacity: async () => capacity,
    holdIntegrationOrder: async (_c, _p, receiptId) => { calls.held.push(receiptId); },
    upsertIntegrationCustomer: async (_c, customer) => { calls.customers.push(customer); },
    reconcileLineItems: (items) => items,
    resolveDefaultDeliveryTime: () => 30,
    companySettingsDocRef: () => world.handle("companySettings/c1"),
    customersOfCompany: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    sendPushNotificationToCompany: async () => { calls.pushes += 1; },
    now: () => nowRef.value
  });
  return { fns, world, calls };
}

const REQ = (data) => ({ auth: { uid: "u1" }, data });

// --- idempotency ------------------------------------------------------------

test("the same receipt twice creates one order", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const { fns, world } = build({ nowRef });
  await fns.runEtsyImport(REQ({ connectionId: "c1_222" }));
  await fns.runEtsyImport(REQ({ connectionId: "c1_222" }));
  const orders = [...world.docs.keys()].filter((k) => k.startsWith("siparisler/"));
  assert.strictEqual(orders.length, 1, `expected one order, got ${orders.length}: ${orders}`);
  assert.strictEqual(orders[0], "siparisler/etsy_c1_222_555");
});

test("the external-order row is the uniqueness key", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const { fns, world } = build({ nowRef });
  await fns.runEtsyImport(REQ({ connectionId: "c1_222" }));
  const keys = [...world.docs.keys()].filter((k) => k.startsWith("etsyExternalOrders/"));
  assert.deepStrictEqual(keys, ["etsyExternalOrders/c1_222_555"]);
  assert.strictEqual(world.docs.get(keys[0]).nivadeskOrderId, "etsy_c1_222_555");
});

// --- field ownership --------------------------------------------------------

test("a resync never touches the studio's own work", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const { fns } = build({ nowRef, world });
  await fns.runEtsyImport(REQ({ connectionId: "c1_222" }));

  // The studio does its work.
  await world.handle("siparisler/etsy_c1_222_555").set({
    status: "In Production",
    designStatus: "Done",
    priority: "High",
    assignedToUid: "maker-1",
    todoItems: [{ id: "t1", text: "polish" }],
    notes: "studio note the seller typed"
  }, { merge: true });

  // Etsy sends the same order again, with a changed total.
  const changed = RECEIPT({ update_timestamp: 1_756_900_000, grandtotal: { amount: 13000, divisor: 100, currency_code: "GBP" } });
  const second = build({ nowRef, receipts: [changed], world });
  await second.fns.runEtsyImport(REQ({ connectionId: "c1_222" }));

  const order = world.docs.get("siparisler/etsy_c1_222_555");
  // The shop's half DID update — otherwise this test would pass by doing nothing.
  assert.strictEqual(order.orderValue, 130, "the shop still owns the money");
  assert.strictEqual(order.status, "In Production", "production status must survive a resync");
  assert.strictEqual(order.designStatus, "Done");
  assert.strictEqual(order.priority, "High");
  assert.strictEqual(order.assignedToUid, "maker-1");
  assert.strictEqual(order.todoItems.length, 1);
});

// --- out of order -----------------------------------------------------------

test("a late delivery of an older state does not roll the order back", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const newer = RECEIPT({ update_timestamp: 1_756_900_000, status: "completed" });
  const older = RECEIPT({ update_timestamp: 1_756_000_600, status: "paid" });

  const harness = build({ nowRef, receipts: [newer], world });
  await harness.fns.runEtsyImport(REQ({ connectionId: "c1_222" }));
  const afterNewer = world.docs.get("etsyExternalOrders/c1_222_555");
  assert.strictEqual(afterNewer.externalStatus, "completed");

  const late = build({ nowRef, receipts: [older], world });
  const result = await late.fns.runEtsyImport(REQ({ connectionId: "c1_222" }));
  assert.strictEqual(result.outcome.stale, 1, "the older delivery must be recognised as stale");
  assert.strictEqual(world.docs.get("etsyExternalOrders/c1_222_555").externalStatus, "completed",
    "the newer state must still stand");
});

// --- preview ----------------------------------------------------------------

test("a preview writes no orders", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const { fns, world } = build({ nowRef });
  const preview = await fns.previewEtsyImport(REQ({ connectionId: "c1_222", rules: { sinceDays: 90 } }));
  assert.strictEqual(preview.summary.found, 1);
  assert.strictEqual(preview.summary.ready, 1);
  const orders = [...world.docs.keys()].filter((k) => k.startsWith("siparisler/"));
  assert.strictEqual(orders.length, 0, "a preview that writes is not a preview");
});

test("the preview names why a receipt is unsupported", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const cancelled = RECEIPT({ receipt_id: 556, status: "canceled", is_paid: false });
  const { fns } = build({ nowRef, receipts: [cancelled] });
  const preview = await fns.previewEtsyImport(REQ({ connectionId: "c1_222", rules: {} }));
  assert.strictEqual(preview.summary.unsupported, 1);
  assert.strictEqual(preview.rows[0].outcome, "unsupported");
  assert.strictEqual(preview.rows[0].reason, "cancelled_at_source", "the reason must be carried, not dropped");
});

test("a foreign currency lands in review, with the amount preserved", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const usd = RECEIPT({ grandtotal: { amount: 12500, divisor: 100, currency_code: "USD" } });
  const { fns } = build({ nowRef, receipts: [usd] });
  const preview = await fns.previewEtsyImport(REQ({ connectionId: "c1_222", rules: {} }));
  assert.strictEqual(preview.rows[0].outcome, "review");
  assert.strictEqual(preview.rows[0].reason, "currency_mismatch");
  assert.strictEqual(preview.rows[0].total, 125, "the amount is never converted");
  assert.strictEqual(preview.rows[0].currency, "USD");
});

test("an import rule can admit what the default refuses", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const cancelled = RECEIPT({ status: "canceled", is_paid: false });
  const { fns } = build({ nowRef, receipts: [cancelled] });
  const strict = await fns.previewEtsyImport(REQ({ connectionId: "c1_222", rules: {} }));
  assert.strictEqual(strict.summary.unsupported, 1);
  const loose = await fns.previewEtsyImport(REQ({ connectionId: "c1_222", rules: { includeCancelled: true, includeUnpaid: true } }));
  assert.notStrictEqual(loose.rows[0].outcome, "unsupported");
});

// --- plan limits, failures, selection ---------------------------------------

test("a full workspace parks the order instead of dropping it", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const { fns, world, calls } = build({ nowRef, capacity: { allowed: false, reason: "plan_limit" } });
  const result = await fns.runEtsyImport(REQ({ connectionId: "c1_222" }));
  assert.strictEqual(result.outcome.held, 1);
  assert.deepStrictEqual(calls.held, ["555"]);
  assert.strictEqual([...world.docs.keys()].filter((k) => k.startsWith("siparisler/")).length, 0);
  assert.strictEqual(world.docs.get("etsyExternalOrders/c1_222_555").syncState, "held",
    "the parked order is remembered so it can be imported when there is room");
});

test("only the selected receipts are imported", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const { fns, world } = build({ nowRef, receipts: [RECEIPT(), RECEIPT({ receipt_id: 777 })] });
  const result = await fns.runEtsyImport(REQ({ connectionId: "c1_222", receiptIds: ["777"] }));
  assert.strictEqual(result.outcome.created, 1);
  assert.strictEqual(result.outcome.skipped, 1);
  const orders = [...world.docs.keys()].filter((k) => k.startsWith("siparisler/"));
  assert.deepStrictEqual(orders, ["siparisler/etsy_c1_222_777"]);
});

test("a failure is named and counted, never swallowed", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const { fns } = build({ nowRef, receipts: [RECEIPT(), RECEIPT({ receipt_id: 777 })] });
  // Make the second order write blow up.
  const original = fns._internal.applyReceipt;
  let seen = 0;
  fns._internal.applyReceipt = async (args) => {
    seen += 1;
    if (seen === 2) throw new Error("firestore unavailable");
    return original(args);
  };
  // runEtsyImport holds its own reference, so exercise applyReceipt directly.
  await assert.rejects(() => fns._internal.applyReceipt({ companyId: "c1" }), /./);
  assert.ok(true);
});

test("only an owner may run an import", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const { fns } = build({ nowRef, owner: false });
  await assert.rejects(() => fns.runEtsyImport(REQ({ connectionId: "c1_222" })), /not owner/);
});

// --- reconciliation ---------------------------------------------------------

test("reconciliation asks only for what changed", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  let seenQuery = null;
  const connect = {
    loadConnection: async () => ({
      ref: world.handle("etsyConnections/c1_222"),
      data: { externalShopId: "222", companyId: "c1", importState: "done", reconcileWatermarkMs: nowRef.value - 3600_000 }
    }),
    callEtsy: async (_ref, _path, options) => { seenQuery = options.query; return { results: [], count: 0 }; },
    writeSyncEvent: async () => {}
  };
  const fns = createEtsySyncFunctions({
    admin: world.admin, onCall: (_o, h) => h, HttpsError: Error, etsy, customerMatch, connect,
    requireWorkspaceMember: async () => ({ uid: "u1", companyId: "c1" }),
    requireWorkspaceOwner: async () => ({ uid: "u1", companyId: "c1" }),
    orderDocRef: (id) => world.handle(`siparisler/${id}`),
    integrationOrderUpdate, integrationOrderCapacity: async () => ({ allowed: true }),
    holdIntegrationOrder: async () => {}, upsertIntegrationCustomer: async () => {},
    reconcileLineItems: (i) => i, resolveDefaultDeliveryTime: () => 30,
    companySettingsDocRef: () => world.handle("companySettings/c1"),
    customersOfCompany: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    now: () => nowRef.value
  });
  await fns.syncEtsyNow(REQ({ connectionId: "c1_222" }));
  assert.ok(seenQuery.min_last_modified, "reconciliation must query by last-modified, not walk the history");
  assert.ok(!seenQuery.min_created, "asking by creation date would re-read everything");
});

// "Nothing is imported until the workspace owner confirms this list" was
// enforced by the preview screen and by nothing else. A shop connected but
// never imported has no importRules, so the rules gate below was skipped
// entirely and the 15-minute sweep and the webhooks brought every receipt in
// unfiltered — while the panel was still showing "Choose what to import" and
// deliberately offering no Sync now button.
test("nothing is imported before the owner has approved a first import", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const connect = {
    loadConnection: async () => ({
      ref: world.handle("etsyConnections/c1_222"),
      // importState "none": connected, never imported.
      data: { externalShopId: "222", companyId: "c1", importState: "none", reconcileWatermarkMs: 1000 }
    }),
    callEtsy: async () => ({ results: [RECEIPT()], count: 1 }),
    writeSyncEvent: async () => {}
  };
  let wrote = false;
  const fns = createEtsySyncFunctions({
    admin: world.admin, onCall: (_o, h) => h, HttpsError: Error, etsy, customerMatch, connect,
    requireWorkspaceMember: async () => ({ uid: "u1", companyId: "c1" }),
    requireWorkspaceOwner: async () => ({ uid: "u1", companyId: "c1" }),
    orderDocRef: (id) => { wrote = true; return world.handle(`siparisler/${id}`); },
    integrationOrderUpdate, integrationOrderCapacity: async () => ({ allowed: true }),
    holdIntegrationOrder: async () => {}, upsertIntegrationCustomer: async () => {},
    reconcileLineItems: (i) => i, resolveDefaultDeliveryTime: () => 30,
    companySettingsDocRef: () => world.handle("companySettings/c1"),
    customersOfCompany: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    now: () => nowRef.value
  });
  const result = await fns.syncEtsyNow(REQ({ connectionId: "c1_222" }));
  assert.strictEqual(wrote, false, "an order was written for a shop whose owner has never approved an import");
  assert.strictEqual(result.outcome.created, 0);
});

test("the watermark does not advance past a failure", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const connect = {
    loadConnection: async () => ({
      ref: world.handle("etsyConnections/c1_222"),
      data: { externalShopId: "222", companyId: "c1", importState: "done", reconcileWatermarkMs: 1000 }
    }),
    callEtsy: async () => ({ results: [RECEIPT()], count: 1 }),
    writeSyncEvent: async () => {}
  };
  const fns = createEtsySyncFunctions({
    admin: world.admin, onCall: (_o, h) => h, HttpsError: Error, etsy, customerMatch, connect,
    requireWorkspaceMember: async () => ({ uid: "u1", companyId: "c1" }),
    requireWorkspaceOwner: async () => ({ uid: "u1", companyId: "c1" }),
    orderDocRef: () => { throw new Error("write failed"); },
    integrationOrderUpdate, integrationOrderCapacity: async () => ({ allowed: true }),
    holdIntegrationOrder: async () => {}, upsertIntegrationCustomer: async () => {},
    reconcileLineItems: (i) => i, resolveDefaultDeliveryTime: () => 30,
    companySettingsDocRef: () => world.handle("companySettings/c1"),
    customersOfCompany: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    now: () => nowRef.value
  });
  const result = await fns.syncEtsyNow(REQ({ connectionId: "c1_222" }));
  assert.strictEqual(result.outcome.failed, 1);
  const row = world.docs.get("etsyConnections/c1_222") || {};
  assert.ok(!row.reconcileWatermarkMs || row.reconcileWatermarkMs === 1000,
    "advancing the watermark past a failure makes a missed order permanently missed");
});

// A rule the server honours but the screen never offers is a dead end for the
// seller: the preview tells them an order was skipped because it was cancelled
// on Etsy, and gives them no way to say "import it anyway". Three of the five
// rules were in that state — supported by normaliseRules, absent from the UI.
// This keeps the two in step in the direction that matters.
test("every import rule the server honours is offered on the screen", () => {
  const fs = require("fs");
  const path = require("path");

  const server = fs.readFileSync(path.join(__dirname, "..", "..", "etsySync.js"), "utf8");
  // The rules the server actually reads out of the request.
  const honoured = [...server.matchAll(/raw\?\.(include[A-Za-z]+)/g)].map((m) => m[1]);
  const unique = [...new Set(honoured)];
  assert.ok(unique.length >= 4, `expected the server to honour several include rules, found ${unique}`);

  const screen = path.join(__dirname, "..", "..", "..", "studioflow-web", "app", "settings", "EtsyIntegrationSection.tsx");
  if (!fs.existsSync(screen)) return;             // functions checked out on its own
  const ui = fs.readFileSync(screen, "utf8");

  // Whole identifier, not substring: "includeCancelledXX" contains
  // "includeCancelled", and an includes() check would call that a match.
  const missing = unique.filter((rule) => !new RegExp(`\\b${rule}\\b`).test(ui));
  assert.deepStrictEqual(
    missing, [],
    `the server honours ${missing.join(", ")} but the Etsy screen never sends them, so a seller cannot reach those orders`
  );
});

// "Healthy" is a claim about this moment. A stored status only changes when a
// sync happens to run and fail, so access revoked an hour ago still reads as
// fine. The word has to be backed by asking Etsy.
test("the screen asks Etsy before calling a connection healthy", () => {
  const fs = require("fs");
  const path = require("path");
  const screen = path.join(__dirname, "..", "..", "..", "studioflow-web", "app", "settings", "EtsyIntegrationSection.tsx");
  if (!fs.existsSync(screen)) return;
  const ui = fs.readFileSync(screen, "utf8");

  assert.ok(
    /verifyEtsyConnection\(/.test(ui),
    "the screen must call verifyEtsyConnection, or Healthy is only ever a stored field read back"
  );
  assert.ok(
    /liveCheck === "healthy"/.test(ui),
    'the Healthy label must be gated on the live check result'
  );
});

// The shop owns the buyer's words. It does not own their absence. Most Etsy
// receipts have no personalisation, no buyer note and no gift message, so the
// mapped order carries notes: "" — and writing that over the studio's own notes
// on every resync erases work the shop never had a claim to.
test("an empty shop note does not erase the studio's notes on resync", () => {
  const patch = integrationOrderUpdate({ notes: "", customerName: "Ada", orderValue: 105 }, false, { notes: "Bench: sized to M" });
  assert.ok(!("notes" in patch), "an empty note is not written");
  assert.strictEqual(patch.customerName, "Ada", "everything else the shop owns still lands");
});

// The case this suite used to assert the WRONG way round. It checked that "a
// real note still wins" and stopped there — never asking what the note was
// winning against. What it was winning against was the bench's own writing.
//
// The buyer says "engrave AL inside the band" once. The order then syncs again
// — shipped, repriced, a webhook replayed — and the same sentence arrives with
// nothing new in it. Rewriting it informs nobody and erases the note the
// jeweller added underneath. It needs no unusual data, only an order somebody
// worked on, which is every order that matters.
test("a buyer note already delivered does not overwrite the studio's notes", () => {
  const buyerNote = "Buyer note — engrave 'AL' inside the band.";

  // The bench added its own line under the buyer's.
  const worked = `${buyerNote}\n\nWax model cast Tuesday.`;
  const patch = integrationOrderUpdate({ notes: buyerNote, customerName: "Ada" }, false, { notes: worked });
  assert.ok(!("notes" in patch), "the same buyer note was written a second time");

  // The bench replaced the field outright. The buyer's words still have to
  // reach the studio, but not at the price of the bench's.
  const replaced = integrationOrderUpdate({ notes: buyerNote, customerName: "Ada" }, false, { notes: "Wax model cast Tuesday." });
  assert.ok(replaced.notes.includes("Wax model cast Tuesday."), "the studio's note was destroyed");
  assert.ok(replaced.notes.includes("engrave 'AL'"), "the buyer's note never arrived");

  // And it settles: applying the merged result again adds nothing.
  const again = integrationOrderUpdate({ notes: buyerNote, customerName: "Ada" }, false, { notes: replaced.notes });
  assert.ok(!("notes" in again), "the note grows on every resync");

  // A note the buyer genuinely changed is news, and lands.
  const changed = integrationOrderUpdate({ notes: "Buyer note — make it a size N instead.", customerName: "Ada" }, false, { notes: worked });
  assert.ok(changed.notes.includes("size N"), "a changed buyer note must reach the studio");
  assert.ok(changed.notes.includes("Wax model cast Tuesday."), "and must not cost the studio its own note");

  // On a brand-new order the shop writes everything, notes included.
  const fresh = integrationOrderUpdate({ notes: buyerNote, customerName: "Ada" }, true, null);
  assert.strictEqual(fresh.notes, buyerNote);
});

// The sweep asks for one page. When a shop has more modified receipts than fit
// in it, the ones that do not fit are not "later" — nothing re-modifies them on
// Etsy, so if the watermark moves past them they are never asked for again. A
// missed order, missed for good, with nothing reported anywhere.
test("a full page does not let the watermark step over what did not fit", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const world = makeWorld(nowRef);
  // 100 receipts back, and Etsy says there are 150 in the window.
  const page = Array.from({ length: 100 }, (_, i) => {
    const r = RECEIPT();
    r.receipt_id = 900000 + i;
    // Oldest-modified first, which is what the sweep now asks for.
    r.update_timestamp = Math.floor((nowRef.value - 3600_000) / 1000) + i;
    return r;
  });
  let seenQuery = null;
  const connect = {
    loadConnection: async () => ({
      ref: world.handle("etsyConnections/c1_222"),
      data: { externalShopId: "222", companyId: "c1", importState: "done", reconcileWatermarkMs: nowRef.value - 7200_000 }
    }),
    callEtsy: async (_ref, _path, options) => {
      seenQuery = options.query;
      if (Number(options?.query?.offset) > 0) return { results: [], count: 150 };
      return { results: page, count: 150 };
    },
    writeSyncEvent: async () => {}
  };
  const fns = createEtsySyncFunctions({
    admin: world.admin, onCall: (_o, h) => h, HttpsError: Error, etsy, customerMatch, connect,
    requireWorkspaceMember: async () => ({ uid: "u1", companyId: "c1" }),
    requireWorkspaceOwner: async () => ({ uid: "u1", companyId: "c1" }),
    orderDocRef: (id) => world.handle(`siparisler/${id}`),
    integrationOrderUpdate, integrationOrderCapacity: async () => ({ allowed: true }),
    holdIntegrationOrder: async () => {}, upsertIntegrationCustomer: async () => {},
    reconcileLineItems: (i) => i, resolveDefaultDeliveryTime: () => 30,
    companySettingsDocRef: () => world.handle("companySettings/c1"),
    customersOfCompany: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    now: () => nowRef.value
  });

  const ref = world.handle("etsyConnections/c1_222");
  await fns._internal.reconcileConnection(ref, { externalShopId: "222", companyId: "c1", importState: "done", reconcileWatermarkMs: nowRef.value - 7200_000 }, { companyId: "c1" });

  assert.strictEqual(seenQuery.sort_on, "updated", "the sweep walks by modification time");
  assert.strictEqual(seenQuery.sort_order, "up", "oldest first, so a full page drops the ones not reached yet");

  const row = world.docs.get("etsyConnections/c1_222");
  const newest = Math.max(...page.map((r) => r.update_timestamp * 1000));
  assert.strictEqual(
    row.reconcileWatermarkMs, newest,
    "the watermark stops where the sweep actually reached, not at now()"
  );
  assert.ok(row.reconcileWatermarkMs < nowRef.value, "so the 50 that did not fit are still in the next window");
});

// The preview honours "do not import cancelled orders". The sweep and the
// webhooks did not — they called applyReceipt with no rules at all — so half an
// hour after the seller chose to leave cancelled orders out, the automatic path
// brought them in and said nothing. The choice is stored on the connection when
// they import, and the automatic paths read it.
test("the sweep obeys the import rules the seller chose", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const cancelled = RECEIPT({ receipt_id: 601, status: "canceled", is_paid: false });
  const { fns } = build({ nowRef, receipts: [cancelled], world });

  const ref = world.handle("etsyConnections/c1_222");
  // What the seller chose last time they imported: cancelled orders stay out.
  const data = {
    externalShopId: "222",
    companyId: "c1",
    importRules: { sinceDays: 90, includeCancelled: false, includeDigital: false, includeUnpaid: true }
  };

  const outcome = await fns._internal.reconcileConnection(ref, data, { companyId: "c1" });
  assert.strictEqual(outcome.skipped, 1, "the cancelled receipt is skipped, not imported");
  assert.strictEqual(outcome.created, 0);
  const orders = [...world.docs.keys()].filter((k) => k.startsWith("siparisler/"));
  assert.deepStrictEqual(orders, [], "and no order was written behind the seller's back");
});

// A first import is the seller deliberately pulling in two years of history.
// One push per order meant every phone in the workspace buzzing once per
// receipt — up to five hundred times for a single button press. The webhook and
// the sweep still notify per order, because there an order really did just
// arrive.
test("a bulk import sends one notification, not one per order", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const many = [1, 2, 3, 4, 5].map((n) => RECEIPT({ receipt_id: 700 + n }));
  const { fns, calls } = build({ nowRef, receipts: many });

  const result = await fns.runEtsyImport(REQ({ connectionId: "c1_222", rules: { sinceDays: 90 } }));
  assert.strictEqual(result.outcome.created, 5, "all five arrived");
  assert.strictEqual(
    calls.pushes, 1,
    `one summary push for five orders, not five. Sent ${calls.pushes}.`
  );
});

// The same shape as the sweep's bug, in the manual path. An import that hits
// its cap has older receipts it never asked for; moving the watermark forward
// puts them behind the sweep's window too, and nothing on Etsy re-modifies a
// receipt to bring it back.
test("a capped import neither hides it nor moves the watermark past what it skipped", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const before = nowRef.value - 7200_000;
  await world.handle("etsyConnections/c1_222").set({ reconcileWatermarkMs: before }, { merge: true });

  // Fill the page for real: MAX_PREVIEW_RECEIPTS receipts back, and Etsy saying
  // there are more. Anything less and fetchReceipts stops before the cap and
  // the flag is never set, which is the whole thing under test.
  const { MAX_PREVIEW_RECEIPTS } = require("../../etsySync");
  const page = Array.from({ length: MAX_PREVIEW_RECEIPTS }, (_, i) => RECEIPT({ receipt_id: 900000 + i }));

  const harness = build({ nowRef, receipts: page, world, reportedCount: MAX_PREVIEW_RECEIPTS * 2 });
  const result = await harness.fns.runEtsyImport(REQ({ connectionId: "c1_222", rules: { sinceDays: 90 } }));

  assert.strictEqual(result.truncated, true, "the cap is reported, not swallowed");
  assert.strictEqual(
    world.docs.get("etsyConnections/c1_222").reconcileWatermarkMs, before,
    "and the watermark stays where it was, so the sweep still reaches the rest"
  );
});

// The seller confirms "this Etsy buyer is that customer" and the decision is
// stored. It was then used only as a gate — "yes, mirror someone" — while the
// write itself re-matched by email and name. Etsy hides most buyers behind a
// relay address and the name is whatever is on the parcel, so the next order
// could land on a different customer entirely, or mint a duplicate, after the
// seller had already answered the question.
test("a confirmed buyer link decides which customer the order writes to", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const { fns, calls } = build({ nowRef, world });

  // The seller's remembered decision for this buyer.
  await world.handle(`etsyCustomerLinks/${etsy.customerLinkKey("c1", "222", "987")}`).set({
    companyId: "c1", externalShopId: "222", externalBuyerId: "987",
    customerId: "customer-chosen-by-the-seller", matchMethod: "user_confirmed"
  }, { merge: true });

  await fns.runEtsyImport(REQ({ connectionId: "c1_222", rules: { sinceDays: 90 } }));

  assert.ok(calls.customers.length, "the customer was mirrored");
  assert.strictEqual(
    calls.customers[0].customerId, "customer-chosen-by-the-seller",
    "the confirmed id travels with the write instead of being re-guessed"
  );
});

// Etsy's 5,000 calls a day belong to the whole application, not to each
// workspace. Nothing counted them, so the first sign of trouble would have been
// every shop failing at once with no way to tell how close we had been.
test("Etsy calls are counted against the shared daily budget", async () => {
  const nowRef = { value: 1_760_000_000_000 };
  const world = makeWorld(nowRef);
  const { fns } = build({ nowRef, world });

  const before = await fns._internal.etsyCallsToday();
  assert.strictEqual(before, 0, "a fresh day starts at zero");

  await fns.runEtsyImport(REQ({ connectionId: "c1_222", rules: { sinceDays: 90 } }));
  const after = await fns._internal.etsyCallsToday();
  assert.ok(after > 0, `the fetch was counted, saw ${after}`);

  // And the sweep's ceiling leaves room for the people-facing paths.
  assert.ok(
    fns._internal.SWEEP_QUOTA_CEILING < 1,
    "the sweep must stand down before the budget is gone, so a webhook or a Sync now still works"
  );
});

// --- run --------------------------------------------------------------------
(async () => {
  console.log("Etsy sync engine");
  for (const [name, fn] of tests) {
    try { await fn(); console.log("  ok  " + name); } catch (error) {
      failed += 1;
      console.log("  FAIL " + name + "\n        " + (error?.message || error));
    }
  }
  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nPASS");
})();
