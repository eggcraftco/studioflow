// Who the orchestrator lets in, and what it refuses to let out.
//
// The risk this file exists for: an assistant that becomes the loose door into
// data an owner closed. Every gate below is the app's own predicate, injected —
// so what is really being asserted is that the orchestrator ASKS, and asks
// before it reads.
//
// Run: node test/qa/orchestrator-context.test.js
const assert = require("assert");
const context = require("../../orchestrator/context");
const registry = require("../../orchestrator/registry");
const { createOrchestrator } = require("../../orchestrator");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};
const asyncChecks = [];
const checkAsync = (name, run) => { asyncChecks.push([name, run]); };

/** Predicates that behave like the app's, driven by a plain company document. */
function deps(overrides = {}) {
  const base = {
    loadCompany: async (companyId) => ({
      companyData: { ownerUid: "u_owner", __workspaceId: companyId, ...(overrides.companyData || {}) },
      settings: fixtures.settings
    }),
    uidHasCompanyAccess: (companyData, uid) =>
      companyData.ownerUid === uid || Boolean((companyData.members || {})[uid]) && !((companyData.suspendedMembers || {})[uid]),
    uidIsCompanyOwner: (companyData, uid) => companyData.ownerUid === uid,
    uidCanAccessWorkspaceArea: (companyData, uid, area) => ((companyData.memberAccess || {})[uid] || {})[area] === true,
    // The app's resolver, standing in for workspaceMemberRole: the test scripts
    // what it answers instead of copying how it decides, because what is being
    // asserted is that the orchestrator ASKS it.
    workspaceMemberRole: (companyData, uid) =>
      String((companyData.roles || {})[uid] || (companyData.ownerUid === uid ? "owner" : "unknown")),
    normalizeWorkspaceRole: (value) => String(value || "member"),
    billingEntitlementsForCompany: () => ({ advancedFinanceEnabled: true, bankFeedEnabled: true, chatgptAppEnabled: true }),
    roleCanAccessFinancialInfo: (companyData, uid) => companyData.ownerUid === uid || ((companyData.memberAccess || {})[uid] || {}).financialInfo === true,
    accountingReaderCanRead: (companyData, uid) => companyData.ownerUid === uid || ((companyData.memberAccess || {})[uid] || {}).bankFeed === true,
    inventoryAccessAllowed: (companyData, uid) => companyData.ownerUid === uid
  };
  return { ...base, ...overrides, companyData: undefined };
}

function orchestratorWith(overrides = {}, snapshot = fixtures.mixedSnapshot()) {
  return createOrchestrator({
    ...deps(overrides),
    flags: { orchestrator: true },
    now: () => snapshot.nowMs,
    loaders: { loadCompany: deps(overrides).loadCompany, snapshotFor: async () => snapshot }
  });
}

checkAsync("resolveContext builds every area a registry row is allowed to name", async () => {
  // `assertCapability` reads `ctx.areas[permission.area]`, so an area this
  // function does not build is `undefined` and refuses the owner as flatly as a
  // stranger. It built four keys while ten rows named `notes` or
  // `financialInfo`; `orchestrator-contract.test.js` pins the registry side of
  // that, and this is the other half — the context really carrying them, out of
  // the app's own `uidCanAccessWorkspaceArea` rather than a literal here.
  const companyData = {
    ownerUid: "u_owner",
    members: { u_member: true },
    memberAccess: { u_member: { orders: true, notes: true, financialInfo: true } }
  };
  const loadCompany = async () => ({ companyData, settings: fixtures.settings });
  const orchestrator = createOrchestrator({
    ...deps(), loadCompany, flags: { orchestrator: true },
    loaders: { loadCompany, snapshotFor: async () => fixtures.mixedSnapshot() }
  });

  for (const uid of ["u_owner", "u_member"]) {
    const ctx = await orchestrator.resolveContext({ uid, companyId: "co_1", scope: "orders.read notes.read finance.read" });
    assert.deepStrictEqual(Object.keys(ctx.areas).sort(), [...context.AREA_KEYS].sort(),
      `${uid}: ctx.areas does not carry every area a registry row may name`);
    for (const area of context.AREA_KEYS) {
      assert.strictEqual(typeof ctx.areas[area], "boolean", `${uid}: ctx.areas.${area} is ${ctx.areas[area]}`);
    }
    assert.strictEqual(ctx.areas.notes, true, `${uid} was granted notes and did not get it`);
  }

  // And the area is still ASKED for, not assumed: a member without it is
  // refused by the notes row.
  const noNotes = { ...companyData, memberAccess: { u_member: { orders: true, notes: false } } };
  const strict = createOrchestrator({
    ...deps(), loadCompany: async () => ({ companyData: noNotes, settings: fixtures.settings }), flags: { orchestrator: true },
    loaders: { loadCompany: async () => ({ companyData: noNotes, settings: fixtures.settings }), snapshotFor: async () => fixtures.mixedSnapshot() }
  });
  const denied = await strict.resolveContext({ uid: "u_member", companyId: "co_1", scope: "notes.read notes.write" });
  assert.strictEqual(denied.areas.notes, false);
  assert.throws(() => context.assertCapability(denied, registry.entryFor("search_notes")), /does not include notes/);
});

