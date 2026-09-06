// The eBay callback relay and the browser-binding ticket, checked across the
// boundary between the two trees.
//
//   npm run test:relay
//
// `app/ebay/callback/route.ts` and `app/ebay/ticket/route.ts` own decisions
// nothing else executes: the decline branch (the only place `cancelled` is
// produced), the 32-character key floor, WHICH ENVELOPE gets signed for a given
// browser, and one of the two HMAC implementations in this system — two of them
// now, because §5.5 added a ticket whose minter lives in the functions tree and
// whose verifier lives here. Next builds these files, TypeScript checks their
// types, and until this script existed nothing ran them — so a change to either
// side of either canonical string would have broken OAuth silently, in
// production only, with an opaque 401 → `unavailable` as the entire symptom.
//
// Design §5.4 planned a committed vector file for that, and §5.5 wrote it. Both
// halves now run, and they answer different questions:
//
//   * the EXECUTION (most of this file): it compiles the REAL routes, drives them
//     with `fetch` captured, and hands the request they produced to the REAL
//     `ebayOAuthCallback` through the functions qa harness, under a key minted
//     per run and written nowhere. Neither side re-implements the other — this
//     repo's "tests that assert the bug" lesson applied across the two trees.
//   * the FIXTURE (section 2b): `functions/test/fixtures/ebay-callback-signature-vectors.json`,
//     committed, under a test key the fixture mints inside itself. The execution
//     is symmetric — it proves the two sides AGREE, and stays green if both of
//     them move together. The frozen answer is what notices that.
//
// A missing fixture is a FAILURE of this script, not a note on it. The `SKIP`
// line this file used to print is gone, and `ebay-connect.test.js` pins that it
// cannot come back.
//
// The one re-implementation is deliberate and is fenced: `forge()` mints
// ADVERSARIAL tickets — expired, bent, signed under the wrong key — which no
// honest minter can produce. It is checked against both real implementations
// before anything trusts it ("the forger agrees with both real sides").
//
// This script stops at the BYTES the routes produce. The ten cases the operator's
// report cites by id — EBAY-REG-01 … 10 — carry those bytes into the function and
// assert what is left afterwards, and they live next door in
// `check-ebay-callback-regressions.mjs`. Both run in the same CI job.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..");
const callbackPath = path.join(webRoot, "app", "ebay", "callback", "route.ts");
const ticketRoutePath = path.join(webRoot, "app", "ebay", "ticket", "route.ts");
const screenRulesPath = path.join(webRoot, "lib", "studioflow", "ebayScreenRules.ts");
const flowPath = path.join(webRoot, "lib", "studioflow", "ebayFlow.ts");
const vectorPath = path.join(repoRoot, "functions", "test", "fixtures", "ebay-callback-signature-vectors.json");

// Read FIRST, and with no `catch` that lets the run continue: the fixture is
// committed, so its absence is a broken checkout or a deleted file, and either
// way this script must go red rather than quietly cover less ground.
if (!existsSync(vectorPath)) {
  console.log(`FAIL  the committed vector fixture is missing: ${vectorPath}`);
  console.log("      It is committed on purpose (design §5.5). Restore it, or regenerate with:");
  console.log("      node functions/test/fixtures/generate-ebay-callback-vectors.mjs");
  process.exit(1);
}
const vectors = JSON.parse(readFileSync(vectorPath, "utf8"));

