// Connecting a workspace: the browser carries an intent in and a code back,
// and is trusted with neither.
const assert = require("assert");
const { createOauthFlow } = require("../src/oauthFlow");
const { mintIntent, stateFor } = require("../src/intent");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const KEY = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex");
const T0 = 1_700_000_000_000;

function harness({ exchange = null, discovery = null } = {}) {
  const config = {
    intentHmacKey: KEY, spApiApplicationId: "amzn1.sp.solution.test", lwaClientId: "cid", lwaClientSecret: "csecret",
    sellerCentralHost: "sellercentral-europe.amazon.com", draftApplication: true, defaultRegion: "eu",
    redirectUri: "https://amazon.nivadesk.app/oauth/callback", mainAppReturnUrl: "https://app.nivadesk.app/settings/integrations",
    pendingConnectionTtlMs: 15 * 60 * 1000
  };
  const nonces = new Set();
  const pending = new Map();
  const activated = [];
  const logs = [];
  const connections = {
    async recordNonce(n) { if (nonces.has(n)) return false; nonces.add(n); return true; },
    async createPending(p) { const id = `p${pending.size + 1}`; pending.set(id, { id, ...p, createdAtMs: T0 }); return id; },
    async findPendingByState(state, ttl) { return [...pending.values()].find((p) => p.state === state && T0 + 1000 - p.createdAtMs <= ttl) || null; },
    async discardPending(id) { pending.delete(id); },
    async activate(args) { activated.push(args); pending.delete(args.pendingId); return "conn-1"; }
  };
  const fetched = [];
  const egress = {
    fetch: async (url, init) => {
      fetched.push(url);
      if (/api\.amazon\.com\/auth\/o2\/token/.test(url)) {
        if (exchange instanceof Error) throw exchange;
        return { ok: true, status: 200, json: async () => exchange || { refresh_token: "Atzr|refresh", access_token: "Atza|access", expires_in: 3600 } };
      }
      throw new Error(`unexpected fetch ${url}`);
    }
  };
  const clientFactory = () => ({
    async getMarketplaceParticipations() {
      if (discovery instanceof Error) throw discovery;
      return discovery || [{ marketplaceId: "A1F83G8C2ARO7P", countryCode: "GB", currencyCode: "GBP", participating: true },
        { marketplaceId: "A13V1IB3VIYZZH", countryCode: "FR", currencyCode: "EUR", participating: false }];
    }
  });
  const flow = createOauthFlow({ config, connections, egress, now: () => T0 + 1000, clientFactory,
    logger: { log: (l) => logs.push(l), warn: (l) => logs.push(l), error: (l) => logs.push(l) } });
  return { flow, config, nonces, pending, activated, fetched, logs };
}

check("start: a valid intent becomes a pending connection and a redirect to Login with Amazon", () => {
  const h = harness();
  const intent = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  return h.flow.start({ query: { intent } }).then((out) => {
    assert.strictEqual(out.status, 302);
    const url = new URL(out.headers.Location);
    assert.strictEqual(url.host, "sellercentral-europe.amazon.com");
    assert.strictEqual(url.pathname, "/apps/authorize/consent");
    assert.strictEqual(url.searchParams.get("application_id"), "amzn1.sp.solution.test");
    assert.strictEqual(url.searchParams.get("version"), "beta");
    const state = url.searchParams.get("state");
    const p = [...h.pending.values()][0];
    assert.strictEqual(p.companyId, "co-1");
    assert.strictEqual(p.state, state);
    assert.strictEqual(state, stateFor(p.nonce, KEY), "the state is not bound to the intent's nonce");
  });
});

check("start: a forged, expired, or replayed intent is refused and nothing is recorded", () => {
  const h = harness();
  const good = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  const other = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: Buffer.alloc(32, 7), now: () => T0 });
  const stale = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 - 11 * 60 * 1000 });
  return h.flow.start({ query: { intent: other } }).then((out) => {
    assert.strictEqual(out.status, 400); assert.strictEqual(h.pending.size, 0);
    return h.flow.start({ query: { intent: stale } });
  }).then((out) => {
    assert.strictEqual(out.status, 400); assert.strictEqual(h.pending.size, 0);
    return h.flow.start({ query: { intent: good } });
  }).then((out) => {
    assert.strictEqual(out.status, 302);
    return h.flow.start({ query: { intent: good } });   // the same link, twice
  }).then((out) => {
    assert.strictEqual(out.status, 400, "a replayed intent was accepted");
    assert.strictEqual(h.pending.size, 1);
  });
});

