// RET-001. Every retention field is a Timestamp called expireAt, because that is
// the only thing a Firestore TTL policy can read. These two writers sit behind
// a webhook signature and an OAuth token key the emulator suite does not hold,
// so their shape is pinned here; the Shopify row is checked live in
// test/e2e/inbound-capacity-emulator.test.js.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const webhook = fs.readFileSync(path.join(root, "etsyWebhook.js"), "utf8");
const connect = fs.readFileSync(path.join(root, "etsyConnect.js"), "utf8");

function pass(name) { console.log("PASS ", name); }

{
  const block = webhook.slice(webhook.indexOf("await eventRef.create({"));
  assert(/expireAt: admin\.firestore\.Timestamp\.fromMillis\(now\(\) \+ 7 \* 24 \* 60 \* 60 \* 1000\)/.test(block.slice(0, 600)),
    "etsyWebhookEvents rows expire seven days after receipt");
  pass("an Etsy webhook event row carries a seven-day expireAt");
}
{
  const block = connect.slice(connect.indexOf("await states().doc(state).set({"));
  assert(/expiresAt: now\(\) \+ etsy\.OAUTH_STATE_TTL_MS/.test(block.slice(0, 600)), "the numeric expiry the callback compares is still there");
  assert(/expireAt: admin\.firestore\.Timestamp\.fromMillis\(now\(\) \+ etsy\.OAUTH_STATE_TTL_MS\)/.test(block.slice(0, 700)),
    "and the Timestamp twin the TTL policy purges by");
  pass("an Etsy OAuth state carries both the numeric expiry and its Timestamp twin");
}

// A parked order is the raw provider payload — name, email, phone and both
// addresses — waiting for room on the plan, and it had no end date at all. A
// workspace that hit its limit once kept a stranger's personal data forever.
// Ninety days rather than the seven above: these are real unimported sales, and
// an owner over their limit for a fortnight must not lose them.
{
  const index = fs.readFileSync(path.join(root, "index.js"), "utf8");
  const held = index.slice(index.indexOf("async function holdIntegrationOrder("), index.indexOf("async function holdIntegrationOrder(") + 900);
  assert(/expireAt: admin\.firestore\.Timestamp\.fromMillis\(Date\.now\(\) \+ HELD_ORDER_TTL_MS\)/.test(held),
    "a parked integration order carries an expireAt the TTL policy can read");
  assert(/const HELD_ORDER_TTL_MS = 90 \* 24 \* 60 \* 60 \* 1000;/.test(index),
    "ninety days, long enough that an owner over their limit does not lose real sales");
  pass("a parked integration order carries a ninety-day expireAt");

  // Masking is deliberately NOT the control: releasing a parked order replays
  // the payload into a real order, so a redacted one would import a nameless
  // sale. A privacy request therefore deletes the parked copy instead.
  const redact = index.slice(index.indexOf("async function redactShopifyCustomerData("), index.indexOf("async function handleShopifyPrivacyTopic("));
  assert(/heldIntegrationOrdersRef\(companyId\)/.test(redact),
    "a customers/redact request must reach the parked copy too");
  assert(/docSnap\.ref\.delete\(\)/.test(redact), "and delete it rather than mask it");
  pass("a Shopify redaction request reaches the parked copy");
}

console.log("\n✅ RETENTION FIELDS GEÇTİ");
