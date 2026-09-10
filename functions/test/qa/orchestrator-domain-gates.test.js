// Every domain the loader knows, and the gate on it — enumerated from the
// loader rather than from a list somebody maintains here.
//
// `readableDomain` was a `switch` whose `default` was `return true`, so a
// domain was gated by somebody having thought about it. Ten had been thought
// about. `payouts` had not: a member with the orders area and financial access
// and NO Banking had companies/{cid}/paypalPayouts read for them, and
// `commerce.settlementTotals` published its count, gross, fee and net under
// `data.settlements.paypal` — while get_payout_reconciliation_overview refused
// that same person outright with "Bank Spending is not enabled for your role".
// PayPal money, through the commerce overview, to somebody the banking tools
// had already said no to.
//
// Gating it as `bankFeed OR financialInfo` fixed the PayPal half and left the
// Square half exactly as it was: the SAME member still received
// `settlement: {available, count, net, currency}` per channel out of
// get_channel_performance, off `companies/{cid}/squarePayouts` — which
// firestore.rules refuses them outright, on `canReadBankFeed`, under a comment
// that reads "Processor payouts are money: readable with the bank feed". One
// gate, `areas.bankFeed`, is what the rules file asks, so it is what this asks.
//
// The fix for that one domain is a line. The fix for the SHAPE is this file
// plus the table it reads: `loaders.DOMAIN_GATES` has a row for every domain,
// every row is either a predicate or an `open: true` with its reason written
// beside it, and `readableDomain` returns false for a domain with no row at
// all. So the next domain fails the suite rather than a reviewer:
//
//   - a domain in DOMAINS with no row → "has no row in DOMAIN_GATES" below;
//   - a domain given `open: true` → must be added to REVIEWED_OPEN here, with
//     somebody having read the reason;
//   - a gated domain that a grant it does not name can open → caught by the
//     cross-product check;
//   - and for each gated domain, the caller-facing refusal is asserted as a
//     sentence, because "the read did not happen" is only half the promise. The
//     other half is that the answer says so.
//
// Run: node test/qa/orchestrator-domain-gates.test.js
const assert = require("assert");
const loadersModule = require("../../orchestrator/loaders");
const registry = require("../../orchestrator/registry");
const contextModule = require("../../orchestrator/context");
const envelope = require("../../orchestrator/envelope");
const { CAPABILITY_NAMES, HANDLERS } = require("../../orchestrator");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const asyncChecks = [];
const check = (name, run) => { asyncChecks.push([name, run]); };

const CID = "co_1";
const { DOMAINS, DOMAIN_GATES } = loadersModule;

/**
 * The domains that are open, and were read and judged open.
 *
 * Written here rather than derived from the table, because deriving it from the
 * thing under test is how "every domain is gated" becomes a sentence that
 * cannot fail. A new domain has to appear in one of two places — a predicate in
 * DOMAIN_GATES, or this list — and adding it to this list means saying, in a
 * commit, that a member with no grants may read it.
 */
const REVIEWED_OPEN = ["settings", "orders", "production", "connections", "commerceHealth", "review"];

/** Every grant a context can hold, and how it is spelled on the context. */
const GRANTS = Object.freeze({
  bankFeed: (ctx) => { ctx.areas.bankFeed = true; },
  accountingReader: (ctx) => { ctx.accountingReader = true; },
  inventoryAccess: (ctx) => { ctx.inventoryAccess = true; },
  financialInfo: (ctx) => { ctx.financialInfo = true; }
});

/** A member with the orders area and not one financial or inventory grant. */
function bareContext(overrides = {}) {
  return fixtures.ownerContext({
    uid: "u_member",
    isOwner: false,
    role: "member",
    areas: { orders: true, dashboard: true, customers: true, bankFeed: false },
    financialInfo: false,
    accountingReader: false,
    inventoryAccess: false,
    companyId: CID,
    ...overrides
  });
}

/** A bare member holding exactly the named grants. */
function contextWith(...grants) {
  const ctx = bareContext();
  for (const grant of grants) GRANTS[grant](ctx);
  return ctx;
}

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

