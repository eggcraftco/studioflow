// The index file against the query that actually runs.
//
// Faz 1's list is a Firestore query, and a Firestore query either has a
// composite index shaped exactly like it or it fails in production with
// FAILED_PRECONDITION. Nothing here restates the fields by hand: the real
// `defaultListOrdersPage` inside functions/sales/index.js is run against a
// recording client, and what it asks Firestore for IS the input to the
// comparison. A copy of the query written into the test would only confirm the
// copy. The record and firestore.indexes.json are then checked against that.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createSalesFunctions } = require("../../sales");
const { resetSalesFlagCache } = require("../../sales/flags");

let failures = 0;
function check(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => console.log("PASS ", name))
    .catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 400)); });
}

const DOCUMENT_ID = Symbol("FieldPath.documentId");

/** A Firestore stand-in that answers nothing and remembers everything it was asked. */
function recordingAdmin(docs) {
  const shapes = [];
  const snapshotOf = (p) => ({ exists: Object.prototype.hasOwnProperty.call(docs, p), data: () => docs[p] || {} });
  const docRef = (p) => ({
    id: p.split("/").pop(),
    get: async () => snapshotOf(p),
    set: async () => undefined,
    collection: (name) => collectionRef(`${p}/${name}`)
  });
  const collectionRef = (p) => {
    const build = (shape) => ({
      where: (field, op, value) => build({ ...shape, filters: [...shape.filters, { field, op, value }] }),
      orderBy: (field, direction = "asc") => build({ ...shape, orders: [...shape.orders, { field: field === DOCUMENT_ID ? "__name__" : field, direction }] }),
      startAfter: (...values) => build({ ...shape, cursorValues: values.length }),
      limit: (count) => build({ ...shape, limit: count }),
      get: async () => { shapes.push(shape); return { docs: [], empty: true }; }
    });
    return Object.assign(build({ collection: p, filters: [], orders: [], cursorValues: 0, limit: 0 }), {
      doc: (id) => docRef(`${p}/${id}`)
    });
  };
  const firestore = () => ({ collection: (name) => collectionRef(name) });
  firestore.FieldPath = { documentId: () => DOCUMENT_ID };
  firestore.Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms, __ts: ms }) };
  firestore.FieldValue = { serverTimestamp: () => ({}) };
  return { admin: { firestore }, shapes };
}

class FakeHttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

/** Runs the REAL listSalesRows — the injectable pager is deliberately not used. */
async function recordQuery({ assignedOnly = false, cursor = null } = {}) {
  resetSalesFlagCache();
  const { admin, shapes } = recordingAdmin({
    "appConfig/sales": { enabled: true, workspaces: { c1: true } },
    "companies/c1/salesSettings/main": { visibility: "on" },
    "companySettings/c1": { seciliParaBirimi: "£" }
  });
  const fns = createSalesFunctions({
    admin, HttpsError: FakeHttpsError, onCall: (_options, handler) => handler,
    requireWorkspaceMember: async ({ auth, data }) => ({ uid: auth.uid, companyId: String(data.companyId), companyData: { ownerUid: "u_owner" } }),
    memberAccessFor: () => ({ orders: true, financialInfo: true }),
    roleFor: () => "member",
    assignedOnlyFor: () => assignedOnly,
    engineVersion: 4
  });
  await fns.listSalesRows({ auth: { uid: "u_member" }, data: { companyId: "c1", cursor } });
  const orderQueries = shapes.filter((shape) => shape.collection === "siparisler");
  assert.strictEqual(orderQueries.length, 1, `expected one orders query, saw ${orderQueries.length}`);
  return orderQueries[0];
}

/** The composite index a shape needs: equalities first, then the ordered fields. */
function requiredIndex(shape) {
  const equalities = shape.filters.filter((f) => f.op === "==").map((f) => f.field);
  const ordered = shape.orders.filter((o) => o.field !== "__name__");
  return {
    collectionGroup: shape.collection,
    fields: [
      ...equalities.map((fieldPath) => ({ fieldPath, order: "ASCENDING" })),
      ...ordered.map((o) => ({ fieldPath: o.field, order: o.direction === "desc" ? "DESCENDING" : "ASCENDING" }))
    ]
  };
}

const indexFile = path.join(__dirname, "..", "..", "..", "firestore.indexes.json");
const parsed = JSON.parse(fs.readFileSync(indexFile, "utf8"));
const declared = Array.isArray(parsed.indexes) ? parsed.indexes : [];
const simplify = (index) => ({
  collectionGroup: index.collectionGroup,
  fields: (index.fields || []).map((f) => ({ fieldPath: f.fieldPath, order: f.order }))
});
/** An index serves a query when its fields match, with or without a trailing explicit __name__. */
function fileHas(required) {
  return declared.map(simplify).some((index) => {
    if (index.collectionGroup !== required.collectionGroup) return false;
    const trailing = index.fields[index.fields.length - 1];
    const body = trailing && trailing.fieldPath === "__name__" ? index.fields.slice(0, -1) : index.fields;
    return JSON.stringify(body) === JSON.stringify(required.fields);
  });
}

