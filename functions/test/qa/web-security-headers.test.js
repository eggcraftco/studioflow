// The headers a browser is told to enforce.
//
// These went on after Amazon refused the developer registration on the network
// security controls question. They are not an answer to that question — a
// header is not a firewall — and the plan says so. They are the cheap half of
// defence in depth that was simply missing: the site was serving one CSP
// directive and nothing else.
//
// Configured is not the same as emitted, so scripts/check-security-headers.js
// starts the built app and reads them off a real response. This file guards the
// configuration, which is what a careless edit would change.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const config = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "studioflow-web", "next.config.ts"), "utf8"
);

const REQUIRED = [
  ["Strict-Transport-Security", /max-age=31536000; includeSubDomains/,
    "a browser that has seen this site once must refuse to talk to it over plain HTTP"],
  ["X-Content-Type-Options", /nosniff/,
    "without it a browser may decide an uploaded file is a script"],
  ["X-Frame-Options", /DENY/,
    "no page here is meant to be framed"],
  ["Referrer-Policy", /strict-origin-when-cross-origin/,
    "a full URL leaking to a third party can carry an order id"],
  ["Permissions-Policy", /camera=\(\)/,
    "capabilities this app does not use should not be available to anything running on the page"],
  ["Cross-Origin-Opener-Policy", /same-origin/, "a window opened from here must not reach back into it"],
  ["Cross-Origin-Resource-Policy", /same-origin/, "another origin must not embed our resources"]
];

check("every security header is configured, with its value", () => {
  for (const [header, pattern, why] of REQUIRED) {
    assert.ok(new RegExp(`"${header}"`).test(config), `${header} is gone — ${why}`);
    const at = config.indexOf(`"${header}"`);
    const line = config.slice(at, at + 260);
    assert.ok(pattern.test(line), `${header} no longer carries the value that makes it work — ${why}`);
  }
});

check("they are applied to every path, not just one", () => {
  // A header block scoped to a single route is the shape this mistake takes.
  assert.ok(/source: "\/:path\*",\s*\n\s*headers: SECURITY_HEADERS/.test(config),
    "the security headers are no longer applied to every path");
});

check("HSTS is not preloaded", () => {
  // Preloading is a one-way door through the browser vendors; max-age is ours
  // to lower. Turning it on should be a decision somebody makes deliberately,
  // not something that arrives with a copied snippet.
  const at = config.indexOf('"Strict-Transport-Security"');
  assert.ok(!/preload/.test(config.slice(at, at + 200)),
    "HSTS preload was added. It cannot be undone on the browsers' timetable — if this is deliberate, " +
    "change this test and say why in the commit.");
});

check("the framework version is not announced", () => {
  assert.ok(/poweredByHeader: false/.test(config),
    "x-powered-by is back, telling an attacker which framework to look up");
});

check("the runtime check exists, because configured is not emitted", () => {
  const script = path.join(__dirname, "..", "..", "..", "studioflow-web", "scripts", "check-security-headers.js");
  assert.ok(fs.existsSync(script),
    "the script that starts the built app and reads the headers off a real response is gone");
  const body = fs.readFileSync(script, "utf8");
  for (const [header] of REQUIRED) {
    assert.ok(body.toLowerCase().includes(header.toLowerCase()),
      `the runtime check no longer looks for ${header}`);
  }
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ WEB SECURITY HEADERS GEÇTİ");
