"use strict";

// A hand-built Firestore for the eBay connector's qa tests — just enough of
// the SDK to run the factory against: documents, subcollections, a single
// equality `where` (chained, with limit), orderBy/limit on a subcollection,
// transactions, create(), recursiveDelete, and the four sentinels the connector
// and the common engine write (serverTimestamp, delete, arrayUnion, increment).
// Set-with-merge is a DEEP merge, as in Firestore, because the quota ledger
// increments inside a nested map. Nothing here is asynchronous for real; every
// call still returns a promise so the code under test reads exactly as it does
// in production.
const DELETE = Symbol("delete");
const SERVER_TS = Symbol("serverTimestamp");

function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && v !== DELETE && v !== SERVER_TS; }
function clone(value) {
  if (value === DELETE || value === SERVER_TS) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (isObject(value)) { const out = {}; for (const [k, v] of Object.entries(value)) out[k] = clone(v); return out; }
  return value;
}

function applyValue(current, value, nowMs) {
  if (value === DELETE) return DELETE;
  if (value === SERVER_TS) return nowMs;
  if (isObject(value) && value.__arrayUnion) { const base = Array.isArray(current) ? current.slice() : []; for (const item of value.__arrayUnion) if (!base.some((x) => JSON.stringify(x) === JSON.stringify(item))) base.push(clone(item)); return base; }
  if (isObject(value) && value.__increment !== undefined) return (Number(current) || 0) + value.__increment;
  return clone(value);
}

function deepMerge(target, patch, nowMs) {
  const out = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) { delete out[key]; continue; }
    if (isObject(value) && value.__arrayUnion === undefined && value.__increment === undefined) { out[key] = deepMerge(out[key], value, nowMs); continue; }
    out[key] = applyValue(out[key], value, nowMs);
  }
  return out;
}

function replaceAll(patch, nowMs) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) continue;
    if (isObject(value) && value.__arrayUnion === undefined && value.__increment === undefined) { out[key] = replaceAll(value, nowMs); continue; }
    out[key] = applyValue(undefined, value, nowMs);
  }
  return out;
}

function readPath(row, field) { return String(field).split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), row); }
function valueMatches(actual, op, expected) {
  if (op === "==") return actual === expected;
  if (op === "!=") return actual !== expected;
  if (op === ">") return actual > expected;
  if (op === ">=") return actual >= expected;
  if (op === "<") return actual < expected;
  if (op === "<=") return actual <= expected;
  if (op === "in") return Array.isArray(expected) && expected.includes(actual);
  if (op === "array-contains") return Array.isArray(actual) && actual.includes(expected);
  throw new Error(`fake firestore: unsupported operator ${op}`);
}

