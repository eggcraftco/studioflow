// The same website order arriving twice.
//
// Zapier, Make and most site plugins retry on any non-2xx, and a shop can
// resend by hand. The document id is deterministic, so a replay never created a
// second order — but it DID rewrite every shop-owned field including paidAmount,
// and it fired a second "New website order" push. The three native connectors
// get this from the shared commerce engine; the generic inbound channel has
// never been routed through it and had neither guard.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const HANDLER = (() => {
  const at = SOURCE.indexOf("exports.inboundOrderWebhook = onRequest(");
  assert.ok(at > 0, "the webhook is where it was");
  const end = SOURCE.indexOf("\nexports.", at + 20);
  return SOURCE.slice(at, end > 0 ? end : at + 12000);
})();

check("an identical redelivery does not write the order again", () => {
  assert.ok(/String\(stamp\.contentHash \|\| ""\) === contentFingerprint/.test(HANDLER));
  const guard = HANDLER.indexOf("=== contentFingerprint");
  const write = HANDLER.indexOf("integrationOrderUpdate(mappedOrder, !existing.exists");
  assert.ok(guard > 0 && write > 0 && guard < write, "the guard has to come before the write");
});

check("a delivery the sender labelled as a repeat is refused by its own key", () => {
  assert.ok(/String\(stamp\.lastEventKey \|\| ""\) === deliveryKey/.test(HANDLER));
  // Both the payload and the header, because senders use both.
  assert.ok(/idempotencyKey", "idempotency_key", "eventId"/.test(HANDLER));
  assert.ok(/req\.get\("idempotency-key"\)/.test(HANDLER));
});

check("neither guard fires on a first delivery", () => {
  // An order that does not exist yet must always be written, whatever the
  // sender put in the payload.
  for (const marker of ['String(stamp.lastEventKey || "") === deliveryKey', 'String(stamp.contentHash || "") === contentFingerprint']) {
    const at = HANDLER.indexOf(marker);
    assert.ok(at > 0, marker);
    const line = HANDLER.slice(HANDLER.lastIndexOf("if (", at), at);
    assert.ok(/existing\.exists &&/.test(line), `${marker} is not gated on the order already existing`);
  }
});

check("the fingerprint is of what would be written, not of the raw payload", () => {
  // A sender that adds a timestamp or a nonce to every delivery would defeat a
  // payload hash while writing exactly the same order.
  assert.ok(
    /createHash\("sha256"\)\s*\n?\s*\.update\(JSON\.stringify\(integrationOrderUpdate\(mappedOrder/.test(HANDLER),
    "the hash must be taken over the mapped update"
  );
});

check("the stamp is written in the shape the commerce engine already uses", () => {
  // So routing this channel through the engine later reads the same stamp
  // instead of starting from nothing.
  assert.ok(/commerce: \{/.test(HANDLER));
  for (const field of ["contentHash: contentFingerprint", "lastEventKey: deliveryKey", "lastAppliedAtMs: Date.now()", 'provider: "inbound"']) {
    assert.ok(HANDLER.includes(field), `the stamp is missing ${field}`);
  }
});

check("a repeat still answers 200, so the sender stops retrying", () => {
  const dup = HANDLER.slice(HANDLER.indexOf("=== deliveryKey"));
  assert.ok(/res\.status\(200\)\.json\(\{ ok: true, orderId: docId, duplicate: true \}\)/.test(dup));
  assert.ok(/res\.status\(200\)\.json\(\{ ok: true, orderId: docId, unchanged: true \}\)/.test(dup));
});

check("a repeat is still recorded as a delivery, so the card stays green", () => {
  // The workspace's Integrations card reads the delivery log. A silent success
  // that logged nothing would look like a channel that had gone quiet.
  // Both early returns, bounded by the real write rather than by the first
  // `ref.set` — the content-hash branch does one of its own to refresh the
  // stamp, and slicing there cut the second branch out of the window.
  const dup = HANDLER.slice(HANDLER.indexOf("=== deliveryKey"), HANDLER.indexOf("...integrationOrderUpdate(mappedOrder"));
  assert.strictEqual((dup.match(/recordIntegrationDelivery\(companyId, "inbound", \{ ok: true/g) || []).length, 2);
});

check("only a genuinely new order rings the phone", () => {
  // The exact call, not "a `!existing.exists` appears somewhere above it" — the
  // first version of this check searched backwards to the nearest `if (` and
  // found an unrelated one, so removing the gate left it green.
  assert.ok(
    HANDLER.includes("if (!existing.exists) await sendPushNotificationToCompany(companyId, {"),
    "an updated delivery must not say 'New website order'"
  );
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ INBOUND REPLAY GEÇTİ");
})();
