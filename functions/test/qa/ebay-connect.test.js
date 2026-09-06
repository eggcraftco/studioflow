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
const { buildEbay, connect, callbackPost, signedCallback, callbackRid, TOKEN_KEY, HASH_KEY, CALLBACK_KEY } = require("./helpers/ebayHarness");
const { decryptToken } = require("../../security/tokenBox");
const hashing = require("../../commerce/ebay/hashing");
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
    assert.strictEqual(calls.exchanges, 0, "no code was ever exchanged");
    assert.strictEqual(store.paths("ebayConnections/").length, 0, "no connection, no credentials");
  });

  await check("a state minted for the sandbox is refused on a production server (reason=environment), before any exchange", async () => {
    const sandbox = buildEbay();
    const begun = await sandbox.fns.beginEbayConnect({ auth, data: {} });
    const production = buildEbay({ environment: "production" });
    production.store.write(`ebayConnectStates/${begun.state}`, sandbox.store.read(`ebayConnectStates/${begun.state}`));
    const res = await callbackPost(production.fns, { state: begun.state, nonce: begun.nonce });
    assert.strictEqual(res.payload.reason, "environment", said(res));
    assert.strictEqual(production.calls.exchanges, 0);
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
    assert.strictEqual(store.read(`ebayConnectStates/${begun.state}`).used, false, "an unconfigured key burns nothing");
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
    const consoleLines = body.split("\n").filter((l) => /console\.(log|warn|error)\(/.test(l));
    const withMessage = consoleLines.filter((l) => /error\??\.(message|stack)/.test(l));
    assert.deepStrictEqual(withMessage.length, 1, withMessage.join(" | "));
    assert.ok(withMessage[0].includes('console.error("ebayOAuthCallback failed:"'), withMessage[0]);
    assert.ok(/error\?\.name === "EbayOAuthError"/.test(withMessage[0]), "the message line is reached only for the class §14.1 pins");
    assert.ok(!/error\??\.stack/.test(body), "no stack anywhere");
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
