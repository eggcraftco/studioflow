// The assigned-only query needs a composite index the production database may
// not have yet. When Firestore refuses for that reason the server must still
// answer correctly — by reading the workspace's page and filtering on the
// server — and it must never hand back an order that belongs to somebody else.
// Any other error stays an error.
const assert = require("assert");
const { createSalesFunctions } = require("../../sales");
const { resetSalesFlagCache } = require("../../sales/flags");
const { ENGINE_VERSION } = require("../../finance/engine");

let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }

class FakeHttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const ORDERS = [
  { id: "mine", companyId: "c1", assignedToUid: "u_assigned", customerName: "A", lineItems: [], paidAmount: 0, remainingAmount: 0, paymentDate: { toMillis: () => 1757600000000 } },
  { id: "theirs", companyId: "c1", assignedToUid: "u_other", customerName: "B", lineItems: [], paidAmount: 0, remainingAmount: 0, paymentDate: { toMillis: () => 1757600000000 } }
];

/** A Firestore stub that refuses the assigned query the way a missing index does. */
function stubAdmin({ failAssigned = true, failureCode = "9", failureMessage = "The query requires an index." } = {}) {
  const calls = [];
  const makeQuery = (filters) => ({
    where: (field, _op, value) => makeQuery([...filters, { field, value }]),
    orderBy: () => makeQuery(filters),
    startAfter: () => makeQuery(filters),
    limit: () => makeQuery(filters),
    get: async () => {
      const assigned = filters.find((f) => f.field === "assignedToUid");
      calls.push(assigned ? { assigned: assigned.value } : { assigned: null });
      if (assigned && failAssigned) { const error = new Error(failureMessage); error.code = failureCode; throw error; }
      const rows = ORDERS.filter((row) => !assigned || row.assignedToUid === assigned.value);
      return { docs: rows.map((row) => ({ id: row.id, data: () => row })) };
    }
  });
  const firestore = () => ({
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ exists: name === "appConfig" && id === "sales", data: () => (name === "appConfig" ? { enabled: true, workspaces: { c1: true } } : {}) }),
        collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => {} }) })
      }),
      where: (field, op, value) => makeQuery([{ field, value }])
    })
  });
  firestore.Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms }) };
  firestore.FieldPath = { documentId: () => "__name__" };
  return { admin: { firestore }, calls };
}

function build(options) {
  resetSalesFlagCache();
  const { admin, calls } = stubAdmin(options);
  const fns = createSalesFunctions({
    admin, HttpsError: FakeHttpsError, onCall: (_o, handler) => handler,
    requireWorkspaceMember: async ({ data }) => ({ uid: "u_assigned", companyId: String(data?.companyId || ""), companyData: {} }),
    memberAccessFor: () => ({ orders: true, financialInfo: true, assignedProjectsOnly: true }),
    roleFor: () => "member",
    assignedOnlyFor: () => true,
    engineVersion: ENGINE_VERSION
  });
  return { fns, calls };
}
const auth = { uid: "u_assigned", token: {} };

(async () => {
  await check("without the index the server filters, and only that member's order comes back", async () => {
    const { fns, calls } = build({ failAssigned: true });
    const list = await fns.listSalesRows({ auth, data: { companyId: "c1", limit: 10 } });
    assert.deepStrictEqual(list.rows.map((row) => row.orderId), ["mine"], "somebody else's order reached an assigned-only list");
    assert.deepStrictEqual(calls.map((call) => (call.assigned ? "assigned" : "workspace")), ["assigned", "workspace"], "the indexed query must be tried first");
  });

  await check("with the index the assigned query answers on its own", async () => {
    const { fns, calls } = build({ failAssigned: false });
    const list = await fns.listSalesRows({ auth, data: { companyId: "c1", limit: 10 } });
    assert.deepStrictEqual(list.rows.map((row) => row.orderId), ["mine"]);
    assert.deepStrictEqual(calls.map((call) => (call.assigned ? "assigned" : "workspace")), ["assigned"], "no second read is needed");
  });

  await check("any other failure is still a failure: it is not swallowed by the fallback", async () => {
    const { fns } = build({ failAssigned: true, failureCode: "7", failureMessage: "Missing or insufficient permissions." });
    await assert.rejects(fns.listSalesRows({ auth, data: { companyId: "c1", limit: 10 } }), /insufficient permissions/);
  });

  console.log(failures === 0 ? "\n✅ SALES ASSIGNED FALLBACK GEÇTİ" : `\n❌ ${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
})();
