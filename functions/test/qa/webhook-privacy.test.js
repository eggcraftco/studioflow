// Three findings about what a stranger can do, and what a customer asked for.
//
// #5  An unauthenticated POST with nothing but a workspace id wrote into the
//     tenant's delivery log, and the Integrations cards read that log — so one
//     request from a stranger turned the Wix, Squarespace, Zapier and Make
//     cards red for somebody else's workspace.
//
// #22 "Do not contact" was written by the customer screen and read by nothing.
//     Every automated status message went out anyway, which is the opposite of
//     what the switch says.
//
// #32 A parked order — the raw provider payload, name, email, phone and both
//     addresses — had no end date at all, so a workspace that hit its plan
//     limit once kept a stranger's personal data forever.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

function region(startMarker, endMarker) {
  const at = SOURCE.indexOf(startMarker);
  assert.ok(at > 0, `${startMarker} is where it was`);
  const end = SOURCE.indexOf(endMarker, at + startMarker.length);
  return SOURCE.slice(at, end > 0 ? end : at + 5000);
}

// ---- #5: a rejected request cannot colour a card ---------------------------
check("a rejected request no longer writes the delivery log", () => {
  const rejection = region('if (!workspaceToken || !nvTimingSafeEqual(providedToken, workspaceToken)) {', 'res.status(401)');
  assert.ok(/recordIntegrationRejection\(/.test(rejection), "it records the rejection");
  assert.ok(!/recordIntegrationDelivery\(/.test(rejection), "and not as a delivery");
});

check("the two logs are genuinely separate fields", () => {
  const rejectionWriter = region("async function recordIntegrationRejection(", "\nfunction integrationStatusPayload(");
  for (const owned of ["lastDeliveryAt", "lastDeliveryOk", "lastDeliveryError", "recentDeliveries"]) {
    assert.ok(!rejectionWriter.includes(owned), `a rejection still writes ${owned}, which the cards read`);
  }
  assert.ok(/lastRejectedAt/.test(rejectionWriter) && /recentRejections/.test(rejectionWriter));
});

check("but the rejection is still reported, because a stale token looks like this", () => {
  // Somebody's Zap with an out-of-date token produces exactly these. Dropping
  // them would trade a forgeable red card for an invisible real problem.
  const payload = region("function integrationStatusPayload(", "\n// The requester's address");
  assert.ok(/lastRejectedAtMs/.test(payload) && /rejectedCount/.test(payload));
});

check("the logged address is the one the platform resolved, not a header", () => {
  const source = region("function integrationRequestSource(", "\n// Rotating invalidates");
  const resolved = source.indexOf("req.ip");
  const header = source.indexOf('req.headers["x-forwarded-for"]');
  assert.ok(resolved > 0 && header > 0);
  assert.ok(resolved < header, "x-forwarded-for is caller-supplied and must not be preferred");
});

// ---- #22: the switch means it ---------------------------------------------
check("a customer who asked not to be contacted stops the status message", () => {
  const trigger = region("exports.notifyCustomerOnStatusChange = onDocumentWritten(", "const [settings, companySnap]");
  assert.ok(/await customerHasOptedOut\(companyId, after\.customerName\)/.test(trigger));
  assert.ok(/return;/.test(trigger));
});

check("and the skip is remembered, so it is not retried on every write", () => {
  const trigger = region("exports.notifyCustomerOnStatusChange = onDocumentWritten(", "const [settings, companySnap]");
  const gate = trigger.indexOf("customerHasOptedOut");
  const remember = trigger.indexOf("portalLastNotifiedStatus: status", gate);
  assert.ok(remember > gate, "the status is recorded before returning");
});

check("every outbound SMS passes the same gate, not just this trigger", () => {
  // sendWorkspaceSMS is the single call site for every message the product
  // sends. A future sender written without the trigger's check still stops here.
  const sender = region("async function sendWorkspaceSMS(", "const config = workspaceSmsConfig(settings");
  assert.ok(/await customerHasOptedOut\(companyId, customerName\)/.test(sender));
  assert.ok(/reason: "do_not_contact"/.test(sender));
});

check("the lookup matches the customer the way the rest of the code does", () => {
  // There is no stored normalised key to query on. An invented one would have
  // matched nothing, and matching nothing here means the message goes.
  const lookup = region("async function customerHasOptedOut(", "\nfunction normalizedCustomerKey(");
  assert.ok(/\.where\("name", "==", name\)/.test(lookup), "exact name, as upsertCustomerForWebOrder does");
  assert.ok(!/normalizedName/.test(lookup), "there is no such stored field");
});

check("a lookup failure lets the message through rather than silencing the product", () => {
  const lookup = region("async function customerHasOptedOut(", "\nfunction normalizedCustomerKey(");
  const cat = lookup.indexOf("catch (error)");
  assert.ok(cat > 0);
  assert.ok(/return false;/.test(lookup.slice(cat)), "a transient error must not stop order updates");
  assert.ok(/console\.warn/.test(lookup.slice(cat)), "but a persistent one must be visible");
});

// ---- #32: parked personal data has an end date -----------------------------
check("a parked order expires", () => {
  const held = region("async function holdIntegrationOrder(", "\n  try {");
  assert.ok(/expireAt: admin\.firestore\.Timestamp\.fromMillis\(Date\.now\(\) \+ HELD_ORDER_TTL_MS\)/.test(held));
});

check("ninety days, not the fortnight an error row gets", () => {
  // These are real unimported sales. An owner over their plan limit for two
  // weeks must not come back to find them gone.
  assert.ok(/const HELD_ORDER_TTL_MS = 90 \* 24 \* 60 \* 60 \* 1000;/.test(SOURCE));
});

check("a redaction request reaches the parked copy, and deletes it", () => {
  // Masking would be wrong here: releasing a parked order replays the payload
  // into a real order, so a redacted one would import a nameless sale.
  const redact = region("async function redactShopifyCustomerData(", "\nasync function handleShopifyPrivacyTopic(");
  assert.ok(/heldIntegrationOrdersRef\(companyId\)/.test(redact));
  assert.ok(/docSnap\.ref\.delete\(\)/.test(redact));
  assert.ok(!/anonymizedOrderFields[\s\S]{0,80}held/.test(redact), "parked orders are deleted, not masked");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ WEBHOOK PRIVACY GEÇTİ");
})();