const run = async () => {
  let workspaceShape = null;
  let assignedShape = null;

  await check("the workspace query orders by paymentDate and the document id, both descending", async () => {
    workspaceShape = await recordQuery();
    assert.deepStrictEqual(workspaceShape.filters.map((f) => `${f.field} ${f.op}`), ["companyId =="]);
    assert.deepStrictEqual(workspaceShape.orders, [
      { field: "paymentDate", direction: "desc" },
      { field: "__name__", direction: "desc" }
    ], "the date field the list sorts by changed");
    assert.ok(!JSON.stringify(workspaceShape.orders).includes("orderDateMs"), "the query does not use orderDateMs");
  });

  await check("the assigned-scope query adds assignedToUid as an equality, nothing else", async () => {
    assignedShape = await recordQuery({ assignedOnly: true });
    assert.deepStrictEqual(assignedShape.filters.map((f) => `${f.field} ${f.op}`), ["companyId ==", "assignedToUid =="]);
    assert.deepStrictEqual(assignedShape.orders, workspaceShape.orders, "the two queries sort differently");
  });

  await check("the explicit document id matches the implicit __name__ an index would carry", () => {
    // A composite index ends with __name__ in the direction of its last field.
    // Ordering the id the other way is unservable, whatever the file says.
    const last = workspaceShape.orders.filter((o) => o.field !== "__name__").slice(-1)[0];
    const name = workspaceShape.orders.find((o) => o.field === "__name__");
    assert.strictEqual(name.direction, last.direction, "the document id is ordered against the index's implicit __name__");
  });

  await check("a cursor carries exactly one value per ordered field", async () => {
    const shape = await recordQuery({ cursor: { ms: 1757600000000, id: "o1" } });
    assert.strictEqual(shape.cursorValues, shape.orders.length, "Firestore refuses a cursor that is not the length of the orderBy list");
  });

  await check("firestore.indexes.json carries the index each recorded query needs", () => {
    for (const [label, shape] of [["workspace", workspaceShape], ["assigned", assignedShape]]) {
      const required = requiredIndex(shape);
      assert.ok(fileHas(required), `${label} query has no index in the file: ${JSON.stringify(required)}`);
    }
  });

  await check("the file carries no index for a collection or field Faz 1 never queries", () => {
    // salesOrders is the projection PR 3 will write, and orderDateMs is its
    // stamp. Neither exists yet, so an index for them describes nothing that
    // runs and would be deployed against an empty collection.
    const queried = new Set([workspaceShape.collection, assignedShape.collection]);
    const orphans = declared.filter((index) => index.collectionGroup === "salesOrders");
    assert.deepStrictEqual(orphans, [], `salesOrders indexes without a query: ${JSON.stringify(orphans.map(simplify))}`);
    const fields = declared.flatMap((index) => (index.fields || []).map((f) => f.fieldPath));
    assert.ok(!fields.includes("orderDateMs"), "orderDateMs is indexed but no query sorts by it");
    assert.ok(queried.has("siparisler"), "the list stopped reading the orders collection");
  });

  await check("the record's query contract is the query that ran", () => {
    // The record carries the contract in a fenced block; it is parsed here and
    // compared with what the real query asked for, so prose and code cannot drift.
    const record = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "sales", "faz1-pr1-2026-09-12.md"), "utf8");
    const after = record.split("<!-- query-contract")[1];
    assert.ok(after, "the record carries no query contract block");
    const body = after.split("```")[1];
    assert.ok(body, "the query contract block is not fenced");
    const lines = body.split("\n").map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
    const stated = { collection: "", filters: [], orders: [] };
    for (const line of lines) {
      const [word, ...rest] = line.split(/\s+/);
      if (word === "collection") stated.collection = rest[0];
      else if (word === "where") stated.filters.push({ field: rest[0], op: rest[1] });
      else if (word === "orderBy") stated.orders.push({ field: rest[0], direction: rest[1] });
      else throw new Error(`unknown line in the contract block: ${line}`);
    }
    assert.strictEqual(stated.collection, assignedShape.collection, "the contract names another collection");
    assert.deepStrictEqual(stated.orders, assignedShape.orders, "the contract sorts by fields the query does not");
    assert.deepStrictEqual(stated.filters.map((f) => `${f.field} ${f.op}`), assignedShape.filters.map((f) => `${f.field} ${f.op}`), "the contract filters differently from the query");
    // The workspace query is the same minus the assignee, which the block marks.
    assert.deepStrictEqual(workspaceShape.filters.map((f) => f.field), ["companyId"]);
  });

  console.log(failures ? `\n${failures} check(s) failed` : "\nsales index match: all checks passed");
  process.exit(failures ? 1 : 0);
};
run();
