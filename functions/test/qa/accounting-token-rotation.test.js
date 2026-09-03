// What the accounting connector does when the token key it boxed with is gone.
//
// Rotating NIVADESK_QBO_TOKEN_KEY makes every stored blob undecryptable, and
// Xero is boxed with the QuickBooks key, so one rotation lands on both
// connectors at once. The decrypt used to throw from outside the only catch
// that can write status "reconnect_required": the connection stayed "linked",
// the owner was shown a raw Node crypto string, and Disconnect — which decrypts
// too — failed as INTERNAL, so the row could not even be cleared. Nothing in
// the code reads as broken; only running it says so, which is why this is here.
//
//   node functions/test/qa/accounting-token-rotation.test.js
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { encryptToken, decryptToken } = require("../../etsy");
const { createAccountingFunctions } = require("../../accountingFunctions");

const KEY_A = crypto.randomBytes(32).toString("hex");
const KEY_B = crypto.randomBytes(32).toString("hex");
const COMPANY = "c1";
const CONNECTION_ID = "quickbooks_online__realm1";
const NOW = 1_760_000_000_000;

// --- a fake Firestore, just enough of it ------------------------------------
function clone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = clone(v);
  return out;
}

function makeAdmin() {
  const docs = new Map(); // "companies/c1/accountingTokens/x" -> data
  let generated = 0;

  function docHandle(path) {
    return {
      path,
      id: path.split("/").pop(),
      get: async () => ({ exists: docs.has(path), ref: docHandle(path), data: () => (docs.has(path) ? clone(docs.get(path)) : undefined) }),
      set: async (patch, options = {}) => { docs.set(path, { ...(options.merge && docs.has(path) ? docs.get(path) : {}), ...clone(patch) }); },
      update: async (patch) => { docs.set(path, { ...(docs.get(path) || {}), ...clone(patch) }); },
      delete: async () => { docs.delete(path); },
      collection: (name) => collectionHandle(`${path}/${name}`)
    };
  }

  function childrenOf(prefix) {
    return [...docs.entries()]
      .filter(([key]) => key.startsWith(`${prefix}/`) && !key.slice(prefix.length + 1).includes("/"))
      .map(([key, row]) => ({ id: key.split("/").pop(), ref: docHandle(key), data: () => clone(row) }));
  }

  function collectionHandle(prefix) {
    const query = (rows) => ({
      get: async () => ({ docs: rows, size: rows.length, empty: rows.length === 0 }),
      limit: (n) => query(rows.slice(0, n)),
      orderBy: () => query(rows),
      where: (field, _op, value) => query(rows.filter((doc) => doc.data()[field] === value))
    });
    return {
      doc: (id) => docHandle(`${prefix}/${id === undefined ? `gen_${(generated += 1)}` : id}`),
      ...query(null),
      get: async () => ({ docs: childrenOf(prefix), size: childrenOf(prefix).length, empty: childrenOf(prefix).length === 0 }),
      limit: (n) => query(childrenOf(prefix).slice(0, n)),
      orderBy: () => query(childrenOf(prefix)),
      where: (field, _op, value) => query(childrenOf(prefix).filter((doc) => doc.data()[field] === value))
    };
  }

  const firestore = () => ({
    collection: (name) => collectionHandle(name),
    runTransaction: async (fn) => fn({
      get: async (ref) => ref.get(),
      update: (ref, patch) => { docs.set(ref.path, { ...(docs.get(ref.path) || {}), ...clone(patch) }); },
      set: (ref, patch, options = {}) => { docs.set(ref.path, { ...(options.merge && docs.has(ref.path) ? docs.get(ref.path) : {}), ...clone(patch) }); }
    }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, patch, options = {}) => ops.push(() => { docs.set(ref.path, { ...(options.merge && docs.has(ref.path) ? docs.get(ref.path) : {}), ...clone(patch) }); }),
        delete: (ref) => ops.push(() => { docs.delete(ref.path); }),
        commit: async () => { ops.forEach((op) => op()); }
      };
    }
  });

  const admin = { firestore: Object.assign(firestore, { FieldValue: {} }) };
  return { admin, docs };
}

class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.httpsCode = code; }
}

