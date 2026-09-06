// What the assistant is allowed to see, and what it is allowed to call.
//
// Three separate holes, none of them a bug in a rule — all three were rules
// that existed and were simply not consulted on this path:
//
//   1. Every order the assistant returned carried paidAmount, remainingAmount
//      and watchPurchasePrice with no finance check. For a Workflow Only member
//      that walks through a wall the Firestore rules put up on purpose: they
//      cannot read /siparisler at all, and the substitute view they DO get
//      leaves exactly those three fields out.
//   2. The workspace's "Orders" switch was never asked about, so an owner who
//      unticked it for somebody found the assistant was a way round it.
//   3. A tool hidden from tools/list for an app review still answered when
//      called by name, because the list and the dispatcher were two lists.
const assert = require("assert");
const api = require("../../index");

const safeOrder = api._nvSafeOrderForChatGPT;
const requireOrdersArea = api._nvRequireOrdersArea;
const availableActions = api._nvMcpAvailableActions;
const dispatch = api._nvChatGPTDispatchAction;

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const ORDER = {
  id: "o1",
  data: () => ({
    companyId: "acme", customerName: "Jane", designName: "Ring", status: "In Progress",
    paidAmount: 120, remainingAmount: 30, watchPurchasePrice: 40, deliveryTime: 14
  })
};

/** A workspace with one owner and one member in the given role. */
function workspace(role, access = {}) {
  return {
    __workspaceId: "acme",
    ownerUid: "owner-uid",
    members: { "owner-uid": { role: "owner" }, "member-uid": { role } },
    memberRoles: { "owner-uid": "owner", "member-uid": role },
    memberAccess: { "member-uid": access }
  };
}
const ctx = (role, access) => ({ uid: "member-uid", companyData: workspace(role, access) });
const ownerCtx = () => ({ uid: "owner-uid", companyData: workspace("member") });

const MONEY = ["paidAmount", "remainingAmount", "watchPurchasePrice"];

check("the owner still sees the money", () => {
  const order = safeOrder(ORDER, ownerCtx());
  for (const key of MONEY) assert.ok(key in order, `owner lost ${key}`);
  assert.strictEqual(order.paidAmount, 120);
});

check("an ordinary member with finance access still sees the money", () => {
  const order = safeOrder(ORDER, ctx("member"));
  for (const key of MONEY) assert.ok(key in order, `member lost ${key}`);
});

check("a Workflow Only member sees none of it", () => {
  const order = safeOrder(ORDER, ctx("workflowOnly"));
  for (const key of MONEY) assert.ok(!(key in order), `workflowOnly still sees ${key}`);
  // And still sees the work, which is the whole point of the role.
  assert.strictEqual(order.customerName, "Jane");
  assert.strictEqual(order.designName, "Ring");
  assert.strictEqual(order.status, "In Progress");
});

check("a View Only member sees none of it either", () => {
  const order = safeOrder(ORDER, ctx("viewer"));
  for (const key of MONEY) assert.ok(!(key in order), `viewer still sees ${key}`);
});

check("a member whose finance access was switched off sees none of it", () => {
  const order = safeOrder(ORDER, ctx("member", { financialInfo: false }));
  for (const key of MONEY) assert.ok(!(key in order), `still sees ${key} with financialInfo off`);
  const cardOff = safeOrder(ORDER, ctx("member", { cardFinancial: false }));
  for (const key of MONEY) assert.ok(!(key in cardOff), `still sees ${key} with cardFinancial off`);
});

check("a caller that forgets the context gets the redacted answer, not the permissive one", () => {
  // The dangerous default. A new call site that omits the context must lose the
  // money, not gain it.
  for (const missing of [undefined, null, {}]) {
    const order = safeOrder(ORDER, missing);
    for (const key of MONEY) assert.ok(!(key in order), `${JSON.stringify(missing)} leaked ${key}`);
  }
});

// ---- the Orders switch ----------------------------------------------------
check("the Orders switch is honoured", () => {
  assert.throws(() => requireOrdersArea(ctx("member", { orders: false })), /Orders/);
  assert.doesNotThrow(() => requireOrdersArea(ctx("member", { orders: true })));
  assert.doesNotThrow(() => requireOrdersArea(ctx("member")));
});

