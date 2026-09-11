// The three Sales callables against the fake Firestore: closed by default, the
// menu preference is an owner's setting rather than a permission, the list is a
// read that writes nothing at all, and a member of another workspace, a
// workflow-only member and a member without orders access are each refused.
const assert = require("assert");
const { makeFakeFirestore, FakeHttpsError } = require("./helpers/fakeFirestore");
const { createSalesFunctions } = require("../../sales");
const { resetSalesFlagCache } = require("../../sales/flags");
const { ENGINE_VERSION } = require("../../finance/engine");

const passthrough = (_options, handler) => handler;
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }
const rejects = (promise, code, pattern) => assert.rejects(promise, (error) => {
  assert.strictEqual(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
  if (pattern) assert.match(error.message, pattern);
  return true;
});

const ACCESS = {
  u_owner: { orders: true, financialInfo: true },
  u_member: { orders: true, financialInfo: true },
  u_nomoney: { orders: true, financialInfo: false },
  u_noorders: { orders: false, financialInfo: true },
  u_workflow: { orders: true, financialInfo: false },
  u_assigned: { orders: true, financialInfo: true, assignedProjectsOnly: true }
};
const ROLE = { u_owner: "owner", u_member: "member", u_nomoney: "member", u_noorders: "member", u_workflow: "workflowOnly", u_assigned: "member" };

const order = (id, extra = {}) => ({
  id, companyId: "c1", customerName: "Alex Morgan",
  lineItems: [{ id: `${id}-l1`, name: "Seamaster 300", quantity: 1, unitPrice: 1200, lineTotal: 1200 }],
  paidAmount: 1200, remainingAmount: 0, paymentDate: { toMillis: () => 1757600000000 },
  finance: { engineVersion: ENGINE_VERSION, revenue: 1200 }, ...extra
});

function build({ flag = null, orders = [] } = {}) {
  resetSalesFlagCache();
  const nowRef = { value: Date.parse("2026-09-12T09:00:00.000Z") };
  const store = makeFakeFirestore(nowRef);
  store.write("companies/c1", { name: "QA Sales Studio", ownerUid: "u_owner", members: Object.fromEntries(Object.keys(ROLE).map((uid) => [uid, { role: ROLE[uid] }])) });
  store.write("companies/other", { name: "Other", ownerUid: "u_stranger", members: { u_stranger: { role: "owner" } } });
  store.write("companySettings/c1", { seciliParaBirimi: "£", onboardingMainGoal: "connect_store" });
  if (flag) store.write("appConfig/sales", flag);
  const pages = [];
  const fns = createSalesFunctions({
    admin: store.admin, HttpsError: FakeHttpsError, onCall: passthrough,
    requireWorkspaceMember: async ({ auth, data }) => {
      if (!auth) throw new FakeHttpsError("unauthenticated", "You must be signed in.");
      const companyId = String(data?.companyId || "");
      const company = store.read(`companies/${companyId}`);
      if (!company) throw new FakeHttpsError("not-found", "Workspace not found.");
      if (!company.members || !company.members[auth.uid]) throw new FakeHttpsError("permission-denied", "You do not have access to this workspace.");
      return { uid: auth.uid, companyId, companyData: company };
    },
    memberAccessFor: (_companyData, uid) => ACCESS[uid] || { orders: false, financialInfo: false },
    roleFor: (_companyData, uid) => ROLE[uid] || "member",
    assignedOnlyFor: (_companyData, uid) => (ACCESS[uid] || {}).assignedProjectsOnly === true,
    engineVersion: ENGINE_VERSION,
    listOrdersPage: async ({ companyId, limit, cursor }) => { pages.push({ companyId, limit, cursor }); return { orders: orders.slice(0, limit) }; },
    now: () => nowRef.value
  });
  return { fns, store, pages, nowRef };
}

const owner = { uid: "u_owner", token: { email: "owner@example.invalid" } };
const member = { uid: "u_member", token: { email: "member@example.invalid" } };
const stranger = { uid: "u_stranger", token: { email: "stranger@example.invalid" } };
const OPEN = { enabled: true, workspaces: { c1: true } };

(async () => {
  await check("closed by default: no flag document means no Sales, and no write anywhere", async () => {
    const { fns, store } = build({ orders: [order("o1")] });
    const before = store.paths("companies/c1/salesSettings").length;
    const capability = await fns.getSalesCapability({ auth: owner, data: { companyId: "c1" } });
    assert.deepStrictEqual(
      { pilot: capability.pilotEnabled, menu: capability.showInMenu, open: capability.canOpenSales, reason: capability.reason },
      { pilot: false, menu: false, open: false, reason: "flag_off" }
    );
    const list = await fns.listSalesRows({ auth: owner, data: { companyId: "c1" } });
    assert.deepStrictEqual({ enabled: list.enabled, rows: list.rows.length, reason: list.reason }, { enabled: false, rows: 0, reason: "flag_off" });
    await rejects(fns.setSalesVisibility({ auth: owner, data: { companyId: "c1", visible: true } }), "failed-precondition", /not open/);
    assert.strictEqual(store.paths("companies/c1/salesSettings").length, before);
  });

  await check("the switch alone opens nothing: the workspace has to be named", async () => {
    const { fns } = build({ flag: { enabled: true, workspaces: {} }, orders: [order("o1")] });
    const capability = await fns.getSalesCapability({ auth: owner, data: { companyId: "c1" } });
    assert.strictEqual(capability.pilotEnabled, false);
    assert.strictEqual(capability.reason, "flag_off");
  });

  await check("in the pilot: the area opens, the menu waits for the workspace's own choice", async () => {
    const { fns, store } = build({ flag: OPEN, orders: [order("o1")] });
    const before = await fns.getSalesCapability({ auth: owner, data: { companyId: "c1" } });
    assert.deepStrictEqual(
      { pilot: before.pilotEnabled, open: before.canOpenSales, menu: before.showInMenu, visibility: before.visibility, manage: before.canManageVisibility, suggested: before.suggested },
      { pilot: true, open: true, menu: false, visibility: "unset", manage: true, suggested: true }
    );
    const set = await fns.setSalesVisibility({ auth: owner, data: { companyId: "c1", visible: true } });
    assert.deepStrictEqual({ ok: set.ok, visibility: set.visibility }, { ok: true, visibility: "on" });
    assert.strictEqual(store.read("companies/c1/salesSettings/main").visibility, "on");
    const after = await fns.getSalesCapability({ auth: owner, data: { companyId: "c1" } });
    assert.deepStrictEqual({ menu: after.showInMenu, reason: after.reason }, { menu: true, reason: "ok" });
  });

  await check("a member cannot change the workspace preference, and a stranger cannot ask at all", async () => {
    const { fns } = build({ flag: OPEN });
    await rejects(fns.setSalesVisibility({ auth: member, data: { companyId: "c1", visible: true } }), "permission-denied", /owner or an admin/);
    await rejects(fns.getSalesCapability({ auth: stranger, data: { companyId: "c1" } }), "permission-denied", /do not have access/);
    await rejects(fns.listSalesRows({ auth: stranger, data: { companyId: "c1" } }), "permission-denied", /do not have access/);
    await rejects(fns.listSalesRows({ auth: null, data: { companyId: "c1" } }), "unauthenticated");
  });

  await check("orders access is the gate: no orders, no Sales; workflow-only and assigned-only are refused", async () => {
    const { fns } = build({ flag: OPEN, orders: [order("o1")] });
    for (const uid of ["u_noorders", "u_workflow", "u_assigned"]) {
      const auth = { uid, token: { email: `${uid}@example.invalid` } };
      const capability = await fns.getSalesCapability({ auth, data: { companyId: "c1" } });
      assert.strictEqual(capability.canOpenSales, false, `${uid} must not open Sales`);
      await rejects(fns.listSalesRows({ auth, data: { companyId: "c1" } }), "permission-denied");
    }
  });

  await check("the list is a read: rows come back and nothing is written", async () => {
    const rows = [order("o1"), order("o2", { orderType: "repair", repairIntake: { customerOwned: true } }), order("o3", { isDeleted: true }), order("o4", { commerce: { provider: "woocommerce", externalId: "1042" } })];
    const { fns, store } = build({ flag: OPEN, orders: rows });
    const paths = () => store.paths("").length;
    const before = paths();
    const list = await fns.listSalesRows({ auth: owner, data: { companyId: "c1" } });
    assert.strictEqual(paths(), before, "the list wrote something");
    assert.strictEqual(list.companyId, "c1");
    assert.deepStrictEqual(list.rows.map((row) => row.orderId), ["o1", "o4"], "trashed and bespoke rows are out by default");
    assert.strictEqual(list.financeVisible, true);
    assert.strictEqual(list.rows[0].revenue, 1200);
    const withBespoke = await fns.listSalesRows({ auth: owner, data: { companyId: "c1", includeBespoke: true } });
    assert.deepStrictEqual(withBespoke.rows.map((row) => row.orderId), ["o1", "o2", "o4"]);
    const woo = await fns.listSalesRows({ auth: owner, data: { companyId: "c1", channel: "woocommerce" } });
    assert.deepStrictEqual(woo.rows.map((row) => row.orderId), ["o4"]);
    const attention = await fns.listSalesRows({ auth: owner, data: { companyId: "c1", needsAttentionOnly: true } });
    assert.ok(attention.rows.every((row) => row.needsAttention));
  });

  await check("a member without finance access gets the list without money", async () => {
    const { fns } = build({ flag: OPEN, orders: [order("o1")] });
    const list = await fns.listSalesRows({ auth: { uid: "u_nomoney", token: {} }, data: { companyId: "c1" } });
    assert.strictEqual(list.financeVisible, false);
    assert.deepStrictEqual({ revenue: list.rows[0].revenue, currency: list.rows[0].currency }, { revenue: null, currency: null });
  });

  await check("paging is the server's: the cursor goes down and comes back only while there is more", async () => {
    const many = Array.from({ length: 10 }, (_, index) => order(`o${index + 1}`));
    const { fns, pages } = build({ flag: OPEN, orders: many });
    const first = await fns.listSalesRows({ auth: owner, data: { companyId: "c1", limit: 3 } });
    assert.strictEqual(first.rows.length, 3);
    assert.strictEqual(pages[0].limit, 6, "the scan is wider than the page");
    assert.ok(first.nextCursor && first.nextCursor.id, "a full scan hands back a cursor");
    await fns.listSalesRows({ auth: owner, data: { companyId: "c1", limit: 3, cursor: first.nextCursor } });
    assert.deepStrictEqual(pages[1].cursor, first.nextCursor, "the cursor reaches the query unchanged");
    const { fns: short } = build({ flag: OPEN, orders: [order("o1")] });
    const last = await short.listSalesRows({ auth: owner, data: { companyId: "c1", limit: 3 } });
    assert.strictEqual(last.nextCursor, null, "the end of the list has no cursor");
  });

  await check("every answer names the workspace it was computed for", async () => {
    const { fns } = build({ flag: OPEN, orders: [order("o1")] });
    const capability = await fns.getSalesCapability({ auth: owner, data: { companyId: "c1" } });
    const list = await fns.listSalesRows({ auth: owner, data: { companyId: "c1" } });
    const set = await fns.setSalesVisibility({ auth: owner, data: { companyId: "c1", visible: false } });
    for (const answer of [capability, list, set]) assert.strictEqual(answer.companyId, "c1");
  });

  console.log(failures === 0 ? "\n✅ SALES CALLABLES GEÇTİ" : `\n❌ ${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
})();
