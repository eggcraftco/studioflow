// A refunded App Store subscription must stay refunded.
//
// Apple does not promise delivery in order. Stripe compares the webhook event's
// own created time; Google ignores the pushed payload and re-reads live state,
// which is inherently order-safe. Apple was the one rail with neither: a
// DID_RENEW delivered late — after a REFUND that had already revoked the
// subscription — overwrote providerStatus, activeForEntitlement and
// currentPeriodEnd unconditionally, and the workspace got its paid plan back.
//
// The expiry reconcile does not undo it, because the row left behind has a
// future period end and so looks perfectly healthy.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { appleEventIsStale } = require("../../stripeBilling");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const REFUND_AT = 1_788_000_000_000;
const RENEW_AT = REFUND_AT - 60_000; // signed a minute earlier, delivered later

check("a notification signed before the last one applied is dropped", () => {
  assert.strictEqual(appleEventIsStale({ appleEventSequence: REFUND_AT }, RENEW_AT), true);
});

check("a notification signed after it is applied", () => {
  assert.strictEqual(appleEventIsStale({ appleEventSequence: RENEW_AT }, REFUND_AT), false);
});

check("the first notification for a subscription is never stale", () => {
  assert.strictEqual(appleEventIsStale(null, REFUND_AT), false);
  assert.strictEqual(appleEventIsStale({}, REFUND_AT), false);
  assert.strictEqual(appleEventIsStale({ appleEventSequence: 0 }, REFUND_AT), false);
});

check("the owner's own re-check is never stale, whatever the ledger says", () => {
  // A client verify and the reconcile job carry no sequence. If those could be
  // dropped, an owner could not recover from a bad row by pressing Refresh.
  for (const sequence of [0, undefined, null, NaN, -1, "not a number"]) {
    assert.strictEqual(
      appleEventIsStale({ appleEventSequence: REFUND_AT }, sequence), false, String(sequence)
    );
  }
});

check("a corrupt stored sequence does not start dropping real notifications", () => {
  for (const stored of [null, undefined, "abc", NaN, -5, {}]) {
    assert.strictEqual(
      appleEventIsStale({ appleEventSequence: stored }, RENEW_AT), false, JSON.stringify(stored)
    );
  }
});

check("two notifications signed at the same instant both apply", () => {
  // Equal is not earlier. Dropping a same-millisecond delivery would lose a
  // real state change for no reason.
  assert.strictEqual(appleEventIsStale({ appleEventSequence: REFUND_AT }, REFUND_AT), false);
});

// ---- the wiring -----------------------------------------------------------
const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "stripeBilling.js"), "utf8");

function block(marker, length = 3000) {
  const at = SOURCE.indexOf(marker);
  assert.ok(at > 0, `${marker} is where it was`);
  return SOURCE.slice(at, at + length);
}

check("both Apple ledger writers consult it before they write", () => {
  for (const marker of ["async function persistApplePlanSubscription(", "async function persistAppleStorageAddon("]) {
    const body = block(marker);
    const guard = body.indexOf("appleEventIsStale(");
    const write = body.indexOf("await ledgerRef.set(");
    assert.ok(guard > 0, `${marker} does not check ordering`);
    assert.ok(write > 0, `${marker} does not write`);
    assert.ok(guard < write, `${marker} checks ordering AFTER writing`);
  }
});

check("the sequence is stored, and only from a real notification", () => {
  const body = block("async function persistApplePlanSubscription(");
  assert.ok(
    /\.\.\.\(appleSequence > 0 \? \{ appleEventSequence: appleSequence \} : \{\}\)/.test(body),
    "a client verify must not advance the sequence"
  );
});

check("the webhook passes Apple's own signed date, not a date off the transaction", () => {
  const body = block("appleAppStoreServerNotification", 6000);
  assert.ok(/eventSequenceMs: Number\(notification\.signedDate \|\| 0\)/.test(body),
    "the notification's signedDate is what increases between deliveries");
  // The transaction's own dates are not monotonic — a refund followed by a late
  // renewal would look newer by expiry date and win.
  assert.ok(!/eventSequenceMs: Number\(transaction\./.test(body));
});

check("Stripe's guard is still there, since this one was modelled on it", () => {
  assert.ok(/stripeEventSequence/.test(SOURCE));
  assert.ok(/stale_subscription_event/.test(SOURCE));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ APPLE BILLING ORDER GEÇTİ");
})();