checkAsync("a member whose access was revoked is refused on the next call, not the next cache expiry", async () => {
  // The company document is read per request. A gateway that cached it would
  // keep serving somebody whose membership was removed a minute ago.
  let members = { u_member: true };
  const loadCompany = async () => ({ companyData: { ownerUid: "u_owner", members, memberAccess: { u_member: { orders: true } } }, settings: fixtures.settings });
  const orchestrator = createOrchestrator({
    ...deps(),
    loadCompany,
    loaders: { loadCompany, snapshotFor: async () => fixtures.mixedSnapshot() },
    flags: { orchestrator: true }
  });
  const ok = await orchestrator.resolveContext({ uid: "u_member", companyId: "co_1", scope: "orders.read" });
  assert.strictEqual(ok.uid, "u_member");
  members = {};
  await assert.rejects(
    () => orchestrator.resolveContext({ uid: "u_member", companyId: "co_1", scope: "orders.read" }),
    /do not have access/
  );
});

checkAsync("a suspended member is refused even though the members map still lists them", async () => {
  const loadCompany = async () => ({ companyData: { ownerUid: "u_owner", members: { u_seat: true }, suspendedMembers: { u_seat: true } }, settings: {} });
  const orchestrator = createOrchestrator({ ...deps(), loadCompany, loaders: { loadCompany, snapshotFor: async () => fixtures.mixedSnapshot() }, flags: { orchestrator: true } });
  await assert.rejects(() => orchestrator.resolveContext({ uid: "u_seat", companyId: "co_1" }), /do not have access/);
});

checkAsync("a companyId in the arguments is a lookup key, never a grant", async () => {
  const loadCompany = async (companyId) => ({ companyData: { ownerUid: "somebody_else", __workspaceId: companyId }, settings: {} });
  const orchestrator = createOrchestrator({ ...deps(), loadCompany, loaders: { loadCompany, snapshotFor: async () => fixtures.mixedSnapshot() }, flags: { orchestrator: true } });
  await assert.rejects(() => orchestrator.resolveContext({ uid: "u_outsider", companyId: "someone_elses_workspace" }), /do not have access/);
});

/**
 * Each permission field a registry row can carry, the grant that withholding it
 * means, and the sentence assertCapability owes the caller when it is missing.
 *
 * This drives the gate check off the REGISTRY instead of a written-out list of
 * capability/override pairs. The list that stood here named seven capabilities,
 * five of which the 6 September 2026 scope reduction removed — so five of its
 * seven rows called `registry.entryFor` on a name that returns null, and
 * `assertCapability(ctx, null)` throws "Unknown capability", which matched no
 * expected message and failed. Worse than failing: had any of those regexes
 * been loose enough to match, the row would have passed while testing nothing.
 * A gate table keyed on permission FIELDS covers whatever the registry holds,
 * including capabilities that do not exist yet.
 */
/**
 * The capabilities `assertCapability` actually governs: the orchestrator's own
 * dispatch set, read from the module rather than listed here.
 *
 * Not "everything the registry publishes" — the 19 legacy tools are gated by the
 * nvRequire* guards in index.js and never reach this function, so sweeping them
 * into these loops asserts that assertCapability refuses a tool it was never
 * asked about. mcp-reduced-surface.test.js holds this set and the registry to
 * each other in both directions, so reading it here cannot drift from what is
 * published.
 */
const GOVERNED = require("../../orchestrator").CAPABILITY_NAMES;

