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

check("each capability's gate is the workspace area it belongs to", () => {
  const cases = [
    ["get_commerce_overview", { financialInfo: false }, /financial information/],
    ["get_channel_performance", { financialInfo: false }, /financial information/],
    ["search_commerce_orders", { areas: { orders: false, bankFeed: true } }, /does not include orders/],
    ["get_payout_reconciliation_overview", { areas: { orders: true, bankFeed: false } }, /Bank Spending/],
    ["get_banking_attention_summary", { areas: { orders: true, bankFeed: false } }, /Bank Spending/],
    ["get_accounting_sync_status", { accountingReader: false }, /Accounting/],
    ["get_inventory_overview", { inventoryAccess: false }, /Inventory/]
  ];
  for (const [name, override, expected] of cases) {
    const ctx = fixtures.ownerContext({ isOwner: false, ...override });
    assert.throws(() => context.assertCapability(ctx, registry.entryFor(name)), expected, `${name} was not gated`);
  }
});

check("the accounting gate is stricter than the bankFeed area, and is not substituted for it", () => {
  // A custom role can be granted the bankFeed AREA without the explicit
  // per-member bank grant the accounting callables ask for. The assistant must
  // use the same, stricter predicate the callables use.
  const ctx = fixtures.ownerContext({ isOwner: false, areas: { orders: true, bankFeed: true }, accountingReader: false });
  assert.throws(() => context.assertCapability(ctx, registry.entryFor("get_accounting_sync_status")), /Accounting/);
  assert.doesNotThrow(() => context.assertCapability(ctx, registry.entryFor("get_banking_attention_summary")));
});

check("a token without the scope a capability asks for cannot call it", () => {
  const ctx = fixtures.ownerContext({ scope: ["notes.read"] });
  assert.throws(() => context.assertCapability(ctx, registry.entryFor("get_commerce_overview")), /scope/);
  const withScope = fixtures.ownerContext({ scope: ["orders.read", "finance.read"] });
  assert.doesNotThrow(() => context.assertCapability(withScope, registry.entryFor("get_commerce_overview")));
});

check("the plan entitlement for the ChatGPT connection is honoured", () => {
  const ctx = fixtures.ownerContext({ entitlements: { chatgptAppEnabled: false } });
  assert.throws(() => context.assertCapability(ctx, registry.entryFor("get_commerce_overview")), /plan/);
  // The same workspace over WhatsApp is not gated by the ChatGPT entitlement.
  const wa = fixtures.ownerContext({ entitlements: { chatgptAppEnabled: false }, channel: { type: "whatsapp", profile: null } });
  assert.doesNotThrow(() => context.assertCapability(wa, registry.entryFor("get_commerce_overview")));
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

check("a workflow-only member sees no money and no banking sections", () => {
  const ctx = fixtures.ownerContext({
    isOwner: false, workflowOnly: true, financialInfo: false,
    areas: { orders: true, dashboard: false, customers: false, bankFeed: false }
  });
  const sections = context.sectionAccess(ctx);
  assert.strictEqual(sections.orders, true);
  assert.strictEqual(sections.payments, false);
  assert.strictEqual(sections.banking, false);
  assert.strictEqual(sections.payouts, false);
  assert.strictEqual(sections.accounting, false);
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
  await assert.rejects(() => off.run({ capability: "get_commerce_overview", args: {}, ctx }), /not switched on/);
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
  await assert.rejects(() => orchestrator.run({ capability: "get_commerce_overview", args: {}, ctx }), /financial information/);
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
  await orchestrator.run({ capability: "search_inventory_items", args: {}, ctx });
  assert.deepStrictEqual(requested, ["settings", "inventory"], "an inventory search must not drag orders and connections in behind it");
});

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  console.log(failures === 0 ? "\nAll context checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
