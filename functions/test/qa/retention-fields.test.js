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

console.log("\n✅ RETENTION FIELDS GEÇTİ");
