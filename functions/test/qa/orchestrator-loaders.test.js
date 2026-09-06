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
const fs = require("fs");
const path = require("path");
const loadersModule = require("../../orchestrator/loaders");
const registry = require("../../orchestrator/registry");
const envelope = require("../../orchestrator/envelope");
const { CAPABILITY_NAMES, HANDLERS } = require("../../orchestrator");
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
  const snapshot = await loaders.snapshotFor(entry.domainNeeds || [], ctx, { settings: {} });
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

/** A collection filled to exactly its cap, so `size >= limit` is true. */
const many = (count, row) => Array.from({ length: count }, (_, index) => ({ id: `x${index}`, ...row }));

/** Every capped collection, at its cap, keyed by the path the loader asks for. */
const CAPPED_SEED = {
  siparisler: many(loadersModule.CAPS.orders, { companyId: CID, status: "In Progress", paidAmount: 10, remainingAmount: 0, createdAt: "2026-09-01", paymentDate: "2026-09-01" }),
  [`companies/${CID}/bankTransactions`]: many(loadersModule.CAPS.bank, { amount: -5, currency: "GBP", bookingDate: "2026-09-01", category: "Materials", reviewStatus: "reviewed" }),
  [`companies/${CID}/inventoryItems`]: many(loadersModule.CAPS.inventory, { name: "Bar", trackingType: "quantity", quantity: { onHand: 5, reserved: 0 }, status: "available" }),
  [`companies/${CID}/squarePayouts`]: many(loadersModule.CAPS.payouts, { provider: "square", status: "PAID", amount: 10, currency: "GBP", arrivalDate: "2026-09-01", totals: { gross: 10, fee: 0, net: 10 } }),
  [`companies/${CID}/paypalPayouts`]: many(loadersModule.CAPS.payouts, { provider: "paypal", status: "PAID", amount: 10, currency: "GBP", arrivalDate: "2026-09-01", totals: { gross: 10, fee: 0, net: 10 } }),
  commerceReviewQueue: many(loadersModule.CAPS.review, { companyId: CID, provider: "shopify", reason: "plan_limit" }),
  [`companies/${CID}/heldIntegrationOrders`]: many(loadersModule.CAPS.review, { provider: "shopify", reason: "plan_limit" }),
  [`companies/${CID}/accountingAttention`]: many(loadersModule.CAPS.attention, { provider: "quickbooks", kind: "changed", severity: "warning", message: "changed", status: "open" }),
  [`companies/${CID}/bankReceiptInbox`]: many(loadersModule.CAPS.inbox, { status: "waiting", createdAtMs: fixtures.NOW - 1000 }),
  // The three that used to be integer literals outside CAPS, and therefore
  // invisible to the check below by construction.
  [`companies/${CID}/bankVendors`]: many(loadersModule.CAPS.vendors, { name: "Adobe", keys: ["ADOBE"], cadence: "monthly" }),
  shopifyStores: many(loadersModule.CAPS.connections, { companyId: CID, shopDomain: "a.myshopify.com", status: "connected" }),
  [`companies/${CID}/bankConnections`]: many(loadersModule.CAPS.connections, { provider: "truelayer", institutionName: "HSBC", syncState: "ok" }),
  [`companies/${CID}/accountingConnections`]: many(loadersModule.CAPS.connections, { provider: "quickbooks", companyName: "Co", mode: "read_only", status: "connected" }),
  commerceHealth: many(loadersModule.CAPS.commerceHealth, { companyId: CID, provider: "shopify", connectionId: "s1" })
};

check("a snapshot carries no company document", async () => {
  // `companyDataHint` handed every pure capability the whole company document —
  // members, memberAccess, suspendedMembers, billing — for display, and no
  // handler ever read it (a grep across functions/ found no reader outside the
  // loader). Nothing emitted it; one `...snapshot` in a future capability
  // would have. The gates read that document through `loadCompany`, for the
  // request, which is where it belongs.
  for (const capability of CAPABILITY_NAMES) {
    const { snapshot } = await snapshotOf(capability, {}, { [`companies/${CID}`]: { ownerUid: "u_owner", members: { u_member: true } } });
    const serialised = JSON.stringify(snapshot);
    for (const field of ["companyDataHint", "companyData", "memberAccess", "suspendedMembers", "members"]) {
      assert.ok(!serialised.includes(field), `${capability}: the snapshot carries "${field}"`);
    }
  }
});