check("the owner cannot lock themselves out of their own workspace", () => {
  assert.doesNotThrow(() => requireOrdersArea({ uid: "owner-uid", companyData: workspace("member") }));
});

// ---- the tool list and the dispatcher are one list -------------------------
check("a tool hidden for review is not merely hidden", async () => {
  // NIVADESK_MCP_INVENTORY is off in this process, so tools/list does not
  // advertise the inventory tools. Calling one by name must fail too.
  assert.ok(!availableActions().includes("search_inventory"), "the list should not advertise it");
  await assert.rejects(
    async () => dispatch(ctx("member"), "search_inventory", {}),
    /Unknown action/,
    "a hidden tool answered when called by name"
  );
});

check("an invented tool name is refused", async () => {
  await assert.rejects(async () => dispatch(ctx("member"), "delete_everything", {}), /Unknown action/);
});

check("the advertised tools are all really dispatchable", () => {
  // The other direction of the same drift: a name on the list with no case
  // behind it would fail at the call with a confusing error.
  const source = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "index.js"), "utf8");
  const body = source.slice(
    source.indexOf("function nvChatGPTDispatchAction("),
    source.indexOf("\n}\n", source.indexOf("function nvChatGPTDispatchAction("))
  );
  for (const action of availableActions()) {
    assert.ok(body.includes(`case "${action}"`), `${action} is advertised but has no case`);
  }
});

// ---- what the assistant says came in ---------------------------------------
//
// A positive amount is not automatically income. Moving money between the
// owner's own accounts, putting money in, a loan, a card processor's payout of
// sales already counted when they happened — all arrive positive and none is
// revenue. The four human-facing bank screens have always known that; the
// assistant read the sign alone, so an owner who moved £5,000 between their own
// accounts was told they had earned it.
const bank = require("../../bank/classification");

check("a transfer between the owner's own accounts is not income", () => {
  const rows = [
    { amount: 100, incomingKind: "order_payment" },
    { amount: 5000, incomingKind: "transfer" },
    { amount: 800, incomingKind: "owner_contribution" },
    { amount: 2000, incomingKind: "loan" },
    { amount: 640, incomingKind: "payout" }
  ];
  assert.strictEqual(bank.summarizeRows(rows).incoming, 100);
});

check("a refund going out is not an expense", () => {
  const rows = [
    { amount: -30, category: "Materials" },
    { amount: -120, outgoingKind: "customer_refund" },
    { amount: -45, outgoingKind: "chargeback" }
  ];
  assert.strictEqual(bank.summarizeRows(rows).totalSpent, 30);
});

check("an outgoing kind nobody has invented yet is still not an expense", () => {
  // The contract the bank module writes down is that a row leaves the spending
  // totals the moment it carries an outgoingKind — not that it matches a list.
  assert.strictEqual(bank.isSpendRow({ amount: -50, outgoingKind: "some_future_kind" }), false);
});

check("ordinary money still counts, both ways", () => {
  const summary = bank.summarizeRows([
    { amount: 240, incomingKind: "order_payment" },
    { amount: 60, incomingKind: "" },
    { amount: -90 }
  ]);
  assert.strictEqual(summary.incoming, 300);
  assert.strictEqual(summary.totalSpent, 90);
  assert.strictEqual(summary.net, 210);
});

check("what was set aside is reported, not silently dropped", () => {
  const summary = bank.summarizeRows([
    { amount: 100, incomingKind: "order_payment" },
    { amount: 5000, incomingKind: "transfer" },
    { amount: -120, outgoingKind: "customer_refund" }
  ]);
  assert.strictEqual(summary.excluded, 5120);
});

check("nonsense rows cannot move a total", () => {
  const summary = bank.summarizeRows([{ amount: "abc" }, {}, null, { amount: 0 }, { amount: NaN }]);
  assert.deepStrictEqual(summary, { incoming: 0, totalSpent: 0, net: 0, excluded: 0 });
  assert.deepStrictEqual(bank.summarizeRows("not a list"), { incoming: 0, totalSpent: 0, net: 0, excluded: 0 });
});

check("the assistant's loader actually carries the two fields", () => {
  // The rule cannot be applied to a row that never had the fields on it. This
  // was the whole defect: the projection dropped them, so no downstream filter
  // could have worked even if it had existed.
  const source = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "index.js"), "utf8");
  const loader = source.slice(
    source.indexOf("async function nvLoadBankTransactions("),
    source.indexOf("async function nvLoadBankTransactions(") + 1800
  );
  assert.ok(/incomingKind: nvCleanString/.test(loader), "the loader drops incomingKind");
  assert.ok(/outgoingKind: nvCleanString/.test(loader), "the loader drops outgoingKind");
});