let failures = 0;
const ok = (name) => console.log(`PASS  ${name}`);
const check = (name, condition, detail = "") => {
  if (condition) return ok(name);
  failures += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---- 1. What the routes say about themselves --------------------------------
// Source assertions, because these are properties of the FILES that no execution
// of one request can demonstrate.
const source = readFileSync(callbackPath, "utf8");
const ticketSource = readFileSync(ticketRoutePath, "utf8");
// The routes explain themselves at length, and one of the things they say is
// "NEVER NEXT_PUBLIC_". So the code is read without its comment lines: a prose
// mention of the prefix must not fail the check that the prefix is never USED.
const strip = (text) => text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const code = strip(source);
const ticketCode = strip(ticketSource);

for (const [label, text] of [["callback", source], ["ticket", ticketSource]]) {
  check(`the ${label} route runs on Node, not Edge — Next inlines process.env for Edge handlers, which would bake the relay key into the build`,
    /export const runtime = "nodejs"/.test(text));
  check(`the ${label} route is force-dynamic, so a request is never served from a cache`,
    /export const dynamic = "force-dynamic"/.test(text));
}
check("the decline branch lives here and nowhere else — the function has no error field and no cancelled in its vocabulary",
  /params\.has\("error"\)/.test(source) && /return land\("cancelled"\)/.test(source));
check("the relay key is read INSIDE the callback handler and its length is checked",
  /process\.env\.NIVADESK_EBAY_CALLBACK_KEY/.test(source) && /KEY_MIN_LENGTH/.test(source)
  && source.indexOf("export async function GET") < source.indexOf("process.env.NIVADESK_EBAY_CALLBACK_KEY"));
check("the relay key is read INSIDE the ticket handler too, and a missing one there is a 503 rather than a 400",
  ticketSource.indexOf("export async function POST") < ticketSource.indexOf("process.env.NIVADESK_EBAY_CALLBACK_KEY")
  && /status: 503/.test(ticketSource));
for (const [label, text] of [["callback", code], ["ticket", ticketCode]]) {
  check(`NEXT_PUBLIC_ is never used in the ${label} route — that prefix would publish the key to every visitor`, !/NEXT_PUBLIC_/.test(text));
}
check("the ticket route never calls request.json() — that parses regardless of content type, and on an uncapped body",
  !/request\.json\(\)/.test(ticketCode) && /content-length/.test(ticketCode));
// §5.5's rule, in place of §5.4's "a shaped callback always POSTs, cookie or no
// cookie": it still always POSTs, but a caller who does not hold the binding
// cannot make the body name anything they chose.
check("the dispose envelope carries no state and no nonce — the property is in the bytes the route builds, not in a promise",
  /JSON\.stringify\(\{ v: 1, op: "dispose", rid, code \}\)/.test(code));
check("the callback route mints its own rid and accepts none from the query",
  /const rid = randomBytes\(8\)\.toString\("hex"\)/.test(code) && !/params\.get\("rid"\)/.test(code));
check("§5.4's CONSUMED set is gone: the cookies are cleared by a rule the edge decides alone",
  !/CONSUMED/.test(code) && /function land\(outcome[^)]*clearFlow/.test(code));
check("…and the disposal landing clears nothing at all",
  /return land\("error", "browser"\);/.test(code) && !/land\("error", "browser", /.test(code));
const flowSource = readFileSync(flowPath, "utf8");
check("both cookies take the __Host- prefix, which is what stops a *.nivadesk.app origin shadowing them",
  /__Host-nv_ebay_nonce_/.test(flowSource) && /__Host-nv_ebay_ticket_/.test(flowSource));

// ---- 2. The implementations, executed against each other --------------------
// The routes are compiled as CommonJS on purpose: `next/server` resolves for
// `require` but not for a bare ESM specifier, and the output must live under the
// web tree or `next` does not resolve at all. `--strict` matches the project's
// own tsconfig, so this compilation refuses exactly what `npm run typecheck`
// refuses.
const outDir = mkdtempSync(path.join(webRoot, ".ebay-relay-check-"));
try {
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [callbackPath, ticketRoutePath, screenRulesPath, "--outDir", outDir, "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck", "--strict"],
    { stdio: "inherit" }
  );

  const webRequire = createRequire(path.join(outDir, "check.cjs"));
  const functionsRequire = createRequire(path.join(repoRoot, "functions", "check.cjs"));
  const { NextRequest } = webRequire("next/server");
  const route = webRequire(path.join(outDir, "app", "ebay", "callback", "route.js"));
  const ticketRoute = webRequire(path.join(outDir, "app", "ebay", "ticket", "route.js"));
  const flow = webRequire(path.join(outDir, "lib", "studioflow", "ebayFlow.js"));
  // The verifier the two routes share, compiled as a side effect of compiling
  // them. Section 2b runs the committed ticket vectors through this, which is
  // the same function `GET /ebay/callback` and `POST /ebay/ticket` both call.
  const ticketLib = webRequire(path.join(outDir, "lib", "studioflow", "ebayTicket.js"));
  // The admission helpers both routes share, compiled the same way.
  const admission = webRequire(path.join(outDir, "lib", "studioflow", "ebayAdmission.js"));
  // The builtin the COMPILED route calls through (`node_crypto_1.randomBytes`),
  // so section 2b can freeze the rid the route mints. Patched around one call
  // and restored in a `finally`; nothing else in this file reads it.
  const nodeCrypto = webRequire("node:crypto");
  const harness = functionsRequire(path.join(repoRoot, "functions", "test", "qa", "helpers", "ebayHarness.js"));

  // One key, minted here, held in memory, in no file and no commit. The web half
  // reads it from the environment exactly as Hostinger will supply it; the
  // function half gets it through the harness's own switch.
  const KEY = harness.CALLBACK_KEY;
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;

  // The harness clock is what the function checks the signature's timestamp
  // against, and the routes stamp the real one — so they are started together.
  const nowRef = { value: Date.now() };
  const { fns, store, calls, switches: harnessSwitches } = harness.buildEbay({ nowRef });

  // The adversarial minter, fenced: every ticket a real flow uses below comes
  // from the real function, and this exists only for tickets no honest minter
  // can make.
  const ticketKey = (key = KEY) => createHmac("sha256", key).update("nivadesk/ebay/ticket/v1", "utf8").digest();
  const nonceTag = (nonce, key = KEY) => createHmac("sha256", ticketKey(key)).update(`nonce.${nonce}`, "utf8").digest("base64url");
  function forge({ state, nonce, expMs, macKey = null, tag = null }) {
    const payload = `nv1.${state}.${tag === null ? nonceTag(nonce) : tag}.${Math.round(expMs)}.${randomBytes(16).toString("base64url")}`;
    const mac = createHmac("sha256", macKey === null ? ticketKey() : macKey).update(payload, "utf8").digest("base64url");
    return `${payload}.${mac}`;
  }

  /** Drive the real sealing route. Returns the status and the one Set-Cookie. */
  async function seal(ticket, { site = "same-origin", origin = null, contentType = "application/json", body = null, address = "" } = {}) {
    const headers = {
      "content-type": contentType,
      ...(site === null ? {} : { "sec-fetch-site": site }),
      ...(origin === null ? {} : { origin }),
      ...(address ? { "x-forwarded-for": address } : {})
    };
    const request = new NextRequest(new URL("https://nivadesk.app/ebay/ticket"), {
      method: "POST", headers, body: body === null ? JSON.stringify({ ticket }) : body
    });
    const response = await ticketRoute.POST(request);
    const setCookie = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    return { status: response.status, setCookie };
  }

  /** Drive the real callback route, capture the request it would have sent. */
  async function relay(url, cookie, answer, { address = null } = {}) {
    const realFetch = globalThis.fetch;
    let sent = null;
    globalThis.fetch = async (target, init) => {
      sent = { target: String(target), init };
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
    };
    try {
      const headers = { ...(cookie ? { cookie } : {}), ...(address === null ? {} : { "x-forwarded-for": address }) };
      const request = new NextRequest(new URL(url), Object.keys(headers).length ? { headers } : {});
      const response = await route.GET(request);
      // The Set-Cookie is part of the contract: clearing a flow's pair on a
      // landing that consumed nothing is a free way for a link to break an
      // in-flight connect, so which landings clear is checked, not assumed.
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

  /**
   * A whole browser: begin the flow in the function, write the nonce cookie the
   * way the client script does, and seal the ticket through the real route.
   * Nothing here is re-implemented — the ticket is the function's own.
   */
  async function browser({ auth = { uid: "u1" } } = {}) {
    const begun = await fns.beginEbayConnect({ auth, data: { companyId: "c1" } });
    const sealed = await seal(begun.ticket);
    const ticketCookie = (sealed.setCookie[0] || "").split(";")[0];
    const nonceCookie = `${flow.ebayNonceCookieName(begun.state)}=${encodeURIComponent(begun.nonce)}`;
    return { begun, sealed, ticketCookie, nonceCookie, cookie: `${nonceCookie}; ${ticketCookie}` };
  }

  // One code per FLOW, derived from the state so every call site keeps its
  // one-argument shape and two landings on the same flow present the same code —
  // which is what a real replay looks like. A single shared literal would now be
  // refused by §5.5's presented-code registry the second time any flow used it,
  // and that would be an artefact of the fixture rather than a fact about the
  // route. The prefix is what the harness's fake eBay accepts.
  const codeOf = (state) => `good-code-${String(state).slice(0, 10)}`;
  const callbackUrl = (state, extra = "") => `https://nivadesk.app/ebay/callback?code=${encodeURIComponent(codeOf(state))}${extra}&state=${encodeURIComponent(state)}`;
  const connected = { status: 200, body: { ok: true, outcome: "connected", rid: "0123456789abcdef" } };
  const browserAnswer = { status: 200, body: { ok: false, outcome: "error", reason: "browser", rid: "0123456789abcdef" } };
  const bodyOf = (sent) => JSON.parse(sent.init.body);
  const clearsBoth = (r, state) => [flow.ebayNonceCookieName(state), flow.ebayTicketCookieName(state)]
    .every((name) => r.cookies.some((c) => c.startsWith(`${name}=;`) && /Max-Age=0/i.test(c) && /Path=\//.test(c)));

  // ---- the happy path, and the canonical strings it exercises ---------------
  const first = await browser();
  check("the ticket the FUNCTION minted seals: 204, one cookie, under a name derived from the ticket's own state",
    first.sealed.status === 204 && first.sealed.setCookie.length === 1
    && first.sealed.setCookie[0].startsWith(`${flow.ebayTicketCookieName(first.begun.state)}=nv1.`),
    `${first.sealed.status} ${JSON.stringify(first.sealed.setCookie)}`);
  check("…with the exact attribute set: Max-Age from the ticket's own expiry, Path=/, Secure, HttpOnly, SameSite=Lax",
    /; Max-Age=\d{1,3}; Path=\/; Secure; HttpOnly; SameSite=Lax$/.test(first.sealed.setCookie[0] || "")
    && Number((first.sealed.setCookie[0].match(/Max-Age=(\d+)/) || [])[1]) <= 600,
    first.sealed.setCookie[0]);
  check("…and the flow tag is the state's own first sixteen characters, derived by all three parties the same way",
    flow.ebayTicketCookieName(first.begun.state) === `__Host-nv_ebay_ticket_${first.begun.state.slice(0, 16)}`
    && flow.ebayNonceCookieName(first.begun.state) === `__Host-nv_ebay_nonce_${first.begun.state.slice(0, 16)}`);

  const relayed = await relay(callbackUrl(first.begun.state), first.cookie, connected);
  check("the route puts no value in a URL: it POSTs a JSON body to the bare function URL",
    relayed.sent !== null && relayed.sent.target === "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback"
    && relayed.sent.init.method === "POST" && !relayed.sent.target.includes("?"),
    relayed.sent ? relayed.sent.target : "no request was made");
  check("a verified ticket signs the CONNECT envelope, unchanged: v, rid, code, state, nonce and no op",
    relayed.sent !== null && bodyOf(relayed.sent).op === undefined
    && bodyOf(relayed.sent).state === first.begun.state && bodyOf(relayed.sent).nonce === first.begun.nonce,
    relayed.sent ? relayed.sent.init.body.slice(0, 80) : "no request was made");
  check("and it redirects the seller to the settings page with a word from its own vocabulary",
    relayed.location === "https://nivadesk.app/settings?section=ebay&ebay=connected", String(relayed.location));
  check("a connected landing clears BOTH of this flow's cookies: that flow really did consume them",
    clearsBoth(relayed, first.begun.state), JSON.stringify(relayed.cookies));

  // THE check this script exists for: the bytes the route signed, verified by the
  // function's own verifier. Two implementations, in two languages' trees, that
  // cannot import each other — so they are run against each other instead.
  const accepted = await deliver(relayed.sent);
  check("the canonical string agrees across the boundary: the function accepts the route's signature",
    accepted.statusCode === 200 && accepted.payload && accepted.payload.outcome === "connected",
    `${accepted.statusCode} ${JSON.stringify(accepted.payload)}`);

  // And the signature is bound to THIS body: one changed character is a 401.
  const second = await browser();
  const again = await relay(callbackUrl(second.begun.state), second.cookie, connected);
  const swapped = again.sent.init.body.replace(`"code":"${codeOf(second.begun.state)}"`, '"code":"other-code"');
  const refused = await deliver(again.sent, { tamper: swapped });
  check("the signature binds the body: one swapped field and the function answers 401",
    refused.statusCode === 401 && JSON.stringify(refused.payload) === JSON.stringify({ ok: false }),
    `${refused.statusCode} ${JSON.stringify(refused.payload)}`);
  check("…and a body the function refused burned nothing — the state is still there to be used",
    store.read(`ebayConnectStates/${second.begun.state}`).used === false);

  // The forger, checked against both real sides before anything below trusts it:
  // it agrees with the function's minter (same state, same nonce, same expiry)
  // and with this side's verifier (it seals).
  const honestFlow = await browser();
  const honest = forge({
    state: honestFlow.begun.state, nonce: honestFlow.begun.nonce,
    expMs: store.read(`ebayConnectStates/${honestFlow.begun.state}`).expiresAt
  });
  const honestSeal = await seal(honest);
  check("the forger agrees with both real sides: a ticket it mints over a real state and nonce seals",
    honestSeal.status === 204 && honestSeal.setCookie[0].startsWith(`${flow.ebayTicketCookieName(honestFlow.begun.state)}=`),
    `${honestSeal.status} ${JSON.stringify(honestSeal.setCookie)}`);

  // ---- the cases §5.5 tabulates ---------------------------------------------
  /** A landing that must sign a disposal and nothing else. */
  async function refusedLanding(name, state, cookie) {
    const landing = await relay(callbackUrl(state), cookie, browserAnswer);
    const body = landing.sent ? bodyOf(landing.sent) : null;
    check(name,
      landing.sent !== null && body.op === "dispose" && body.state === undefined && body.nonce === undefined
      && landing.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=browser"
      && landing.cookies.length === 0,
      landing.sent ? `${landing.sent.init.body.slice(0, 80)} ${landing.location} ${JSON.stringify(landing.cookies)}` : "no request was made");
    return landing;
  }

  // 1 — a forged cookie: valid shape, broken MAC.
  const forgedFlow = await browser();
  const bent = `${forgedFlow.ticketCookie.slice(0, -1)}${forgedFlow.ticketCookie.endsWith("A") ? "B" : "A"}`;
  await refusedLanding("ticket: a forged cookie signs nothing", forgedFlow.begun.state, `${forgedFlow.nonceCookie}; ${bent}`);

  // 2 — a ticket minted for ANOTHER state, planted under this flow's name.
  const flowA = await browser();
  const flowB = await browser();
  const planted = `${flow.ebayTicketCookieName(flowA.begun.state)}=${flowB.ticketCookie.split("=").slice(1).join("=")}`;
  const two = await refusedLanding("ticket: one minted for another state signs nothing", flowA.begun.state, `${flowA.nonceCookie}; ${planted}`);
  check("…and the state that ticket named is in no body the route produced",
    !String(two.sent.init.body).includes(flowB.begun.state), two.sent.init.body.slice(0, 100));

  // 3 — a ticket minted for another NONCE. The literal form of criterion 4: it
  // fails in the WEB layer, before anything is signed against a state.
  const flowC = await browser();
  const foreignNonce = `${flow.ebayNonceCookieName(flowC.begun.state)}=${encodeURIComponent(flowB.begun.nonce)}`;
  await refusedLanding("ticket: one minted for another nonce signs nothing", flowC.begun.state, `${foreignNonce}; ${flowC.ticketCookie}`);

  // 4 — expiry, both ends. The upper bound is real: a state cannot live past ten
  // minutes, so a ticket claiming twenty was minted by a rule that is gone.
  const flowD = await browser();
  for (const [label, expMs] of [["one second in the past", Date.now() - 1000], ["twenty minutes ahead", Date.now() + 20 * 60 * 1000]]) {
    const stale = forge({ state: flowD.begun.state, nonce: flowD.begun.nonce, expMs });
    const attempt = await seal(stale);
    check(`ticket: an expired one (${label}) does not even seal`, attempt.status === 400 && attempt.setCookie.length === 0,
      `${attempt.status} ${JSON.stringify(attempt.setCookie)}`);
    await refusedLanding(`ticket: an expired one (${label}) signs nothing`, flowD.begun.state,
      `${flowD.nonceCookie}; ${flow.ebayTicketCookieName(flowD.begun.state)}=${stale}`);
  }

  // 6 — the phished seller: no cookie at all.
  const flowE = await browser();
  const phished = await refusedLanding("ticket: with no cookie the route signs only a disposal", flowE.begun.state, "");
  const disposed = await deliver(phished.sent);
  check("…and the real function answers `browser` for those exact bytes without reading a state",
    disposed.statusCode === 200 && disposed.payload.reason === "browser"
    && store.read(`ebayConnectStates/${flowE.begun.state}`).used === false,
    `${JSON.stringify(disposed.payload)} used=${store.read(`ebayConnectStates/${flowE.begun.state}`).used}`);
  check("…and the code that landing carried was spent at eBay, which is what the disposal is for",
    calls.codes.filter((c) => c === codeOf(flowE.begun.state)).length === 1, JSON.stringify(calls.codes.slice(-3)));

  // 7 — the outsider using the route as a signing oracle.
  const before = store.paths("ebayConnectStates/").length;
  const oracle = await relay(callbackUrl("an-invented-state-nobody-minted"), "", browserAnswer);
  check("ticket: the route is not a signing oracle — the body it produced names no state",
    oracle.sent !== null && bodyOf(oracle.sent).state === undefined && bodyOf(oracle.sent).op === "dispose",
    oracle.sent ? oracle.sent.init.body.slice(0, 80) : "no request was made");
  const oracleAnswer = await deliver(oracle.sent);
  check("…and the real function, handed those exact bytes, touches no state document at all",
    oracleAnswer.statusCode === 200 && oracleAnswer.payload.reason === "browser"
    && store.paths("ebayConnectStates/").length === before
    && store.read("ebayConnectStates/an-invented-state-nobody-minted") === undefined,
    `${JSON.stringify(oracleAnswer.payload)} ${store.paths("ebayConnectStates/").length} vs ${before}`);

  // 11 — two concurrent flows in one browser.
  const one = await browser();
  const other = await browser();
  check("ticket: two flows in one browser do not collide — four cookies, four names",
    new Set([flow.ebayNonceCookieName(one.begun.state), flow.ebayTicketCookieName(one.begun.state),
      flow.ebayNonceCookieName(other.begun.state), flow.ebayTicketCookieName(other.begun.state)]).size === 4);
  const finishedFirst = await relay(callbackUrl(one.begun.state), `${one.cookie}; ${other.cookie}`, connected);
  check("…completing the FIRST consent verifies against its own ticket and names its own state",
    bodyOf(finishedFirst.sent).state === one.begun.state && bodyOf(finishedFirst.sent).nonce === one.begun.nonce,
    finishedFirst.sent.init.body.slice(0, 80));
  check("…and clears only that flow's pair, leaving the second flow's cookies intact",
    clearsBoth(finishedFirst, one.begun.state)
    && !finishedFirst.cookies.some((c) => c.includes(flow.ebayTicketCookieName(other.begun.state)))
    && !finishedFirst.cookies.some((c) => c.includes(flow.ebayNonceCookieName(other.begun.state))),
    JSON.stringify(finishedFirst.cookies));

  // 12 — the cross-site plant. Four ways in, no cookie out.
  const victim = await browser();
  for (const [label, options] of [
    ["Sec-Fetch-Site: cross-site", { site: "cross-site" }],
    ["Origin: https://evil.example", { site: null, origin: "https://evil.example" }],
    ["no Origin and no Sec-Fetch-Site", { site: null }],
    ["content-type: text/plain with a JSON-shaped body", { contentType: "text/plain" }]
  ]) {
    const attempt = await seal(victim.begun.ticket, options);
    check(`ticket: a cross-site plant sets no cookie (${label})`,
      attempt.status === 400 && attempt.setCookie.length === 0, `${attempt.status} ${JSON.stringify(attempt.setCookie)}`);
  }
  const untouched = await relay(callbackUrl(victim.begun.state), victim.cookie, connected);
  check("…and the victim's own flow is untouched and completes normally",
    untouched.location === "https://nivadesk.app/settings?section=ebay&ebay=connected", String(untouched.location));

  // ---- the sealing route's own contract -------------------------------------
  const flowF = await browser();
  const stateF = store.read(`ebayConnectStates/${flowF.begun.state}`);
  for (const [label, ticket] of [
    ["a broken MAC", `${flowF.begun.ticket.slice(0, -1)}${flowF.begun.ticket.endsWith("A") ? "B" : "A"}`],
    ["a bad shape", "nv1.not-a-ticket"],
    ["an over-long value", `nv1.${"x".repeat(500)}`],
    ["one signed with the RELAY key instead of the derived one", forge({ state: flowF.begun.state, nonce: flowF.begun.nonce, expMs: stateF.expiresAt, macKey: KEY })],
    ["one signed under the nonce label instead of the ticket label (domain separation)",
      forge({ state: flowF.begun.state, nonce: flowF.begun.nonce, expMs: stateF.expiresAt, macKey: createHmac("sha256", ticketKey()).update("nonce.x", "utf8").digest() })]
  ]) {
    const attempt = await seal(ticket);
    check(`ticket route: ${label} is a 400 with no Set-Cookie`, attempt.status === 400 && attempt.setCookie.length === 0,
      `${attempt.status} ${JSON.stringify(attempt.setCookie)}`);
  }
  const oversizeBody = await seal("", { body: JSON.stringify({ ticket: "x".repeat(1100) }) });
  check("ticket route: a body over 1024 bytes is refused with nothing parsed",
    oversizeBody.status === 400 && oversizeBody.setCookie.length === 0, String(oversizeBody.status));
  check("ticket route: GET is 405 — the cookie is set by one method and one method only",
    (await ticketRoute.GET()).status === 405);

  // Max-Age is derived from the MAC-covered expiry and is never extended.
  const flowG = await browser();
  const shortLived = forge({ state: flowG.begun.state, nonce: flowG.begun.nonce, expMs: Date.now() + 120000 });
  const shortSeal = await seal(shortLived);
  const maxAge = Number((shortSeal.setCookie[0] || "").match(/Max-Age=(\d+)/)?.[1] || 0);
  check("ticket route: Max-Age comes from the ticket's own expMs — two minutes left seals into a two-minute cookie",
    shortSeal.status === 204 && maxAge > 100 && maxAge <= 120, `${shortSeal.status} Max-Age=${maxAge}`);

  // A missing key is OURS and not the caller's, and the client has to tell them
  // apart: 503 means "try again", 400 means "start again in the same browser".
  process.env.NIVADESK_EBAY_CALLBACK_KEY = "";
  const unkeyedSeal = await seal(flowG.begun.ticket);
  check("ticket route: a missing key is a 503 and not a 400, so the client says try again rather than start again",
    unkeyedSeal.status === 503 && unkeyedSeal.setCookie.length === 0, String(unkeyedSeal.status));
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;

  // Admission: the 31st request from one address inside a minute.
  const flowH = await browser();
  let throttledAt = 0;
  for (let i = 1; i <= 31; i += 1) {
    const attempt = await seal(flowH.begun.ticket, { address: "203.0.113.7" });
    if (attempt.status === 429) { throttledAt = i; break; }
    if (attempt.setCookie.length !== 1) { throttledAt = -i; break; }
  }
  check("ticket route: the 31st request from one address inside a minute is a 429 with no cookie",
    throttledAt === 31, `throttled at ${throttledAt}`);

  // ---- what §5.4 settled, still settled -------------------------------------
  // A decline never reaches the connector, and an empty error= is still a decline.
  for (const query of ["error=access_denied", "error="]) {
    const declined = await relay(`https://nivadesk.app/ebay/callback?${query}`, "", { status: 200, body: {} });
    check(`a decline (?${query}) is settled on our own domain: no call, and the seller is told nothing was changed`,
      declined.sent === null && declined.location === "https://nivadesk.app/settings?section=ebay&ebay=cancelled",
      `${declined.sent ? "a call was made" : "no call"} ${declined.location}`);
    check(`…and it leaves the cookies alone (?${query}): nothing was consumed, so a link cannot spend someone's in-flight connect`,
      declined.cookies.length === 0, JSON.stringify(declined.cookies));
  }

  // Not a callback at all: same rule, and this is the shape an attacker's link
  // takes — https://nivadesk.app/ebay/callback with nothing on it.
  const live = await browser();
  const bare = await relay("https://nivadesk.app/ebay/callback", live.cookie, { status: 200, body: {} });
  check("a bare visit makes no call, says missing_code, and does NOT clear the cookies of a flow it never touched",
    bare.sent === null && bare.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=missing_code" && bare.cookies.length === 0,
    `${bare.location} ${JSON.stringify(bare.cookies)}`);

  // A code alongside an error: the one shaped query with a real code in it that
  // used to answer `cancelled` with nothing burned and nothing spent.
  const both = await browser();
  const withError = await relay(callbackUrl(both.begun.state, "&error=access_denied"), both.cookie, connected);
  check("a callback carrying BOTH a code and an error takes the relay path — the code wins, so the burn has no exception",
    withError.sent !== null && bodyOf(withError.sent).code === codeOf(both.begun.state),
    withError.sent ? withError.sent.init.body.slice(0, 60) : "no request was made");
  const bothDelivered = await deliver(withError.sent);
  check("…and the function consumes that state like any other callback",
    bothDelivered.payload.outcome === "connected" && store.read(`ebayConnectStates/${both.begun.state}`).used === true,
    JSON.stringify(bothDelivered.payload));

  // The two shape checks, in the SAME unit: the function caps the body at 8192
  // BYTES, so a code the route would accept by character count must be refused
  // here rather than landing as an opaque 400 with nothing burned.
  const wide = await browser();
  const oversize = await relay(`https://nivadesk.app/ebay/callback?code=${encodeURIComponent("€".repeat(4000))}&state=${encodeURIComponent(wide.begun.state)}`,
    wide.cookie, { status: 200, body: {} });
  check("a 4000-character code that is 12000 bytes is refused HERE, in the function's own unit, not there as a 400",
    oversize.sent === null && oversize.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=missing_code",
    `${oversize.sent ? "a call was made" : "no call"} ${oversize.location}`);

  // The key floor, exercised rather than asserted: a short key never calls — and
  // that now means NEITHER envelope, because the ticket key is derived from it,
  // so there is nothing to verify a binding with and nothing to sign with.
  for (const bad of ["", "a".repeat(31)]) {
    process.env.NIVADESK_EBAY_CALLBACK_KEY = bad;
    const fourth = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
    const unkeyed = await relay(callbackUrl(fourth.state), "", { status: 200, body: {} });
    check(`a ${bad.length}-character key makes no call — not even a disposal — and lands the seller on unavailable`,
      unkeyed.sent === null && unkeyed.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=unavailable",
      String(unkeyed.location));
    // …which is also the case that leaves the state alive: §5.4, "The burn has
    // one dependency, and it is the key", and the deploy plan's §4.2 action.
    check("…and the state it could not burn is still unused, which is the cost the deploy plan names",
      store.read(`ebayConnectStates/${fourth.state}`).used === false);
  }
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;

  // ---- 2b. The committed vectors, on this side of the boundary --------------
  // Everything above proves the two implementations agree with EACH OTHER. This
  // proves they agree with a frozen answer, which is the only thing that catches
  // a change that moves both of them together. The fixture is read at the top of
  // this file; a missing one exits non-zero there.
  //
  // The route signs what it builds and stamps its own clock, so it cannot be
  // handed a body to sign. It is driven instead with the two values that make its
  // output non-deterministic frozen to the vector's own — `Date.now` and the
  // eight random bytes of the rid — and then the header it emitted is compared
  // with the fixture, character for character. That is the route's signer
  // checked against the vector, not a re-implementation of it.
  check("the fixture says on its face that its key is a test key, and mints it inside itself",
    vectors.keyLabel === "TEST-KEY-NOT-A-SECRET" && /^TEST VECTORS ONLY\./.test(vectors.README)
    && /^[0-9a-f]{64}$/.test(vectors.key) && vectors.key !== vectors.wrongKey,
    `${vectors.keyLabel} ${String(vectors.README).slice(0, 40)}`);

  const ticketKeyOf = (key) => ticketLib.ebayTicketKey(key);
  /** Drive the real callback route with the clock and the rid frozen. */
  async function relayFrozen(url, cookie, answer, { nowMs, rid }) {
    const realNow = Date.now;
    const realRandomBytes = nodeCrypto.randomBytes;
    const ridBytes = Buffer.from(rid, "hex");
    Date.now = () => nowMs;
    nodeCrypto.randomBytes = (size) => (size === ridBytes.length ? Buffer.from(ridBytes) : realRandomBytes(size));
    try { return await relay(url, cookie, answer); } finally {
      Date.now = realNow;
      nodeCrypto.randomBytes = realRandomBytes;
    }
  }

  process.env.NIVADESK_EBAY_CALLBACK_KEY = vectors.key;
  const vectorTicket = vectors.ticketVectors.find((t) => t.id === "ticket-valid");
  const vectorCookie = `${vectorTicket.nonceCookieName}=${encodeURIComponent(vectors.flow.nonce)}; ${vectorTicket.cookieName}=${vectorTicket.ticket}`;
  const vectorUrl = `https://nivadesk.app/ebay/callback?code=${encodeURIComponent(vectors.flow.code)}&state=${encodeURIComponent(vectors.flow.state)}`;

  for (const vector of vectors.relayVectors) {
    // A dispose vector is produced by a browser holding nothing; a connect
    // vector by one holding the fixture's own ticket and nonce.
    const produced = await relayFrozen(
      vector.envelope === "dispose" ? vectorUrl : vectorUrl,
      vector.envelope === "dispose" ? "" : vectorCookie,
      { status: 200, body: { ok: true, outcome: "connected", rid: vector.rid } },
      { nowMs: vector.timestampMs, rid: vector.rid }
    );
    if (!produced.sent) { check(`${vector.id}: the route produced a request at all`, false, "no request was made"); continue; }
    const headers = produced.sent.init.headers;
    check(`${vector.id}: the route builds the exact bytes this vector's signature covers — a signature is over bytes, so key order is part of the contract`,
      produced.sent.init.body === vector.signedBody, `${produced.sent.init.body.slice(0, 90)}`);
    check(`${vector.id}: it stamps the vector's own timestamp`,
      headers["x-nivadesk-timestamp"] === String(vector.timestampMs), String(headers["x-nivadesk-timestamp"]));
    if (vector.routeReproduces) {
      check(`${vector.id}: and the signature it emits IS the committed one — ${vector.name}`,
        headers["x-nivadesk-signature"] === `v1=${vector.signature}`, String(headers["x-nivadesk-signature"]));
    } else {
      // The wrong-key vector is the one this side cannot produce at all: the
      // route holds the fixture key, so a signature under the other test key is
      // exactly what it must NOT emit.
      check(`${vector.id}: the route's own signer cannot produce it, which is what makes it a negative vector`,
        headers["x-nivadesk-signature"] !== `v1=${vector.signature}`, String(headers["x-nivadesk-signature"]));
    }
  }

  // The swapped-body vector is negative in a different way, and it is worth
  // saying which: its signature is a GOOD one — the valid vector's, over the
  // valid bytes — presented over a body whose code was changed. So the route
  // reproduces the signature and the vector's own `body` is the thing that does
  // not belong to it. That is what "the signature binds the body" means, frozen.
  const swapVector = vectors.relayVectors.find((v) => v.id === "relay-swapped-body");
  const validVector = vectors.relayVectors.find((v) => v.id === "relay-connect-valid");
  check("the swapped-body vector is a valid signature over OTHER bytes, not a broken signature",
    swapVector.signature === validVector.signature && swapVector.signedBody === validVector.body
    && swapVector.body !== swapVector.signedBody && JSON.parse(swapVector.body).code === vectors.flow.swappedCode,
    `${swapVector.signature === validVector.signature} ${swapVector.body === swapVector.signedBody}`);

  // The bodies the fixture froze are the two envelopes, and the dispose one must
  // still name nothing: the property §5.5 exists for, asserted against a value
  // committed to a file rather than against this run's own output.
  const disposeVector = vectors.relayVectors.find((v) => v.id === "relay-dispose-valid");
  const disposeParsed = JSON.parse(disposeVector.body);
  check("the committed dispose envelope carries no state and no nonce",
    disposeParsed.op === "dispose" && disposeParsed.state === undefined && disposeParsed.nonce === undefined,
    disposeVector.body);
  const connectParsed = JSON.parse(vectors.relayVectors.find((v) => v.id === "relay-connect-valid").body);
  check("…and the committed connect envelope carries both, plus no op",
    connectParsed.op === undefined && connectParsed.state === vectors.flow.state && connectParsed.nonce === vectors.flow.nonce);

  // The ticket verifier, against the same file. Every vector goes through the
  // same call the route makes, and its class is compared with the frozen one.
  for (const vector of vectors.ticketVectors) {
    const verdict = ticketLib.verifyEbayTicketForFlow(
      ticketKeyOf(vectors.key), vector.ticket,
      vector.queryState || vector.state, vector.nonceOffered || vector.nonce, vector.verifyAtMs
    );
    check(`${vector.id}: this side's verifier answers ${vector.expect} — ${vector.name}`,
      (verdict.ok ? "ok" : verdict.failure) === vector.expect, JSON.stringify(verdict));
    check(`${vector.id}: and the cookie name derives from the state the same way on all three sides`,
      flow.ebayTicketCookieName(vector.state) === vector.cookieName
      && flow.ebayNonceCookieName(vector.state) === vector.nonceCookieName,
      `${flow.ebayTicketCookieName(vector.state)} ${vector.cookieName}`);
  }
  const verifiedVector = ticketLib.verifyEbayTicketForFlow(ticketKeyOf(vectors.key), vectorTicket.ticket, vectorTicket.state, vectorTicket.nonce, vectorTicket.verifyAtMs);
  check("the committed ticket's fields are read back exactly: its state, its expiry and its jti",
    verifiedVector.ok && verifiedVector.state === vectors.flow.state
    && verifiedVector.expMs === vectorTicket.expMs && verifiedVector.jti === vectorTicket.jti,
    JSON.stringify(verifiedVector));
  // …and the sealing route accepts it, so the fixture is a ticket this system
  // would really put in a browser and not only a string that verifies.
  const sealedVector = await (async () => {
    const realNow = Date.now;
    Date.now = () => vectorTicket.verifyAtMs;
    try { return await seal(vectorTicket.ticket); } finally { Date.now = realNow; }
  })();
  check("the sealing route seals the committed ticket, under the committed cookie name",
    sealedVector.status === 204 && (sealedVector.setCookie[0] || "").startsWith(`${vectorTicket.cookieName}=${vectorTicket.ticket};`),
    `${sealedVector.status} ${JSON.stringify(sealedVector.setCookie)}`);
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;

  // ---- 2b-ii. The two client-screen rules, executed ------------------------
  // Both were written in a comment and contradicted by the code beneath it.
  const rules = webRequire(path.join(outDir, "lib", "studioflow", "ebayScreenRules.js"));

  // RULE 1, against the REAL @firebase/functions rather than against our idea of
  // it: a callable that is not deployed answers 404, and the library turns that
  // into a FirebaseError whose MESSAGE is the bare word `not-found`.
  // `EbayIntegrationSection` printed `err.message`, so the screen said `not-found`
  // — during the deploy plan's own window, which ships the web tier first.
  const notDeployed = await (async () => {
    const { initializeApp, deleteApp } = webRequire("@firebase/app");
    const { getFunctions, httpsCallableFromURL } = webRequire("@firebase/functions");
    const app = initializeApp({ projectId: "demo-nivadesk", apiKey: "test", appId: "1:1:web:1" }, `ebay-probe-${Date.now()}`);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    try { await httpsCallableFromURL(getFunctions(app), "https://example.invalid/getEbayConnections")({}); return null; }
    catch (error) { return error; }
    finally { globalThis.fetch = realFetch; await deleteApp(app).catch(() => undefined); }
  })();
  check("callable error: an undeployed function really does arrive as a FirebaseError whose message is the bare status word",
    notDeployed instanceof Error && notDeployed.message === "not-found" && String(notDeployed.code) === "functions/not-found",
    `${notDeployed && notDeployed.code} ${notDeployed && notDeployed.message}`);
  check("callable error: …and the screen gets a sentence for it, never the word — the rule the section's own header states",
    rules.ebayCallableErrorText(notDeployed, "Could not load.")
      === "eBay is not set up on this server yet. Contact support and we will enable it.",
    rules.ebayCallableErrorText(notDeployed, "Could not load."));
  check("callable error: every other bare status word is a code too, and none of them reaches the screen",
    ["unavailable", "internal", "permission-denied", "failed-precondition", "unauthenticated"].every((word) => {
      const error = Object.assign(new Error(word), { code: `functions/${word}` });
      return rules.ebayCallableErrorText(error, "Could not load.") === "Could not load.";
    }));
  check("callable error: …while a sentence the SERVER wrote on purpose still reaches it unchanged",
    rules.ebayCallableErrorText(
      Object.assign(new Error("This eBay connection was started by a different NivaDesk user."), { code: "functions/permission-denied" }),
      "Could not load.") === "This eBay connection was started by a different NivaDesk user.");

  // Source pins, because a unit test on a helper stays green while the screen
  // goes back to printing `err.message` beside it.
  const sectionSource = readFileSync(path.join(webRoot, "app", "settings", "EbayIntegrationSection.tsx"), "utf8");
  check("callable error: the settings section reaches no error message except through the helper",
    !/setError\((?:err|error) instanceof Error \? (?:err|error)\.message/.test(sectionSource)
    && (sectionSource.match(/ebayCallableErrorText\(/g) || []).length >= 2,
    "EbayIntegrationSection still prints a raw callable message");

  // RULE 2: a signed-out visitor to /ebay/start comes back to /ebay/start. The
  // page used to `router.replace("/login")` with no `?next=`, and /login's
  // default is /home — so the single-use state, which lives only in that URL,
  // was gone and the seller had to start again from the native app.
  const startState = "AbCdEf0123456789-_XyZ";
  check("start page: a signed-out visitor is sent to sign in AND BACK, with the state intact",
    rules.ebayStartLoginHref(startState) === `/login?next=${encodeURIComponent(`/ebay/start?state=${startState}`)}`,
    rules.ebayStartLoginHref(startState));
  check("start page: …and /login's own rule accepts that next — same-origin, one leading slash",
    (() => {
      const next = new URLSearchParams(rules.ebayStartLoginHref(startState).split("?")[1]).get("next") || "";
      return next.startsWith("/") && !next.startsWith("//");
    })());
  check("start page: a state that is not shaped like one is not reflected into the URL we build",
    rules.ebayStartLoginHref("https://evil.example/") === `/login?next=${encodeURIComponent("/ebay/start")}`
    && rules.ebayStartLoginHref("") === `/login?next=${encodeURIComponent("/ebay/start")}`,
    rules.ebayStartLoginHref("https://evil.example/"));

  const startSource = readFileSync(path.join(webRoot, "app", "ebay", "start", "EbayStartContent.tsx"), "utf8");
  check("start page: …and the page itself sends a signed-out visitor through that helper, not to a bare /login",
    !/router\.replace\("\/login"\)/.test(startSource) && startSource.includes("ebayStartLoginHref(state)"),
    "EbayStartContent still drops the state on the way to /login");

  // ---- 2b-iii. Deploy plan §4.2's rows, executed ---------------------------
  // The half-configured-key matrix is the operator's whole runbook for the most
  // likely way this deploy goes wrong, and three of its five rows named evidence
  // that cannot be produced any more: they were written for §5.4, before the
  // ticket, and the ticket moved every one of those failures to a point BEFORE
  // the seller leaves for eBay. So the rows are pinned here by execution.

  // Row: the FUNCTION has no key (secret unset, marker not committed, or the
  // functions not deployed). It is the function that mints the ticket, so there
  // is no ticket, the client refuses to navigate, and the callback is never
  // reached — no 401, no `ebay callback relay … status=401`, no
  // `ebay callback: EBAY_CALLBACK_KEY not configured`.
  const keyBefore = harnessSwitches.callbackKey;
  for (const [label, value] of [["unset", ""], ["shorter than 32 characters", "0123456789abcdef"]]) {
    harnessSwitches.callbackKey = value;
    const begun = await fns.beginEbayConnect({ auth: { uid: "u1" }, data: { companyId: "c1" } });
    check(`deploy §4.2: with the function's key ${label} the reply carries NO ticket, so the seller never leaves for eBay`,
      begun.ticket === "" && typeof begun.authorizeUrl === "string", JSON.stringify({ ticket: begun.ticket }));
  }
  harnessSwitches.callbackKey = keyBefore;

  // Row: the two halves hold DIFFERENT values (a half-finished rotation). The
  // ticket is minted under the function's key and verified under the route's, so
  // sealing fails with a 400 and the seller never leaves. The function is not
  // called, so Google logs nothing at all — not `rejected unsigned request`.
  const rotating = await browser();
  process.env.NIVADESK_EBAY_CALLBACK_KEY = createHmac("sha256", "rotation").update("a different 32-byte value", "utf8").digest("hex");
  const rotated = await seal(rotating.begun.ticket);
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;
  check("deploy §4.2: a half-finished rotation is a 400 at POST /ebay/ticket, before the seller leaves — not a 401 at the function",
    rotated.status === 400 && rotated.setCookie.length === 0, String(rotated.status));

  // Row: the web host's clock is off. The ticket's window is checked at the edge
  // against the state's own expiry, so a drift big enough to matter is a 400 at
  // POST /ebay/ticket — and `ebay callback: relay timestamp outside the
  // five-minute window`, the line this row tells the operator to grep for, can
  // never appear, because the function is never called.
  const drifting = await browser();
  const driftAt = Date.now();
  for (const [label, offsetMs, expected] of [
    ["four minutes behind", -4 * 60000, 204],
    ["four minutes ahead", 4 * 60000, 204],
    ["six minutes behind", -6 * 60000, 400],
    ["eleven minutes behind", -11 * 60000, 400],
    ["eleven minutes ahead", 11 * 60000, 400]
  ]) {
    const realNow = Date.now;
    Date.now = () => driftAt + offsetMs;
    let attempt;
    try { attempt = await seal(drifting.begun.ticket); } finally { Date.now = realNow; }
    check(`deploy §4.2: a web clock ${label} seals ${expected === 204 ? "normally" : "not at all, and fails at the EDGE"}`,
      attempt.status === expected, `${attempt.status} (wanted ${expected})`);
  }

  // ---- 2c. Admission, and it goes LAST because it drains the process buckets --
  // Both buckets live in their route's module scope, so anything after this
  // section would run against a drained one. Nothing does.

  // The trim rule, as a unit: a per-address map that an attacker can CLEAR is
  // not a counter. Both routes used to call `map.clear()` on overflow, so 4097
  // spoofed addresses reset a real address's bucket as a side effect.
  // The clock is frozen for this unit so that refill cannot be mistaken for a
  // reset: what is under test is eviction, not the passage of time.
  const at = Date.now();
  const map = new Map();
  const victimAddress = "203.0.113.99";
  const victimBucket = admission.bucketFor(map, victimAddress, 30, at);
  for (let i = 0; i < 30; i += 1) admission.takeToken(victimBucket, 30, at);
  for (let i = 0; i < admission.MAX_TRACKED_ADDRESSES + 200; i += 1) {
    admission.takeToken(admission.bucketFor(map, `flood-${i}`, 30, at), 30, at);
  }
  check("admission: a flood of fresh keys bounds the map without zeroing a bucket a real client is sitting on",
    map.size <= admission.MAX_TRACKED_ADDRESSES
    && map.has(victimAddress)
    && admission.takeToken(admission.bucketFor(map, victimAddress, 30, at), 30, at) === false,
    `size=${map.size} victim=${JSON.stringify(map.get(victimAddress))}`);
  check("admission: an absent x-forwarded-for is the empty string, never a value that means 'admit'",
    admission.clientAddress(null) === "" && admission.clientAddress("") === ""
    && admission.clientAddress("198.51.100.4, 10.0.0.1") === "198.51.100.4");

  // POST /ebay/ticket was an anonymous global kill switch: 300 requests a minute
  // per process, charged for every caller before anything else, and sealing is
  // the only way a seller reaches eBay. Executed before the fix: 320 anonymous
  // posts carrying a junk ticket, each from a different spoofed address, drained
  // the bucket and the very next call — a genuine seller sealing a REAL ticket —
  // answered 429.
  const seller = await browser();
  for (let i = 0; i < 340; i += 1) await seal("nv1.not-a-ticket", { address: `198.51.100.${i % 251}` });
  const floodedOut = await seal("nv1.not-a-ticket", { address: "198.51.100.200" });
  check("ticket route: with the process bucket drained a junk ticket is a 429 — the flood is what the bucket refuses",
    floodedOut.status === 429 && floodedOut.setCookie.length === 0, String(floodedOut.status));
  const genuine = await seal(seller.begun.ticket, { address: "203.0.113.42" });
  check("ticket route: …and a genuine seller's REAL ticket still seals through the drained bucket, so a stranger cannot close Connect eBay for everyone",
    genuine.status === 204 && genuine.setCookie.length === 1, `${genuine.status} ${JSON.stringify(genuine.setCookie)}`);
  // The reserve is keyed on the ticket's own state, so the one party who can
  // exhaust it is somebody replaying a ticket of their own — and they close
  // their own flow, not anybody else's.
  let reserveOut = 0;
  for (let i = 0; i < 12; i += 1) {
    const attempt = await seal(seller.begun.ticket, { address: `203.0.113.${100 + i}` });
    if (attempt.status === 429) { reserveOut = i; break; }
  }
  const otherFlow = await browser();
  const otherSeal = await seal(otherFlow.begun.ticket, { address: "203.0.113.77" });
  check("ticket route: a replay flood of ONE valid ticket exhausts that flow's reserve and no other flow's",
    reserveOut > 0 && otherSeal.status === 204, `reserve ran out at ${reserveOut}; another flow answered ${otherSeal.status}`);

  // GET /ebay/callback's disposal had only the courtesy counter, and its own
  // comment argued the gap away. Executed before the fix: 60 landings with no
  // `x-forwarded-for` produced 60 signed POSTs, and 60 with one spoofed address
  // each produced 60 more — every one of them a valid HMAC we minted and a
  // billable Cloud Function invocation.
  const noHeader = await browser();
  let signed = 0;
  let lastLanding = null;
  for (let i = 0; i < 340; i += 1) {
    lastLanding = await relay(`https://nivadesk.app/ebay/callback?code=flood-${i}&state=${encodeURIComponent(noHeader.begun.state)}`, "", browserAnswer);
    if (lastLanding.sent) signed += 1;
  }
  check("callback route: an unsigned flood with NO x-forwarded-for is bounded — the per-process bucket is charged before the address is read",
    signed < 340, `${signed} of 340 landings were signed and posted`);
  check("callback route: …and the seller-facing answer never depends on the bucket, throttled or not",
    lastLanding.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=browser" && lastLanding.cookies.length === 0,
    String(lastLanding.location));
  const spoofed = await relay(`https://nivadesk.app/ebay/callback?code=flood-spoofed&state=${encodeURIComponent(noHeader.begun.state)}`,
    "", browserAnswer, { address: "198.51.100.250" });
  check("callback route: …and a fresh spoofed address does not buy a way past it, because the process bucket is charged first",
    spoofed.sent === null && spoofed.location === "https://nivadesk.app/settings?section=ebay&ebay=error&reason=browser",
    spoofed.sent ? "a POST was signed" : String(spoofed.location));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

// ---- 3. What this script does NOT cover, said out loud ----------------------
// The committed vectors used to be this list's only entry, and section 2b is
// where they went. What is left is the half neither this script nor the fixture
// can reach: the ten cited regressions carry the bytes INTO the function and
// assert what is left afterwards (`check-ebay-callback-regressions.mjs`), and
// the emulator tier is where `firestore.rules` and a real transaction are.
console.log(`NOTE  the committed vectors ran above, from ${path.relative(repoRoot, vectorPath)},`);
console.log(`      under its own test key (${vectors.keyLabel}). The function's half of the same file is checked by`);
console.log("      functions/test/qa/ebay-connect.test.js. What still lives elsewhere: the ten cited regressions");
console.log("      (npm run test:ebay-regressions) and the emulator tier (firestore.rules, a real transaction).");

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ EBAY RELAY GEÇTİ");