const GATE_WITHHOLDINGS = [
  { field: "ownerOnly", withhold: () => ({ isOwner: false }), expect: /workspace owner/ },
  { field: "financial", withhold: () => ({ financialInfo: false }), expect: /financial information/ },
  { field: "bankFeed", withhold: () => ({ areas: { orders: true, dashboard: true, customers: true, bankFeed: false } }), expect: /Bank Spending/ },
  { field: "accountingReader", withhold: () => ({ accountingReader: false }), expect: /Accounting/ },
  { field: "inventory", withhold: () => ({ inventoryAccess: false }), expect: /Inventory/ }
];

check("each capability's gate is the workspace area it belongs to", () => {
  const published = GOVERNED.map((name) => registry.entryFor(name));
  let gatesChecked = 0;
  for (const entry of published) {
    const permission = entry.permission || {};
    // The area gate, which names its area rather than being a boolean.
    if (permission.area) {
      const ctx = fixtures.ownerContext({
        isOwner: false,
        areas: { ...fixtures.ownerContext().areas, [permission.area]: false }
      });
      assert.throws(() => context.assertCapability(ctx, entry),
        new RegExp(`does not include ${permission.area}`), `${entry.name}: the ${permission.area} area gate did not fire`);
      gatesChecked += 1;
    }
    for (const gate of GATE_WITHHOLDINGS) {
      if (permission[gate.field] !== true) continue;
      const ctx = fixtures.ownerContext({ isOwner: false, ...gate.withhold() });
      assert.throws(() => context.assertCapability(ctx, entry), gate.expect,
        `${entry.name}: permission.${gate.field} did not gate the call`);
      gatesChecked += 1;
    }
    // And with every grant held, the same capability answers — so the check
    // above is a gate firing rather than a capability that always refuses.
    assert.doesNotThrow(() => context.assertCapability(fixtures.ownerContext(), entry),
      `${entry.name} refuses an owner holding every grant`);
  }
  assert.ok(gatesChecked >= published.length,
    `only ${gatesChecked} gate(s) fired across ${published.length} published capabilities`);
});

check("the accounting gate is stricter than the bankFeed area, and is not substituted for it", () => {
  // A custom role can be granted the bankFeed AREA without the explicit
  // per-member bank grant the accounting callables ask for. The assistant must
  // use the same, stricter predicate the callables use.
  //
  // The two capabilities this was demonstrated on — get_accounting_sync_status
  // and get_banking_attention_summary — are both out of the release, so there
  // is no published capability left carrying either gate. The RULE still lives
  // in assertCapability and is what a future accounting capability will be held
  // to, so it is checked directly on the predicate rather than deleted with the
  // capabilities that happened to be its first callers.
  const ctx = fixtures.ownerContext({ isOwner: false, areas: { orders: true, bankFeed: true }, accountingReader: false });
  const accountingEntry = { name: "probe", scopes: ["finance.read"], permission: { accountingReader: true } };
  const bankEntry = { name: "probe", scopes: ["finance.read"], permission: { bankFeed: true } };
  assert.throws(() => context.assertCapability(ctx, accountingEntry), /Accounting/,
    "the bankFeed area was accepted in place of the accounting reader grant");
  assert.doesNotThrow(() => context.assertCapability(ctx, bankEntry),
    "the accounting grant was demanded of a capability that only asks for the bank feed");
  // And no published capability quietly carries one gate while meaning the other.
  for (const name of GOVERNED) {
    const permission = registry.entryFor(name).permission || {};
    assert.ok(!(permission.accountingReader && permission.bankFeed),
      `${name} carries both the accounting and the bank-feed gate; say which one owns its data`);
  }
});