/** One document in every collection, so a read that happens has something to find. */
const SEED = {
  siparisler: [{ companyId: CID, status: "In Progress", paidAmount: 10, remainingAmount: 0, createdAt: "2026-09-01", paymentDate: "2026-09-01" }],
  [`companies/${CID}/inventoryItems`]: [{ name: "Bar", trackingType: "quantity", quantity: { onHand: 1, reserved: 0 }, status: "available" }],
  [`companies/${CID}/bankTransactions`]: [{ amount: -50, currency: "GBP", bookingDate: "2026-09-01", category: "", reviewStatus: "unreviewed" }],
  [`companies/${CID}/bankVendors`]: [{ name: "Adobe", keys: ["ADOBE"], cadence: "monthly" }],
  [`companies/${CID}/bankReceiptInbox`]: [{ status: "waiting", createdAtMs: fixtures.NOW - 1000 }],
  [`companies/${CID}/squarePayouts`]: [{ provider: "square", status: "PAID", amount: 10, currency: "GBP", arrivalDate: "2026-09-01", totals: { gross: 10, fee: 0, net: 10 } }],
  [`companies/${CID}/paypalPayouts`]: [{ provider: "paypal", status: "PAID", amount: 4200.55, currency: "GBP", arrivalDate: "2026-09-01", totals: { gross: 4400, fee: -199.45, net: 4200.55 } }],
  [`companies/${CID}/bankConnections`]: [{ provider: "truelayer", institutionName: "HSBC", syncState: "ok", lastSyncedAtMs: fixtures.NOW }],
  [`companies/${CID}/accountingConnections`]: [{ provider: "quickbooks", companyName: "Co", mode: "read_only", status: "connected" }],
  [`companies/${CID}/accountingAttention`]: [{ provider: "quickbooks", kind: "changed", severity: "warning", message: "changed", status: "open" }]
};

/** A Firestore handle that records the paths it was asked for. */
function recorder(seed = {}) {
  const reads = [];
  const docsFor = (path) => (seed[path] || []).map((data, index) => ({ id: String(data.id || `d${index}`), data: () => data }));
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
      const data = seed[path] || null;
      return { exists: Boolean(data), data: () => data || {} };
    }
  });
  const collection = (path) => ({ ...query(path), doc: (id) => doc(`${path}/${id}`) });
  return { db: () => ({ collection: (name) => collection(name) }), reads };
}

/** The domains each read belongs to, for one capability and one caller. */
async function domainsRead(capability, ctx) {
  const { db, reads } = recorder(SEED);
  const loaders = loadersModule.createLoaders({ db, now: () => fixtures.NOW });
  const entry = registry.entryFor(capability);
  const snapshot = await loaders.snapshotFor(entry.domainNeeds || [], ctx, { settings: fixtures.settings });
  const domains = new Set();
  for (const path of reads) {
    const segments = path.split("/");
    const name = segments[0] === "companies" ? segments[2] : segments[0];
    // The company document itself is not a domain read.
    if (!name) continue;
    assert.ok(COLLECTION_DOMAIN[name], `${capability} read "${path}", which this test does not know a domain for`);
    domains.add(COLLECTION_DOMAIN[name]);
  }
  return { domains, snapshot };
}

/** Which capabilities declare a domain, from the registry. */
const capabilitiesDeclaring = (domain) => CAPABILITY_NAMES
  .filter((name) => ((registry.entryFor(name) || {}).domainNeeds || []).includes(domain));

/** The grants that open a domain, read off the table's own predicate. */
function grantsThatOpen(domain) {
  return Object.keys(GRANTS).filter((grant) => loadersModule.readableDomain(domain, contextWith(grant)));
}

