// The eBay callback relay, checked across the boundary between the two trees.
//
//   npm run test:relay
//
// `app/ebay/callback/route.ts` owns four decisions nothing else executes: the
// decline branch (the only place `cancelled` is produced), the 32-character key
// floor, the rule that an absent nonce cookie is never gated on, and one of the
// two HMAC implementations in this system. Next builds it, TypeScript checks its
// types, and until this script existed nothing ran it — so a change to either
// side of the canonical string would have broken OAuth silently, in production
// only, with an opaque 401 → `unavailable` as the entire symptom.
//
// Design §5.4 planned a committed vector file for that. This does something
// stronger and needs no committed key: it compiles the REAL route, drives it
// with `fetch` captured, and hands the request it produced to the REAL
// `ebayOAuthCallback` through the functions qa harness, under a key minted per
// run and written nowhere. Neither side re-implements the other — that is this
// repo's "tests that assert the bug" lesson applied across the two trees, and it
// is why the check is an execution rather than a pair of greps.
//
// The vector file itself (`functions/test/fixtures/ebay-callback-signature-vectors.json`)
// is still unwritten and still blocked on who mints its fixture key; this script
// says so out loud rather than reporting green for work nobody has done.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..");
const routePath = path.join(webRoot, "app", "ebay", "callback", "route.ts");
const vectorPath = path.join(repoRoot, "functions", "test", "fixtures", "ebay-callback-signature-vectors.json");