check("the inventory section is gated by the inventory predicate, not by the orders area", () => {
  // nvRequireInventoryAccess is owner, OR the orders area AND an order role
  // that can fully edit. A member sitting between those two is refused both
  // inventory tools and — while sectionAccess read ctx.areas.orders — was
  // handed the same shelf by the attention summary's stock_low item. One body
  // of data, one predicate.
  const ctx = fixtures.ownerContext({
    isOwner: false,
    areas: { orders: true, dashboard: true, customers: true, bankFeed: true },
    inventoryAccess: false
  });
  // get_inventory_overview stood beside search_inventory here and is out of the
  // release; the surviving inventory capability carries the same gate, and it
  // is read from the registry so a second one arriving is covered too.
  const inventoryTools = GOVERNED.filter((name) => (registry.entryFor(name).permission || {}).inventory === true);
  assert.deepStrictEqual(inventoryTools, ["search_inventory"],
    "the set of inventory-gated capabilities changed; this check should cover all of them");
  for (const name of inventoryTools) {
    assert.throws(() => context.assertCapability(ctx, registry.entryFor(name)), /Inventory/, `${name} was not inventory-gated`);
  }
  const sections = context.sectionAccess(ctx);
  assert.strictEqual(sections.inventory, false, "the summary opened a section both inventory tools refuse");
  // Everything the orders area really does grant is untouched.
  assert.strictEqual(sections.orders, true);
  assert.strictEqual(sections.integrations, true);
  assert.strictEqual(context.sectionAccess(fixtures.ownerContext()).inventory, true);
});

check("a token without the scope a capability asks for cannot call it", () => {
  // Over every published capability, with the scope each one declares, rather
  // than on the single capability that used to be named here.
  for (const name of GOVERNED) {
    const entry = registry.entryFor(name);
    const wrong = fixtures.ownerContext({ scope: ["notes.read"] });
    assert.throws(() => context.assertCapability(wrong, entry), /scope/, `${name} answered a token holding only notes.read`);
    const withScope = fixtures.ownerContext({ scope: entry.scopes });
    assert.doesNotThrow(() => context.assertCapability(withScope, entry),
      `${name} refused a token granted exactly the scopes it asks for`);
  }
});

check("the plan entitlement for the ChatGPT connection is honoured", () => {
  for (const name of GOVERNED) {
    const entry = registry.entryFor(name);
    const ctx = fixtures.ownerContext({ entitlements: { chatgptAppEnabled: false } });
    assert.throws(() => context.assertCapability(ctx, entry), /plan/, `${name} answered a workspace whose plan excludes the connection`);
    // The same workspace over WhatsApp is not gated by the ChatGPT entitlement.
    const wa = fixtures.ownerContext({ entitlements: { chatgptAppEnabled: false }, channel: { type: "whatsapp", profile: null } });
    assert.doesNotThrow(() => context.assertCapability(wa, entry), `${name} applied the ChatGPT entitlement to a WhatsApp binding`);
  }
});

checkAsync("the role is whatever the app's resolver says, not what the members map looks like", async () => {
  // The failure this pins: a member whose role lives in a custom role reads as
  // a plain `member` to anything that looks at members[uid].role, and a
  // workflow-only member who resolves as `member` loses the assigned-orders
  // filter and gains payments, banking and payouts.
  const companyData = {
    ownerUid: "u_owner",
    members: { u_bench: { role: "member" } },
    memberAccess: { u_bench: { orders: true } },
    // Only the resolver can see this.
    roles: { u_bench: "workflowOnly" }
  };
  const loadCompany = async () => ({ companyData, settings: fixtures.settings });
  const orchestrator = createOrchestrator({
    ...deps(), loadCompany, flags: { orchestrator: true },
    loaders: { loadCompany, snapshotFor: async () => fixtures.mixedSnapshot() }
  });
  const ctx = await orchestrator.resolveContext({ uid: "u_bench", companyId: "co_1", scope: "orders.read" });
  assert.strictEqual(ctx.role, "workflowOnly");
  assert.strictEqual(ctx.workflowOnly, true, "the orchestrator re-derived the role instead of asking");
  assert.strictEqual(ctx.assignedOnly, true);
  const sections = context.sectionAccess(ctx);
  assert.strictEqual(sections.payments, false);
  assert.strictEqual(sections.banking, false);
  assert.strictEqual(sections.payouts, false);
});

checkAsync("an orchestrator built without the resolver refuses rather than guessing", async () => {
  // Failing closed matters more than the message: the guess a missing resolver
  // would have to make is "member", which is the loosest role in the table.
  const loadCompany = async () => ({ companyData: { ownerUid: "u_owner", members: { u_bench: true } }, settings: {} });
  const orchestrator = createOrchestrator({
    ...deps(), workspaceMemberRole: undefined, loadCompany, flags: { orchestrator: true },
    loaders: { loadCompany, snapshotFor: async () => fixtures.mixedSnapshot() }
  });
  await assert.rejects(
    () => orchestrator.resolveContext({ uid: "u_bench", companyId: "co_1" }),
    /workspace role resolver/
  );
});

