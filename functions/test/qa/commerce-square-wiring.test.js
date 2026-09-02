// Square wiring pins — the shape index.js must keep so the connector stays
// on the common engine, behind the secrets, and out of the clients' reach.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const index = fs.readFileSync(path.join(__dirname, "../../index.js"), "utf8");
const connector = fs.readFileSync(path.join(__dirname, "../../squareConnector.js"), "utf8");
const rules = fs.readFileSync(path.join(__dirname, "../../../firestore.rules"), "utf8");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 260)); } }

check("six Square secrets are declared and bound to every Square function, the worker and the manual retry (SQ-SEC-001/002)", () => {
  for (const name of ["SQUARE_APPLICATION_ID", "SQUARE_APPLICATION_SECRET", "SQUARE_WEBHOOK_SIGNATURE_KEY", "SQUARE_TOKEN_KEY", "SQUARE_APP_ACCESS_TOKEN", "SQUARE_ENVIRONMENT"]) assert.ok(index.includes(`defineSecret("${name}")`), name);
  assert.ok(/onCall: \(options, handler\) => onCall\(\{ \.\.\.options, secrets: SQUARE_SECRETS \}/.test(index));
  assert.ok(/onRequest: \(options, handler\) => onRequest\(\{ \.\.\.options, secrets: SQUARE_SECRETS \}/.test(index));
  assert.ok(/onSchedule: \(options, handler\) => onSchedule\(\{ \.\.\.options, secrets: SQUARE_SECRETS \}/.test(index));
  assert.ok(/secrets: \[SHOPIFY_TOKEN_KEY, WOO_TOKEN_KEY, \.\.\.SQUARE_SECRETS\]\n\}/.test(index), "worker secrets");
  assert.ok(index.includes('exports.retryCommerceEvent = onCall({ region: "europe-west2", secrets: [SHOPIFY_TOKEN_KEY, WOO_TOKEN_KEY, ...SQUARE_SECRETS]'), "retry secrets");
});
check("thirteen Square functions are exported and the queue dispatcher routes provider square to the connector", () => {
  for (const name of ["beginSquareConnect", "squareOAuthCallback", "getSquareConnections", "updateSquareConnectionSettings", "disconnectSquare", "squareWebhook", "reconcileSquareConnections", "syncSquareNow", "previewSquareImport", "runSquareImport", "listSquareUnmatched", "listSquarePayouts", "auditSquareOrders"]) assert.ok(index.includes(`exports.${name} = squareExports.${name};`), name);
  assert.ok(index.includes('if (task.provider === "square") return squareExports._internal.processSquareCommerceTask(task);'));
  assert.ok(index.includes("enqueue: (task, delaySeconds) => enqueueCommerceEvent(task, delaySeconds)"), "the gateway queues (SQ-WEB-008)");
});
check("the connector goes through the engine, never writes an order from a payment, and boxes tokens (SQ-ORD-011, SQ-PAY-006, SQ-AUTH-005)", () => {
  assert.ok(connector.includes("engine.applyEnvelope(db(), envelope, {"));
  assert.ok(!/orderDocRef\([^)]*\)\.set\(/.test(connector), "no direct order writes");
  assert.ok(connector.includes("accessTokenEncrypted: box(accessToken)") && connector.includes("refreshTokenEncrypted: box(refreshToken)"));
  assert.ok(!/accessToken[A-Za-z]*: (?!box|FieldValue)/.test(connector.replace(/accessTokenEncrypted/g, "")), "no plaintext token field is ever written");
  assert.ok(connector.includes('recordPayment(ref, data, payment)') && !/recordPayment[\s\S]*?applyEnvelope[\s\S]*?\n  \}\n\n  async function recordRefund/.test(connector), "recordPayment never applies an envelope");
  assert.ok(connector.includes("tokenRefreshLockUntilMs"), "single-flight refresh lock (SQ-AUTH-007)");
  assert.ok(connector.includes('type === "oauth.authorization.revoked"'), "SQ-AUTH-008");
  assert.ok(connector.includes("verifySquareSignature({ notificationUrl: notificationUrl(), rawBody, header: signature, signatureKey: webhookSignatureKey() })"), "SQ-WEB-001/002");
  assert.ok(connector.includes('.where("merchantId", "==", merchantId)'), "SQ-WEB-006");
  assert.ok(connector.includes('cursors.readCursor(db(), "square", ref.id, "order")') && connector.includes('cursors.readCursor(db(), "square", ref.id, "payment")') && connector.includes('cursors.readCursor(db(), "square", ref.id, "events")') && connector.includes('cursors.readCursor(db(), "square", ref.id, "payout")'), "SQ-REC-009: separate cursors");
});
check("the client-readable rules deny the Square root collections; account deletion purges them (SQ-SEC-009)", () => {
  assert.ok(/match \/squareConnections\/\{document=\*\*\} \{\s*allow read, write: if false;/.test(rules));
  assert.ok(/match \/squareConnectStates\/\{document=\*\*\} \{\s*allow read, write: if false;/.test(rules));
  assert.ok(index.includes('await step("squareConnections", async () => {') && index.includes('await step("squareConnectStates", () => deleteMatching(db.collection("squareConnectStates")'));
});
check("the envelope validator and the capability registry know Square", () => {
  const envelope = fs.readFileSync(path.join(__dirname, "../../commerce/envelope.js"), "utf8");
  assert.ok(envelope.includes('"square"'));
  const caps = require("../../commerce/capabilities").getCapabilities("square");
  assert.strictEqual(caps.orders.read, true); assert.strictEqual(caps.orders.write, false); assert.strictEqual(caps.payments.read, true); assert.strictEqual(caps.events_api_recovery.window_days, 28);
});
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ SQUARE WIRING PINS GEÇTİ");