let failures = 0;
const ok = (name) => console.log(`PASS  ${name}`);
const check = (name, condition, detail = "") => {
  if (condition) return ok(name);
  failures += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---- 1. What the route says about itself ------------------------------------
// Four source assertions, because these are properties of the FILE that no
// execution of one request can demonstrate.
const source = readFileSync(routePath, "utf8");
// The route explains itself at length, and one of the things it says is "NEVER
// NEXT_PUBLIC_". So the code is read without its comment lines: a prose mention
// of the prefix must not fail the check that the prefix is never USED.
const code = source.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

check('the route runs on Node, not Edge — Next inlines process.env for Edge handlers, which would bake the relay key into the build',
  /export const runtime = "nodejs"/.test(source));
check("the route is force-dynamic, so a callback is never served from a cache",
  /export const dynamic = "force-dynamic"/.test(source));
check("the decline branch lives here and nowhere else — the function has no error field and no cancelled in its vocabulary",
  /params\.has\("error"\)/.test(source) && /return land\("cancelled"\)/.test(source));
check("the relay key is read INSIDE the handler and its length is checked",
  /process\.env\.NIVADESK_EBAY_CALLBACK_KEY/.test(source) && /KEY_MIN_LENGTH/.test(source)
  && source.indexOf("export async function GET") < source.indexOf("process.env.NIVADESK_EBAY_CALLBACK_KEY"));
check("NEXT_PUBLIC_ is never used in the route — that prefix would publish the key to every visitor",
  !/NEXT_PUBLIC_/.test(code));
// §5.4's burn: an absent cookie must still cost one invocation, so the cookie is
// read and never returned on. The shape of the mistake is a `return` in the same
// statement as the cookie read.
const cookieLine = code.split("\n").find((line) => line.includes("cookies.get(NONCE_COOKIE)")) || "";
check("the absent nonce cookie is read, never gated on — the burn depends on the POST being made anyway",
  cookieLine.length > 0 && !/return/.test(cookieLine), cookieLine.trim().slice(0, 90));

// ---- 2. The two implementations, executed against each other ----------------
// The route is compiled as CommonJS on purpose: `next/server` resolves for
// `require` but not for a bare ESM specifier, and the output must live under the
// web tree or `next` does not resolve at all.
const outDir = mkdtempSync(path.join(webRoot, ".ebay-relay-check-"));
try {
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [routePath, "--outDir", outDir, "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "inherit" }
  );

  const webRequire = createRequire(path.join(outDir, "check.cjs"));
  const functionsRequire = createRequire(path.join(repoRoot, "functions", "check.cjs"));
  const { NextRequest } = webRequire("next/server");
  const route = webRequire(path.join(outDir, "route.js"));
  const harness = functionsRequire(path.join(repoRoot, "functions", "test", "qa", "helpers", "ebayHarness.js"));

  // One key, minted here, held in memory, in no file and no commit. The web half
  // reads it from the environment exactly as Hostinger will supply it; the
  // function half gets it through the harness's own switch.
  const KEY = harness.CALLBACK_KEY;
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;

  // The harness clock is what the function checks the signature's timestamp
  // against, and the route stamps the real one — so they are started together.
  const nowRef = { value: Date.now() };
  const { fns, store, calls } = harness.buildEbay({ nowRef });

  /** Drive the real route, capture the request it would have sent. */
  async function relay(url, cookie, answer) {
    const realFetch = globalThis.fetch;
    let sent = null;
    globalThis.fetch = async (target, init) => {
      sent = { target: String(target), init };
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
    };
    try {
      const request = new NextRequest(new URL(url), cookie ? { headers: { cookie } } : {});
      const response = await route.GET(request);
      // The Set-Cookie is part of the contract: clearing the nonce on a landing
      // that consumed nothing is a free way for a link to break an in-flight
      // connect, so which landings clear it is checked, not assumed.
      const cookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
      return { sent, location: response.headers.get("location"), cookies };
    } finally { globalThis.fetch = realFetch; }
  }

  /** Hand what the route sent to the real function, as Cloud Run would. */
  async function deliver(sent, { tamper = null } = {}) {
    const raw = tamper === null ? sent.init.body : tamper;
    const res = harness.fakeRes();
    await fns.ebayOAuthCallback({
      method: sent.init.method,
      originalUrl: "/ebayOAuthCallback",
      headers: sent.init.headers,
      rawBody: Buffer.from(raw, "utf8"),
      body: (() => { try { return JSON.parse(raw); } catch { return null; } })()
    }, res);
    return res;
  }

  const begun = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
  const callbackUrl = `https://nivadesk.app/ebay/callback?code=good-code&state=${encodeURIComponent(begun.state)}`;

  const relayed = await relay(callbackUrl, `nv_ebay_nonce=${encodeURIComponent(begun.nonce)}`,
    { status: 200, body: { ok: true, outcome: "connected", rid: "0123456789abcdef" } });
  check("the route puts no value in a URL: it POSTs a JSON body to the bare function URL",
    relayed.sent !== null && relayed.sent.target === "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback"
    && relayed.sent.init.method === "POST" && !relayed.sent.target.includes("?"),
    relayed.sent ? relayed.sent.target : "no request was made");
  check("and it redirects the seller to the settings page with a word from its own vocabulary",
    relayed.location === "https://nivadesk.app/settings?section=ebay&ebay=connected", String(relayed.location));
  const clears = (r) => r.cookies.some((c) => /nv_ebay_nonce=;/.test(c) && /Max-Age=0/i.test(c));
  check("a connected landing clears the nonce cookie: that flow really did consume it",
    clears(relayed), JSON.stringify(relayed.cookies));

  // THE check this script exists for: the bytes the route signed, verified by the
  // function's own verifier. Two implementations, in two languages' trees, that
  // cannot import each other — so they are run against each other instead.
  const accepted = await deliver(relayed.sent);
  check("the canonical string agrees across the boundary: the function accepts the route's signature",
    accepted.statusCode === 200 && accepted.payload && accepted.payload.outcome === "connected",
    `${accepted.statusCode} ${JSON.stringify(accepted.payload)}`);

  // And the signature is bound to THIS body: one changed character is a 401.
  const second = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
  const again = await relay(`https://nivadesk.app/ebay/callback?code=good-code&state=${encodeURIComponent(second.state)}`,
    `nv_ebay_nonce=${encodeURIComponent(second.nonce)}`, { status: 200, body: { ok: true, outcome: "connected", rid: "0123456789abcdef" } });
  const swapped = again.sent.init.body.replace('"code":"good-code"', '"code":"other-code"');
  const refused = await deliver(again.sent, { tamper: swapped });
  check("the signature binds the body: one swapped field and the function answers 401",
    refused.statusCode === 401 && JSON.stringify(refused.payload) === JSON.stringify({ ok: false }),
    `${refused.statusCode} ${JSON.stringify(refused.payload)}`);
  check("…and a body the function refused burned nothing — the state is still there to be used",
    store.read(`ebayConnectStates/${second.state}`).used === false);

  // The absent cookie: the route must still post, with nonce:"" — the burn.
  const third = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
  const noCookie = await relay(`https://nivadesk.app/ebay/callback?code=good-code&state=${encodeURIComponent(third.state)}`,
    "", { status: 200, body: { ok: false, outcome: "error", reason: "browser", rid: "0123456789abcdef" } });
  check("no cookie is not a refusal: the route posts nonce:\"\" and the function burns the state",
    noCookie.sent !== null && JSON.parse(noCookie.sent.init.body).nonce === "",
    noCookie.sent ? noCookie.sent.init.body.slice(0, 60) : "no request was made");
  const burned = await deliver(noCookie.sent);
  check("…and the function answers browser with the state consumed, which is the whole of §5's browser binding",
    burned.payload.reason === "browser" && store.read(`ebayConnectStates/${third.state}`).used === true,
    JSON.stringify(burned.payload));
  // The burn kills that state; only the exchange kills the code, which is bound
  // to the application and not to the state that fetched it (§5.4, "The burn,
  // and the spend"). This is the end of the round trip the route exists for, so
  // it is checked here as well as in the qa suite.
  check("…and the code the refusal saw was spent, not left in the access log for a fresh-state replay",
    calls.codes.includes("good-code"), JSON.stringify(calls.codes));

  check("…and that landing is the only kind that touches the cookie: a burn answer clears it too",
    clears(await relay(`https://nivadesk.app/ebay/callback?code=good-code&state=${encodeURIComponent(third.state)}`, "",
      { status: 200, body: { ok: false, outcome: "error", reason: "browser", rid: "0123456789abcdef" } })));

  // A decline never reaches the connector, and an empty error= is still a decline.
  for (const query of ["error=access_denied", "error="]) {
    const declined = await relay(`https://nivadesk.app/ebay/callback?${query}`, "", { status: 200, body: {} });
    check(`a decline (?${query}) is settled on our own domain: no call, and the seller is told nothing was changed`,
      declined.sent === null && declined.location === "https://nivadesk.app/settings?section=ebay&ebay=cancelled",
      `${declined.sent ? "a call was made" : "no call"} ${declined.location}`);
    check(`…and it leaves the nonce cookie alone (?${query}): nothing was consumed, so a link cannot spend someone's in-flight connect`,
      declined.cookies.length === 0, JSON.stringify(declined.cookies));
  }

  // Not a callback at all: same rule, and this is the shape an attacker's link
  // takes — https://nivadesk.app/ebay/callback with nothing on it.
  const bare = await relay("https://nivadesk.app/ebay/callback", "nv_ebay_nonce=someone-elses-live-nonce", { status: 200, body: {} });
  check("a bare visit makes no call, says missing_code, and does NOT clear the cookie of a flow it never touched",
    bare.sent === null && bare.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=missing_code" && bare.cookies.length === 0,
    `${bare.location} ${JSON.stringify(bare.cookies)}`);

  // A code alongside an error: the one shaped query with a real code in it that
  // used to answer `cancelled` with nothing burned and nothing spent.
  const both = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
  const withError = await relay(`https://nivadesk.app/ebay/callback?code=good-code&error=access_denied&state=${encodeURIComponent(both.state)}`,
    `nv_ebay_nonce=${encodeURIComponent(both.nonce)}`, { status: 200, body: { ok: true, outcome: "connected", rid: "0123456789abcdef" } });
  check("a callback carrying BOTH a code and an error takes the relay path — the code wins, so the burn has no exception",
    withError.sent !== null && JSON.parse(withError.sent.init.body).code === "good-code",
    withError.sent ? withError.sent.init.body.slice(0, 60) : "no request was made");
  const bothDelivered = await deliver(withError.sent);
  check("…and the function consumes that state like any other callback",
    bothDelivered.payload.outcome === "connected" && store.read(`ebayConnectStates/${both.state}`).used === true,
    JSON.stringify(bothDelivered.payload));

  // The two shape checks, in the SAME unit: the function caps the body at 8192
  // BYTES, so a code the route would accept by character count must be refused
  // here rather than landing as an opaque 400 with nothing burned.
  const wide = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
  const oversize = await relay(`https://nivadesk.app/ebay/callback?code=${encodeURIComponent("\u20ac".repeat(4000))}&state=${encodeURIComponent(wide.state)}`,
    `nv_ebay_nonce=${encodeURIComponent(wide.nonce)}`, { status: 200, body: {} });
  check("a 4000-character code that is 12000 bytes is refused HERE, in the function's own unit, not there as a 400",
    oversize.sent === null && oversize.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=missing_code",
    `${oversize.sent ? "a call was made" : "no call"} ${oversize.location}`);

  // The key floor, exercised rather than asserted: a short key never calls.
  for (const bad of ["", "a".repeat(31)]) {
    process.env.NIVADESK_EBAY_CALLBACK_KEY = bad;
    const fourth = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
    const unkeyed = await relay(`https://nivadesk.app/ebay/callback?code=good-code&state=${encodeURIComponent(fourth.state)}`,
      `nv_ebay_nonce=${encodeURIComponent(fourth.nonce)}`, { status: 200, body: {} });
    check(`a ${bad.length}-character key makes no call and lands the seller on unavailable`,
      unkeyed.sent === null && unkeyed.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=unavailable",
      String(unkeyed.location));
    // …which is also the case that leaves the state alive: §5.4, "The burn has
    // one dependency, and it is the key", and the deploy plan's §4.2 action.
    check("…and the state it could not burn is still unused, which is the cost the deploy plan names",
      store.read(`ebayConnectStates/${fourth.state}`).used === false);
  }
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

// ---- 3. What this script does NOT cover, said out loud ----------------------
let vectorFile = null;
try { vectorFile = readFileSync(vectorPath, "utf8"); } catch { vectorFile = null; }
if (vectorFile) {
  console.log("NOTE  a vector file now exists at functions/test/fixtures/ebay-callback-signature-vectors.json —");
  console.log("      §5.4 says the function's verifier is checked against it in ebay-connect.test.js. This script");
  console.log("      checks the two implementations against each other directly and does not read the file.");
} else {
  console.log("SKIP  the committed signature vector (design §5.4) is still unwritten: it needs a fixed fixture key,");
  console.log("      and who mints that key is an owner decision (deploy plan check 10). The cross-boundary check");
  console.log("      above covers what it was for, with a key minted per run and written nowhere.");
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ EBAY RELAY GEÇTİ");
