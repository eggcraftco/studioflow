// The eBay connection lifecycle against the fake Firestore and a fake eBay
// (design §5, §6, §4.11): a state that is single-use, expiring, bound to the
// environment AND to the browser that began the flow; a seller taken from the
// Identity API; credentials in their own boxed document; one refresh at a
// time; a seller marked reconnect_required ONLY for an auth-class failure; and
// a public view that never carries a token, a box or a hash.
//
// The callback is a SIGNED POST (§5.4), not a browser GET: eBay lands on the web
// route, the route relays. So these cases also pin the transport — 405 for a
// GET, 401 for anything unsigned, wrongly signed, stale or key-less, 400 for a
// malformed envelope — and pin that no code, state or nonce reaches a log line
// or a response body on ANY path, error paths included.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { buildEbay, connect, callbackPost, disposePost, signedCallback, callbackRid, fakeRes, TOKEN_KEY, HASH_KEY, CALLBACK_KEY } = require("./helpers/ebayHarness");
const { decryptToken } = require("../../security/tokenBox");
const hashing = require("../../commerce/ebay/hashing");
const realOAuth = require("../../commerce/ebay/oauth");
const { STATE_TTL_MS, TOKEN_REFRESH_AHEAD_MS } = require("../../ebayConnector");

// Everything the suite says out loud, teed into one list for the log pin below.
const captured = [];
const realConsole = { log: console.log, warn: console.warn, error: console.error };
for (const level of ["log", "warn", "error"]) {
  console[level] = (...args) => { captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); realConsole[level](...args); };
}
// Values the pin hunts for. Distinctive on purpose: a generic "code" would make
// the pin pass by accident, and the eight-character prefixes catch a truncated
// echo like JSON.parse's ten-character quote of the body.
const secretsSeen = [];
const watch = (...values) => { for (const v of values) if (typeof v === "string" && v.length >= 8) secretsSeen.push(v); };

let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 320)); }); }
const auth = { uid: "u1" };
const said = (res) => JSON.stringify(res.payload);

