// The Etsy connection lifecycle, against a fake Firestore and a fake Etsy.
//
// These are the failure modes that break an OAuth integration in production
// rather than in review:
//
//   * A callback replayed twice attaching a shop to a second workspace.
//   * Two workers refreshing the same token at the same second. Etsy rotates
//     the refresh token on every refresh, so the loser of that race stores a
//     token that is already dead, and the connection breaks an hour later —
//     nowhere near the code that caused it.
//   * A connection id from another workspace being accepted.
//
// None of them are visible by reading the code, which is why they are here.

const assert = require("assert");
const crypto = require("crypto");
const etsy = require("../../etsy");
const { createEtsyConnectFunctions } = require("../../etsyConnect");

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// --- a fake Firestore, just enough of it ------------------------------------
const DELETE = Symbol("delete");
const SERVER_TS = Symbol("serverTimestamp");

function clone(value) {
  if (value === null || typeof value !== "object") return value;
  if (value === DELETE || value === SERVER_TS) return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = clone(v);
  return out;
}

function applyPatch(target, patch, nowMs) {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) delete out[key];
    else if (value === SERVER_TS) out[key] = nowMs;
    else out[key] = clone(value);
  }
  return out;
}

function makeFirestore(nowRef) {
  const docs = new Map();          // "col/id" -> data
  const subDocs = [];              // { path, data }

  function docHandle(path) {
    return {
      path,
      get: async () => ({
        exists: docs.has(path),
        data: () => (docs.has(path) ? clone(docs.get(path)) : undefined),
        ref: docHandle(path)
      }),
      set: async (patch, options = {}) => {
        const base = options.merge && docs.has(path) ? docs.get(path) : {};
        docs.set(path, applyPatch(base, patch, nowRef.value));
      },
      update: async (patch) => {
        docs.set(path, applyPatch(docs.get(path) || {}, patch, nowRef.value));
      },
      collection: (name) => ({
        add: async (row) => { subDocs.push({ path: `${path}/${name}`, data: clone(row) }); },
        orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) })
      })
    };
  }

  const firestore = () => ({
    collection: (name) => ({
      doc: (id) => docHandle(`${name}/${id}`),
      where: (field, _op, value) => ({
        get: async () => ({
          docs: [...docs.entries()]
            .filter(([key, row]) => key.startsWith(`${name}/`) && row[field] === value)
            .map(([key, row]) => ({
              id: key.split("/")[1],
              data: () => clone(row),
              ref: docHandle(key)
            }))
        })
      })
    }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ref.get(),
      update: (ref, patch) => { docs.set(ref.path, applyPatch(docs.get(ref.path) || {}, patch, nowRef.value)); },
      set: (ref, patch, options = {}) => {
        const base = options.merge && docs.has(ref.path) ? docs.get(ref.path) : {};
        docs.set(ref.path, applyPatch(base, patch, nowRef.value));
      }
    })
  });

  return { firestore, docs, subDocs, docHandle };
}

function makeAdmin(nowRef) {
  const store = makeFirestore(nowRef);
  const admin = {
    firestore: Object.assign(store.firestore, {
      FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE }
    })
  };
  return { admin, store };
}

class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.httpsCode = code; }
}

// onCall/onRequest just hand back the handler so the test can call it directly.
const onCall = (_options, handler) => handler;
const onRequest = (_options, handler) => handler;

const KEY = crypto.randomBytes(32).toString("hex");

function build({ nowRef, refreshImpl, exchangeImpl, fetchImpl, owner = true, useRealEtsy = false }) {
  const { admin, store } = makeAdmin(nowRef);
  const etsyStub = useRealEtsy ? etsy : {
    ...etsy,
    refreshAccessToken: refreshImpl || (async () => ({ access_token: "1.new", refresh_token: "r.new", expires_in: 3600 })),
    exchangeAuthorizationCode: exchangeImpl || (async () => ({ access_token: "1.acc", refresh_token: "1.ref", expires_in: 3600 })),
    etsyFetch: fetchImpl || (async () => ({ results: [{ shop_id: 222, shop_name: "Ada Studio", currency_code: "GBP" }] }))
  };
  const fns = createEtsyConnectFunctions({
    admin,
    onCall,
    onRequest,
    HttpsError: FakeHttpsError,
    etsy: etsyStub,
    keystring: () => "kkkk",
    tokenKey: () => KEY,
    redirectUri: () => "https://example.test/cb",
    requireWorkspaceOwner: async () => {
      if (!owner) throw new FakeHttpsError("permission-denied", "not owner");
      return { uid: "u1", companyId: "c1", companyData: {} };
    },
    requireWorkspaceMember: async () => ({ uid: "u1", companyId: "c1", companyData: {} }),
    appReturnUrl: () => "https://nivadesk.app/settings",
    now: () => nowRef.value
  });
  return { fns, store, admin };
}

