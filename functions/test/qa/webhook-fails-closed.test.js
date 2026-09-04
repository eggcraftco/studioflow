// A control that disappears when its configuration does is not a control.
//
// track17Webhook used to fail OPEN: with TRACK17_WEBHOOK_TOKEN unset, every
// request was accepted and a warning went to the log. The token has been set all
// along, so nothing was ever unauthenticated in practice — but one missing
// environment variable, a rename, or a deploy that dropped the env file would
// have turned an endpoint that writes to orders into an open one, and nothing
// about the incoming request would have looked wrong.
//
// This file holds every unauthenticated inbound endpoint to the same rule, so
// the next one cannot be written with a friendly fallback.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
function bodyOf(marker) {
  const start = source.indexOf(marker);
  assert.ok(start > 0, `${marker} is gone`);
  return source.slice(start, source.indexOf("\n});", start));
}

check("the tracking webhook refuses everything when its token is not configured", () => {
  const body = bodyOf("exports.track17Webhook = onRequest(");
  const guard = body.indexOf("if (!expectedToken)");
  assert.ok(guard > 0, "there is no absent-token guard at all");
  // The refusal must come before anything is read off the request body.
  const firstUse = body.indexOf("req.body");
  assert.ok(firstUse > guard, "the payload is read before the token is checked");
  assert.ok(/res\.status\(503\)/.test(body.slice(guard, guard + 400)), "an absent token does not refuse");
});

check("there is no branch that lets an unauthenticated request through", () => {
  const body = bodyOf("exports.track17Webhook = onRequest(");
  // The exact shape of the old bug: a warning instead of a refusal.
  assert.ok(
    !/not set[^\n]*not authenticated/i.test(body),
    "the fail-open branch is back: a missing token warns and continues"
  );
  // And the comparison stays timing-safe.
  assert.ok(body.includes("nvTimingSafeEqual(provided, expectedToken)"), "the token comparison is no longer timing-safe");
});

check("a wrong token is still refused, and the sender is told which kind of failure it is", () => {
  const body = bodyOf("exports.track17Webhook = onRequest(");
  assert.ok(/res\.status\(401\)[^\n]*invalid_token/.test(body), "a wrong token no longer returns 401");
  // 503 for our own misconfiguration, 401 for theirs: 17TRACK retries a 503 and
  // treats a 401 as a delivery it should stop attempting.
  assert.ok(/res\.status\(503\)[^\n]*not_configured/.test(body));
});

check("every other inbound webhook still authenticates before it acts", () => {
  // Not a new rule — a regression net around the ones that already do it, so
  // that "authenticated" stays true of the whole surface rather than of one
  // endpoint somebody remembered.
  const endpoints = [
    { marker: "exports.shopifyOrderWebhook = onRequest(", needs: ["readIntegrationSecret", "retiredWebhookResponse"] },
    { marker: "exports.woocommerceOrderWebhook = onRequest(", needs: ["readIntegrationSecret", "retiredWebhookResponse"] },
    { marker: "exports.inboundOrderWebhook = onRequest(", needs: ["readIntegrationSecret"] }
  ];
  for (const { marker, needs } of endpoints) {
    const body = bodyOf(marker);
    assert.ok(needs.some((n) => body.includes(n)), `${marker} has no visible authentication`);
  }
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ WEBHOOK FAILS CLOSED GEÇTİ");
})();