check("every domain the loader knows has an explicit row, and nothing else does", () => {
  assert.deepStrictEqual([...DOMAINS].sort(), Object.keys(DOMAIN_GATES).sort(),
    "DOMAINS and DOMAIN_GATES disagree: a domain with no row reads nothing, and a row with no domain is decoration");
  for (const [domain, gate] of Object.entries(DOMAIN_GATES)) {
    assert.ok(gate && typeof gate === "object", `${domain} has no row in DOMAIN_GATES`);
    assert.ok(typeof gate.why === "string" && gate.why.length > 30,
      `${domain} is gated or opened without a reason anybody can read`);
    if (gate.open === true) {
      assert.ok(REVIEWED_OPEN.includes(domain),
        `${domain} is open to a member with no grants and is not in this test's reviewed list — add it deliberately, or gate it`);
    } else {
      assert.strictEqual(typeof gate.allows, "function", `${domain} is neither open nor gated by a predicate`);
      assert.ok(typeof gate.grant === "string" && gate.grant.length > 0, `${domain}'s row does not name the grant it asks for`);
    }
  }
  // And the reviewed list is not stale: everything in it is still a domain, and
  // still open.
  for (const domain of REVIEWED_OPEN) {
    assert.ok(DOMAINS.includes(domain), `${domain} is reviewed-open here but is no longer a domain`);
    assert.strictEqual((DOMAIN_GATES[domain] || {}).open, true, `${domain} is gated now, so it does not belong in the reviewed-open list`);
  }
});

check("a domain nobody wrote a row for is refused, even to the owner", () => {
  // The `default: return true` that let payouts through. A domain this table
  // has never heard of is the same situation as a domain somebody adds next
  // month and forgets to gate, and the answer to both is no.
  for (const domain of ["payoutsV2", "customerMessages", "payroll", "", "constructor", "toString", "__proto__"]) {
    assert.strictEqual(loadersModule.readableDomain(domain, fixtures.ownerContext()), false,
      `an undeclared domain "${domain}" is readable — the gate defaults to yes again`);
  }
});

check("every gated domain refuses a caller who holds none of its grants", () => {
  const bare = bareContext();
  for (const domain of DOMAINS) {
    if ((DOMAIN_GATES[domain] || {}).open === true) continue;
    assert.strictEqual(loadersModule.readableDomain(domain, bare), false,
      `${domain} is readable by a member with the orders area and nothing else`);
    // And with the grants it names, it opens — a gate that never opens is a
    // feature that does not work.
    const opening = grantsThatOpen(domain);
    assert.ok(opening.length > 0, `${domain} is closed to every grant there is`);
    for (const grant of opening) {
      assert.strictEqual(loadersModule.readableDomain(domain, contextWith(grant)), true, `${domain} refused ${grant}`);
    }
    // Every grant that is NOT one of its own leaves it shut. This is the check
    // that would have caught payouts: `financialInfo` alone opening `bank`, or
    // `inventoryAccess` opening anything else, is the same defect one column
    // over.
    for (const grant of Object.keys(GRANTS)) {
      if (opening.includes(grant)) continue;
      assert.strictEqual(loadersModule.readableDomain(domain, contextWith(grant)), false,
        `${grant} opens ${domain}, which asks for ${DOMAIN_GATES[domain].grant}`);
    }
  }
});

check("the grants each gated domain opens on are the ones its row says", () => {
  // The row is documentation until something reads it. `grant` is prose, so it
  // is compared by NAME against the behaviour: every grant named in the row
  // opens the domain, and no grant outside it does.
  for (const domain of DOMAINS) {
    const gate = DOMAIN_GATES[domain] || {};
    if (gate.open === true) continue;
    assert.strictEqual(typeof gate.allows, "function", `${domain} has no row in DOMAIN_GATES`);
    const named = Object.keys(GRANTS).filter((grant) => gate.grant.includes(grant));
    assert.deepStrictEqual(grantsThatOpen(domain).sort(), named.sort(),
      `${domain} says it asks for "${gate.grant}" and behaves differently`);
  }
});