check("a workflow-only member with no grants sees no money and no banking sections", () => {
  // The role as `workspaceMemberAccess` actually leaves it: dashboard,
  // financialInfo, customers and cardFinancial forced false, and every grant
  // an owner has not handed out still off.
  const ctx = fixtures.ownerContext({
    isOwner: false, workflowOnly: true, financialInfo: false, accountingReader: false,
    areas: { orders: true, dashboard: false, customers: false, bankFeed: false }
  });
  const sections = context.sectionAccess(ctx);
  assert.strictEqual(sections.orders, true);
  assert.strictEqual(sections.payments, false);
  assert.strictEqual(sections.banking, false);
  assert.strictEqual(sections.payouts, false);
  assert.strictEqual(sections.accounting, false);
});

check("every section line is the SAME predicate as the capability that owns the data", () => {
  // The comment above sectionAccess claims this, and for three lines it was
  // false: `banking`, `payouts` and `accounting` carried `&& !ctx.workflowOnly`
  // while their capabilities carry `permission.bankFeed` /
  // `permission.accountingReader` and nothing else — and so does the app's own
  // nvRequireBankFeedAccess. A workflow-only member granted Bank Spending was
  // told "banking items are not included for your role" by the summary and
  // answered in full by the banking tool, in one session.
  //
  // A claim of parity is checkable, so it is checked, over every combination of
  // the four grants and both roles rather than at one example.
  //
  // WHAT THE 6 SEPTEMBER 2026 REDUCTION DID TO THIS CHECK. `SECTION_OWNERS`
  // lived in context.js and named an owning capability for all eight sections.
  // Six of those capabilities are no longer in the release, so six of its rows
  // named something `registry.entryFor` returns null for — a parity claim with
  // nothing on the other side of it. The table is gone from context.js and the
  // owner mapping lives here, in the test that is the only thing that ever read
  // it, with each owner VERIFIED against the registry rather than asserted.
  //
  // The sections whose owner went out of the release are not skipped quietly:
  // `sectionAccess` has exactly one caller, `attention.js`, and that module has
  // no registry row and nothing on the live require graph reaches it
  // (test/qa/mcp-reduced-surface.test.js). So those six lines cannot reach any
  // client at all, and that — not a weaker version of the parity claim — is
  // what is asserted about them below.
  const SECTION_OWNERS = { orders: "search_commerce_orders", shipping: "search_commerce_orders" };
  const UNOWNED_IN_THIS_RELEASE = {
    payments: "get_commerce_overview", inventory: "get_inventory_overview",
    banking: "get_banking_attention_summary", payouts: "get_payout_reconciliation_overview",
    accounting: "get_accounting_sync_status", integrations: "get_integration_health"
  };
  for (const [section, capability] of Object.entries(SECTION_OWNERS)) {
    assert.ok(registry.entryFor(capability),
      `SECTION_OWNERS names ${capability} for "${section}", and the registry does not have it`);
  }
  for (const [section, capability] of Object.entries(UNOWNED_IN_THIS_RELEASE)) {
    assert.strictEqual(registry.entryFor(capability), null,
      `"${section}" owner ${capability} is published again: move it into SECTION_OWNERS so its line is held to the capability's gate`);
  }
  const GRANTS = ["bankFeed", "financialInfo", "accountingReader", "inventoryAccess"];
  let combinations = 0;
  for (let mask = 0; mask < (1 << GRANTS.length); mask += 1) {
    for (const workflowOnly of [false, true]) {
      const held = new Set(GRANTS.filter((_, index) => (mask & (1 << index)) !== 0));
      // The orders area is held throughout: without it nothing reaches
      // attention.js, the only caller of sectionAccess, so the population under
      // test is exactly the population this function is evaluated over.
      const ctx = fixtures.ownerContext({
        isOwner: false,
        role: workflowOnly ? "workflowOnly" : "member",
        workflowOnly,
        assignedOnly: workflowOnly,
        areas: { orders: true, dashboard: true, customers: true, bankFeed: held.has("bankFeed") },
        financialInfo: held.has("financialInfo"),
        accountingReader: held.has("accountingReader"),
        inventoryAccess: held.has("inventoryAccess")
      });
      const sections = context.sectionAccess(ctx);
      for (const [section, capability] of Object.entries(SECTION_OWNERS)) {
        const entry = registry.entryFor(capability);
        let allowed = true;
        try { context.assertCapability(ctx, entry); } catch (error) { allowed = false; }
        assert.strictEqual(sections[section], allowed,
          `section "${section}" says ${sections[section]} while ${capability} says ${allowed} — ` +
          `grants: ${[...held].join(", ") || "none"}${workflowOnly ? ", workflowOnly" : ""}`);
      }
      combinations += 1;
    }
  }
  assert.strictEqual(combinations, 32, "the cross-product stopped covering every grant combination");
  // And every section is accounted for: one of the two lists above, and no
  // third state. A section added without saying who owns its data is a
  // predicate nothing is holding to anything.
  assert.deepStrictEqual(
    Object.keys(context.sectionAccess(fixtures.ownerContext())).sort(),
    [...Object.keys(SECTION_OWNERS), ...Object.keys(UNOWNED_IN_THIS_RELEASE)].sort(),
    "a section was added or removed without saying which capability owns its data"
  );
});