// key: the key the functions are built with. The rows below are always boxed
// with KEY_A, so passing KEY_B is a rotation that never re-linked.
function build({ key = KEY_A, tokenRow = {}, connection = {} } = {}) {
  const { admin, docs } = makeAdmin();
  const calls = { refreshed: 0, revoked: 0 };
  docs.set(`companies/${COMPANY}`, { ownerUid: "owner" });
  docs.set(`companies/${COMPANY}/accountingConnections/${CONNECTION_ID}`, {
    provider: "quickbooks_online", status: "linked", syncState: "ok", mode: "shadow_read",
    externalCompanyId: "realm1", tokenDocId: CONNECTION_ID, ...connection
  });
  docs.set(`companies/${COMPANY}/accountingTokens/${CONNECTION_ID}`, {
    accessTokenEncrypted: encryptToken("access-token", KEY_A),
    refreshTokenEncrypted: encryptToken("refresh-token", KEY_A),
    tokenExpiresAtMs: NOW - 1000, tokenRefreshLockUntilMs: 0, ...tokenRow
  });

  const fns = createAccountingFunctions({
    admin,
    onCall: (_options, handler) => handler,
    onRequest: (_options, handler) => handler,
    onSchedule: (_options, handler) => handler,
    HttpsError: FakeHttpsError,
    uidIsCompanyOwner: (_company, uid) => uid === "owner",
    encryptToken, decryptToken,
    qboClientId: () => "client", qboClientSecret: () => "secret", qboWebhookVerifier: () => "verifier",
    qboTokenKey: () => key,
    appReturnUrl: () => "https://nivadesk.app/settings",
    functionsBaseUrl: () => "https://example.invalid",
    createClient: () => ({}),
    now: () => NOW,
    oauth: {
      refreshTokens: async () => {
        calls.refreshed += 1;
        return { accessToken: "fresh-access", refreshToken: "fresh-refresh", expiresAtMs: NOW + 3600_000, refreshExpiresAtMs: NOW + 100 * 86_400_000 };
      },
      revokeToken: async () => { calls.revoked += 1; return true; }
    }
  });
  return { fns, docs, calls };
}

const connectionRow = (docs) => docs.get(`companies/${COMPANY}/accountingConnections/${CONNECTION_ID}`);
const tokenRow = (docs) => docs.get(`companies/${COMPANY}/accountingTokens/${CONNECTION_ID}`);

test("an expired token boxed under the old key asks for a reconnect, and releases the lock", async () => {
  const { fns, docs, calls } = build({ key: KEY_B });
  const accessToken = await fns._internal.refreshTokenWithLock(COMPANY, CONNECTION_ID);
  assert.strictEqual(accessToken, "", "no token comes back, and no crypto error escapes");
  assert.strictEqual(calls.refreshed, 0, "an unreadable refresh token is never sent to Intuit");
  const row = connectionRow(docs);
  assert.strictEqual(row.status, "reconnect_required", "the one state the web offers Connect again for");
  assert.strictEqual(row.syncState, "needs_reconnect");
  assert.strictEqual(row.lastError, "token_unreadable");
  assert.strictEqual(tokenRow(docs).tokenRefreshLockUntilMs, 0, "the claimed lock must not hold for a minute after a permanent failure");
});

test("a still-fresh access token that will not decrypt is the same permanent failure", async () => {
  const { fns, docs } = build({ key: KEY_B, tokenRow: { tokenExpiresAtMs: NOW + 3600_000 } });
  assert.strictEqual(await fns._internal.refreshTokenWithLock(COMPANY, CONNECTION_ID), "");
  assert.strictEqual(connectionRow(docs).status, "reconnect_required", "the near path throws just as the refresh path does");
});

test("with the key it was boxed with, the refresh still runs and the connection stays linked", async () => {
  const { fns, docs, calls } = build({ key: KEY_A });
  assert.strictEqual(await fns._internal.refreshTokenWithLock(COMPANY, CONNECTION_ID), "fresh-access");
  assert.strictEqual(calls.refreshed, 1);
  assert.strictEqual(connectionRow(docs).status, "linked", "the guard must not fire on a healthy connection");
  assert.strictEqual(connectionRow(docs).lastError, "");
});

test("Disconnect clears a connection whose tokens cannot be read, so there is a way out", async () => {
  const { fns, docs, calls } = build({ key: KEY_B });
  const result = await fns.quickbooksDisconnect({ auth: { uid: "owner" }, data: { companyId: COMPANY, connectionId: CONNECTION_ID } });
  assert.strictEqual(result.ok, true, "this used to throw INTERNAL and leave the connection in place");
  assert.strictEqual(result.revoked, false, "an unreadable token cannot be revoked at Intuit — say so, do not pretend");
  assert.strictEqual(calls.revoked, 0);
  assert.strictEqual(connectionRow(docs).status, "disconnected");
  assert.strictEqual(tokenRow(docs), undefined, "the unreadable blob is forgotten either way");
});

test("Disconnect with the right key still revokes at the vendor", async () => {
  const { fns, docs, calls } = build({ key: KEY_A });
  const result = await fns.quickbooksDisconnect({ auth: { uid: "owner" }, data: { companyId: COMPANY, connectionId: CONNECTION_ID } });
  assert.strictEqual(result.revoked, true);
  assert.strictEqual(calls.revoked, 1);
  assert.strictEqual(connectionRow(docs).status, "disconnected");
});
