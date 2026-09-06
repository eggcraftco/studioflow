// eBay wiring pins — the shape index.js, the connector, the rules and the
// neighbouring modules must keep so the connector stays on the common engine,
// behind its own secrets and identity, on its own queue, gated off at deploy,
// and out of the clients' reach (design §2, §3, §3.2, §4.10, §7.3, §8.4).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "../..");
const index = fs.readFileSync(path.join(root, "index.js"), "utf8");
const connector = fs.readFileSync(path.join(root, "ebayConnector.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "../firestore.rules"), "utf8");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

check("the five eBay secrets are declared only behind the marker, and EBAY_RUNTIME carries the dedicated identity beside them", () => {
  assert.ok(index.includes('const EBAY_SECRETS_READY = process.env.NIVADESK_EBAY_SECRETS_READY === "1" || require("fs").existsSync(require("path").join(__dirname, ".ebay-secrets-ready"));'));
  // The fifth is EBAY_CALLBACK_KEY (§5.4): the key the web callback route signs
  // its relay POST with. It is a NAME here and nowhere else — no value in any
  // file, commit or log. Deploying without the marker mounts none of the five,
  // so every relay POST answers 401 and no OAuth can complete: §5.4's rollout
  // step 3 is what actually controls the mount.
  assert.ok(/const EBAY_SECRET_PARAMS = EBAY_SECRETS_READY\s*\?\s*\[defineSecret\("EBAY_CLIENT_ID"\), defineSecret\("EBAY_CLIENT_SECRET"\), defineSecret\("EBAY_TOKEN_KEY"\), defineSecret\("EBAY_HASH_KEY"\), defineSecret\("EBAY_CALLBACK_KEY"\)\]\s*:\s*\[\];/.test(index));
  assert.ok(index.includes('const EBAY_SERVICE_ACCOUNT = "ebay-connector@eggcraft-studio.iam.gserviceaccount.com";'));
  assert.ok(index.includes("const EBAY_RUNTIME = EBAY_SECRETS_READY ? { secrets: EBAY_SECRET_PARAMS, serviceAccount: EBAY_SERVICE_ACCOUNT } : {};"), "the fifth secret rides the dedicated identity, never the default compute account");
  assert.ok(index.includes('const ebaySecretValue = (name) => process.env[name] || "";'));
  assert.ok(index.includes('callbackKey: () => ebaySecretValue("EBAY_CALLBACK_KEY"),'), "read at call time, like the other four");
  assert.ok(!fs.existsSync(path.join(root, ".ebay-secrets-ready")), "the marker must not be committed by the connector work — it is the owner's step after the secrets and the service account exist");
});

check("the callback is POST-only, signed, JSON-answering and instance-capped (§5.4)", () => {
  const from = connector.indexOf("const ebayOAuthCallback = onRequest(");
  const to = connector.indexOf("// ---- 3. reading and managing a connection", from);
  assert.ok(from > 0 && to > from, "the handler was found");
  const body = connector.slice(from, to);
  assert.ok(/maxInstances: 10/.test(body), "a bounded bill for an unkeyed flood on a public endpoint whose only control is the shared key");
  assert.ok(/timeoutSeconds: 120/.test(body), "the long budget stays: the state burns BEFORE the exchange, so cutting it short would strand a burned state");
  assert.ok(!/req\.query/.test(body) && !/res\.redirect/.test(body), "no query read, no redirect — the browser never meets this host");
  assert.ok(!/req\.rawBody\s*\|\|/.test(body), "never the re-serialised fallback: it breaks an exact-bytes HMAC silently");
  assert.ok(connector.includes("crypto.timingSafeEqual(offered, expected)"), "the digests are compared in constant time");
  assert.ok(!connector.includes("function connectRedirect"), "connectRedirect had exactly one caller and went with it");
});

check("the connector ships gated off: the runtime switch is read once, and every trigger spreads EBAY_RUNTIME", () => {
  assert.ok(index.includes('const EBAY_CONNECTOR_ENABLED = String(process.env.NIVADESK_EBAY_CONNECTOR || "") === "1";'));
  assert.ok(index.includes("connectorEnabled: () => EBAY_CONNECTOR_ENABLED"));
  for (const wrapper of ["onCall", "onRequest", "onSchedule"]) assert.ok(index.includes(`${wrapper}: (options, handler) => ${wrapper}({ ...options, ...EBAY_RUNTIME }, handler)`), wrapper);
  const at = index.indexOf("exports.ebayEventWorker = onTaskDispatched({");
  assert.ok(at > 0, "the eBay worker exists");
  const options = index.slice(at, index.indexOf("}, async (request) => {", at));
  assert.ok(/\.\.\.EBAY_RUNTIME/.test(options), "the worker runs as the eBay identity with the eBay secrets");
  assert.ok(/maxAttempts: 1/.test(options) && /maxConcurrentDispatches: 5/.test(options));
  assert.ok(index.includes('const EBAY_QUEUE_FUNCTION = "ebayEventWorker";') && index.includes("locations/europe-west2/functions/${EBAY_QUEUE_FUNCTION}"), "its own Cloud Tasks queue");
});

check("every export is a literal line, and the e2e hook exposes the internals", () => {
  for (const name of ["beginEbayConnect", "claimEbayConnectState", "ebayOAuthCallback", "getEbayConnections", "verifyEbayConnection", "updateEbayConnectionSettings", "previewEbayImport", "runEbayImport", "retryEbayImportFailures", "syncEbayNow", "disconnectEbay", "reconcileEbayConnections", "reconcileEbayConnectionsNightly", "reconcileEbayDeletions", "ebayNotifications", "revealRestrictedCustomer"]) {
    assert.ok(index.includes(`exports.${name} = ebayExports.${name};`), name);
  }
  assert.ok(index.includes("ebay: ebayExports._internal,"));
});

check("the eBay worker loop is the common worker's, minus health for a buyer deletion; the shared worker refuses eBay rows; retry re-enqueues instead of processing", () => {
  const at = index.indexOf("async function runEbayEventTask(task) {");
  assert.ok(at > 0);
  const body = index.slice(at, index.indexOf("\n}\n", at));
  assert.ok(body.includes('if (String(task.entityType || "") !== "buyer_deletion") {'), "no commerceHealth/ebay__ document for a deletion task");
  assert.ok(body.includes('provider: "ebay", connectionId: task.connectionId, companyId: task.companyId, kind, FieldValue'));
  assert.ok(body.includes('kind: "retry_cleared"'));
  assert.ok(body.includes('if (result.status === "retrying" && result.nextRetryInMs) {'));
  // commerceEventWorker's secrets literal is unchanged: eBay's key never rides beside the others.
  assert.ok(/secrets: \[SHOPIFY_TOKEN_KEY, WOO_TOKEN_KEY, \.\.\.SQUARE_SECRETS\]\n\}/.test(index), "the shared worker's secrets are exactly as before");
  assert.ok(index.includes('if (task.provider === "ebay") {\n    // eBay tasks belong to ebayEventWorker'), "the dispatcher names the mistake");
  assert.ok(index.includes('const misrouted = new Error("provider_not_on_this_worker");'));
  const retryAt = index.indexOf("exports.retryCommerceEvent = onCall(");
  const retry = index.slice(retryAt, index.indexOf("\n});", retryAt));
  assert.ok(retry.includes('if (record.provider === "ebay") {') && retry.includes("await enqueueEbayTask(task, 0);") && retry.includes("return { ok: true, queued: true, status: \"queued\" };"), "retry never processes an eBay row inline");
  assert.ok(retry.indexOf('record.provider === "ebay"') < retry.indexOf("await processCommerceTaskByProvider(task)"));
});

check("the connector goes through the engine, never writes an order itself, has one applyEbayOrder that every path calls, and boxes tokens under EBAY_TOKEN_KEY only", () => {
  assert.ok(connector.includes("engine.applyEnvelope(db(), envelope, {"));
  assert.ok(!/orderDocRef\([^)]*\)\.set\(/.test(connector.replace(/orderRef\.set\(\{ \.\.\.deletionPatch/g, "")), "no direct order write apart from the deletion scrub");
  assert.strictEqual((connector.match(/async function applyEbayOrder\(/g) || []).length, 1, "exactly one apply path");
  for (const caller of ["readOneSubWindow", "reconcileConnectionNightly", "importRun", "retryFailedIds", "processEbayCommerceTask"]) {
    const at = connector.indexOf(`async function ${caller}(`);
    assert.ok(at > 0 && connector.slice(at, at + 6000).includes("applyEbayOrder("), `${caller} lands orders through applyEbayOrder`);
  }
  assert.ok(connector.includes("accessTokenEncrypted: box(accessToken), refreshTokenEncrypted: box(refresh)"));
  // A token may be passed to the client factory (`accessToken: await appAccessToken()`), never written to a document.
  const writes = [...connector.matchAll(/\.(?:set|update|create)\(\s*\{([\s\S]{0,800}?)\}/g)].map((m) => m[1]);
  for (const written of writes) assert.ok(!/\b(?:accessToken|refreshToken|refresh)\s*:/.test(written), `a plaintext token field in a write: ${written.slice(0, 120)}`);
  assert.ok(connector.includes("const tokenKeys = () => keyListOf(tokenKey());") && connector.includes("const box = (plain) => encryptToken(plain, tokenKeys());"), "boxed under the eBay key list, never a shared key");
  assert.ok(connector.includes("refreshLockUntilMs"), "single-flight refresh");
  assert.ok(connector.includes("credentialsRef(ref).delete()"), "disconnect deletes the credentials document");
  assert.ok(connector.includes('cursors.readCursor(db(), "ebay", ref.id, "order")'));
  assert.ok(connector.includes("sanitize.splitEbayOrder(order, shipments)") && connector.includes("sanitize.scanForPii(safe)") && connector.includes('"pii_in_safe_half"'), "split first, scan second");
  assert.ok(connector.includes("restrictedCustomer"), "the buyer's details are diverted to the restricted collection");
  assert.ok(!connector.includes("upsertIntegrationCustomer"), "no customer mirror for a marketplace buyer");
  assert.ok(connector.includes("marketplaceId, eventOrigin: envelopeOrigin, rawSnapshotRef: eventKey, fulfillments: safe.fulfillments"), "the adapter gets the marketplace and the safe fulfilments");
});

check("no eBay URL appears in the connector or index.js — every path lives in commerce/ebay/", () => {
  for (const [name, body] of [["ebayConnector.js", connector], ["index.js", index]]) {
    assert.ok(!/api(?:z)?\.(?:sandbox\.)?ebay\.com|auth\.(?:sandbox\.)?ebay\.com|\/sell\/fulfillment\/v1/.test(body), name);
  }
});

check("the rules deny all six eBay root collections and the per-workspace restricted and reveal-counter subcollections, in every list", () => {
  for (const col of ["ebayConnections", "ebayConnectStates", "ebayBuyers", "ebayDeletionRequests", "ebayQuota", "ebayNotificationKeys"]) {
    assert.ok(new RegExp(`match /${col}/\\{document=\\*\\*\\} \\{\\s*allow read, write: if false;`).test(rules), col);
  }
  assert.ok(/match \/companies\/\{companyId\}\/restrictedCustomer\/\{orderId\} \{\s*allow read, write: if false;/.test(rules));
  assert.ok(/match \/companies\/\{companyId\}\/revealCounters\/\{document=\*\*\} \{\s*allow read, write: if false;/.test(rules));
  for (const col of ["restrictedCustomer", "revealCounters"]) {
    assert.strictEqual((rules.match(new RegExp(`collectionId != '${col}'`, "g")) || []).length, 2, `${col} must be in BOTH wildcard deny-lists`);
  }
});

check("account deletion purges the eBay roots; the held-order release goes to the eBay worker and never replays the payload", () => {
  assert.ok(index.includes('await step("ebayConnections", async () => {') && index.includes('db.collection("ebayConnections").where("companyId", "==", companyId).get();\n    for (const doc of snap.docs) await db.recursiveDelete(doc.ref);'));
  assert.ok(index.includes('await step("ebayConnectStates", () => deleteMatching(db.collection("ebayConnectStates").where("companyId", "==", companyId)));'));
  assert.ok(index.includes('await step("ebayBuyers", () => deleteMatching(db.collection("ebayBuyers").where("companyId", "==", companyId)));'));
  assert.ok(index.includes("ebayConnections: 0, ebayConnectStates: 0, ebayBuyers: 0, errors: []"));
  const at = index.indexOf('} else if (provider === "ebay") {');
  assert.ok(at > 0, "the release branch exists");
  const branch = index.slice(at, index.indexOf("} else {", at));
  // The release runs in a shared callable that cannot hold EBAY_TOKEN_KEY (it
  // cannot take the eBay identity, and the two travel together), so it hands
  // the row to the worker that can — the move retryCommerceEvent already makes.
  // Unboxing the credentials here threw "No eBay key is configured." into the
  // branch's own catch, which counted the row 'left in place': a held eBay order
  // could never be imported, even after the owner upgraded.
  assert.ok(!/ebayExports\._internal/.test(branch), "the release must not run eBay code it has no key for");
  assert.ok(branch.includes("await enqueueEbayTask(task, 0);"), "the row goes to ebayEventWorker");
  assert.ok(/eventType: "release", attempt: 1, eventOrigin: "retry"/.test(branch), "as a retry-origin order task");
  const code = branch.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/payload|\border\b(?! task| document)/.test(code.replace(/entityType: "order"/g, "")), "the stored payload is never replayed; the worker fetches fresh");
  assert.ok(!/doc\.ref\.delete\(\)/.test(branch), "the held row is not deleted on the way out — it goes when the order lands");
  assert.ok(branch.includes("unknown += 1;\n          continue;"), "left held when the connection or the queue refuses it");
  const applyAt = connector.indexOf("async function applyEbayOrder(");
  const apply = connector.slice(applyAt, connector.indexOf("\n  // ---- 5.", applyAt));
  assert.ok(apply.includes('if (outcome.result === "created" || eventOrigin === "retry") await clearHeldOrder(companyId, externalId);'), "and applyEbayOrder is what clears it");
});

check("the retention sweep deletes the restricted document beside the scrub; lifecycle derives integration_connected from eBay rows", () => {
  const at = index.indexOf("async function sweepRetentionPeriod(");
  const sweep = index.slice(at, index.indexOf("exports.sweepMarketplacePii", at));
  assert.ok(sweep.includes('.collection("restrictedCustomer").doc(doc.id)') && sweep.includes("restrictedDocsDeleted += 1"));
  assert.ok(sweep.indexOf("await doc.ref.set(patch, { merge: true });") < sweep.indexOf('.collection("restrictedCustomer")'));
  const derive = fs.readFileSync(path.join(root, "lifecycle/derive.js"), "utf8");
  assert.ok(derive.includes("snapshot.ebayConnections"));
  const retention = fs.readFileSync(path.join(root, "privacy/retention.js"), "utf8");
  assert.ok(retention.includes('ebay: { days: 90, reason: "ebay_address_withheld_after_90d" }'));
});

check("the flag document carries a connectors area, off by default, and the connector reads it per connection", () => {
  const flags = fs.readFileSync(path.join(root, "commerce/flags.js"), "utf8");
  assert.ok(/connectors: \{ enabled: false, providers: \{\}, connections: \{\} \}/.test(flags));
  assert.ok(flags.includes("connectors: { ...EMPTY.connectors, ...(data.connectors || {}) }"), "merged from the document, so the field drives the sweep");
  assert.ok(connector.includes('flagsModule.flagEnabled(await flagsNow(), "connectors", "ebay", connectionId)'));
  assert.ok(connector.includes("if (!connectorOn() || !(await flagOn(snap.id))) return recordSkipped(task, \"connector_off\");"), "an order task is skipped without a fetch");
  assert.ok(connector.includes('if (String(task?.entityType || "") === "buyer_deletion") return processEbayBuyerDeletion(task);'), "a buyer deletion is never gated");
  assert.ok(connector.indexOf('=== "buyer_deletion") return processEbayBuyerDeletion') < connector.indexOf('return recordSkipped(task, "connector_off")'), "the deletion check comes before the gate");
});

check("the notification gateway hashes in the request, answers 503 without secrets, and the task carries hashes only", () => {
  const at = connector.indexOf("async function handleNotificationRequest(req, res) {");
  const gateway = connector.slice(at, connector.indexOf("\n  const ebayNotifications = onRequest(", at));
  assert.ok(gateway.includes('if (!configured()) { console.error("ebay notifications: deletion received without secrets"); res.status(503)'));
  assert.ok(gateway.includes("notification.challengeResponse({ challengeCode, verificationToken: token, endpointUrl: endpoint })"));
  assert.ok(gateway.includes("hashing.hashesUnderEveryKey(hashKey(), hashing.normalizeUsername(shape.data.username))"));
  assert.ok(!/\.eiasToken|\["eiasToken"\]/.test(gateway), "the eiasToken is never read");
  const builderAt = connector.indexOf("function deletionTaskOf(notificationId,");
  const builder = connector.slice(builderAt, connector.indexOf("\n  }", builderAt));
  assert.ok(!/username:|userId:/.test(builder) && builder.includes("usernameHashes, userIdHashes"), "hashes only in the Cloud Tasks payload");
  assert.ok(gateway.indexOf('res.status(200).json({ ok: true, result: claim.first ? "queued" : "requeued" });') < gateway.indexOf("await driveDeletion("), "200 first, then the work");
});

// The endpoint eBay makes mandatory for production keys. Its dedup was on
// RECEIPT — the ledger row was created before the work and any create() failure
// answered `duplicate` whatever the row said — so a failed anonymisation was
// permanent: eBay's redelivery, the only remaining safety net, got a cheerful
// 200 forever, and nothing ever read the ledger back.
check("a deletion is deduped on completion, and the ledger is read back by an ungated reconciliation", () => {
  const at = connector.indexOf("async function claimDeletion(ledgerRef,");
  assert.ok(at > 0, "the claim is a transaction of its own");
  const claim = connector.slice(at, connector.indexOf("\n  }", at));
  assert.ok(claim.includes('if (row && String(row.status) === "done") return { verdict: "duplicate" };'), "duplicate is answered for exactly one state");
  assert.ok(claim.includes("n(row.leaseUntilMs) > now()"), "a delivery in flight holds a lease rather than being re-driven");
  assert.ok(!/create\(/.test(claim), "the create()-based dedup is gone");
  assert.ok(/status: "done"[\s\S]{0,200}finishedAtMs: now\(\)/.test(connector.slice(connector.indexOf("async function processEbayBuyerDeletion("))), "done is written after the work, never before it");
  // The pass that reads it back, and the schedule that runs it.
  const sweepAt = connector.indexOf("async function reconcileDeletionRequests(");
  assert.ok(sweepAt > 0, "nothing sweeps the deletion ledger");
  const sweep = connector.slice(sweepAt, connector.indexOf("\n  const reconcileEbayDeletions", sweepAt));
  assert.ok(sweep.includes('for (const status of ["queued", "failed"])'), "both unfinished states are re-driven");
  assert.ok(!/connectorOn\(\)|flagOn\(/.test(sweep), "compliance is not gated by the connector switch or the flag");
  assert.ok(sweep.includes("await driveDeletion("), "re-driven through the same queue path as a live notification");
  assert.ok(/const reconcileEbayDeletions = onSchedule[\s\S]{0,200}schedule: "every 10 minutes"/.test(connector), "the sweep is scheduled");
  assert.ok(index.includes("exports.reconcileEbayDeletions = ebayExports.reconcileEbayDeletions;"), "and exported");
});

check("the reveal grant is a member-access key defaulting to false, and the callable logs before it returns", () => {
  assert.ok(/restrictedCustomer: false,/.test(index.slice(index.indexOf("const WORKSPACE_MEMBER_ACCESS_DEFAULTS"), index.indexOf("const WORKSPACE_MEMBER_ACCESS_DEFAULTS") + 3000)));
  const at = connector.indexOf("const revealRestrictedCustomer = onCall(");
  const body = connector.slice(at, connector.indexOf("\n  });", at));
  assert.ok(body.indexOf("recordPiiAccess({") < body.indexOf("return { ok: true, ...payload };"), "log first, then return");
  assert.ok(body.includes('action: "restricted_resource_accessed"') && body.includes('if (!logged) throw new HttpsError("unavailable"'));
  assert.ok(body.includes("reveal.revealAllowed({") && body.includes("reveal.revealBudget("));
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ EBAY WIRING PINS GEÇTİ");