check("callback: the code is exchanged, the refresh token stored, marketplaces discovered, and the browser sent home with a status word only", () => {
  const h = harness();
  const intent = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  return h.flow.start({ query: { intent } }).then((out) => {
    const state = new URL(out.headers.Location).searchParams.get("state");
    return h.flow.callback({ query: { state, spapi_oauth_code: "ANxxxx", selling_partner_id: "A2SELLER" } });
  }).then((out) => {
    assert.strictEqual(out.status, 302);
    const url = new URL(out.headers.Location);
    assert.strictEqual(url.origin + url.pathname, "https://app.nivadesk.app/settings/integrations");
    assert.strictEqual(url.searchParams.get("amazon"), "connected");
    assert.strictEqual(url.searchParams.get("connection"), "conn-1");
    assert.ok(!out.headers.Location.includes("Atz"), "a token was sent to the browser");
    assert.strictEqual(h.activated.length, 1);
    const a = h.activated[0];
    assert.strictEqual(a.refreshToken, "Atzr|refresh");
    assert.strictEqual(a.companyId, "co-1");
    assert.strictEqual(a.sellerId, "A2SELLER");
    assert.deepStrictEqual(a.marketplaces.map((m) => m.marketplaceId), ["A1F83G8C2ARO7P"], "a non-participating marketplace was kept");
    assert.strictEqual(h.pending.size, 0, "the pending connection was not discarded");
    assert.ok(h.logs.every((l) => !/Atz|ANxxxx/.test(l)), "a token or code was logged");
  });
});

check("callback: an unknown or expired state is refused; a denied consent is reported as denied", () => {
  const h = harness();
  return h.flow.callback({ query: { state: "nope", spapi_oauth_code: "x" } }).then((out) => {
    assert.strictEqual(out.status, 302);
    assert.strictEqual(new URL(out.headers.Location).searchParams.get("reason"), "state");
    assert.strictEqual(h.activated.length, 0);
    const intent = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
    return h.flow.start({ query: { intent } });
  }).then((out) => {
    const state = new URL(out.headers.Location).searchParams.get("state");
    return h.flow.callback({ query: { state } });   // no code: the seller said no
  }).then((out) => {
    assert.strictEqual(new URL(out.headers.Location).searchParams.get("reason"), "denied");
    assert.strictEqual(h.activated.length, 0);
    assert.strictEqual(h.pending.size, 0);
  });
});

check("callback: a failed exchange connects nothing and says only 'exchange'", () => {
  const h = harness({ exchange: Object.assign(new Error("amazon_lwa_http_400: invalid_grant"), { code: "invalid_grant" }) });
  const intent = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  return h.flow.start({ query: { intent } }).then((out) => {
    const state = new URL(out.headers.Location).searchParams.get("state");
    return h.flow.callback({ query: { state, spapi_oauth_code: "bad" } });
  }).then((out) => {
    const url = new URL(out.headers.Location);
    assert.strictEqual(url.searchParams.get("amazon"), "error");
    assert.strictEqual(url.searchParams.get("reason"), "exchange");
    assert.ok(!out.headers.Location.includes("invalid_grant"), "an error detail reached the browser");
    assert.strictEqual(h.activated.length, 0);
  });
});

check("callback: failed marketplace discovery still connects — the sync retries it", () => {
  const h = harness({ discovery: new Error("amazon_http_429") });
  const intent = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  return h.flow.start({ query: { intent } }).then((out) => {
    const state = new URL(out.headers.Location).searchParams.get("state");
    return h.flow.callback({ query: { state, spapi_oauth_code: "ok" } });
  }).then((out) => {
    assert.strictEqual(new URL(out.headers.Location).searchParams.get("amazon"), "connected");
    assert.strictEqual(h.activated[0].marketplaces.length, 0);
  });
});

check("every outbound call went through the guarded fetch", () => {
  const h = harness();
  const intent = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  return h.flow.start({ query: { intent } }).then((out) => {
    const state = new URL(out.headers.Location).searchParams.get("state");
    return h.flow.callback({ query: { state, spapi_oauth_code: "ok" } });
  }).then(() => {
    assert.ok(h.fetched.length >= 1);
    assert.ok(h.fetched.every((u) => /^https:\/\/api\.amazon\.com\//.test(u)), h.fetched.join(", "));
  });
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ OAUTH FLOW GEÇTİ");
})();
