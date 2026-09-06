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

check("no published capability reads a bank transaction", async () => {
  // This was two commerce capabilities that declared `payouts` and not `bank`,
  // and read the payouts they declared. The 6 September 2026 reduction removed
  // both of them, and every other capability that declared either domain — so
  // the statement is now about the whole published set rather than about two
  // members of it, and it is stronger for it.
  for (const capability of CAPABILITY_NAMES) {
    const { reads, entry } = await snapshotOf(capability);
    assert.ok(!entry.domainNeeds.includes("bank"), `${capability} declares the bank domain again`);
    assert.ok(!touched(reads, "bankTransactions"),
      `${capability} read companies/${CID}/bankTransactions`);
  }
});

check("a member who may not open the shelf has no inventory read for them", async () => {
  // The capability's own gate refuses this caller before run() reaches the
  // loader, so this is the second line rather than the first: even asked
  // directly, the loader does not read a shelf the caller may not open.
  const { reads, snapshot } = await snapshotOf("search_inventory", {
    isOwner: false,
    areas: { orders: true, dashboard: true, customers: true, bankFeed: true },
    inventoryAccess: false
  });
  assert.ok(!touched(reads, "inventoryItems"));
  assert.strictEqual(snapshot.inventoryItems, undefined);
  // And with the grant, the same read happens — a gate that never opens would
  // satisfy the two lines above.
  const open = await snapshotOf("search_inventory", { inventoryAccess: true });
  assert.ok(touched(open.reads, "inventoryItems"), "the shelf is unreadable even to a caller who holds the grant");
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
  // Every cap the published capabilities can reach is reached, and every cap
  // they cannot is one whose DOMAIN nothing declares — derived from the
  // registry, not listed here, so a capability that stops declaring a domain
  // moves the expectation with it.
  //
  // This used to compare `seen` against every cap there is, which held while
  // ten capabilities between them declared all eleven domains. Since the
  // 6 September 2026 reduction the published set declares five, and the caps
  // behind bank, payouts, receiptInbox and accounting are unreachable — the
  // flags stay because `loaders.js` still writes them and `CAP_WARNINGS` still
  // has to have a sentence for each, which the check above pins.
  const CAP_DOMAIN = {
    ordersCapped: "orders", bankCapped: "bank", vendorsCapped: "bank", inventoryCapped: "inventory",
    payoutsCapped: "payouts", reviewCapped: "review", attentionCapped: "accounting",
    inboxCapped: "receiptInbox", connectionsCapped: "connections", commerceHealthCapped: "commerceHealth"
  };
  const declared = new Set(CAPABILITY_NAMES.flatMap((name) => registry.entryFor(name).domainNeeds || []));
  const reachable = Object.keys(envelope.CAP_WARNINGS).filter((flag) => {
    assert.ok(CAP_DOMAIN[flag], `${flag} has no domain in this test's map`);
    return declared.has(CAP_DOMAIN[flag]);
  });
  assert.ok(reachable.length > 0, "no cap is reachable at all, so the loop above proves nothing");
  assert.deepStrictEqual([...seen].sort(), reachable.sort(),
    "a cap a published capability can hit went unannounced, or one it cannot hit was raised");
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

check("no capability in this release reads a payout collection, for anybody", async () => {
  // Three checks stood here, and all three drove the payouts DOMAIN through a
  // capability that declared it: get_commerce_overview (a member holding money
  // but not Banking), get_payout_reconciliation_overview (the owner) and
  // get_business_attention_summary (a member holding neither). The 6 September
  // 2026 scope reduction removed all three capabilities, so each one called
  // `registry.entryFor` on a name that is now null.
  //
  // The finding they encode is still in loaders.js and still right: the payouts
  // domain is gated on `bankFeed` ALONE, never on a union with financialInfo,
  // because firestore.rules gates squarePayouts and paypalPayouts on
  // `canReadBankFeed` — owner OR memberAccess.bankFeed — and provenance is not
  // permission. What can no longer be tested is a capability reaching it, and
  // the reason is worth asserting in its place: nothing declares the domain, so
  // the collections are unreachable from this surface however the caller is
  // graded. That is derived from the registry, so the day a capability declares
  // `payouts` again this check fails and the gate test comes back with it.
  const declaring = CAPABILITY_NAMES.filter((name) => (registry.entryFor(name).domainNeeds || []).includes("payouts"));
  assert.deepStrictEqual(declaring, [],
    `${declaring.join(", ")} declares the payouts domain again; restore the bankFeed-alone gate checks with it`);

  // Not an argument from the declaration alone — the loader is run for every
  // published capability, as an OWNER holding every grant, and no payout
  // collection is touched by any of them.
  for (const name of CAPABILITY_NAMES) {
    const { reads, snapshot } = await snapshotOf(name);
    for (const collection of ["squarePayouts", "paypalPayouts"]) {
      assert.ok(!touched(reads, collection), `${name} read ${collection}`);
    }
    assert.strictEqual(snapshot.payouts, undefined,
      `${name}: a collection nobody read must not look like a collection that was empty`);
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