function fakeRes() {
  return { redirects: [], redirect(code, url) { this.redirects.push({ code, url }); } };
}

// --- connect ----------------------------------------------------------------

test("begin puts the verifier in the state document, never in the URL", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  const result = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const url = new URL(result.authorizeUrl);
  const state = url.searchParams.get("state");
  assert.ok(state, "the URL carries a state");
  assert.ok(!url.searchParams.has("code_verifier"), "the verifier must never be in the URL");
  assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");

  const stored = store.docs.get(`etsyOAuthStates/${state}`);
  assert.strictEqual(stored.companyId, "c1");
  assert.strictEqual(stored.uid, "u1");
  assert.ok(stored.codeVerifier && stored.codeVerifier.data, "the verifier is stored encrypted");
  assert.ok(!JSON.stringify(stored.codeVerifier).includes(url.searchParams.get("code_challenge")),
    "the stored blob is not the challenge in plaintext");
  // The challenge in the URL must be the hash of the stored verifier.
  const verifier = etsy.decryptToken(stored.codeVerifier, KEY);
  assert.strictEqual(etsy.codeChallengeFor(verifier), url.searchParams.get("code_challenge"));
});

test("a callback with a good state connects the shop", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");

  const res = fakeRes();
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, res);
  assert.strictEqual(res.redirects.length, 1);
  assert.ok(res.redirects[0].url.includes("etsy=connected"), res.redirects[0].url);

  const connection = store.docs.get("etsyConnections/c1_222");
  assert.ok(connection, "the connection is keyed by workspace and shop");
  assert.strictEqual(connection.companyId, "c1");
  assert.strictEqual(connection.externalShopId, "222");
  assert.strictEqual(connection.status, "connected");
  assert.ok(connection.accessTokenEncrypted.data, "tokens are stored encrypted");
  assert.ok(!JSON.stringify(connection).includes("1.acc"), "no plaintext token anywhere in the row");
});

test("a replayed callback cannot attach the shop twice", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");

  const first = fakeRes();
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, first);
  assert.ok(first.redirects[0].url.includes("etsy=connected"));

  const second = fakeRes();
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, second);
  assert.ok(second.redirects[0].url.includes("etsy=error"), "the second use must be refused");
  assert.ok(second.redirects[0].url.includes("reason=state"));
});

test("an expired state is refused", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns } = build({ nowRef });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  nowRef.value += etsy.OAUTH_STATE_TTL_MS + 1000;

  const res = fakeRes();
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, res);
  assert.ok(res.redirects[0].url.includes("reason=state"));
});

test("an unknown state is refused", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns } = build({ nowRef });
  const res = fakeRes();
  await fns.etsyOAuthCallback({ query: { state: "invented", code: "abc" } }, res);
  assert.ok(res.redirects[0].url.includes("reason=state"));
});

test("a cancelled authorisation comes back as cancelled, not as an error", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns } = build({ nowRef });
  const res = fakeRes();
  await fns.etsyOAuthCallback({ query: { error: "access_denied" } }, res);
  assert.ok(res.redirects[0].url.includes("etsy=cancelled"));
});

test("only an owner may start a connection", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns } = build({ nowRef, owner: false });
  await assert.rejects(() => fns.beginEtsyConnect({ auth: { uid: "u2" }, data: {} }), /not owner/);
});

// --- token refresh ----------------------------------------------------------

test("two workers refreshing at once produce exactly one refresh call", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  let refreshCalls = 0;
  const { fns, store } = build({
    nowRef,
    refreshImpl: async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { access_token: `1.new${refreshCalls}`, refresh_token: `r.new${refreshCalls}`, expires_in: 3600 };
    }
  });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());

  // Make the stored token look expired.
  const ref = store.docHandle("etsyConnections/c1_222");
  await ref.set({ tokenExpiresAt: nowRef.value - 1000 }, { merge: true });

  const { accessTokenFor } = fns._internal;
  const [a, b] = await Promise.all([accessTokenFor(ref), accessTokenFor(ref)]);
  assert.strictEqual(refreshCalls, 1, `expected one refresh, got ${refreshCalls}`);
  assert.strictEqual(a, b, "both workers must end up with the same token");
});

