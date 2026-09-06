// What the loader actually reads, asked of the loader rather than of the comment.
//
// loaders.js promises one sentence — "Read exactly what the capability
// declared, and nothing else" — and registry.js's `domainNeeds` is the
// declaration. Nothing checked it. The payouts branch called loadBank()
// unconditionally, so get_commerce_overview and get_channel_performance, which
// declare no bank domain and sit behind no bankFeed gate, each pulled up to
// three thousand documents out of companies/{cid}/bankTransactions.
//
// The db handle here is a recorder: every .get() writes down the path it was
// asked for and returns an empty result. That is enough to test a contract
// about WHICH collections are touched, and it needs no emulator.
//
// Run: node test/qa/orchestrator-loaders.test.js
const assert = require("assert");
const loadersModule = require("../../orchestrator/loaders");
const registry = require("../../orchestrator/registry");
const { CAPABILITY_NAMES } = require("../../orchestrator");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const asyncChecks = [];
const check = (name, run) => { asyncChecks.push([name, run]); };

const CID = "co_1";

/** A Firestore handle that records paths instead of holding data. */
function recorder(seed = {}) {
  const reads = [];
  const docsFor = (path) => (seed[path] || []).map((data, index) => ({
    id: String(data.id || `d${index}`),
    data: () => data
  }));
  const query = (path) => ({
    where: () => query(path),
    orderBy: () => query(path),
    limit: () => query(path),
    get: async () => {
      reads.push(path);
      const docs = docsFor(path);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  });
  const doc = (path) => ({
    collection: (name) => collection(`${path}/${name}`),
    get: async () => {
      reads.push(path);
      const data = (seed[path] || null);
      return { exists: Boolean(data), data: () => data || {} };
    }
  });
  const collection = (path) => ({ ...query(path), doc: (id) => doc(`${path}/${id}`) });
  return { db: () => ({ collection: (name) => collection(name) }), reads };
}

async function snapshotOf(capability, ctxOverrides = {}, seed = {}) {
  const { db, reads } = recorder(seed);
  const loaders = loadersModule.createLoaders({ db, now: () => fixtures.NOW });
  const ctx = fixtures.ownerContext({ companyId: CID, ...ctxOverrides });
  const entry = registry.entryFor(capability);
  const snapshot = await loaders.snapshotFor(entry.domainNeeds || [], ctx, { settings: {}, companyData: {} });
  return { snapshot, reads, entry };
}

const touched = (reads, collectionName) => reads.some((path) => path.split("/").includes(collectionName));

/** Which domain each collection this loader can reach belongs to. */
const COLLECTION_DOMAIN = {
  siparisler: "orders",
  inventoryItems: "inventory",
  bankTransactions: "bank",
  bankVendors: "bank",
  bankReceiptInbox: "receiptInbox",
  squarePayouts: "payouts",
  paypalPayouts: "payouts",
  shopifyStores: "connections",
  etsyConnections: "connections",
  wooConnections: "connections",
  squareConnections: "connections",
  bankConnections: "connections",
  accountingConnections: "connections",
  commerceHealth: "commerceHealth",
  commerceReviewQueue: "review",
  heldIntegrationOrders: "review",
  accountingAttention: "accounting",
  pandleConnection: "accounting"
};

check("a commerce capability reads no bank transactions", async () => {
  for (const capability of ["get_commerce_overview", "get_channel_performance"]) {
    const { reads, entry } = await snapshotOf(capability);
    assert.ok(!entry.domainNeeds.includes("bank"), `${capability} is not supposed to declare bank`);
    assert.ok(!touched(reads, "bankTransactions"),
      `${capability} read companies/${CID}/bankTransactions without declaring the bank domain`);
    assert.ok(touched(reads, "squarePayouts"), `${capability} still reads the payouts it declared`);
  }
});

check("payouts without the bank domain report no bank rows rather than borrowing them", async () => {
  // Seeded so the old branch would have produced a populated payoutBankRows:
  // an unmatched payout whose settlement window contains a credit.
  const seed = {
    [`companies/${CID}/bankTransactions`]: [
      { id: "tx_1", amount: 120, bookingDate: "2026-09-02", currency: "GBP" }
    ],
    [`companies/${CID}/squarePayouts`]: [
      { id: "po_1", amount: 120, currency: "GBP", arrivalDate: "2026-09-02", status: "PAID" }
    ]
  };
  const { snapshot } = await snapshotOf("get_commerce_overview", {}, seed);
  assert.deepStrictEqual(snapshot.payoutBankRows, [],
    "a capability that may not read the bank feed must not be handed rows out of it");
  assert.strictEqual(snapshot.bankRows, undefined);
});

check("the reconciliation capability, which does declare bank, still gets its rows", async () => {
  // The fix must not take the bank half away from the one tool whose whole job
  // is matching a payout against a bank line.
  const seed = {
    [`companies/${CID}/bankTransactions`]: [
      { id: "tx_1", amount: 120, bookingDate: "2026-09-02", currency: "GBP" }
    ],
    [`companies/${CID}/squarePayouts`]: [
      { id: "po_1", amount: 120, currency: "GBP", arrivalDate: "2026-09-02", status: "PAID" }
    ]
  };
  const { snapshot, reads } = await snapshotOf("get_payout_reconciliation_overview", {}, seed);
  assert.ok(touched(reads, "bankTransactions"));
  assert.strictEqual((snapshot.bankRows || []).length, 1);
  assert.strictEqual(snapshot.payoutBankRows.length, 1, "the settlement window still selects the bank row");
});

check("a member without Banking has no bank documents read for them", async () => {
  // get_business_attention_summary declares bank and receiptInbox and is gated
  // on the ORDERS area, so a member without Banking reaches the loader. Their
  // banking section is reported not_permitted; the rows behind it used to be
  // read anyway and thrown away.
  const { reads } = await snapshotOf("get_business_attention_summary", {
    isOwner: false,
    areas: { orders: true, dashboard: true, customers: true, bankFeed: false },
    accountingReader: false
  });
  for (const name of ["bankTransactions", "bankVendors", "bankReceiptInbox"]) {
    assert.ok(!touched(reads, name), `${name} was read for a member without the Banking area`);
  }
  assert.ok(touched(reads, "siparisler"), "the orders they can see are still read");
});

check("the accounting reader keeps the bank rows the readiness figure is counted over", async () => {
  // Not the same predicate as the Banking area: a custom role's access map
  // replaces memberAccess, so the explicit bank grant the accounting callables
  // ask for can be true while the area map says no. Gating this read on the
  // area would have reported "0 transactions ready" as a fact.
  const { reads } = await snapshotOf("get_accounting_sync_status", {
    isOwner: false,
    areas: { orders: true, dashboard: true, customers: true, bankFeed: false },
    accountingReader: true
  });
  assert.ok(touched(reads, "bankTransactions"));
  assert.ok(touched(reads, "accountingAttention"));
});

check("a member who may not open the shelf has no inventory read for them", async () => {
  const { reads, snapshot } = await snapshotOf("get_business_attention_summary", {
    isOwner: false,
    areas: { orders: true, dashboard: true, customers: true, bankFeed: true },
    inventoryAccess: false
  });
  assert.ok(!touched(reads, "inventoryItems"));
  assert.strictEqual(snapshot.inventoryItems, undefined);
});

check("every collection a capability reads belongs to a domain it declared", async () => {
  for (const capability of CAPABILITY_NAMES) {
    const { reads, entry } = await snapshotOf(capability);
    const declared = new Set(entry.domainNeeds || []);
    for (const path of reads) {
      const segments = path.split("/");
      const name = segments[0] === "companies" ? segments[2] : segments[0];
      const domain = COLLECTION_DOMAIN[name];
      assert.ok(domain, `${capability} read "${path}", which this test does not know a domain for`);
      assert.ok(declared.has(domain),
        `${capability} read "${path}" (${domain}) but declares only ${[...declared].join(", ")}`);
    }
  }
});

check("a capability that declares payouts also declares connections", async () => {
  // payouts.payoutFeedState asks the CONNECTION whether a feed exists, and the
  // payouts branch no longer loads connections behind the declaration's back.
  for (const capability of CAPABILITY_NAMES) {
    const entry = registry.entryFor(capability);
    const declared = new Set(entry.domainNeeds || []);
    if (!declared.has("payouts")) continue;
    assert.ok(declared.has("connections"),
      `${capability} declares payouts without connections: "not connected" would be read off an empty collection again`);
  }
});

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  console.log(failures === 0 ? "\nAll loader checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