function makeFakeFirestore(nowRef = { value: Date.now() }) {
  const docs = new Map();   // full path → data
  const now = () => nowRef.value;
  // Failure injection, for the rules a test can only prove by executing them: a
  // real Firestore refusal arrives as an Error whose MESSAGE carries the value
  // that was refused, and §5.4's logging rule is precisely that no such message
  // may reach a log line. `store.refuseWrites(/syncLog/, "…")` makes writes under
  // matching paths throw that shape.
  const refusals = [];
  const refusalFor = (path) => refusals.find((r) => r.match.test(path));
  function guard(path) {
    const refusal = refusalFor(path);
    if (!refusal) return;
    const error = new Error(refusal.message);
    error.code = refusal.code;
    throw error;
  }

  function docHandle(path) {
    const id = path.split("/").pop();
    const handle = {
      id, path,
      get: async () => snapshotOf(path),
      set: async (patch, options = {}) => { guard(path); docs.set(path, options.merge && docs.has(path) ? deepMerge(docs.get(path), patch, now()) : replaceAll(patch, now())); },
      update: async (patch) => { if (!docs.has(path)) throw new Error(`fake firestore: update on missing ${path}`); docs.set(path, deepMerge(docs.get(path), patch, now())); },
      delete: async () => { docs.delete(path); },
      // `guard` runs here as it does for set(): a refusal injected over a
      // create() is how the registry's "unavailable" branch is executed, and
      // without it that branch could only be argued about.
      create: async (data) => { guard(path); if (docs.has(path)) { const e = new Error("ALREADY_EXISTS"); e.code = 6; throw e; } docs.set(path, replaceAll(data, now())); },
      collection: (name) => collectionHandle(`${path}/${name}`)
    };
    return handle;
  }
  function snapshotOf(path) {
    const exists = docs.has(path);
    return { id: path.split("/").pop(), exists, ref: docHandle(path), data: () => (exists ? clone(docs.get(path)) : undefined) };
  }
  function query(prefix, filters = [], order = null, cap = Infinity) {
    const depth = prefix.split("/").length + 1;
    const q = {
      where: (field, op, value) => query(prefix, [...filters, { field, op, value }], order, cap),
      orderBy: (field, direction = "asc") => query(prefix, filters, { field, direction }, cap),
      limit: (count) => query(prefix, filters, order, count),
      get: async () => {
        let rows = [...docs.entries()].filter(([path]) => path.startsWith(`${prefix}/`) && path.split("/").length === depth).map(([path, row]) => ({ path, row }));
        for (const f of filters) rows = rows.filter(({ row }) => valueMatches(readPath(row, f.field), f.op, f.value));
        if (order) rows.sort((a, b) => { const x = readPath(a.row, order.field); const y = readPath(b.row, order.field); return (x > y ? 1 : x < y ? -1 : 0) * (order.direction === "desc" ? -1 : 1); });
        rows = rows.slice(0, cap);
        const list = rows.map(({ path }) => snapshotOf(path));
        return { docs: list, size: list.length, empty: list.length === 0 };
      },
      count: () => ({ get: async () => { const size = (await q.get()).size; return { data: () => ({ count: size }) }; } })
    };
    return q;
  }
  function collectionHandle(prefix) {
    let counter = 0;
    return {
      path: prefix,
      doc: (id) => docHandle(`${prefix}/${id || `auto_${++counter}_${Math.random().toString(36).slice(2, 8)}`}`),
      add: async (row) => { guard(prefix); const ref = docHandle(`${prefix}/auto_${++counter}_${Math.random().toString(36).slice(2, 8)}`); await ref.set(row); return ref; },
      ...query(prefix)
    };
  }

  const firestore = () => ({
    collection: (name) => collectionHandle(name),
    doc: (path) => docHandle(path),
    runTransaction: async (fn) => fn({
      get: async (ref) => ref.get(),
      set: (ref, patch, options = {}) => { docs.set(ref.path, options.merge && docs.has(ref.path) ? deepMerge(docs.get(ref.path), patch, now()) : replaceAll(patch, now())); },
      update: (ref, patch) => { docs.set(ref.path, deepMerge(docs.get(ref.path) || {}, patch, now())); },
      delete: (ref) => { docs.delete(ref.path); }
    }),
    recursiveDelete: async (ref) => { for (const path of [...docs.keys()]) if (path === ref.path || path.startsWith(`${ref.path}/`)) docs.delete(path); },
    batch: () => { const ops = []; return { set: (ref, data, options) => ops.push(() => ref.set(data, options)), delete: (ref) => ops.push(() => ref.delete()), commit: async () => { for (const op of ops) await op(); } }; }
  });

  const admin = {
    firestore: Object.assign(firestore, {
      FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE, arrayUnion: (...items) => ({ __arrayUnion: items }), increment: (n) => ({ __increment: n }) },
      Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 }) }
    })
  };

  return {
    admin, docs, now,
    read: (path) => (docs.has(path) ? clone(docs.get(path)) : undefined),
    write: (path, data) => { docs.set(path, clone(data)); },
    paths: (prefix) => [...docs.keys()].filter((p) => p.startsWith(prefix)).sort(),
    /** Make every write under a matching path throw the way Firestore does. */
    refuseWrites: (match, message, code = 3) => { refusals.push({ match, message, code }); },
    /** Let the writes through again — for testing the retry after a failure,
     *  which is the half of a partial-failure test that actually matters. */
    allowWrites: () => { refusals.length = 0; }
  };
}

class FakeHttpsError extends Error {
  // `details` is the third argument the real firebase-functions HttpsError
  // carries to the client, and this fake used to drop it. That is not a
  // harmless omission: callers use it to say WHICH records blocked an
  // operation, so a screen reading `error.details.paymentRequestIds` would test
  // clean here and show the user an empty list. A fake that is less capable
  // than the thing it stands in for hides exactly the bugs it exists to catch.
  constructor(code, message, details) {
    super(message);
    this.name = "HttpsError";
    this.code = code;
    this.httpsCode = code;
    if (details !== undefined) this.details = details;
  }
}

module.exports = { makeFakeFirestore, FakeHttpsError, DELETE, SERVER_TS };