check("every cap has a flag, and the flag has a sentence", async () => {
  // The two lists that have to agree: what the loader can truncate, and what an
  // answer knows how to say. `bankCapped` was set and read by nothing, and the
  // payout, review, attention and inbox reads set no flag at all, while
  // loaders.js's header and docs/orchestrator-contract.md both promised that
  // hitting a cap sets `partial: true` with `loader_cap_reached`.
  const flags = Object.keys(loadersModule.CAPS).map((name) => `${name}Capped`).sort();
  assert.deepStrictEqual(flags, Object.keys(envelope.CAP_WARNINGS).sort(),
    "a cap with no sentence truncates in silence; a sentence with no cap can never be said");
});

check("a read that hits its cap says so, in the flag and in the answer", async () => {
  const seen = new Set();
  for (const capability of CAPABILITY_NAMES) {
    const { snapshot } = await snapshotOf(capability, {}, CAPPED_SEED);
    const hit = Object.keys(envelope.CAP_WARNINGS).filter((flag) => snapshot[flag] === true);
    hit.forEach((flag) => seen.add(flag));

    const result = HANDLERS[capability](snapshot, {}, fixtures.ownerContext({ companyId: CID }), { nowMs: fixtures.NOW }) || {};
    const built = envelope.finish({
      capability,
      state: result.state || "completed",
      data: result.data || {},
      sources: result.sources || [],
      warnings: result.warnings || [],
      partial: result.partial === true,
      entityRefs: result.entityRefs || [],
      nowMs: fixtures.NOW
    });
    const said = built.warnings.some((row) => row.code === "loader_cap_reached");
    assert.strictEqual(said, hit.length > 0,
      hit.length > 0
        ? `${capability} was built on a truncated read (${hit.join(", ")}) and said the answer was complete`
        : `${capability} warned about a cap it did not hit`);
    if (hit.length > 0) {
      assert.strictEqual(built.partial, true, `${capability} raised loader_cap_reached without going partial`);
    }
  }
  // And every cap is reachable by some capability, or the flag is decoration.
  assert.deepStrictEqual([...seen].sort(), Object.keys(envelope.CAP_WARNINGS).sort(),
    "a cap no capability can hit is a cap nobody needs");
});

check("every .limit() the loader issues is one of the caps that has a sentence", () => {
  // The pin above compares two LISTS with each other, so a cap written as an
  // integer literal at a call site was invisible to it by construction — which
  // is how `bankVendors` (200), the four commerce-connection reads and
  // `bankConnections` (25 each), `accountingConnections` (25) and
  // `commerceHealth` (50) truncated in silence while both loaders.js and the
  // contract document said every cap is announced. This reads the source
  // instead, so the next literal fails here rather than in an answer.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "orchestrator", "loaders.js"), "utf8")
    // Comments talk ABOUT `.limit()`; only the code issues one.
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const names = new Set(Object.keys(loadersModule.CAPS).map((name) => `CAPS.${name}`));
  // Both ways this file caps a read: a `.limit()` of its own, and the limit
  // argument it hands `readCollection` — which is where the `bankVendors` 200
  // lived, invisible to a check that only read `.limit(`.
  const found = [
    ...[...source.matchAll(/\.limit\(([^)]*)\)/g)].map((match) => match[1].trim()),
    ...[...source.matchAll(/readCollection\([^,]+,\s*([^)]*)\)/g)].map((match) => match[1].trim())
  ];
  assert.ok(found.length >= 13, `only ${found.length} capped reads found — did the loader stop reading?`);
  for (const argument of found) {
    // `readCollection(ref, limit)` is the shared helper: its own `.limit(limit)`
    // is the parameter every caller passes a CAPS constant to.
    if (argument === "limit") continue;
    assert.ok(names.has(argument),
      `loaders.js caps a read at "${argument}", which is not one of CAPS — a cap outside CAPS sets no flag and says nothing`);
  }
});