check("no capability reads a gated domain for a caller without its grant", async () => {
  // The promise is not "the gate is a function that returns false"; it is that
  // no document is read. Every capability that declares a gated domain is run
  // for a caller holding every grant EXCEPT the ones that open it, over a
  // workspace with a document in every collection.
  for (const domain of DOMAINS) {
    const gate = DOMAIN_GATES[domain] || {};
    if (gate.open === true) continue;
    assert.strictEqual(typeof gate.allows, "function", `${domain} has no row in DOMAIN_GATES`);
    const opening = grantsThatOpen(domain);
    const held = Object.keys(GRANTS).filter((grant) => !opening.includes(grant));
    const ctx = contextWith(...held);
    for (const capability of capabilitiesDeclaring(domain)) {
      const entry = registry.entryFor(capability);
      // The capability's own gate may refuse first; that is the stronger
      // refusal and it is asserted in the next check.
      let refused = false;
      try { contextModule.assertCapability(ctx, entry); } catch (error) { refused = true; }
      if (refused) continue;
      const { domains } = await domainsRead(capability, ctx);
      assert.ok(!domains.has(domain),
        `${capability} read ${domain} documents for a caller holding only ${held.join(", ") || "the orders area"}`);
    }
  }
});

/**
 * The sentence a caller actually sees, per grant. These are `context.js`'s own
 * words; a refusal names the area and never its contents.
 */
const REFUSALS = {
  bankFeed: "Bank Spending is not enabled for your role. Ask the workspace owner to grant it in Team Access.",
  accountingReader: "Accounting is not enabled for your role. Ask the workspace owner to grant it in Team Access.",
  inventoryAccess: "Inventory is not enabled for your role. Ask the workspace owner to grant it in Team Access.",
  financialInfo: "You do not have access to financial information in this workspace."
};

check("a refused caller is told, in the words the caller reads", async () => {
  // Two shapes of refusal, and every gated domain a capability can reach
  // produces at least one of them. A capability whose whole subject is the
  // gated domain refuses at the door; a capability with a SECTION over it
  // answers and names the section it left out. Silence is neither, and silence
  // reads as "nothing to report".
  //
  // A gated domain NO published capability declares is a third case, and it
  // arrived with the 6 September 2026 reduction: `bank`, `receiptInbox`,
  // `payouts` and `accounting` are gated in the loader and nothing on this
  // surface asks for them any more. There is no refusal to word because there
  // is no read to refuse, and demanding one would be demanding a sentence about
  // an answer nobody can ask for. Which domains those are is asserted below,
  // from the registry, so this cannot quietly become an excuse for a domain a
  // capability really does declare.
  const said = new Set();
  const unreachable = [];
  for (const domain of DOMAINS) {
    const gate = DOMAIN_GATES[domain] || {};
    if (gate.open === true) continue;
    assert.strictEqual(typeof gate.allows, "function", `${domain} has no row in DOMAIN_GATES`);
    const opening = grantsThatOpen(domain);
    const ctx = contextWith(...Object.keys(GRANTS).filter((grant) => !opening.includes(grant)));
    if (capabilitiesDeclaring(domain).length === 0) { unreachable.push(domain); continue; }
    let toldSomewhere = false;
    for (const capability of capabilitiesDeclaring(domain)) {
      const entry = registry.entryFor(capability);
      try {
        contextModule.assertCapability(ctx, entry);
      } catch (error) {
        assert.strictEqual(error.code, "permission-denied", `${capability} refused with ${error.code}`);
        assert.ok(Object.values(REFUSALS).includes(error.message),
          `${capability} refuses with a sentence this test does not know: "${error.message}"`);
        // A refusal names the area, never what is behind it.
        for (const value of ["£", "GBP", "4200", "HSBC"]) {
          assert.ok(!error.message.includes(value), `${capability}'s refusal quotes data: "${error.message}"`);
        }
        said.add(`${domain}:refused`);
        toldSomewhere = true;
        continue;
      }
      // Reached the loader: the answer must name the section rather than come
      // back quietly short.
      const { snapshot } = await domainsRead(capability, ctx);
      const result = HANDLERS[capability](snapshot, {}, ctx, { nowMs: fixtures.NOW }) || {};
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
      const notPermitted = built.warnings.filter((row) => row.code === "section_not_permitted");
      if (notPermitted.length > 0) {
        for (const row of notPermitted) {
          assert.ok(/not included for your role\.$/.test(row.message),
            `${capability}: "${row.message}" is not the sentence a caller is told`);
        }
        said.add(`${domain}:named`);
        toldSomewhere = true;
      }
    }
    assert.ok(toldSomewhere,
      `${domain} is refused in silence: no capability that declares it either refuses the caller or names the section`);
  }
  assert.deepStrictEqual(unreachable.sort(), ["accounting", "bank", "payouts", "receiptInbox"],
    "a gated domain became unreachable, or a capability started declaring one that was — either way this check's exemption list is wrong");
  assert.ok(said.size >= 1, "no refusal was observed at all, so the wording above is not under test");
});

