// The retired WooCommerce and Shopify webhook addresses answer 410 and write
// nothing. A merchant whose shop still posts to one of them therefore sees
// orders stop with nothing anywhere to say why.
//
// The obvious fix — record the hit against the workspace — is the wrong one,
// and this file guards against somebody adding it later: the stub has no token
// to check, so it would have to trust a companyId lifted straight out of a
// public URL, and any stranger could then light up a workspace's integration
// cards. The telling belongs on the read side, where the caller is already
// signed in and already proven to belong to the workspace.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { RETIRED_KINDS, retiredHolds } = require("../../integrations/retiredHolds");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
/** The body of a named function, comments stripped — prose about a bug is not the bug. */
function bodyOf(needle) {
  const start = source.indexOf(needle);
  assert.ok(start > 0, `${needle} is still there`);
  const end = source.indexOf("\n}", start);
  return source.slice(start, end)
    .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
}

check("a workspace still holding a WooCommerce token is told", () => {
  const held = retiredHolds({ woocommerce: { token: "abc", createdAt: null } });
  assert.deepStrictEqual(held, [{ kind: "woocommerce", createdAtMs: 0 }]);
});

check("both retired methods are covered, and in a stable order", () => {
  const held = retiredHolds({ shopify: { token: "s" }, woocommerce: { token: "w" } });
  assert.deepStrictEqual(held.map((row) => row.kind), ["woocommerce", "shopify"]);
  assert.deepStrictEqual(RETIRED_KINDS, ["woocommerce", "shopify"]);
});

check("a workspace holding nothing is told nothing", () => {
  assert.deepStrictEqual(retiredHolds({}), []);
  assert.deepStrictEqual(retiredHolds({ woocommerce: null, shopify: null }), []);
  assert.deepStrictEqual(retiredHolds(), []);
});

check("a doc left behind by a rotation, with no token in it, is not a warning", () => {
  // Nothing can be posted with an empty token, so there is nothing to say.
  assert.deepStrictEqual(retiredHolds({ woocommerce: { token: "", lastDeliveryOk: false } }), []);
  assert.deepStrictEqual(retiredHolds({ woocommerce: { token: "   " } }), []);
  assert.deepStrictEqual(retiredHolds({ woocommerce: {} }), []);
});

check("the date is carried across whether it is a Timestamp or a number", () => {
  assert.strictEqual(retiredHolds({ shopify: { token: "s", createdAt: { toMillis: () => 1750000000000 } } })[0].createdAtMs, 1750000000000);
  assert.strictEqual(retiredHolds({ shopify: { token: "s", createdAt: 1750000000001 } })[0].createdAtMs, 1750000000001);
  assert.strictEqual(retiredHolds({ shopify: { token: "s", createdAt: "rubbish" } })[0].createdAtMs, 0);
});

check("a live integration kind is never reported as retired", () => {
  // The inbound channel (Zapier, Make, Wix, Squarespace, a website) is not
  // retired and must never carry this warning.
  assert.deepStrictEqual(retiredHolds({ inbound: { token: "live" } }), []);
  assert.ok(!RETIRED_KINDS.includes("inbound"));
});

// ---- the two rules that only exist across files -----------------------------

check("the 410 stub still writes nothing at all", () => {
  const body = bodyOf("function retiredWebhookResponse(res, kind) {");
  assert.ok(/res\.status\(410\)/.test(body), "it still answers 410");
  for (const writer of ["recordIntegrationDelivery", "recordIntegrationRejection", "integrationSecretRef", ".set(", ".update("]) {
    assert.ok(
      !body.includes(writer),
      `the stub must not call ${writer}: it has no token to check, so it would be writing on the word of an unauthenticated URL`
    );
  }
});

check("the read-side answer is behind a signed-in owner, not a public URL", () => {
  const body = bodyOf("exports.listRetiredIntegrationHolds = onCall(");
  assert.ok(
    /requireWorkspaceForBilling\(request, true\)/.test(body),
    "the caller must be proven to own the workspace before being told what it holds"
  );
  assert.ok(
    !/request\.data\?\.\s*kind|req\.query/.test(body),
    "nothing about the answer may come from the caller beyond the workspace it proved"
  );
  assert.ok(/retiredHolds\(secrets\)/.test(body), "the answer comes from the shared rule, not a second copy of it");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ RETIRED ENDPOINTS GEÇTİ");
})();