check("a member without Banking gets NEITHER payout collection read for them", async () => {
  // The domain was gated as a union — bankFeed OR financialInfo — argued from
  // where each document is WRITTEN: Square's payouts ride a commerce
  // connection, PayPal's are written off a `bankConnections` document
  // (bankFeed.js paypalConnect). Provenance is not permission, and
  // firestore.rules gates the two collections identically:
  //
  //   match /companies/{cid}/squarePayouts/{document=**} {
  //     allow read: if canReadBankFeed(companyId);
  //   }
  //
  // where `canReadBankFeed` is owner OR memberAccess.bankFeed — financialInfo
  // is not in it. So the union read `squarePayouts` for a member the client is
  // refused it for, and `commerce.settlementTotals` published its
  // count/gross/fee/net, while get_payout_reconciliation_overview refused that
  // same person outright.
  const financialNoBank = {
    isOwner: false,
    areas: { orders: true, dashboard: true, customers: true, bankFeed: false },
    financialInfo: true,
    accountingReader: false
  };
  const { reads, snapshot } = await snapshotOf("get_commerce_overview", financialNoBank, {
    [`companies/${CID}/paypalPayouts`]: [{ id: "pp_1", provider: "paypal", status: "PAID", amount: 4200.55, currency: "GBP", arrivalDate: "2026-09-02", totals: { gross: 4400, fee: -199.45, net: 4200.55 } }],
    [`companies/${CID}/squarePayouts`]: [{ id: "sq_1", provider: "square", status: "PAID", amount: 10, currency: "GBP", arrivalDate: "2026-09-02", totals: { gross: 10, fee: 0, net: 10 } }]
  });
  assert.ok(!touched(reads, "paypalPayouts"), "the PayPal payout collection was read for a member without Banking");
  assert.ok(!touched(reads, "squarePayouts"), "the Square payout collection was read for a member the rules file refuses it to");
  assert.strictEqual(snapshot.payouts, undefined, "a collection nobody read must not look like a collection that was empty");

  // And neither provider's money reaches the answer.
  const ctx = fixtures.ownerContext({ companyId: CID, ...financialNoBank });
  const result = HANDLERS.get_commerce_overview(snapshot, {}, ctx, { nowMs: fixtures.NOW });
  for (const provider of ["paypal", "square"]) {
    assert.strictEqual(result.data.settlements[provider], undefined,
      `data.settlements still carries ${JSON.stringify(result.data.settlements[provider])} for ${provider}`);
    assert.ok(result.data.settlements.others.some((row) => row.provider === provider && row.reason === "connection_not_visible"),
      `the answer must say the ${provider} feed cannot be seen from here, not guess that it is missing`);
  }
});

check("the owner still gets both payout feeds", async () => {
  const { reads, snapshot } = await snapshotOf("get_payout_reconciliation_overview");
  assert.ok(touched(reads, "paypalPayouts"));
  assert.ok(touched(reads, "squarePayouts"));
  assert.deepStrictEqual(Object.keys(snapshot.payouts).sort(), ["paypal", "square"]);
});

check("a member with neither Banking nor financial access has no payout read at all", async () => {
  const { reads } = await snapshotOf("get_business_attention_summary", {
    isOwner: false,
    areas: { orders: true, dashboard: true, customers: true, bankFeed: false },
    financialInfo: false,
    accountingReader: false,
    inventoryAccess: false
  });
  for (const name of ["squarePayouts", "paypalPayouts"]) {
    assert.ok(!touched(reads, name), `${name} was read for a member who can see neither payouts nor money`);
  }
});

check("settings reach only the capabilities that declared them", async () => {
  // The one DOMAINS member with no branch: it rode along on every snapshot, so
  // get_integration_health — the single entry whose domainNeeds omit it —
  // received it anyway, and "read exactly what the capability declared, and
  // nothing else" was true of ten domains and vacuous for the eleventh.
  const workspaceSettings = { seciliParaBirimi: "£", feePercentage: 3 };
  for (const capability of CAPABILITY_NAMES) {
    const { db } = recorder();
    const loaders = loadersModule.createLoaders({ db, now: () => fixtures.NOW });
    const entry = registry.entryFor(capability);
    const snapshot = await loaders.snapshotFor(entry.domainNeeds || [], fixtures.ownerContext({ companyId: CID }), { settings: workspaceSettings });
    const declared = (entry.domainNeeds || []).includes("settings");
    assert.deepStrictEqual(snapshot.settings, declared ? workspaceSettings : {},
      `${capability} ${declared ? "lost the settings it declared" : "was handed settings it never declared"}`);
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