check("the workflow-only member the summary contradicted gets one answer now", () => {
  // The finding itself, as the session that produced it: a workflow-only member
  // holding Bank Spending and the accounting reader.
  const ctx = fixtures.ownerContext({
    isOwner: false, role: "workflowOnly", workflowOnly: true, assignedOnly: true,
    financialInfo: false, inventoryAccess: false, accountingReader: true,
    areas: { orders: true, dashboard: false, customers: false, bankFeed: true }
  });
  const sections = context.sectionAccess(ctx);
  // The three capabilities that made the contradiction visible — the banking
  // summary, the payout overview and the accounting status — are all out of the
  // release. What was WRONG was never those three tools: it was that
  // sectionAccess carried `&& !ctx.workflowOnly` where the gate it claimed to
  // copy carried only `permission.bankFeed` / `permission.accountingReader`. So
  // the check keeps the member and keeps the finding, and states it against the
  // gate rather than against capabilities that no longer exist to disagree.
  for (const [section, permission] of [
    ["banking", { bankFeed: true }],
    ["payouts", { bankFeed: true }],
    ["accounting", { accountingReader: true }]
  ]) {
    assert.doesNotThrow(() => context.assertCapability(ctx, { name: section, scopes: ["finance.read"], permission }),
      `the ${section} gate refuses this member, so the section must be closed rather than the capability opened`);
    assert.strictEqual(sections[section], true,
      `the summary reports "${section}" as not permitted while its own gate lets this member through`);
  }
  // The grants this member does NOT hold are still closed, so the fix is not
  // "open everything to workflow-only".
  assert.strictEqual(sections.payments, false);
  assert.strictEqual(sections.inventory, false);
});

checkAsync("an unknown capability, and a capability whose flag is off, are both refused", async () => {
  const snapshot = fixtures.mixedSnapshot();
  const orchestrator = orchestratorWith({}, snapshot);
  const ctx = await orchestrator.resolveContext({ uid: "u_owner", companyId: "co_1", scope: "orders.read finance.read" });
  await assert.rejects(() => orchestrator.run({ capability: "delete_everything", args: {}, ctx }), /Unknown capability/);

  const off = createOrchestrator({
    ...deps(),
    flags: {},
    loaders: { loadCompany: deps().loadCompany, snapshotFor: async () => snapshot }
  });
  await assert.rejects(() => off.run({ capability: "search_commerce_orders", args: {}, ctx }), /not switched on/);
  assert.deepStrictEqual(off.listCapabilities(), [], "with the flag off the orchestrator publishes nothing");
});

checkAsync("permission is checked BEFORE anything is read", async () => {
  // §38. A gate that runs after the read has already handed the data to the
  // process that was not allowed to ask for it.
  let readAttempted = false;
  const loadCompany = async () => ({ companyData: { ownerUid: "u_owner", members: { u_view: true }, memberAccess: { u_view: { orders: true } } }, settings: {} });
  const orchestrator = createOrchestrator({
    ...deps(),
    loadCompany,
    flags: { orchestrator: true },
    loaders: { loadCompany, snapshotFor: async () => { readAttempted = true; return fixtures.mixedSnapshot(); } }
  });
  const ctx = await orchestrator.resolveContext({ uid: "u_view", companyId: "co_1", scope: "orders.read finance.read" });
  // The vehicle was get_commerce_overview and its `permission.financial` gate,
  // which the reduction removed with the capability. `search_inventory` is
  // published and carries `permission.inventory`, and a member holding only the
  // orders area is refused by it — the same gate-before-read shape.
  await assert.rejects(() => orchestrator.run({ capability: "search_inventory", args: {}, ctx }), /Inventory/);
  assert.strictEqual(readAttempted, false, "the loader ran despite the refusal");
});