// ---- the orchestrator resolves the SAME role the app resolves ---------------
//
// A workspace can hand somebody a custom role whose baseRole is workflowOnly.
// Only workspaceMemberRole knows that: it reads memberCustomRoles, follows the
// id into customRoles and returns the base role. An orchestrator that re-derived
// the role from members[uid].role saw a plain "member", so the assigned-orders
// filter never ran and the payments/banking/payouts sections opened.
const orchestrator = api._nvOrchestrator;
const workflowOnlyInApp = api._nvWorkflowOnlyContext;

/** A workspace where the member's role lives ONLY in a custom role. */
function customRoleWorkspace(baseRole) {
  return {
    __workspaceId: "acme",
    ownerUid: "owner-uid",
    members: { "owner-uid": { role: "owner" }, "member-uid": { role: "member" } },
    memberCustomRoles: { "member-uid": "custom_bench01" },
    customRoles: { custom_bench01: { name: "Bench", baseRole } },
    memberAccess: { "member-uid": { orders: true } }
  };
}

const contextOver = (companyData, uid) => orchestrator.resolveContext(
  { uid, companyId: "acme", scope: "orders.read finance.read" },
  { loadCompany: async () => ({ companyData, settings: {} }) }
);

check("a workflow-only member on a custom role is workflow-only to the orchestrator too", async () => {
  const companyData = customRoleWorkspace("workflowOnly");
  assert.strictEqual(workflowOnlyInApp({ companyData, uid: "member-uid" }), true, "the app's own answer");
  const ctxOut = await contextOver(companyData, "member-uid");
  assert.strictEqual(ctxOut.role, "workflowOnly", "the orchestrator read members[uid].role instead of the custom role");
  assert.strictEqual(ctxOut.workflowOnly, true, "so the assigned-orders filter in loaders.js would never have run");

  const sections = require("../../orchestrator/context").sectionAccess(ctxOut);
  for (const section of ["payments", "banking", "payouts", "accounting"]) {
    assert.strictEqual(sections[section], false, `${section} was opened to a workflow-only member`);
  }
});

check("a member on an ordinary custom role keeps the base role that role carries", async () => {
  const companyData = customRoleWorkspace("member");
  assert.strictEqual(workflowOnlyInApp({ companyData, uid: "member-uid" }), false);
  const ctxOut = await contextOver(companyData, "member-uid");
  assert.strictEqual(ctxOut.role, "member");
  assert.strictEqual(ctxOut.workflowOnly, false, "an ordinary member must not be narrowed to their own assignments");
});

check("a member entry stored as a bare string still resolves", async () => {
  // Older workspaces store `members: { uid: "workflowOnly" }`. The app's
  // resolver copes with it; an inline `members[uid].role` reads undefined.
  const companyData = {
    __workspaceId: "acme",
    ownerUid: "owner-uid",
    members: { "owner-uid": "owner", "member-uid": "workflowOnly" },
    memberAccess: { "member-uid": { orders: true } }
  };
  assert.strictEqual(workflowOnlyInApp({ companyData, uid: "member-uid" }), true);
  const ctxOut = await contextOver(companyData, "member-uid");
  assert.strictEqual(ctxOut.workflowOnly, true);
});

check("the owner is still the owner", async () => {
  const ctxOut = await contextOver(customRoleWorkspace("workflowOnly"), "owner-uid");
  assert.strictEqual(ctxOut.role, "owner");
  assert.strictEqual(ctxOut.workflowOnly, false);
});

check("the assistant's totals go through the shared rule, not the sign", () => {
  const source = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "index.js"), "utf8");
  assert.ok(!/rows\.filter\(\(tx\) => tx\.amount > 0\)/.test(source), "an incoming total still reads the sign alone");
  assert.ok(/rows\.filter\(nvIsRevenueRow\)/.test(source), "the incoming total uses the shared rule");
  assert.ok(/list\.filter\(nvIsSpendRow\)/.test(source), "the spending total uses the shared rule");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ MCP PERMISSIONS GEÇTİ");
})();