check("no published capability can read a payout, bank or accounting collection at all", async () => {
  // What this check used to be, and why it is now stronger.
  //
  // It pinned a finding: a member with the orders area and financial access and
  // NO Banking had companies/{cid}/paypalPayouts read for them, and
  // `commerce.settlementTotals` published its count, gross, fee and net under
  // `data.settlements.paypal` — while get_payout_reconciliation_overview
  // refused that same person outright. Gating the domain fixed the PayPal half
  // and left the Square half standing, because get_channel_performance had no
  // gate of any kind.
  //
  // All three of those capabilities left the release on 6 September 2026, along
  // with every other one that reported money. So the assertion is no longer
  // "the gate holds for a member without Banking" — it is that the money is not
  // reachable from this surface AT ALL: no published capability declares those
  // domains, and driving every one of them as an OWNER, the caller who holds
  // every grant there is, touches none of those collections.
  //
  // Read as an owner on purpose: a gate that refuses a member proves the gate,
  // and this is proving something else — that there is nothing behind it to
  // read. If a money capability is ever published again, its own domain gate
  // comes back with it and this check turns red, which is the right place for
  // that decision to surface.
  const MONEY_COLLECTIONS = ["squarePayouts", "paypalPayouts", "bankTransactions", "bankVendors", "bankReceiptInbox", "accountingAttention", "pandleConnection"];
  const owner = fixtures.ownerContext({ companyId: CID });
  assert.ok(CAPABILITY_NAMES.length > 0, "nothing is published, so this check covers nothing");
  for (const capability of CAPABILITY_NAMES) {
    const { db, reads } = recorder(SEED);
    const loaders = loadersModule.createLoaders({ db, now: () => fixtures.NOW });
    const entry = registry.entryFor(capability);
    const snapshot = await loaders.snapshotFor(entry.domainNeeds || [], owner, { settings: fixtures.settings });
    for (const path of reads) {
      const segments = path.split("/");
      const name = segments[0] === "companies" ? segments[2] : segments[0];
      assert.ok(!MONEY_COLLECTIONS.includes(name),
        `${capability} read ${path} for an owner: a money collection is reachable from the published surface again`);
    }
    assert.strictEqual(snapshot.payouts, undefined, `${capability} was handed a payout feed`);
    assert.strictEqual(snapshot.bankRows, undefined, `${capability} was handed bank transactions`);
    // And the fixture really would have shown it: the same recorder reads the
    // seeded PayPal payout when a domain asks for it.
    const proof = recorder(SEED);
    const feed = await loadersModule.createLoaders({ db: proof.db, now: () => fixtures.NOW })
      .snapshotFor(["settings", "payouts"], owner, { settings: fixtures.settings });
    assert.ok(Array.isArray(feed.payouts.paypal) && feed.payouts.paypal.length > 0,
      "the payout seed no longer loads even when a domain asks for it, so the absence above proves nothing");
  }

  // The registry side of the same statement, said directly: no published row
  // asks for money.
  for (const name of CAPABILITY_NAMES) {
    const declared = registry.entryFor(name).domainNeeds || [];
    for (const domain of ["payouts", "bank", "receiptInbox", "accounting"]) {
      assert.ok(!declared.includes(domain), `${name} declares the ${domain} domain again`);
    }
  }
});

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  console.log(failures === 0 ? "\nEvery domain the loader knows is gated or deliberately open." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