test("the rotated refresh token replaces the old one", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({
    nowRef,
    refreshImpl: async () => ({ access_token: "1.acc2", refresh_token: "r.rotated", expires_in: 3600 })
  });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());

  const ref = store.docHandle("etsyConnections/c1_222");
  await ref.set({ tokenExpiresAt: nowRef.value - 1000 }, { merge: true });
  await fns._internal.accessTokenFor(ref);

  const row = store.docs.get("etsyConnections/c1_222");
  assert.strictEqual(etsy.decryptToken(row.refreshTokenEncrypted, KEY), "r.rotated",
    "storing the old refresh token would strand the connection at the next hour");
  assert.strictEqual(etsy.decryptToken(row.accessTokenEncrypted, KEY), "1.acc2");
});

// This test used to stub refreshAccessToken to throw EtsyApiError("auth_expired")
// directly, which skipped etsyFetch and the status classification entirely — it
// asserted a code path production never produces, and passed while the real one
// was broken. It now fakes the HTTP layer instead, so the classification runs
// for real.
test("a revoked refresh token (400 invalid_grant) marks the connection needs_reconnect", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const realFetch = global.fetch;
  let tokenCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes("/oauth/token")) {
      tokenCalls += 1;
      if (tokenCalls === 1) {
        // the initial code exchange succeeds
        return new Response(JSON.stringify({ access_token: "1.acc", refresh_token: "1.ref", expires_in: 3600 }), { status: 200 });
      }
      // the refresh: Etsy is a public PKCE client, so a dead grant is a 400,
      // never a 401 — RFC 6749 section 5.2.
      return new Response(JSON.stringify({ error: "invalid_grant", error_description: "refresh token expired" }), { status: 400 });
    }
    return new Response(JSON.stringify({ results: [{ shop_id: 222, shop_name: "Ada Studio", currency_code: "GBP" }] }), { status: 200 });
  };
  const { fns, store } = build({
    nowRef,
    refreshImpl: undefined,
    exchangeImpl: undefined,
    fetchImpl: undefined,
    useRealEtsy: true
  });
  try {
    const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
    const state = new URL(begun.authorizeUrl).searchParams.get("state");
    await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());

    const ref = store.docHandle("etsyConnections/c1_222");
    await ref.set({ tokenExpiresAt: nowRef.value - 1000 }, { merge: true });
    await assert.rejects(() => fns._internal.accessTokenFor(ref));

    const row = store.docs.get("etsyConnections/c1_222");
    assert.strictEqual(row.status, "needs_reconnect",
      "a 400 invalid_grant is the ONLY way a real Etsy refresh token dies");
    assert.strictEqual(row.lastErrorCode, "auth_expired");
    assert.ok(!row.refreshLockAt, "the lock must be released even when the refresh fails");
  } finally {
    global.fetch = realFetch;
  }
});

test("a transient failure does not erase needs_reconnect", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({
    nowRef,
    refreshImpl: async () => { throw new etsy.EtsyApiError("network", "dns blip"); }
  });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());

  const ref = store.docHandle("etsyConnections/c1_222");
  // A previous attempt correctly decided the seller must reconnect.
  await ref.set({ status: "needs_reconnect", tokenExpiresAt: nowRef.value - 1000 }, { merge: true });
  await assert.rejects(() => fns._internal.accessTokenFor(ref));

  const row = store.docs.get("etsyConnections/c1_222");
  assert.strictEqual(row.status, "needs_reconnect",
    "a network blip must not report the connection healthy again");
  assert.strictEqual(row.lastErrorCode, "network");
});

test("a token blob that will not decrypt asks for a reconnect, not a retry forever", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());

  const ref = store.docHandle("etsyConnections/c1_222");
  // As if ETSY_TOKEN_KEY had been rotated without re-linking the shop.
  await ref.set({
    tokenExpiresAt: nowRef.value - 1000,
    refreshTokenEncrypted: { v: 1, iv: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", data: "AAAA" }
  }, { merge: true });
  await assert.rejects(() => fns._internal.accessTokenFor(ref));
  assert.strictEqual(store.docs.get("etsyConnections/c1_222").status, "needs_reconnect");
});

// --- isolation --------------------------------------------------------------

test("a connection from another workspace is refused", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  await store.docHandle("etsyConnections/other_999").set({ companyId: "SOMEONE_ELSE", externalShopId: "999" });
  await assert.rejects(
    () => fns._internal.loadConnection("other_999", "c1"),
    /another workspace/
  );
});

test("the client view carries no token and no verifier", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns } = build({ nowRef });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());

  const listed = await fns.getEtsyConnections({ auth: { uid: "u1" }, data: {} });
  const json = JSON.stringify(listed);
  assert.strictEqual(listed.connections.length, 1);
  assert.strictEqual(listed.connections[0].shopId, "222");
  for (const forbidden of ["accessToken", "refreshToken", "codeVerifier", "Encrypted", "1.acc", "1.ref"]) {
    assert.ok(!json.includes(forbidden), `the client view leaked ${forbidden}`);
  }
});