checkAsync("only the domains a capability declares are read", async () => {
  const snapshot = fixtures.mixedSnapshot();
  let requested = null;
  const orchestrator = createOrchestrator({
    ...deps(),
    flags: { orchestrator: true },
    now: () => snapshot.nowMs,
    loaders: { loadCompany: deps().loadCompany, snapshotFor: async (domains) => { requested = domains; return snapshot; } }
  });
  const ctx = await orchestrator.resolveContext({ uid: "u_owner", companyId: "co_1", scope: "orders.read" });
  // Deliberately the OLD name: `search_inventory_items` is an alias of
  // `search_inventory` now, and an alias that stops resolving is a channel that
  // stops working. Resolving it here means the alias is exercised by a test
  // that is about something else, which is where a dead alias would show up.
  const answer = await orchestrator.run({ capability: "search_inventory_items", args: {}, ctx });
  assert.strictEqual(answer.action, "search_inventory", "the envelope names the tool that answered, not the alias that was typed");
  assert.deepStrictEqual(requested, ["settings", "inventory"], "an inventory search must not drag orders and connections in behind it");
});

checkAsync("every gate reads the document loadCompany returned for this call, and nothing the caller passed with it", async () => {
  // context.js rule 1. The header used to promise a `companyDataHint`
  // parameter — "a caller-supplied snapshot is accepted only as
  // companyDataHint, for display, and no gate reads it" — that resolveContext
  // has never taken. The rule it should have stated is this one, and it is
  // worth a test rather than a sentence: the caller here hands in a snapshot
  // that would make it the owner of everything, and the document read for this
  // request says it is a member with nothing.
  let loads = 0;
  const readForThisRequest = { ownerUid: "u_owner", members: { u_member: true }, memberAccess: { u_member: {} } };
  const loadCompany = async () => { loads += 1; return { companyData: readForThisRequest, settings: fixtures.settings }; };
  const orchestrator = createOrchestrator({
    ...deps(),
    loadCompany,
    loaders: { loadCompany, snapshotFor: async () => fixtures.mixedSnapshot() },
    flags: { orchestrator: true }
  });

  const forged = { ownerUid: "u_member", members: { u_member: true }, memberAccess: { u_member: { orders: true, bankFeed: true, financialInfo: true } } };
  const ctx = await orchestrator.resolveContext({
    uid: "u_member",
    companyId: "co_1",
    scope: "orders.read finance.read",
    // Both spellings a caller might reach for, including the one the header
    // used to promise.
    companyData: forged,
    companyDataHint: forged
  });

  assert.strictEqual(ctx.companyData, readForThisRequest, "the context carries a document the caller supplied");
  assert.strictEqual(ctx.isOwner, false, "a caller-supplied snapshot made its holder the owner");
  assert.strictEqual(ctx.areas.orders, false);
  assert.strictEqual(ctx.areas.bankFeed, false);
  assert.strictEqual(ctx.financialInfo, false);
  // The refusal is taken on the gate rather than on a named capability: the one
  // that stood here, get_banking_attention_summary, is out of the release, and
  // the claim being made is about where `ctx.areas` came from, not about which
  // tool asked.
  assert.throws(
    () => context.assertCapability(ctx, { name: "probe", scopes: ["finance.read"], permission: { bankFeed: true } }),
    /Bank Spending is not enabled/
  );
  // And on a capability that IS published, over the area it declares.
  assert.throws(
    () => context.assertCapability(ctx, registry.entryFor("search_commerce_orders")),
    /does not include orders/
  );

  // And it is read again on the next call rather than carried over: that is
  // the whole of what "for THIS request" buys.
  await orchestrator.resolveContext({ uid: "u_member", companyId: "co_1", scope: "orders.read" });
  assert.strictEqual(loads, 2, "the company document was not re-read for the second request");
});

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  console.log(failures === 0 ? "\nAll context checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
