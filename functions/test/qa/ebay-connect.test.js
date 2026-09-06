// The eBay connection lifecycle against the fake Firestore and a fake eBay
// (design §5, §6, §4.11): a state that is single-use, expiring, bound to the
// environment AND to the browser that began the flow; a seller taken from the
// Identity API; credentials in their own boxed document; one refresh at a
// time; a seller marked reconnect_required ONLY for an auth-class failure; and
// a public view that never carries a token, a box or a hash.
const assert = require("assert");
const { buildEbay, connect, fakeRes, TOKEN_KEY, HASH_KEY } = require("./helpers/ebayHarness");
const { decryptToken } = require("../../security/tokenBox");
const hashing = require("../../commerce/ebay/hashing");
const { STATE_TTL_MS, TOKEN_REFRESH_AHEAD_MS } = require("../../ebayConnector");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 320)); }); }
const auth = { uid: "u1" };

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
    assert.strictEqual(res.statusCode, 302); assert.ok(res.redirectedTo.includes("section=ebay") && res.redirectedTo.includes("ebay=connected"), res.redirectedTo);
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

  await check("a replayed state, an expired state, an unknown state and a cancelled consent", async () => {
    const { fns, nowRef, calls } = buildEbay();
    const { begun } = await connect(fns);
    const replay = fakeRes(); await fns.ebayOAuthCallback({ query: { state: begun.state, code: "good-code", nonce: begun.nonce } }, replay);
    assert.ok(replay.redirectedTo.includes("ebay=error") && replay.redirectedTo.includes("reason=state"), replay.redirectedTo);
    assert.strictEqual(calls.exchanges, 1, "no second exchange");
    const expiring = await fns.beginEbayConnect({ auth, data: {} });
    nowRef.value += STATE_TTL_MS + 1000;
    const expired = fakeRes(); await fns.ebayOAuthCallback({ query: { state: expiring.state, code: "good-code", nonce: expiring.nonce } }, expired);
    assert.ok(expired.redirectedTo.includes("reason=state"));
    const unknown = fakeRes(); await fns.ebayOAuthCallback({ query: { state: "invented", code: "x", nonce: "y" } }, unknown);
    assert.ok(unknown.redirectedTo.includes("reason=state"));
    const cancelled = fakeRes(); await fns.ebayOAuthCallback({ query: { error: "access_denied", state: begun.state } }, cancelled);
    assert.ok(cancelled.redirectedTo.includes("ebay=cancelled"));
    const missing = fakeRes(); await fns.ebayOAuthCallback({ query: { state: begun.state } }, missing);
    assert.ok(missing.redirectedTo.includes("reason=missing_code"));
  });

  await check("a callback without the browser's nonce is refused with reason=browser AND the state is burned — a second try with the right nonce cannot follow", async () => {
    const { fns, calls, store } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: {} });
    const phished = fakeRes(); await fns.ebayOAuthCallback({ query: { state: begun.state, code: "good-code" } }, phished);
    assert.ok(phished.redirectedTo.includes("reason=browser"), phished.redirectedTo);
    const wrong = fakeRes(); await fns.ebayOAuthCallback({ query: { state: (await fns.beginEbayConnect({ auth, data: {} })).state, code: "good-code", nonce: "not-the-nonce" } }, wrong);
    assert.ok(wrong.redirectedTo.includes("reason=browser"));
    const again = fakeRes(); await fns.ebayOAuthCallback({ query: { state: begun.state, code: "good-code", nonce: begun.nonce } }, again);
    assert.ok(again.redirectedTo.includes("reason=state"), "burned");
    assert.strictEqual(calls.exchanges, 0, "no code was ever exchanged");
    assert.strictEqual(store.paths("ebayConnections/").length, 0, "no connection, no credentials");
  });

  await check("a state minted for the sandbox is refused on a production server (reason=environment), before any exchange", async () => {
    const sandbox = buildEbay();
    const begun = await sandbox.fns.beginEbayConnect({ auth, data: {} });
    const production = buildEbay({ environment: "production" });
    production.store.write(`ebayConnectStates/${begun.state}`, sandbox.store.read(`ebayConnectStates/${begun.state}`));
    const res = fakeRes(); await production.fns.ebayOAuthCallback({ query: { state: begun.state, code: "good-code", nonce: begun.nonce } }, res);
    assert.ok(res.redirectedTo.includes("reason=environment"), res.redirectedTo);
    assert.strictEqual(production.calls.exchanges, 0);
  });

  await check("the connector switch off answers reason=disabled; an identity 403 answers no_seller; a bad code answers token", async () => {
    const off = buildEbay({ connectorOn: false });
    const res = fakeRes(); await off.fns.ebayOAuthCallback({ query: { state: "s", code: "c", nonce: "n" } }, res);
    assert.ok(res.redirectedTo.includes("reason=disabled"));
    const noSeller = buildEbay({ oauth: { fetchIdentity: async () => { throw Object.assign(new Error("ebay_identity_http_403"), { status: 403, errorClass: "permission", code: "no_seller" }); } } });
    const begun = await noSeller.fns.beginEbayConnect({ auth, data: {} });
    const r2 = fakeRes(); await noSeller.fns.ebayOAuthCallback({ query: { state: begun.state, code: "good-code", nonce: begun.nonce } }, r2);
    assert.ok(r2.redirectedTo.includes("reason=no_seller"), r2.redirectedTo);
    assert.strictEqual(noSeller.store.paths("ebayConnections/").length, 0, "nothing stored for a seller we cannot name");
    const bad = buildEbay();
    const b = await bad.fns.beginEbayConnect({ auth, data: {} });
    const r3 = fakeRes(); await bad.fns.ebayOAuthCallback({ query: { state: b.state, code: "bad-code", nonce: b.nonce } }, r3);
    assert.ok(r3.redirectedTo.includes("reason=token"), r3.redirectedTo);
  });

  await check("claimEbayConnectState answers only the uid that began the flow, once", async () => {
    const { fns } = buildEbay();
    const begun = await fns.beginEbayConnect({ auth, data: { origin: "native" } });
    await assert.rejects(fns.claimEbayConnectState({ auth: { uid: "u2" }, data: { state: begun.state } }), /different NivaDesk user/);
    await assert.rejects(fns.claimEbayConnectState({ auth: null, data: { state: begun.state } }), /Sign in/);
    const claimed = await fns.claimEbayConnectState({ auth, data: { state: begun.state } });
    assert.ok(claimed.nonce && claimed.authorizeUrl.startsWith("https://auth.sandbox.ebay.com/"));
    await assert.rejects(fns.claimEbayConnectState({ auth, data: { state: begun.state } }), /expired or was already used/);
    const res = fakeRes(); await fns.ebayOAuthCallback({ query: { state: begun.state, code: "good-code", nonce: claimed.nonce } }, res);
    assert.ok(res.redirectedTo.includes("ebay=connected"), "the claimed nonce is the one the callback accepts");
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
    assert.ok(res.redirectedTo.includes("ebay=connected"));
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

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ EBAY CONNECT GEÇTİ");
})();