(async () => {
  await check("begin hands the owner the consent URL, a state document with the nonce's HASH, and the nonce itself only to the browser", async () => {
    const { fns, store } = buildEbay();
    const out = await fns.beginEbayConnect({ auth, data: { companyId: "c1" } });
    assert.ok(out.authorizeUrl.startsWith("https://auth.sandbox.ebay.com/oauth2/authorize?"));
    assert.ok(out.nonce && out.state); assert.deepStrictEqual(out.scopes.length, 2); assert.strictEqual(out.environment, "sandbox");
    const row = store.read(`ebayConnectStates/${out.state}`);
    assert.strictEqual(row.companyId, "c1"); assert.strictEqual(row.uid, "u1"); assert.strictEqual(row.environment, "sandbox"); assert.strictEqual(row.origin, "web");
    assert.strictEqual(row.nonceHash, require("crypto").createHash("sha256").update(out.nonce).digest("hex"));
    assert.ok(!JSON.stringify(row).includes(out.nonce), "the nonce itself is never stored");
    assert.ok(row.expireAt && row.expiresAt > store.now(), "a TTL twin and an expiry");
    const native = await fns.beginEbayConnect({ auth, data: { companyId: "c1", origin: "native" } });
    assert.strictEqual(native.nonce, undefined, "a native app gets no nonce"); assert.strictEqual(native.authorizeUrl, undefined, "and no URL to open directly");
    assert.ok(native.startUrl.startsWith("https://nivadesk.app/ebay/start?state="));
  });

  await check("begin refuses when the connector switch is off, the flag is off, or the server has no keyset; and for a non-owner", async () => {
    await assert.rejects(buildEbay({ connectorOn: false }).fns.beginEbayConnect({ auth, data: {} }), /not enabled/);
    await assert.rejects(buildEbay({ providerFlag: false }).fns.beginEbayConnect({ auth, data: {} }), /not enabled/);
    await assert.rejects(buildEbay({ configured: false }).fns.beginEbayConnect({ auth, data: {} }), /not configured/);
    await assert.rejects(buildEbay({ owner: false }).fns.beginEbayConnect({ auth: { uid: "u2" }, data: {} }), /not owner/);
  });

  await check("a valid callback (nonce forwarded) connects the seller the Identity API names, boxes both tokens in credentials/current, and proves only orders.read", async () => {
    const { fns, store, calls } = buildEbay();
    const { res, connectionId } = await connect(fns);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.payload.ok, true); assert.strictEqual(res.payload.outcome, "connected"); assert.ok(/^[0-9a-f]{16}$/.test(res.payload.rid), said(res));
    assert.strictEqual(res.redirectedTo, "", "the function answers JSON; the redirect is the web route's");
    assert.strictEqual(res.headers["cache-control"], "no-store");
    const conn = store.read(`ebayConnections/${connectionId}`);
    assert.strictEqual(conn.companyId, "c1"); assert.strictEqual(conn.status, "connected"); assert.strictEqual(conn.sellerUserId, "ebayuser_xxx"); assert.strictEqual(conn.sellerUsername, "eggcraft_uk");
    assert.strictEqual(conn.environment, "sandbox"); assert.strictEqual(conn.readOnly, true); assert.strictEqual(conn.hasCredentials, true);
    assert.strictEqual(conn.sellerUserIdHash, hashing.userIdHash(HASH_KEY, "ebayuser_xxx"), "the keyed hash the deletion task matches on");
    assert.deepStrictEqual(conn.marketplaces, [{ marketplace: "EBAY_GB", enabled: true, currency: "GBP" }]);
    assert.strictEqual(conn.capabilities["orders.read"], true); assert.strictEqual(conn.capabilities["shipment.write"], "not_in_this_release");
    assert.deepStrictEqual(conn.settings, { autoSync: true, includeUnpaid: false, includeCancelled: true });
    assert.ok(!JSON.stringify(conn).includes("at_1") && !JSON.stringify(conn).includes("rt_1"), "no token on the connection document");
    assert.ok(!Object.keys(conn).some((k) => /Encrypted/.test(k)), "the boxes are not on the connection document either");
    const cred = store.read(`ebayConnections/${connectionId}/credentials/current`);
    assert.strictEqual(decryptToken(cred.accessTokenEncrypted, TOKEN_KEY), "at_1"); assert.strictEqual(decryptToken(cred.refreshTokenEncrypted, TOKEN_KEY), "rt_1");
    assert.strictEqual(cred.accessTokenExpiresAtMs, store.now() + 7200 * 1000); assert.strictEqual(cred.refreshTokenExpiresAtMs, store.now() + 47304000 * 1000);
    assert.strictEqual(calls.identities, 1, "the seller was asked from eBay, not read off the URL");
    assert.strictEqual(store.read(`ebayConnectStates/${(await (async () => { const s = store.paths("ebayConnectStates/"); return s[0].split("/")[1]; })())}`).connectionId, connectionId);
  });

  await check("a replayed state, an expired state, an unknown state, a missing code — and a replayed SIGNED POST, which the state stops, not the signature", async () => {
    const { fns, nowRef, calls } = buildEbay();
    const { begun } = await connect(fns);
    watch(begun.state, begun.nonce);
    const replay = await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(replay.statusCode, 200); assert.strictEqual(replay.payload.reason, "state", said(replay));
    assert.strictEqual(calls.exchanges, 1, "no second exchange");
    const expiring = await fns.beginEbayConnect({ auth, data: {} });
    nowRef.value += STATE_TTL_MS + 1000;
    const expired = await callbackPost(fns, { state: expiring.state, nonce: expiring.nonce });
    assert.strictEqual(expired.payload.reason, "state");
    const unknown = await callbackPost(fns, { state: "invented-state-0000000000", code: "x", nonce: "y" });
    assert.strictEqual(unknown.statusCode, 200); assert.strictEqual(unknown.payload.reason, "state", said(unknown));
    const missing = await callbackPost(fns, { state: begun.state, code: "" });
    assert.strictEqual(missing.statusCode, 200); assert.strictEqual(missing.payload.reason, "missing_code", said(missing));
    // The same signed bytes twice: the second one verifies and still loses.
    const fresh = await fns.beginEbayConnect({ auth, data: {} });
    const fields = { v: 1, rid: callbackRid(), code: "good-code", state: fresh.state, nonce: fresh.nonce };
    const first = await signedCallback(fns, fields);
    const second = await signedCallback(fns, fields);
    assert.strictEqual(first.payload.outcome, "connected", said(first));
    assert.strictEqual(second.payload.reason, "state", "replay is stopped by the single-use state, not by the HMAC");
  });

  await check("a callback without the browser's nonce is refused with reason=browser AND the state is burned — a second try with the right nonce cannot follow", async () => {
    const { fns, calls, store } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    watch(begun.state, begun.nonce);
    // The §5 attack: the seller has no cookie, so the web route posts nonce:"".
    // It must still reach here, because the burn is what kills the attacker's state.
    const phished = await callbackPost(fns, { state: begun.state, nonce: "" });
    assert.strictEqual(phished.payload.reason, "browser", said(phished));
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, true, "burned on an ABSENT nonce, not only a wrong one");
    const noKeyAtAll = await fns.beginEbayConnect({ auth, data: {} });
    const omitted = await signedCallback(fns, { v: 1, rid: callbackRid(), code: "good-code", state: noKeyAtAll.state });
    assert.strictEqual(omitted.payload.reason, "browser", "no nonce key in the body is the same as an empty one");
    assert.strictEqual(store.read(`ebayConnectStates/${noKeyAtAll.state}`).used, true);
    const other = await fns.beginEbayConnect({ auth, data: {} });
    const wrong = await callbackPost(fns, { state: other.state, nonce: "not-the-nonce" });
    assert.strictEqual(wrong.payload.reason, "browser");
    assert.strictEqual(store.read(`ebayConnectStates/${other.state}`).used, true);
    const again = await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(again.payload.reason, "state", "burned");
    // The three refusals above each SPENT the code, and that is the other half
    // of the defence: the burn kills this state, the exchange kills this code.
    // A code is bound to the application, not to the state that fetched it, so
    // an unspent one is replayable against any other live state (the case below).
    assert.deepStrictEqual(calls.codes, ["good-code", "good-code", "good-code"], "every refusal that burned a live state also spent the code");
    assert.strictEqual(calls.identities, 0, "spending is one token request: no identity call, nothing asked about the seller");
    assert.strictEqual(store.paths("ebayConnections/").length, 0, "and nothing kept: no connection, no credentials");
  });

  await check("the code a refusal observed is SPENT, so the §5 attacker's fresh-state replay fails — the burn alone never stopped it", async () => {
    // eBay binds a code to the APPLICATION (grant_type, code, one global RuName),
    // never to the state that fetched it, so burning the victim's state leaves
    // the code usable against any other live state. Executed against this
    // handler before the fix: the victim answered `browser` with zero exchanges,
    // and a second, freshly minted state exchanged the same code and connected.
    // Modelled here with eBay's real rule — a code is single use — which the
    // shared fake does not impose, because most cases here reuse "good-code".
    const spent = new Set();
    const singleUse = async ({ code }) => {
      if (spent.has(code)) throw new realOAuth.EbayOAuthError("ebay_oauth_http_400: invalid_grant", { status: 400, errorClass: "auth", code: "invalid_grant" });
      spent.add(code);
      return { access_token: "at_x", expires_in: 7200, refresh_token: "rt_x", refresh_token_expires_in: 47304000, scope: realOAuth.SCOPES.join(" ") };
    };
    const { fns, store, calls } = buildEbay({ oauth: { exchangeCode: singleUse } });
    const victim = await fns.beginEbayConnect({ auth, data: {} });
    const phished = await callbackPost(fns, { state: victim.state, code: "OBSERVED-CODE-9f2a", nonce: "" });
    assert.strictEqual(phished.payload.reason, "browser", said(phished));
    assert.strictEqual(store.read(`ebayConnectStates/${victim.state}`).used, true, "the state is burned");
    assert.ok(spent.has("OBSERVED-CODE-9f2a"), "…and the code is spent, which is the half the burn cannot do");
    assert.strictEqual(store.paths("ebayConnections/").length, 0, "the tokens that came back were thrown away");
    assert.strictEqual(calls.identities, 0);
    // The attacker's own live state, their own nonce, the code they observed.
    const attacker = await fns.beginEbayConnect({ auth, data: {} });
    const replay = await callbackPost(fns, { state: attacker.state, code: "OBSERVED-CODE-9f2a", nonce: attacker.nonce });
    assert.strictEqual(replay.payload.ok, false, said(replay));
    assert.strictEqual(replay.payload.reason, "token", "eBay refuses a spent code — invalid_grant is auth class");
    assert.strictEqual(store.paths("ebayConnections/").length, 0, "nothing landed in the attacker's workspace");
    // And the same fresh state, with a code nobody spent, still connects: the
    // defence is the spending, not a blanket refusal.
    const honest = await fns.beginEbayConnect({ auth, data: {} });
    const good = await callbackPost(fns, { state: honest.state, code: "FRESH-CODE-1", nonce: honest.nonce });
    assert.strictEqual(good.payload.outcome, "connected", said(good));
  });

  await check("a state minted for the sandbox is refused on a production server (reason=environment) — nothing is stored, and the code is spent rather than left alive", async () => {
    const sandbox = buildEbay();
    const begun = await sandbox.fns.beginEbayConnect({ auth, data: {} });
    const production = buildEbay({ environment: "production" });
    production.store.write(`ebayConnectStates/${begun.state}`, sandbox.store.read(`ebayConnectStates/${begun.state}`));
    const res = await callbackPost(production.fns, { state: begun.state, code: "MIXED-ENV-CODE", nonce: begun.nonce });
    assert.strictEqual(res.payload.reason, "environment", said(res));
    assert.strictEqual(production.store.read(`ebayConnectStates/${begun.state}`).used, true, "burned like any other refusal");
    // Best effort by construction: a code minted on the other host will not be
    // redeemed by this one. It costs one refused request and closes the case
    // where the two environments are not really different (a switched flag).
    assert.deepStrictEqual(production.calls.codes, ["MIXED-ENV-CODE"], "the code is presented, not left for a log reader");
    assert.strictEqual(production.calls.identities, 0, "and nothing else happens: no identity call, no connection");
    assert.strictEqual(production.store.paths("ebayConnections/").length, 0);
  });

  await check("the connector switch off answers reason=disabled to a SIGNED caller and 401 to an unsigned one; an identity 403 answers no_seller; a bad code answers token", async () => {
    const off = buildEbay({ connectorOn: false });
    const res = await callbackPost(off.fns, { state: "state-that-does-not-exist", code: "c", nonce: "n" });
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.payload.reason, "disabled", said(res));
    // The gate sits behind the signature: whether the connector is on is not a
    // fact an unauthenticated caller may read.
    const dark = await signedCallback(off.fns, { v: 1, rid: callbackRid(), code: "c", state: "state-that-does-not-exist", nonce: "n" }, { omitSignature: true });
    assert.strictEqual(dark.statusCode, 401); assert.deepStrictEqual(dark.payload, { ok: false }, said(dark));
    const noSeller = buildEbay({ oauth: { fetchIdentity: async () => { throw Object.assign(new Error("ebay_identity_http_403"), { status: 403, errorClass: "permission", code: "no_seller" }); } } });
    const begun = await noSeller.fns.beginEbayConnect({ auth, data: {} });
    const r2 = await callbackPost(noSeller.fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(r2.payload.reason, "no_seller", said(r2));
    assert.strictEqual(noSeller.store.paths("ebayConnections/").length, 0, "nothing stored for a seller we cannot name");
    const bad = buildEbay();
    const b = await bad.fns.beginEbayConnect({ auth, data: {} });
    const r3 = await callbackPost(bad.fns, { state: b.state, code: "bad-code", nonce: b.nonce });
    assert.strictEqual(r3.payload.reason, "token", said(r3));
    // §5.4's stated exception 1 to "a shaped callback always burns": the gate is
    // before the transaction, so a switch flipped MID-FLOW leaves a live state
    // unburned and its code unspent. Harmless while the switch stays off — begin
    // refuses, so no state can be minted to replay that code against, and §2
    // forbids contacting eBay — but it is an exception, so it is executed here
    // rather than promised in prose.
    const live = buildEbay();
    const midFlow = await live.fns.beginEbayConnect({ auth, data: {} });
    live.switches.connectorOn = false;
    const mid = await callbackPost(live.fns, { state: midFlow.state, code: "good-code", nonce: midFlow.nonce });
    assert.strictEqual(mid.payload.reason, "disabled", said(mid));
    assert.strictEqual(live.store.read(`ebayConnectStates/${midFlow.state}`).used, false, "the documented exception: the gate sits before the transaction");
    assert.deepStrictEqual(live.calls.codes, [], "and nothing is presented to eBay while the connector is off");
  });

  // ---- §5.4: the transport ---------------------------------------------------
  await check("the function takes POST only — a GET answers 405, touches no state and reads no body", async () => {
    const { fns, store, calls } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    watch(begun.state, begun.nonce);
    for (const method of ["GET", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"]) {
      const res = await callbackPost(fns, { state: begun.state, nonce: begun.nonce, method });
      assert.strictEqual(res.statusCode, 405, method);
      assert.deepStrictEqual(res.payload, { ok: false }, method);
      assert.strictEqual(res.redirectedTo, "", "405 is an answer, not a redirect");
    }
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, false, "a GET must not burn a state");
    assert.strictEqual(calls.exchanges, 0);
  });

  await check("a query string is refused with 400 before the body is read — the mechanism is originalUrl, never req.query", async () => {
    const { fns, store } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const res = await callbackPost(fns, { state: begun.state, nonce: begun.nonce, originalUrl: "/ebayOAuthCallback?code=leaked" });
    assert.strictEqual(res.statusCode, 400); assert.deepStrictEqual(res.payload, { ok: false }, said(res));
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, false, "nothing stateful was touched");
  });

  await check("an unconfigured or truncated EBAY_CALLBACK_KEY fails closed — with the SAME 401 a wrong key gets, so the status is no configuration oracle, and no state is touched", async () => {
    // §5.4 settles this deliberately: 503 here would be an unauthenticated
    // oracle for whether the secret exists, so an unconfigured key answers 401,
    // identically to a wrong one. The distinction lives only in the ops log.
    const { fns, store, switches } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    watch(begun.state, begun.nonce);
    switches.callbackKey = "";
    const blank = await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(blank.statusCode, 401); assert.deepStrictEqual(blank.payload, { ok: false }, said(blank));
    // Not a safety property: an unconfigured key cannot sign, so nothing reaches
    // the transaction and the state stays LIVE for its TTL — §5's browser binding
    // is suspended for as long as the outage lasts (§5.4, "The burn has one
    // dependency"). Pinned because it is the behaviour; the operator's answer to
    // it is expiring the outstanding states, not a code change.
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, false, "an unconfigured key never reaches the transaction — the state survives, which is the cost, not the comfort");
    switches.callbackKey = "a".repeat(31);
    const short = await callbackPost(fns, { state: begun.state, nonce: begun.nonce, key: "a".repeat(31) });
    assert.strictEqual(short.statusCode, 401, "the 32-character floor is enforced, not assumed");
    switches.callbackKey = CALLBACK_KEY;
    const wrongKey = await callbackPost(fns, { state: begun.state, nonce: begun.nonce, key: crypto.randomBytes(32).toString("hex") });
    assert.strictEqual(wrongKey.statusCode, 401);
    assert.strictEqual(JSON.stringify(blank.payload), JSON.stringify(wrongKey.payload), "byte-identical to a wrong key");
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, false);
    // …and the same state still connects once the key is right: nothing was consumed.
    const good = await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(good.payload.outcome, "connected", said(good));
  });

  await check("the ops lines an outsider can trigger repeat at most once a minute per instance, so the 'not configured' diagnostic cannot be buried", async () => {
    // Every line before the signature check fires on a bare POST from anyone,
    // and one of them is the error-severity line the rollout tells the operator
    // to grep for. Unthrottled, a stranger writes it out of the window it
    // matters in, one line per request, at our expense.
    const { fns, nowRef, switches } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    switches.callbackKey = "";
    const told = () => captured.filter((l) => l.includes("EBAY_CALLBACK_KEY not configured")).length;
    const before = told();
    for (let i = 0; i < 5; i += 1) await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(told() - before, 1, "five anonymous POSTs, one line");
    nowRef.value += 61 * 1000;
    await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(told() - before, 2, "and it is said again a minute later — suppressed, never lost");
    // The map is per instance: a fresh one says it for itself. The throttle
    // bounds noise; it does not hide a configuration fact from a new instance.
    const fresh = buildEbay();
    fresh.switches.callbackKey = "";
    await callbackPost(fresh.fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(told() - before, 3);
  });

  await check("every unauthenticated shape is 401 with a bare body: no signature, wrong key, swapped body, stale or future timestamp, no rawBody", async () => {
    const { fns, nowRef, store } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    watch(begun.state, begun.nonce);
    const fields = { v: 1, rid: callbackRid(), code: "good-code", state: begun.state, nonce: begun.nonce };
    const bare = (res, what) => { assert.strictEqual(res.statusCode, 401, what); assert.deepStrictEqual(res.payload, { ok: false }, what); };
    bare(await signedCallback(fns, fields, { omitSignature: true }), "no signature header");
    bare(await signedCallback(fns, fields, { signature: "v2=deadbeef" }), "wrong version prefix");
    bare(await signedCallback(fns, fields, { signature: `v1=${"z".repeat(64)}` }), "non-hex digest");
    bare(await signedCallback(fns, fields, { signature: "v1=abc" }), "short digest — timingSafeEqual is length-guarded, not thrown through");
    bare(await signedCallback(fns, fields, { key: crypto.randomBytes(32).toString("hex") }), "a rotated-away key");
    // Signed over one body, sent as another: the signature binds THIS body, so a
    // captured request cannot be re-pointed at a different code.
    const swapped = JSON.stringify({ ...fields, code: "attacker-code" });
    bare(await signedCallback(fns, fields, { rawBody: swapped, signOver: JSON.stringify(fields) }), "body swapped after signing");
    bare(await signedCallback(fns, fields, { timestampMs: nowRef.value - 6 * 60 * 1000 }), "six minutes stale");
    bare(await signedCallback(fns, fields, { timestampMs: nowRef.value + 6 * 60 * 1000 }), "six minutes in the future — the window is real in both directions");
    bare(await signedCallback(fns, fields, { timestampHeader: "" }), "no timestamp");
    bare(await signedCallback(fns, fields, { timestampHeader: "not-a-number" }), "non-numeric timestamp");
    bare(await signedCallback(fns, fields, { timestampHeader: "-1757160000123" }), "negative timestamp");
    bare(await signedCallback(fns, fields, { omitRawBody: true }), "no rawBody — a request with no bytes cannot be authenticated, and is never guessed at from req.body");
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, false, "not one of them reached the transaction");
    // Four minutes either way is inside the window, and the state is consumed.
    const early = await signedCallback(fns, fields, { timestampMs: nowRef.value - 4 * 60 * 1000 });
    assert.strictEqual(early.payload.outcome, "connected", said(early));
    const late = await fns.beginEbayConnect({ auth, data: {} });
    const ahead = await callbackPost(fns, { state: late.state, nonce: late.nonce, timestampMs: nowRef.value + 4 * 60 * 1000 });
    assert.strictEqual(ahead.payload.outcome, "connected", said(ahead));
  });

  await check("a clock-skew 401 and a wrong-key 401 are the same answer and DIFFERENT ops lines — the operator can tell a drifted clock from a key mismatch", async () => {
    // Same status, same body, same absence of a rid: the distinction is in our
    // log and never in the answer, so it is no oracle. It exists because a
    // Hostinger process whose time has drifted produces exactly the 401 a
    // half-finished key rotation produces, and a runbook that names only the key
    // sends the operator round the same loop for ever.
    const { fns, nowRef } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const fields = { v: 1, rid: callbackRid(), code: "good-code", state: begun.state, nonce: begun.nonce };
    const counted = (needle) => captured.filter((l) => l.includes(needle)).length;
    const skewBefore = counted("timestamp outside the five-minute window");
    const unsignedBefore = counted("rejected unsigned request");
    const stale = await signedCallback(fns, fields, { timestampMs: nowRef.value - 6 * 60 * 1000 });
    assert.strictEqual(counted("timestamp outside the five-minute window") - skewBefore, 1, "the clock has its own line");
    assert.strictEqual(counted("rejected unsigned request") - unsignedBefore, 0, "and it is not filed as a bad signature");
    nowRef.value += 61 * 1000;
    const wrongKey = await signedCallback(fns, fields, { key: crypto.randomBytes(32).toString("hex") });
    assert.strictEqual(counted("rejected unsigned request") - unsignedBefore, 1);
    assert.strictEqual(stale.statusCode, 401); assert.strictEqual(wrongKey.statusCode, 401);
    assert.strictEqual(JSON.stringify(stale.payload), JSON.stringify(wrongKey.payload), "byte-identical answers: the log is the only place they differ");
    // …and the skew line is throttled like every other pre-signature line: an
    // outsider chooses the timestamp, so it must not be a free line generator.
    const repeatBefore = counted("timestamp outside the five-minute window");
    for (let i = 0; i < 4; i += 1) await signedCallback(fns, fields, { timestampMs: nowRef.value - 6 * 60 * 1000 });
    assert.strictEqual(counted("timestamp outside the five-minute window") - repeatBefore, 1, "four more, one line");
  });

  await check("the envelope is refused with 400 and no rid: an oversized body, a non-JSON body, an array, v:2, and every rid that is not sixteen lowercase hex", async () => {
    const { fns, store } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const ridless = (res, what) => { assert.strictEqual(res.statusCode, 400, what); assert.deepStrictEqual(res.payload, { ok: false }, what); };
    const big = JSON.stringify({ v: 1, rid: callbackRid(), code: "x".repeat(9000), state: begun.state, nonce: "" });
    ridless(await signedCallback(fns, null, { rawBody: big }), "signed 9 KB body");
    ridless(await signedCallback(fns, null, { rawBody: big, omitSignature: true }), "unsigned 9 KB body — the cap is ahead of the HMAC, so it bounds the work the HMAC does");
    ridless(await signedCallback(fns, null, { rawBody: "AUTHCODE_v4x_not_json" }), "non-JSON");
    ridless(await signedCallback(fns, null, { rawBody: "[1,2,3]" }), "a JSON array is not a body");
    ridless(await signedCallback(fns, null, { rawBody: "null" }), "null is not a body");
    ridless(await signedCallback(fns, { v: 2, rid: callbackRid(), code: "c", state: begun.state, nonce: "" }), "v:2");
    for (const rid of [undefined, "", "0123456789abcde", "0123456789abcdef0", "0123456789ABCDEF", "gggggggggggggggg", "0123456\n89abcdef"]) {
      const res = await signedCallback(fns, { v: 1, ...(rid === undefined ? {} : { rid }), code: "good-code", state: begun.state, nonce: begun.nonce });
      ridless(res, `rid ${JSON.stringify(rid)}`);
      assert.strictEqual("rid" in res.payload, false, "a rid that failed its shape is never echoed");
    }
    // A rid set to the code or the state: shaped before it is logged or echoed.
    for (const rid of ["good-code", begun.state]) {
      const res = await signedCallback(fns, { v: 1, rid, code: "good-code", state: begun.state, nonce: begun.nonce });
      ridless(res, "rid pointed at a value");
    }
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, false, "no envelope refusal reached the transaction");
  });

  await check("a malformed state, an over-long code and an over-long nonce are 400 WITH the rid — and a path-shaped state never reaches states().doc()", async () => {
    const { fns, store } = buildEbay();
    const before = store.paths("ebayConnectStates/").length;
    const shaped = async (fields) => { const rid = callbackRid(); const res = await signedCallback(fns, { v: 1, rid, ...fields }); return { res, rid }; };
    // Firestore's own documentPath error embeds the rejected path, and an id may
    // be 1500 bytes — so neither .doc() nor a length check is the filter. §4.5's
    // regex is, and it has to be applied on THIS side.
    for (const state of ["abc/def", "a//b", "x".repeat(1600), "short", "has space", "../../etc"]) {
      const { res, rid } = await shaped({ code: "good-code", state, nonce: "" });
      assert.strictEqual(res.statusCode, 400, state.slice(0, 12));
      assert.deepStrictEqual(res.payload, { ok: false, rid }, state.slice(0, 12));
    }
    const long = await shaped({ code: "x".repeat(4097), state: "a-perfectly-good-state-value", nonce: "" });
    assert.strictEqual(long.res.statusCode, 400); assert.deepStrictEqual(long.res.payload, { ok: false, rid: long.rid });
    const nonce = await shaped({ code: "good-code", state: "a-perfectly-good-state-value", nonce: "n".repeat(201) });
    assert.strictEqual(nonce.res.statusCode, 400); assert.deepStrictEqual(nonce.res.payload, { ok: false, rid: nonce.rid });
    const notAString = await shaped({ code: "good-code", state: "a-perfectly-good-state-value", nonce: 42 });
    assert.strictEqual(notAString.res.statusCode, 400);
    assert.strictEqual(store.paths("ebayConnectStates/").length, before, "no state document was created, read into or written by a malformed request");
  });

  await check("RESPONSE PIN — no answer echoes a code, a state or a nonce back, and the only rid it carries is a shaped one", async () => {
    const { fns } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const CODE = "AUTHCODE-9b2e-never-echoed";
    const answers = [];
    answers.push(await callbackPost(fns, { state: begun.state, code: CODE, nonce: begun.nonce, method: "GET" }));
    answers.push(await callbackPost(fns, { state: begun.state, code: CODE, nonce: begun.nonce, omitSignature: true }));
    answers.push(await signedCallback(fns, { v: 1, rid: CODE, code: CODE, state: begun.state, nonce: begun.nonce }));
    answers.push(await signedCallback(fns, { v: 1, rid: callbackRid(), code: CODE, state: "abc/def", nonce: begun.nonce }));
    answers.push(await callbackPost(fns, { state: "invented-state-0000000000", code: CODE, nonce: "wrong" }));
    answers.push(await callbackPost(fns, { state: begun.state, code: CODE, nonce: "wrong-nonce-entirely" }));
    for (const res of answers) {
      const text = JSON.stringify(res.payload);
      for (const value of [CODE, begun.state, begun.nonce]) {
        assert.ok(!text.includes(value), text);
        assert.ok(!text.includes(value.slice(0, 8)), text);
      }
      if (res.payload && res.payload.rid !== undefined) assert.ok(/^[0-9a-f]{16}$/.test(res.payload.rid), text);
    }
  });

  await check("SOURCE PIN — the handler reads no req.query, redirects nothing, never re-serialises req.body, logs no error message but the pinned one, and is capped at ten instances", async () => {
    const source = fs.readFileSync(path.join(__dirname, "../../ebayConnector.js"), "utf8");
    const from = source.indexOf("const ebayOAuthCallback = onRequest(");
    const to = source.indexOf("// ---- 3. reading and managing a connection", from);
    assert.ok(from > 0 && to > from, "the handler was found");
    const body = source.slice(from, to);
    assert.ok(!/req\.query/.test(body), "req.query is never read — Firebase always populates it, so reading it proves nothing and is the habit that leaked the code");
    assert.ok(!/res\.redirect/.test(body), "the function answers JSON; the redirect is the web route's");
    assert.ok(!/JSON\.stringify\(req\.body\)/.test(body) && !/req\.rawBody\s*\|\|/.test(body), "no re-serialised fallback: it breaks an exact-bytes HMAC silently");
    assert.ok(!/"cancelled"/.test(body), "the decline never reaches the function — the POST body has no error field");
    assert.ok(body.includes("req.originalUrl") && body.includes("req.rawBody"), "the stated query-string mechanism and the raw bytes");
    assert.ok(/maxInstances: 10/.test(body), "a bounded bill for an unkeyed flood");
    // One console line in this handler may carry an error message: §14.1 pins
    // EbayOAuthError's message to eBay's own error / error_description. The pin
    // counts the line; it cannot see which throws reach it, and the try around
    // it is wider than the exception — so the guard is pinned too.
    // opsSay counts as a log call: the pre-signature lines go through it, and a
    // future opsSay(…, error.message) must not slip past a console-only filter.
    const consoleLines = body.split("\n").filter((l) => /console\.(log|warn|error)\(|opsSay\(/.test(l));
    const withMessage = consoleLines.filter((l) => /error\??\.(message|stack)/.test(l));
    assert.deepStrictEqual(withMessage.length, 1, withMessage.join(" | "));
    assert.ok(withMessage[0].includes('console.error("ebayOAuthCallback failed:"'), withMessage[0]);
    assert.ok(/error\?\.name === "EbayOAuthError"/.test(withMessage[0]), "the message line is reached only for the class §14.1 pins");
    assert.ok(!/error\??\.stack/.test(body), "no stack anywhere");
    // The handler is not the whole of §5.4's logging surface, and this is how a
    // real leak got past this pin: `writeSyncEvent` is called from the connect
    // block and `spendAndDiscardCode` from the refusal path, and both are
    // defined ABOVE the slice above. So they are pinned by name.
    for (const name of ["async function writeSyncEvent(", "async function spendAndDiscardCode("]) {
      const at = source.indexOf(name);
      assert.ok(at > 0, `${name} was not found — this pin follows the callback's reachable log sites`);
      const helper = source.slice(at, source.indexOf("\n  }", at));
      assert.ok(!/error\??\.(message|stack)/.test(helper), `${name}) may log a class word, never a caught message`);
    }
    assert.ok(source.includes("crypto.timingSafeEqual(offered, expected)"), "the digests are compared in constant time");
    assert.ok(!source.includes("function connectRedirect"), "connectRedirect had one caller and is gone");
    assert.ok(source.includes("appReturnUrl()"), "appReturnUrl stays — beginEbayConnect derives the native startUrl from it");
  });

  await check("claimEbayConnectState answers only the uid that began the flow, once", async () => {
    const { fns } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: { origin: "native" } });
    await assert.rejects(fns.claimEbayConnectState({ auth: { uid: "u2" }, data: { state: begun.state } }), /different NivaDesk user/);
    await assert.rejects(fns.claimEbayConnectState({ auth: null, data: { state: begun.state } }), /Sign in/);
    const claimed = await fns.claimEbayConnectState({ auth, data: { state: begun.state } });
    assert.ok(claimed.nonce && claimed.authorizeUrl.startsWith("https://auth.sandbox.ebay.com/"));
    await assert.rejects(fns.claimEbayConnectState({ auth, data: { state: begun.state } }), /expired or was already used/);
    const res = await callbackPost(fns, { state: begun.state, nonce: claimed.nonce });
    assert.strictEqual(res.payload.outcome, "connected", "the claimed nonce is the one the callback accepts");
  });

  await check("a connection id carries the workspace; another workspace's id is refused (the isolation boundary)", async () => {
    const { fns, store } = buildEbay();
    const { connectionId } = await connect(fns);
    assert.strictEqual(connectionId, "c1__ebayuser_xxx");
    store.write("ebayConnections/other__ebayuser_yyy", { companyId: "other", provider: "ebay", status: "connected", environment: "sandbox" });
    await assert.rejects(fns.syncEbayNow({ auth, data: { connectionId: "other__ebayuser_yyy" } }), /another workspace/);
    await assert.rejects(fns.disconnectEbay({ auth, data: { connectionId: "other__ebayuser_yyy" } }), /another workspace/);
    await assert.rejects(fns.disconnectEbay({ auth, data: { connectionId: "nope" } }), /No such/);
    await assert.rejects(fns.disconnectEbay({ auth, data: { connectionId: "bad id!" } }), /connectionId/);
    const listed = await fns.getEbayConnections({ auth, data: {} });
    assert.deepStrictEqual(listed.connections.map((c) => c.id), [connectionId], "a member sees only the workspace's own rows");
  });

  await check("a reconnect keeps connectedAtMs, settings, importState and importCursor, replaces the credentials, and owes a catch-up from the watermark", async () => {
    const { fns, store, nowRef } = buildEbay();
    const { connectionId } = await connect(fns);
    const firstConnectedAt = store.read(`ebayConnections/${connectionId}`).connectedAtMs;
    await fns.updateEbayConnectionSettings({ auth, data: { connectionId, settings: { includeUnpaid: true } } });
    store.write(`ebayConnections/${connectionId}`, { ...store.read(`ebayConnections/${connectionId}`), importState: "done", importCursor: { sinceMs: 1, untilMs: 2, failedIds: [] }, status: "reconnect_required", lastErrorCode: "credentials_rejected" });
    store.write(`commerceCursors/ebay__${connectionId}__order`, { watermarkMs: nowRef.value - 3600000 });
    nowRef.value += 60000;
    const { res } = await connect(fns);
    assert.strictEqual(res.payload.outcome, "connected", said(res));
    const conn = store.read(`ebayConnections/${connectionId}`);
    assert.strictEqual(conn.status, "connected"); assert.strictEqual(conn.lastErrorCode, "");
    assert.strictEqual(conn.connectedAtMs, firstConnectedAt); assert.strictEqual(conn.settings.includeUnpaid, true); assert.strictEqual(conn.importState, "done"); assert.deepStrictEqual(conn.importCursor, { sinceMs: 1, untilMs: 2, failedIds: [] });
    assert.strictEqual(conn.catchUpDueFromMs, nowRef.value - 60000 - 3600000, "the gap since the watermark is read again on the next pass");
    assert.strictEqual(decryptToken(store.read(`ebayConnections/${connectionId}/credentials/current`).accessTokenEncrypted, TOKEN_KEY), "at_2");
    const events = store.paths(`ebayConnections/${connectionId}/syncLog/`).map((p) => store.read(p).type);
    assert.ok(events.includes("connected") && events.includes("reconnected"));
  });

  await check("a token near expiry is refreshed once behind the lock even when two callers race; a fresh token is not refreshed again", async () => {
    const { fns, store, calls } = buildEbay();
    const { connectionId } = await connect(fns);
    const ref = store.admin.firestore().collection("ebayConnections").doc(connectionId);
    store.write(`ebayConnections/${connectionId}/credentials/current`, { ...store.read(`ebayConnections/${connectionId}/credentials/current`), accessTokenExpiresAtMs: store.now() + TOKEN_REFRESH_AHEAD_MS - 1000 });
    const data = store.read(`ebayConnections/${connectionId}`);
    const [a, b] = await Promise.all([fns._internal.clientFor(ref, data), fns._internal.clientFor(ref, data)]);
    assert.ok(a && b); assert.strictEqual(calls.refreshes, 1, "one flight");
    const cred = store.read(`ebayConnections/${connectionId}/credentials/current`);
    assert.strictEqual(cred.refreshLockUntilMs, 0); assert.strictEqual(decryptToken(cred.accessTokenEncrypted, TOKEN_KEY), "at_refreshed_1");
    assert.strictEqual(decryptToken(cred.refreshTokenEncrypted, TOKEN_KEY), "rt_1", "eBay did not rotate the refresh token, so it stays");
    assert.strictEqual(store.read(`ebayConnections/${connectionId}`).accessTokenExpiresAtMs, cred.accessTokenExpiresAtMs, "the public mirror follows");
    await fns._internal.clientFor(ref, data);
    assert.strictEqual(calls.refreshes, 1, "a fresh token is left alone");
  });

  await check("the loser of a stuck lock refuses an expired token rather than racing (unavailable)", async () => {
    const { fns, store } = buildEbay();
    const { connectionId } = await connect(fns);
    fns._internal.limits.refreshWaitPolls = 2;
    store.write(`ebayConnections/${connectionId}/credentials/current`, { ...store.read(`ebayConnections/${connectionId}/credentials/current`), accessTokenExpiresAtMs: store.now() - 1, refreshLockUntilMs: store.now() + 60000 });
    const ref = store.admin.firestore().collection("ebayConnections").doc(connectionId);
    await assert.rejects(fns._internal.clientFor(ref, store.read(`ebayConnections/${connectionId}`)), /being refreshed/);
  });

  await check("only an auth-class refusal flips reconnect_required: invalid_grant does, invalid_client (our keyset) does not, a 503 does not", async () => {
    const grant = buildEbay({ oauth: { refreshToken: async () => { throw Object.assign(new Error("ebay_oauth_http_400: invalid_grant"), { status: 400, errorClass: "auth", code: "invalid_grant" }); } } });
    const { connectionId } = await connect(grant.fns);
    const expire = (h, id) => h.store.write(`ebayConnections/${id}/credentials/current`, { ...h.store.read(`ebayConnections/${id}/credentials/current`), accessTokenExpiresAtMs: h.store.now() - 1 });
    expire(grant, connectionId);
    await assert.rejects(grant.fns._internal.clientFor(grant.store.admin.firestore().collection("ebayConnections").doc(connectionId), grant.store.read(`ebayConnections/${connectionId}`)));
    const g = grant.store.read(`ebayConnections/${connectionId}`);
    assert.strictEqual(g.status, "reconnect_required"); assert.strictEqual(g.lastErrorCode, "credentials_rejected");
    assert.ok(grant.store.paths(`ebayConnections/${connectionId}/syncLog/`).some((p) => grant.store.read(p).type === "reauthorization_required"));

    const client = buildEbay({ oauth: { refreshToken: async () => { throw Object.assign(new Error("ebay_oauth_http_400: invalid_client"), { status: 400, errorClass: "permission", code: "app_credentials_invalid" }); } } });
    await connect(client.fns); expire(client, connectionId);
    await assert.rejects(client.fns._internal.clientFor(client.store.admin.firestore().collection("ebayConnections").doc(connectionId), client.store.read(`ebayConnections/${connectionId}`)));
    const c = client.store.read(`ebayConnections/${connectionId}`);
    assert.strictEqual(c.status, "connected", "a misconfigured keyset never marks a seller reconnect_required"); assert.strictEqual(c.lastErrorCode, "app_credentials_invalid");

    const down = buildEbay({ oauth: { refreshToken: async () => { throw Object.assign(new Error("ebay_oauth_http_503"), { status: 503, errorClass: "transient", code: "provider_unavailable" }); } } });
    await connect(down.fns); expire(down, connectionId);
    await assert.rejects(down.fns._internal.clientFor(down.store.admin.firestore().collection("ebayConnections").doc(connectionId), down.store.read(`ebayConnections/${connectionId}`)));
    const d = down.store.read(`ebayConnections/${connectionId}`);
    assert.strictEqual(d.status, "connected"); assert.strictEqual(d.lastErrorCode, "provider_unavailable");

    const malformed = buildEbay({ oauth: { refreshToken: async () => { throw Object.assign(new Error("ebay_oauth_http_400: invalid_request"), { status: 400, errorClass: "validation", code: "token_request_invalid" }); } } });
    await connect(malformed.fns); expire(malformed, connectionId);
    await assert.rejects(malformed.fns._internal.clientFor(malformed.store.admin.firestore().collection("ebayConnections").doc(connectionId), malformed.store.read(`ebayConnections/${connectionId}`)));
    assert.strictEqual(malformed.store.read(`ebayConnections/${connectionId}`).status, "connected"); assert.strictEqual(malformed.store.read(`ebayConnections/${connectionId}`).lastErrorCode, "token_request_invalid");
  });

  await check("a credentials document that is missing or unreadable is token_unreadable → reconnect_required", async () => {
    const { fns, store } = buildEbay();
    const { connectionId } = await connect(fns);
    store.docs.delete(`ebayConnections/${connectionId}/credentials/current`);
    await assert.rejects(fns._internal.clientFor(store.admin.firestore().collection("ebayConnections").doc(connectionId), store.read(`ebayConnections/${connectionId}`)), /credentials_missing/);
    const conn = store.read(`ebayConnections/${connectionId}`);
    assert.strictEqual(conn.status, "reconnect_required"); assert.strictEqual(conn.lastErrorCode, "token_unreadable");
  });

  await check("disconnect deletes credentials/current, records who did it, keeps the orders and is never gated", async () => {
    const { fns, store } = buildEbay({ connectorOn: false, providerFlag: false });
    // Connect with the switch on, then flip it off: disconnect must still work.
    const on = buildEbay();
    const { connectionId } = await connect(on.fns);
    for (const p of on.store.paths("ebayConnections/")) store.write(p, on.store.read(p));
    const out = await fns.disconnectEbay({ auth: { uid: "u1" }, data: { connectionId } });
    assert.deepStrictEqual(out, { ok: true, ordersKept: true, revoked: false });
    assert.strictEqual(store.read(`ebayConnections/${connectionId}/credentials/current`), undefined, "the boxes are gone, not blanked");
    const conn = store.read(`ebayConnections/${connectionId}`);
    assert.strictEqual(conn.status, "disconnected"); assert.strictEqual(conn.hasCredentials, false); assert.strictEqual(conn.disconnectedByUid, "u1"); assert.strictEqual(conn.disconnectReason, "owner");
    const listed = await fns.getEbayConnections({ auth, data: {} });
    assert.strictEqual(listed.connections[0].specStatus, "disconnected");
  });

  await check("the public view carries no box, no token, no hash and no nonce hash — and configured is false while the switch is off", async () => {
    const { fns, store } = buildEbay();
    const { connectionId } = await connect(fns);
    const listed = await fns.getEbayConnections({ auth, data: {} });
    assert.strictEqual(listed.configured, true); assert.strictEqual(listed.environment, "sandbox");
    const view = listed.connections[0];
    const text = JSON.stringify(view);
    assert.ok(!text.includes("Encrypted") && !text.includes("at_1") && !text.includes("rt_1"), text);
    assert.ok(!Object.keys(view).some((k) => /Hash$/.test(k)), Object.keys(view).join(","));
    assert.strictEqual(view.readOnly, true); assert.strictEqual(view.specStatus, "connected_read_only"); assert.strictEqual(view.needsReconnect, false); assert.strictEqual(view.paused, false);
    assert.deepStrictEqual(view.quota, { today: 0, share: 500, cap: 5000, appToday: 0 });
    assert.ok(view.reauthorizeByMs > store.now(), "the card can say 'reconnect before <date>'");
    assert.ok(view.recentEvents.some((e) => e.type === "connected"));
    const off = buildEbay({ connectorOn: false });
    for (const p of store.paths("ebayConnections/")) off.store.write(p, store.read(p));
    const dark = await off.fns.getEbayConnections({ auth, data: {} });
    assert.strictEqual(dark.configured, false, "the not-set-up card, never a dead Connect button");
    assert.strictEqual(dark.connections[0].specStatus, "suspended"); assert.strictEqual(dark.connections[0].paused, true);
    void connectionId;
  });

  await check("settings whitelist drops unknown keys and non-booleans; a marketplace toggle refuses an unseen id and a currency change; sinceDays is clamped", async () => {
    const { fns, store } = buildEbay();
    const { connectionId } = await connect(fns);
    const out = await fns.updateEbayConnectionSettings({ auth, data: { connectionId, settings: { autoSync: "no", includeUnpaid: true, includeCancelled: 0, evil: true, importPolicy: "all" } } });
    assert.deepStrictEqual(out.settings, { autoSync: true, includeUnpaid: true, includeCancelled: true });
    assert.deepStrictEqual(store.read(`ebayConnections/${connectionId}`).settings, { autoSync: true, includeUnpaid: true, includeCancelled: true }, "nothing unshaped reached the document");
    await assert.rejects(fns.updateEbayConnectionSettings({ auth, data: { connectionId, marketplaces: [{ marketplace: "EBAY_US", enabled: false }] } }), /Unknown eBay marketplace/);
    await assert.rejects(fns.updateEbayConnectionSettings({ auth, data: { connectionId, marketplaces: [{ marketplace: "EBAY_GB", enabled: "false" }] } }), /Unknown eBay marketplace/);
    await assert.rejects(fns.updateEbayConnectionSettings({ auth, data: { connectionId, marketplaces: [{ marketplace: "EBAY_GB", enabled: false, currency: "USD" }] } }), /Unknown eBay marketplace/);
    const toggled = await fns.updateEbayConnectionSettings({ auth, data: { connectionId, marketplaces: [{ marketplace: "ebay_gb", enabled: false }] } });
    assert.deepStrictEqual(toggled.marketplaces, [{ marketplace: "EBAY_GB", enabled: false, currency: "GBP" }]);
    assert.strictEqual(fns._internal.clampSinceDays(400), 90); assert.strictEqual(fns._internal.clampSinceDays(0), 90); assert.strictEqual(fns._internal.clampSinceDays(-3), 1); assert.strictEqual(fns._internal.clampSinceDays(30), 30); assert.strictEqual(fns._internal.clampSinceDays("abc"), 90);
    const member = buildEbay({ owner: false });
    for (const p of store.paths("ebayConnections/")) member.store.write(p, store.read(p));
    await assert.rejects(member.fns.updateEbayConnectionSettings({ auth: { uid: "u2" }, data: { connectionId, settings: { autoSync: false } } }), /not owner/, "settings are the owner's");
  });

  await check("verify proves orders.read with a one-order read and never throws for a provider failure", async () => {
    const { fns, store, ebay } = buildEbay();
    const { connectionId } = await connect(fns);
    const ok = await fns.verifyEbayConnection({ auth, data: { connectionId } });
    assert.deepStrictEqual(ok, { ok: true, healthy: true, reason: "" });
    assert.strictEqual(ebay.calls.filter((c) => c.op === "getOrders").pop().limit, 1);
    assert.ok(store.read(`ebayConnections/${connectionId}`).lastVerifiedAtMs > 0);
    ebay.createClient = () => ({ async getOrders() { const e = new Error("ebay_http_429"); e.status = 429; e.errorClass = "transient"; throw e; } });
    const limited = await fns.verifyEbayConnection({ auth, data: { connectionId } });
    assert.deepStrictEqual(limited, { ok: true, healthy: false, reason: "rate_limited" });
    store.write(`ebayConnections/${connectionId}`, { ...store.read(`ebayConnections/${connectionId}`), status: "reconnect_required", lastErrorCode: "credentials_rejected" });
    assert.deepStrictEqual(await fns.verifyEbayConnection({ auth, data: { connectionId } }), { ok: true, healthy: false, reason: "credentials_rejected" });
  });

  await check("a throw the design does not pin — anything but EbayOAuthError inside the exchange block — is logged as a class word, never as a message", async () => {
    // §5.4's one logging exception is EbayOAuthError's message, which §14.1 pins
    // to eBay's own error / error_description. The try it sits in is wider than
    // that: the token box, three Firestore writes, the cursor read and the health
    // touch all land in the same catch, and nothing pins THEIR messages. The
    // source pin cannot see this — it counts the log line, not what can reach it
    // — so the behaviour is pinned here, with a throw carrying a marker value.
    const MARKER = "MARKER-VALUE-that-must-never-be-logged";
    watch(MARKER);
    const { fns } = buildEbay({ oauth: { fetchIdentity: async () => { throw new Error(`a Firestore-shaped failure carrying ${MARKER}`); } } });
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const before = captured.length;
    const res = await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.payload.reason, "exchange", said(res));
    const lines = captured.slice(before);
    assert.ok(lines.some((l) => l.includes("ebayOAuthCallback failed") && l.includes("class=unknown")), lines.join(" | "));
    for (const line of lines) { assert.ok(!line.includes(MARKER), line); assert.ok(!line.includes(MARKER.slice(0, 8)), line); }
    // …and the pinned class still logs its message, which is where an exchange
    // refusal's cause actually lives.
    const pinned = buildEbay();
    const begun2 = await pinned.fns.beginEbayConnect({ auth, data: {} });
    const mark = captured.length;
    const refused = await callbackPost(pinned.fns, { state: begun2.state, nonce: begun2.nonce, code: "bad-code" });
    assert.strictEqual(refused.payload.reason, "token", said(refused));
    assert.ok(captured.slice(mark).some((l) => l.includes("ebayOAuthCallback failed:") && l.includes("invalid_grant")), "the EbayOAuthError message is the one that may be logged");
  });

  await check("a Firestore refusal on the callback's OWN success path is logged as a class word — the syncLog write is inside §5.4's rule, not beside it", async () => {
    // Found by execution rather than by reading: making the syncLog write throw
    // printed the refused write's message verbatim, from a line neither pin
    // could see. The SOURCE PIN slices only the handler body, and writeSyncEvent
    // is defined above it; the LOG PIN never drove a failing syncLog write.
    const MARKER = "MARKER-SYNCLOG-must-never-be-logged";
    watch(MARKER);
    const { fns, store } = buildEbay();
    store.refuseWrites(/\/syncLog$/, `7 INVALID_ARGUMENT: write refused ${MARKER}`);
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const before = captured.length;
    const res = await callbackPost(fns, { state: begun.state, nonce: begun.nonce });
    // The row is best effort — a lost audit line must not lose the connection.
    assert.strictEqual(res.payload.outcome, "connected", said(res));
    const lines = captured.slice(before);
    assert.ok(lines.some((l) => l.includes("ebay syncLog write failed") && l.includes("class=")), lines.join(" | "));
    for (const line of lines) { assert.ok(!line.includes(MARKER), line); assert.ok(!line.includes(MARKER.slice(0, 8)), line); }
  });

  // ---- §5.5: the browser-binding ticket, and the disposal envelope ----------
  // The ticket is minted here and verified in the web tier, so these cases pin
  // the MINTER: the shape the verifier parses, the key derivation both sides
  // must agree on, and the two rules that make "no state ever has two live
  // tickets" true. What the verifier does with one is the relay script's job
  // (studioflow-web/scripts/check-ebay-relay-vectors.mjs), which runs the real
  // route against this real function.
  const TICKET_PATTERN = /^nv1\.[A-Za-z0-9_-]{20,120}\.[A-Za-z0-9_-]{43}\.[0-9]{13}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
  const derivedKey = (key = CALLBACK_KEY) => crypto.createHmac("sha256", key).update("nivadesk/ebay/ticket/v1", "utf8").digest();
  const ticketParts = (ticket) => {
    const bits = String(ticket).split(".");
    return { version: bits[0], state: bits[1], tag: bits[2], expMs: Number(bits[3]), jti: bits[4], mac: bits[5], payload: bits.slice(0, 5).join(".") };
  };
  const macOf = (payload, key = CALLBACK_KEY) => crypto.createHmac("sha256", derivedKey(key)).update(payload, "utf8").digest("base64url");
  const tagOf = (nonce, key = CALLBACK_KEY) => crypto.createHmac("sha256", derivedKey(key)).update(`nonce.${nonce}`, "utf8").digest("base64url");

  await check("begin mints a ticket beside the nonce — over that nonce, over the state's OWN expiry, and under a key derived from the relay key", async () => {
    const { fns, store, switches } = buildEbay();
    const out = await fns.beginEbayConnect({ auth, data: { companyId: "c1" } });
    const row = store.read(`ebayConnectStates/${out.state}`);
    assert.ok(TICKET_PATTERN.test(out.ticket), out.ticket);
    const parts = ticketParts(out.ticket);
    assert.strictEqual(parts.state, out.state, "the ticket names its own state");
    assert.strictEqual(parts.expMs, row.expiresAt, "expMs is the state document's expiry, never now + ten minutes");
    assert.strictEqual(parts.tag, tagOf(out.nonce), "the nonce tag is keyed, over this nonce");
    assert.strictEqual(parts.mac, macOf(parts.payload), "the MAC covers the exact ASCII prefix including nv1.");
    // A ticket must carry nothing the state document compares, so the tag is NOT
    // sha256hex(nonce) — that value is what `nonceHash` is checked against.
    assert.ok(!out.ticket.includes(row.nonceHash), "the ticket does not carry the stored nonce hash");
    assert.ok(!out.ticket.includes(out.nonce), "nor the nonce itself");
    // Two begins, two jti — a ticket is not a deterministic function of values
    // an attacker may know.
    const twin = await fns.beginEbayConnect({ auth, data: { companyId: "c1" } });
    assert.notStrictEqual(ticketParts(twin.ticket).jti, parts.jti);
    // A native app can hold neither cookie, so it gets neither half (§5.2).
    const native = await fns.beginEbayConnect({ auth, data: { companyId: "c1", origin: "native" } });
    assert.strictEqual(native.ticket, undefined, "a native begin mints no ticket");
    // No key, no ticket: there would be nothing to verify it with and nothing to
    // sign either envelope with, so the client refuses to send the seller to
    // eBay rather than manufacturing a code whose return leg is already doomed.
    switches.callbackKey = "";
    assert.strictEqual((await fns.beginEbayConnect({ auth, data: { companyId: "c1" } })).ticket, "");
    switches.callbackKey = "short";
    assert.strictEqual((await fns.beginEbayConnect({ auth, data: { companyId: "c1" } })).ticket, "");
  });

  await check("claimEbayConnectState refuses a WEB-origin state — the guard that makes 'no state ever has two live tickets' true", async () => {
    const { fns, store } = buildEbay();
    // The sequence this closes is not an attack — it needs the state's own owner
    // — but it is legitimate and it ends with a ticket verifying at the edge
    // against a nonce the document has replaced, which the runbook would read as
    // a bug. Claim rewrites nonceHash, and a web state is never claimed by the
    // web flow, so it was claimable exactly once.
    const web = await fns.beginEbayConnect({ auth, data: { companyId: "c1" } });
    const hashBefore = store.read(`ebayConnectStates/${web.state}`).nonceHash;
    await assert.rejects(fns.claimEbayConnectState({ auth, data: { state: web.state } }), /expired or was already used/);
    assert.strictEqual(store.read(`ebayConnectStates/${web.state}`).nonceHash, hashBefore, "the refused claim rewrote nothing");
    assert.strictEqual(store.read(`ebayConnectStates/${web.state}`).claimedAtMs, 0);
    // …and the web ticket it already minted still verifies against the web nonce.
    assert.strictEqual(ticketParts(web.ticket).tag, tagOf(web.nonce));

    const native = await fns.beginEbayConnect({ auth, data: { companyId: "c1", origin: "native" } });
    const claimed = await fns.claimEbayConnectState({ auth, data: { state: native.state } });
    const row = store.read(`ebayConnectStates/${native.state}`);
    assert.ok(TICKET_PATTERN.test(claimed.ticket), claimed.ticket);
    assert.strictEqual(ticketParts(claimed.ticket).state, native.state);
    assert.strictEqual(ticketParts(claimed.ticket).tag, tagOf(claimed.nonce), "over the FRESH nonce this claim wrote");
    assert.strictEqual(ticketParts(claimed.ticket).expMs, row.expiresAt, "and over the row's own expiry, not now + ten minutes");
    assert.strictEqual(ticketParts(claimed.ticket).mac, macOf(ticketParts(claimed.ticket).payload));
    await assert.rejects(fns.claimEbayConnectState({ auth, data: { state: native.state } }), /expired or was already used/);
  });

  await check("dispose: the envelope can name no state and no nonce, and its shape checks are charged before anything else", async () => {
    const { fns, store, calls } = buildEbay();
    const paths = store.paths("").length;
    const rid = callbackRid();
    // A body carrying either key is refused on the AUTHORITATIVE side: this is
    // the structural property criterion 7 asks for, not an assertion about what
    // the route happens to send.
    for (const extra of [{ state: "a-perfectly-good-state-value" }, { nonce: "n" }, { state: "x", nonce: "y" }]) {
      const res = await signedCallback(fns, { v: 1, op: "dispose", rid, code: "good-code", ...extra });
      assert.strictEqual(res.statusCode, 400, JSON.stringify(extra));
      assert.deepStrictEqual(res.payload, { ok: false, rid }, JSON.stringify(extra));
    }
    // `String(body.code || "")` would coerce these without complaint, and an
    // empty code would consume a bucket token and make a pointless outbound
    // request: free amplification at no attacker cost.
    for (const code of [{ evil: 1 }, ["x"], 42, true, null, "", "x".repeat(5000)]) {
      const res = await disposePost(fns, { code, rid });
      assert.strictEqual(res.statusCode, 400, JSON.stringify(code));
      assert.deepStrictEqual(res.payload, { ok: false, rid }, JSON.stringify(code));
    }
    // An ABSENT code, which is a body with no `code` key at all rather than one
    // whose value is undefined: `signedCallback` builds the bytes, so nothing in
    // the helper can fill it back in.
    const absent = await signedCallback(fns, { v: 1, op: "dispose", rid });
    assert.strictEqual(absent.statusCode, 400);
    assert.deepStrictEqual(absent.payload, { ok: false, rid });
    assert.strictEqual(calls.exchanges, 0, "not one outbound request for eleven refused bodies");
    assert.strictEqual(store.paths("").length, paths, "and not one document read into or written");
    // None of them consumed a token either: six disposals still fit in the minute.
    for (let i = 0; i < 6; i += 1) await disposePost(fns, { code: `code-${i}` });
    assert.strictEqual(calls.exchanges, 6, "the refused bodies charged no bucket token");
    // An unknown op is a protocol error, out of a closed two-word vocabulary.
    const unknown = await signedCallback(fns, { v: 1, op: "burn", rid, code: "good-code" });
    assert.strictEqual(unknown.statusCode, 400);
    assert.deepStrictEqual(unknown.payload, { ok: false, rid });
  });

  await check("dispose: one exchange, no identity call, no Firestore, no connection — and the same answer every time", async () => {
    const { fns, store, calls } = buildEbay();
    const paths = store.paths("").length;
    const rid = callbackRid();
    const res = await disposePost(fns, { code: "good-code", rid });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.payload, { ok: false, outcome: "error", reason: "browser", rid });
    assert.strictEqual(calls.exchanges, 1);
    assert.deepStrictEqual(calls.codes, ["good-code"]);
    assert.strictEqual(calls.identities, 0, "no identity call: nothing is being connected");
    assert.strictEqual(store.paths("").length, paths, "no document is read, written or created");
    // A code eBay refuses is the outcome we want, so the answer is identical.
    const refused = await disposePost(fns, { code: "bad-code", rid });
    assert.deepStrictEqual(refused.payload, { ok: false, outcome: "error", reason: "browser", rid });
  });

  await check("dispose: the seventh inside one minute makes no eBay call, and a switch turns the call off without changing the answer", async () => {
    const { fns, calls, switches } = buildEbay();
    const rid = callbackRid();
    const answers = [];
    for (let i = 0; i < 7; i += 1) answers.push(await disposePost(fns, { code: `code-${i}`, rid }));
    assert.strictEqual(calls.exchanges, 6, "six a minute per instance, and maxInstances: 10 makes that 60 system-wide");
    // Byte-identical: the bound is a cost control, and nothing a seller or an
    // attacker can see may depend on it.
    for (const res of answers) assert.deepStrictEqual(res.payload, { ok: false, outcome: "error", reason: "browser", rid });
    // NIVADESK_EBAY_DISPOSE=0 — safe to throw in an incident, because eBay's
    // token endpoint is shared with every live connection's refresh.
    const off = buildEbay();
    off.switches.disposeEnabled = false;
    const quiet = await disposePost(off.fns, { code: "good-code", rid });
    assert.strictEqual(off.calls.exchanges, 0);
    assert.deepStrictEqual(quiet.payload, { ok: false, outcome: "error", reason: "browser", rid });
    // The connector switch is a different thing and answers a different word:
    // §2 forbids reaching eBay at all while it is off.
    switches.connectorOn = false;
    const disabled = await disposePost(fns, { code: "good-code", rid });
    assert.deepStrictEqual(disabled.payload, { ok: false, outcome: "error", reason: "disabled", rid });
    assert.strictEqual(calls.exchanges, 6, "nothing was contacted while the connector was off");
  });

  await check("dispose: the per-minute aggregate counts spent and refused apart — the only signal a wrong RuName would ever give", async () => {
    const { fns, nowRef } = buildEbay();
    const before = captured.length;
    await disposePost(fns, { code: "good-code" });
    await disposePost(fns, { code: "bad-code" });     // eBay refuses it
    // The aggregate is emitted at most once a minute per instance, so nothing
    // has been said yet: an example line is throttled, a COUNT must not be.
    assert.ok(!captured.slice(before).some((l) => l.includes("ebay callback dispose window=")), captured.slice(before).join(" | "));
    nowRef.value += 61 * 1000;
    await disposePost(fns, { code: "good-code" });
    const line = captured.slice(before).find((l) => l.includes("ebay callback dispose window="));
    assert.ok(line, captured.slice(before).join(" | "));
    assert.ok(/spent=1 refused=1 throttled=0 disabled=0$/.test(line), line);
    // A wholesale RuName or environment mismatch shows up as spent=0 refused=n
    // instead of silence — the failure is swallowed by design, so the count is
    // the only thing that can tell an operator the disposal never works.
    const wrong = buildEbay();
    const mark = captured.length;
    for (const code of ["bad-code", "bad-code-2"]) await disposePost(wrong.fns, { code });
    wrong.nowRef.value += 61 * 1000;
    await disposePost(wrong.fns, { code: "bad-code-3" });
    const mismatch = captured.slice(mark).find((l) => l.includes("ebay callback dispose window="));
    assert.ok(mismatch && /spent=0 refused=2 /.test(mismatch), String(mismatch));
  });

  // ---- VECTOR CASES BEGIN --------------------------------------------------
  // The committed vectors (design §5.5, "The committed signature vectors — the
  // skip ends here"). §5.4 planned this file and it was never written, blocked
  // on one question: who mints the fixture key and where is it recorded? The
  // fixture answers it by minting the key inside itself and saying so on its
  // face; nothing outside `functions/test/**` and `studioflow-web/scripts/**`
  // may hold that value, and the fifth case below proves it by grepping the
  // repository.
  //
  // Why this exists beside `check-ebay-relay-vectors.mjs`, which already runs
  // the two implementations against each other: that check is SYMMETRIC. It
  // proves the route and the function agree, and it stays green just as happily
  // if both of them move together. It is also why the `macOf`/`tagOf` helpers
  // above cannot do this job — they are a second implementation living in the
  // test, so they move with whoever edits them. A frozen answer is the only
  // thing that notices a matched pair of edits, and there are two canonical
  // strings to keep still now: the relay signature and the ticket.
  //
  // There is no SKIP path in any of this. A missing fixture is four failing
  // cases, and the sixth case pins that neither this file nor the relay script
  // can report green without having read it.
  const VECTOR_PATH = path.join(__dirname, "..", "fixtures", "ebay-callback-signature-vectors.json");
  const RELAY_SCRIPT = path.join(__dirname, "..", "..", "..", "studioflow-web", "scripts", "check-ebay-relay-vectors.mjs");
  // No try/catch and no default: every case that needs the fixture reads it, and
  // an unreadable one throws ENOENT into that case's own FAIL line.
  const readVectors = () => JSON.parse(fs.readFileSync(VECTOR_PATH, "utf8"));
  /** The real minter, asked for the same ticket twice — the one stub in here. */
  const mintWithJti = (fns, state, nonce, expMs, jti) => {
    const realRandomBytes = crypto.randomBytes;
    const fixed = Buffer.from(jti, "base64url");
    crypto.randomBytes = (size) => (size === fixed.length ? Buffer.from(fixed) : realRandomBytes(size));
    try { return fns._internal.mintTicket(state, nonce, expMs); } finally { crypto.randomBytes = realRandomBytes; }
  };

  await check("VECTORS — the fixture is committed, mints its own key inside itself, and says on its face that the key is a test key", async () => {
    const v = readVectors();
    assert.strictEqual(v.keyLabel, "TEST-KEY-NOT-A-SECRET", "the label is the thing a reader sees first");
    assert.ok(v.README.startsWith("TEST VECTORS ONLY."), v.README.slice(0, 40));
    // The README must name both places the value must never be put, because a
    // 64-hex string in a committed file is exactly the shape of a mistake.
    assert.ok(v.README.includes("EBAY_CALLBACK_KEY") && v.README.includes("NIVADESK_EBAY_CALLBACK_KEY"));
    assert.ok(/NEVER/.test(v.README), "and say never, in a word nobody can read past");
    assert.ok(/^[0-9a-f]{64}$/.test(v.key) && /^[0-9a-f]{64}$/.test(v.wrongKey), "32 bytes each, as hex");
    assert.notStrictEqual(v.key, v.wrongKey);
    assert.strictEqual(v.generatedBy, "functions/test/fixtures/generate-ebay-callback-vectors.mjs");
    assert.deepStrictEqual(v.consumedBy.slice().sort(), ["functions/test/qa/ebay-connect.test.js", "studioflow-web/scripts/check-ebay-relay-vectors.mjs"]);
    // The five cases the ticket named, plus the second envelope, by id.
    assert.deepStrictEqual(v.relayVectors.map((r) => r.id).sort(),
      ["relay-connect-valid", "relay-dispose-valid", "relay-future-timestamp", "relay-stale-timestamp", "relay-swapped-body", "relay-wrong-key"]);
    assert.deepStrictEqual(v.relayVectors.map((r) => r.expect).sort(), ["ok", "ok", "skew", "skew", "unsigned", "unsigned"]);
    assert.ok(v.ticketVectors.length >= 4 && v.ticketVectors.some((t) => t.expect === "ok"));
    // A vector with no frozen answer in it is not a vector.
    for (const r of v.relayVectors) assert.ok(/^[0-9a-f]{64}$/.test(r.signature), r.id);
    for (const t of v.ticketVectors) assert.ok(TICKET_PATTERN.test(t.ticket), t.id);
  });

  await check("VECTORS — every committed relay vector reproduces under the function's OWN verifier: valid, wrong key, swapped body, stale, future", async () => {
    const v = readVectors();
    watch(v.flow.code);
    const { fns, switches, nowRef } = buildEbay();
    switches.callbackKey = v.key;
    for (const vector of v.relayVectors) {
      // The verifier always holds the FIXTURE key. What varies is what the
      // caller presented — which is the whole point of the wrong-key case.
      nowRef.value = vector.nowMs;
      const verdict = fns._internal.checkSignature(
        v.key,
        { "x-nivadesk-timestamp": String(vector.timestampMs), "x-nivadesk-signature": `v1=${vector.signature}` },
        Buffer.from(vector.body, "utf8")
      );
      assert.strictEqual(verdict, vector.expect, `${vector.id}: ${vector.name}`);
    }
    // The two skew vectors are the same signature over the same bytes as the
    // valid one; only the clock moved. So the window is what refused them, and
    // the vector is not quietly proving something else.
    const stale = v.relayVectors.find((r) => r.id === "relay-stale-timestamp");
    const future = v.relayVectors.find((r) => r.id === "relay-future-timestamp");
    for (const vector of [stale, future]) {
      nowRef.value = vector.timestampMs;   // move the clock to the vector's own moment
      assert.strictEqual(fns._internal.checkSignature(v.key,
        { "x-nivadesk-timestamp": String(vector.timestampMs), "x-nivadesk-signature": `v1=${vector.signature}` },
        Buffer.from(vector.body, "utf8")), "ok", `${vector.id} is a GOOD signature outside the window`);
    }
    for (const line of captured) {
      assert.ok(!line.includes(v.key) && !line.includes(v.wrongKey), `a log line carried a fixture key: ${line.slice(0, 120)}`);
    }
  });

  await check("VECTORS — and on the wire: both valid envelopes pass the 401 wall, and the other four are the same eight bytes", async () => {
    const v = readVectors();
    const { fns, switches, nowRef, calls } = buildEbay();
    switches.callbackKey = v.key;
    const deliver = async (vector) => {
      nowRef.value = vector.nowMs;
      const res = fakeRes();
      await fns.ebayOAuthCallback({
        method: "POST", originalUrl: "/ebayOAuthCallback",
        headers: { "content-type": "application/json", "x-nivadesk-timestamp": String(vector.timestampMs), "x-nivadesk-signature": `v1=${vector.signature}` },
        rawBody: Buffer.from(vector.body, "utf8"),
        body: JSON.parse(vector.body)
      }, res);
      return res;
    };
    for (const vector of v.relayVectors.filter((r) => r.expect !== "ok")) {
      const res = await deliver(vector);
      assert.strictEqual(res.statusCode, 401, vector.id);
      assert.strictEqual(JSON.stringify(res.payload), JSON.stringify({ ok: false }), `${vector.id} answers the same eight bytes as every other refusal`);
    }
    // The connect envelope is accepted and gets as far as the state it names,
    // which was never minted — so `state`, not 401, is the proof the signature
    // was believed.
    const connect = await deliver(v.relayVectors.find((r) => r.id === "relay-connect-valid"));
    assert.strictEqual(connect.statusCode, 200);
    assert.strictEqual(connect.payload.reason, "state", said(connect));
    assert.strictEqual(connect.payload.rid, v.flow.connectRid, "the rid it echoes is the one the vector's body carries");
    // And the dispose envelope reaches the disposal: one token request with the
    // vector's own code, nothing kept.
    const before = calls.codes.length;
    const dispose = await deliver(v.relayVectors.find((r) => r.id === "relay-dispose-valid"));
    assert.strictEqual(dispose.statusCode, 200);
    assert.strictEqual(dispose.payload.reason, "browser", said(dispose));
    assert.deepStrictEqual(calls.codes.slice(before), [v.flow.code], "the disposal presented the vector's code once");
    assert.strictEqual(calls.identities, 0, "and asked for no identity");
  });

  await check("VECTORS — every committed ticket reproduces BYTE FOR BYTE under the function's own minter", async () => {
    const v = readVectors();
    const { fns, switches } = buildEbay();
    for (const vector of v.ticketVectors.filter((t) => t.mintedByTheRealMinter)) {
      switches.callbackKey = vector.keyUsed === "key" ? v.key : v.wrongKey;
      const minted = mintWithJti(fns, vector.state, vector.nonce, vector.expMs, vector.jti);
      assert.strictEqual(minted, vector.ticket, `${vector.id}: ${vector.name}`);
    }
    switches.callbackKey = v.key;
    // The derived ones are derived, not minted, and the fixture must not have
    // quietly turned one of them into something else.
    const valid = v.ticketVectors.find((t) => t.id === "ticket-valid");
    const bent = v.ticketVectors.find((t) => t.id === "ticket-bent-mac");
    assert.strictEqual(bent.ticket.slice(0, -1), valid.ticket.slice(0, -1), "the bent ticket differs from the valid one in its last character only");
    assert.notStrictEqual(bent.ticket, valid.ticket);
    assert.ok(TICKET_PATTERN.test(bent.ticket), "and still passes the shape check, so what refuses it is the MAC");
    for (const id of ["ticket-other-state", "ticket-other-nonce"]) {
      assert.strictEqual(v.ticketVectors.find((t) => t.id === id).ticket, valid.ticket, `${id} offers the VALID ticket — what changes is what it is offered against`);
    }
    // The fields the web tier reads out of a ticket, frozen: the tag is keyed
    // over the nonce and is not the value `nonceHash` compares, and the cookie
    // name is the state's own first sixteen characters.
    assert.strictEqual(ticketParts(valid.ticket).tag, valid.nonceTag);
    assert.strictEqual(ticketParts(valid.ticket).expMs, valid.expMs);
    assert.strictEqual(ticketParts(valid.ticket).jti, valid.jti);
    assert.strictEqual(valid.cookieName, `__Host-nv_ebay_ticket_${valid.state.slice(0, 16)}`);
    assert.strictEqual(valid.nonceCookieName, `__Host-nv_ebay_nonce_${valid.state.slice(0, 16)}`);
    assert.ok(!valid.ticket.includes(valid.nonce), "and the ticket carries the nonce nowhere");
    assert.ok(!valid.ticket.includes(crypto.createHash("sha256").update(valid.nonce).digest("hex")));
  });

  await check("VECTORS — the fixture's two keys appear in NO file in this repository outside the fixture, its generator and its two tests", async () => {
    const v = readVectors();
    const repoRoot = path.join(__dirname, "..", "..", "..");
    const allowed = new Set([
      "functions/test/fixtures/ebay-callback-signature-vectors.json",
      "functions/test/fixtures/generate-ebay-callback-vectors.mjs"
    ]);
    const skipDir = new Set(["node_modules", ".git", ".next", "build", "dist", "out", "coverage", "DerivedData", ".gradle", ".idea", "Pods", ".firebase", "app-store-ready"]);
    const skipExt = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".mp4", ".mov", ".ico", ".icns", ".woff", ".woff2", ".ttf", ".otf", ".jar", ".keystore", ".p8", ".p12", ".xcuserstate"]);
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (!skipDir.has(entry.name)) walk(full); continue; }
        if (!entry.isFile()) continue;
        if (skipExt.has(path.extname(entry.name).toLowerCase())) continue;
        const rel = path.relative(repoRoot, full);
        let text = "";
        try { if (fs.statSync(full).size > 4 * 1024 * 1024) continue; text = fs.readFileSync(full, "utf8"); } catch { continue; }
        if (!text.includes(v.key) && !text.includes(v.wrongKey)) continue;
        // The two tests may hold the PATH and the label; they must never hold
        // the value, and they do not — they read it out of the fixture.
        if (!allowed.has(rel)) offenders.push(rel);
      }
    };
    walk(repoRoot);
    assert.deepStrictEqual(offenders, [], `the test key escaped the fixture: ${offenders.join(", ")}`);
    // The other half of the same promise: this file and the relay script name
    // the fixture and never the value.
    for (const file of [__filename, RELAY_SCRIPT]) {
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes(v.key) && !text.includes(v.wrongKey), `${path.basename(file)} holds the key value instead of reading it`);
      assert.ok(text.includes("ebay-callback-signature-vectors.json"), `${path.basename(file)} does not name the fixture at all`);
    }
  });

  await check("VECTORS — there is no skip left: neither this file nor the relay script can report green without reading the fixture", async () => {
    const self = fs.readFileSync(__filename, "utf8");
    const block = self.slice(self.indexOf("// ---- VECTOR CASES BEGIN"), self.indexOf("// ---- VECTOR CASES END"));
    assert.ok(block.length > 2000, "the vector block was not found in this file");
    // No skip, no todo, no early return — the three ways a case reports green
    // for work nobody did. The pin reads the CODE: comment lines and string
    // literals are removed first, so prose about the skip that ended cannot
    // trip it and a real `.skip(` cannot hide inside a message.
    const code = block.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n")
      .replace(/`[^`]*`/g, "``").replace(/"[^"]*"/g, "\"\"").replace(/'[^']*'/g, "''")
      .replace(/skipDir|skipExt/g, "");
    assert.ok(!/\bskip\b/i.test(code), "a skip appeared in the vector cases");
    assert.ok(!/\btodo\b/i.test(code), "a todo appeared in the vector cases");
    assert.ok(!/^\s*return;\s*$/m.test(code), "an early return appeared in the vector cases");
    // The relay script's SKIP line is gone, and a missing fixture exits non-zero
    // there rather than printing a note.
    const relay = fs.readFileSync(RELAY_SCRIPT, "utf8");
    // Its CODE, not its prose: that script explains at length that the skip is
    // gone, and saying so must not be what keeps this green.
    const relayCode = relay.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
    assert.ok(!/SKIP/.test(relayCode), "the relay script still has a SKIP path");
    assert.ok(/existsSync\(vectorPath\)/.test(relay) && /process\.exit\(1\)/.test(relay),
      "the relay script no longer fails on a missing fixture");
    // And the fixture is committed, not generated at test time by someone's
    // local run: the generator is a verifier by default.
    const generator = fs.readFileSync(path.join(__dirname, "..", "fixtures", "generate-ebay-callback-vectors.mjs"), "utf8");
    assert.ok(/--force/.test(generator) && /DRIFT/.test(generator), "the generator would overwrite a drifted fixture silently");
  });
  // ---- VECTOR CASES END ----------------------------------------------------

  await check("SOURCE PIN — the dispose branch reads no state, touches no connection and asks for no identity", async () => {
    const source = fs.readFileSync(path.join(__dirname, "../../ebayConnector.js"), "utf8");
    const from = source.indexOf("// ---- the dispose envelope (§5.5) — begins ---");
    const to = source.indexOf("// ---- the dispose envelope (§5.5) — ends ---", from);
    assert.ok(from > 0 && to > from, "the dispose branch was found between its own markers");
    const branch = source.slice(from, to);
    for (const name of ["states(", "connections(", "fetchIdentity", "storeCredentials", "writeSyncEvent", "credentialsRef", "runTransaction"]) {
      assert.ok(!branch.includes(name), `the dispose branch must not reach ${name}`);
    }
    assert.ok(/typeof body\.state !== "undefined" \|\| typeof body\.nonce !== "undefined"/.test(branch), "it refuses a body that names either");
    // `op` is validated out of a closed vocabulary BEFORE anything branches on it.
    const handler = source.slice(source.indexOf("const ebayOAuthCallback = onRequest("), to);
    assert.ok(handler.indexOf('op !== "connect" && op !== "dispose"') < handler.indexOf('if (op === "dispose")'), "op is validated before it is used");
    assert.ok(handler.indexOf("rid = String(body.rid)") < handler.indexOf("const op ="), "and after the rid was shaped");
  });

  await check("LOG PIN — not one console line on any path carries a code, a state, a nonce, a signature, or even their first eight characters", async () => {
    // The traps this pin exists for: JSON.parse quotes the body's first ten
    // characters back in its message, and Firestore's .doc() embeds the rejected
    // path in its own. Both are error MESSAGES, which is why none is ever logged.
    const { fns } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const CODE = "AUTHCODE-4f1c-do-not-log-me";
    watch(begun.state, begun.nonce, CODE);
    await callbackPost(fns, { state: begun.state, code: CODE, nonce: begun.nonce, method: "GET" });
    await callbackPost(fns, { state: begun.state, code: CODE, nonce: begun.nonce, originalUrl: `/ebayOAuthCallback?code=${CODE}` });
    await callbackPost(fns, { state: begun.state, code: CODE, nonce: begun.nonce, omitSignature: true });
    await signedCallback(fns, null, { rawBody: `${CODE}_not_json` });
    await signedCallback(fns, null, { rawBody: JSON.stringify({ v: 1, rid: callbackRid(), code: CODE, state: "abc/def", nonce: begun.nonce }) });
    await signedCallback(fns, { v: 1, rid: CODE, code: CODE, state: begun.state, nonce: begun.nonce });
    await callbackPost(fns, { state: begun.state, code: "bad-code", nonce: begun.nonce });   // the exchange failure path
    const seen = secretsSeen.concat([CODE]);
    for (const line of captured) {
      for (const value of seen) {
        assert.ok(!line.includes(value), `a log line carried a value: ${line.slice(0, 120)}`);
        assert.ok(!line.includes(value.slice(0, 8)), `a log line carried the first eight characters: ${line.slice(0, 120)}`);
      }
    }
    // The only rid that may appear in a line is one that passed its shape check.
    for (const line of captured.filter((l) => l.includes("rid="))) {
      const rid = line.split("rid=")[1].split(/[\s"]/)[0];
      assert.ok(/^[0-9a-f]{16}$/.test(rid), `an unshaped rid reached a log line: ${line.slice(0, 120)}`);
    }
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ EBAY CONNECT GEÇTİ");
})();