// --- disconnect -------------------------------------------------------------

test("disconnect destroys the tokens and keeps the orders", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());

  const result = await fns.disconnectEtsyShop({ auth: { uid: "u1" }, data: { connectionId: "c1_222" } });
  assert.strictEqual(result.ordersKept, true);

  const row = store.docs.get("etsyConnections/c1_222");
  assert.strictEqual(row.status, "disconnected");
  assert.ok(!row.accessTokenEncrypted, "the access token must be gone");
  assert.ok(!row.refreshTokenEncrypted, "the refresh token must be gone");
  assert.ok(row.externalShopId, "the connection row itself stays, for the audit trail");
});

test("a disconnected connection cannot mint a token", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());
  await fns.disconnectEtsyShop({ auth: { uid: "u1" }, data: { connectionId: "c1_222" } });

  await assert.rejects(
    () => fns._internal.accessTokenFor(store.docHandle("etsyConnections/c1_222")),
    /disconnected/
  );
});

test("reconnecting the same shop reuses the row instead of piling up", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns, store } = build({ nowRef });
  for (let i = 0; i < 2; i += 1) {
    const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
    const state = new URL(begun.authorizeUrl).searchParams.get("state");
    await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, fakeRes());
  }
  const rows = [...store.docs.keys()].filter((key) => key.startsWith("etsyConnections/"));
  assert.strictEqual(rows.length, 1, `expected one connection, found ${rows.length}`);
});

// The seam that no unit test on either side can see on its own.
//
// The callback hands the seller back to the web app with ?etsy=connected. That
// message is read by the Etsy panel — and the panel only mounts once it is
// open. So if the redirect does not name the section, the seller approves
// access to their shop, lands on whichever settings page happens to be first,
// and is told nothing at all. The connection worked; it just looks like it
// did not. Both halves are asserted here because the bug lives between them.
test("every callback outcome names the section it wants opened", async () => {
  const nowRef = { value: 1_700_000_000_000 };
  const { fns } = build({ nowRef });

  const outcomes = [];
  // success
  const begun = await fns.beginEtsyConnect({ auth: { uid: "u1" }, data: {} });
  const state = new URL(begun.authorizeUrl).searchParams.get("state");
  let res = fakeRes();
  await fns.etsyOAuthCallback({ query: { state, code: "abc" } }, res);
  outcomes.push(["connected", res.redirects[0].url]);
  // seller pressed Cancel on Etsy
  res = fakeRes();
  await fns.etsyOAuthCallback({ query: { error: "access_denied" } }, res);
  outcomes.push(["cancelled", res.redirects[0].url]);
  // Etsy sent us back with nothing usable
  res = fakeRes();
  await fns.etsyOAuthCallback({ query: {} }, res);
  outcomes.push(["missing_code", res.redirects[0].url]);
  // a state that was never issued
  res = fakeRes();
  await fns.etsyOAuthCallback({ query: { state: "invented", code: "abc" } }, res);
  outcomes.push(["bad_state", res.redirects[0].url]);

  for (const [label, url] of outcomes) {
    assert.ok(
      new URL(url).searchParams.get("section") === "etsy",
      `the ${label} redirect must name section=etsy, got: ${url}`
    );
  }
});

test("the web settings page opens the Etsy panel when the seller returns", () => {
  const fs = require("fs");
  const path = require("path");
  const page = path.join(__dirname, "..", "..", "..", "studioflow-web", "app", "settings", "page.tsx");
  if (!fs.existsSync(page)) return;            // functions checked out on its own
  const source = fs.readFileSync(page, "utf8");

  assert.ok(
    /etsy:\s*"integrations"/.test(source),
    'SETTINGS_SECTION_ALIASES must map etsy -> integrations, or ?section=etsy lands nowhere'
  );
  assert.ok(
    /rawRequested === "etsy"/.test(source),
    'the provider allowlist must accept "etsy", or ?section=etsy opens Integrations but not the Etsy panel'
  );
  assert.ok(
    /params\.get\("etsy"\)/.test(source) && /setIntegrationProvider\("etsy"\)/.test(source),
    "returning from Etsy with ?etsy=... must open the Etsy panel, or the outcome message is never read"
  );
});

// --- run --------------------------------------------------------------------
(async () => {
  console.log("Etsy connection lifecycle");
  for (const [name, fn] of tests) {
    try { await fn(); console.log("  ok  " + name); } catch (error) {
      failed += 1;
      console.log("  FAIL " + name + "\n        " + (error?.message || error));
    }
  }
  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nPASS");
})();
