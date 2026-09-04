// Who connected a shop, and who disconnected it.
//
// The accounting pair has kept a full trail for months — action, actor, email,
// summary, timestamp. Every other connector recorded only a timestamp, so the
// answer to "who took the Etsy shop off" was a time and nothing else. Low
// stakes today, because every one of these callables is owner-only and there is
// only ever one owner — but a workspace that adds an admin tomorrow inherits a
// history that cannot tell two people apart, and Shopify's unlink actively
// erased the attribution it already had.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

check("every connector records who disconnected, not only when", () => {
  const sources = {
    "Etsy": "etsyConnect.js",
    "WooCommerce": "wooConnector.js",
    "Square": "squareConnector.js",
    "bank / PayPal": "bankFeed.js"
  };
  for (const [name, file] of Object.entries(sources)) {
    const source = read(file);
    assert.ok(/disconnectedByUid/.test(source), `${name} still records only a timestamp`);
  }
});

check("the actor is a real uid from the guard, not a string from the request", () => {
  // Taking it from request.data would let the caller write anybody's name into
  // their own workspace's history.
  for (const file of ["etsyConnect.js", "wooConnector.js", "squareConnector.js", "bankFeed.js"]) {
    const source = read(file);
    const at = source.indexOf("disconnectedByUid");
    const line = source.slice(at, source.indexOf("\n", at));
    assert.ok(/disconnectedByUid: uid/.test(line), `${file}: ${line.trim()}`);
  }
});

check("Shopify moves its attribution aside instead of erasing it", () => {
  const source = read("index.js");
  const at = source.indexOf('if (action === "disconnect") {');
  const body = source.slice(at, at + 1200);
  assert.ok(/unlinkedFromUid: String\(previous\.linkedUid/.test(body), "the previous holder is kept");
  assert.ok(/unlinkedAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/.test(body));
  // And still clears the live fields, or the store would look connected.
  assert.ok(/linkedUid: "",/.test(body));
  assert.ok(/companyId: "",/.test(body));
});

check("the bank's existing audit log carries the actor too", () => {
  const source = read("bankFeed.js");
  assert.ok(/kind: "disconnected", ok: true, connectionId, kept: true, actorUid: uid/.test(source));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ CONNECTOR ATTRIBUTION GEÇTİ");
})();
