// The ten eBay callback regressions the operator's report cites by id.
//
//   npm run test:ebay-regressions
//
// Every case here is an EXECUTION of the whole chain, end to end and in one
// process: the real `app/ebay/callback/route.ts` (compiled by the web tree's own
// tsc), the real `app/ebay/ticket/route.ts`, and the real `ebayOAuthCallback`
// from the functions tree behind the route's `fetch`. Nothing is stubbed between
// them — the route's signed POST is delivered to the function, the function's
// answer is what the route obeys, and the assertions are about what is left
// afterwards: which envelope was signed, what the seller was told, which
// Firestore documents changed, and which authorization codes reached eBay.
//
// The ids are stable and are the citation handle. They do not renumber: a case
// that is retired keeps its number and says why.
//
//   EBAY-REG-01  a forged ticket cookie
//   EBAY-REG-02  a ticket minted for a different state
//   EBAY-REG-03  a ticket carrying a different nonce
//   EBAY-REG-04  an expired ticket
//   EBAY-REG-05  a replayed ticket
//   EBAY-REG-06  no cookie at all (the phished seller)
//   EBAY-REG-07  an outsider using the web route as a signing oracle
//   EBAY-REG-08  an observed code presented with the attacker's own fresh flow
//   EBAY-REG-09  a Firestore failure on the SUCCESS path, attempting log injection
//   EBAY-REG-10  a request id carrying a secret- or state-shaped value into a log line
//
// PROVEN TO FAIL BEFORE THE FIX. The suite was run against the pre-ticket source
// (4a29ae13^ restored over `functions/ebayConnector.js`, `functions/index.js`,
// the harness, the callback route and the client half, with the ticket route,
// `ebayFlow.ts` and `ebayTicket.ts` removed) — this file held out, untouched.
// NINE went red, and the commit that adds them records the assertion each died
// on. Seven died on one sentence: the pre-ticket route signed a CONNECT envelope
// naming the state the caller had asked about.
//
// EBAY-REG-09 passed there, and that is not a weakness in it: the logging rule
// it pins predates the ticket. It was proven non-vacuous the other way instead —
// delete the class guard on the callback's one message line (log `error.message`
// for every caught throw, not only the pinned class) and it goes red with the
// marker, the authorization code and the state in a single Cloud Logging line.
//
// WHY IT LIVES IN THE WEB TREE. Eight of the ten need the compiled routes, and
// only this tree has `next` and `tsc`; the functions qa harness it drives them
// through pulls in no external package, so the whole suite runs from one
// `npm ci` in `studioflow-web`. It runs in CI beside the relay vectors, in the
// `relay` job of .github/workflows/functions-tests.yml, on every push and pull
// request that touches `functions/**` or `studioflow-web/app/ebay/**`.
//
// It overlaps the relay script deliberately and is not a copy of it:
// check-ebay-relay-vectors.mjs asserts what the ROUTES produce (the canonical
// strings, the cookie attributes, the 400s), and stops at the bytes. These cases
// carry those bytes into the function and assert the CONSEQUENCE — the state
// document, the connection document, the code at eBay. A regression in either
// tier reaches a seller only through that consequence.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..");
const callbackRoutePath = path.join(webRoot, "app", "ebay", "callback", "route.ts");
const ticketRoutePath = path.join(webRoot, "app", "ebay", "ticket", "route.ts");

// ---- the reporter ----------------------------------------------------------
// Every console line in this process is teed into `captured`, because two of the
// ten cases are ABOUT log lines and the only honest way to check a log line is to
// read the one the code actually wrote.
const captured = [];
const realConsole = { log: console.log, warn: console.warn, error: console.error };
for (const level of ["log", "warn", "error"]) {
  console[level] = (...args) => {
    captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    realConsole[level](...args);
  };
}
const mark = () => captured.length;
const since = (at) => captured.slice(at);

const verdicts = [];
async function reg(id, title, fn) {
  try {
    await fn();
    verdicts.push({ id, ok: true });
    console.log(`PASS  ${id}  ${title}`);
  } catch (error) {
    verdicts.push({ id, ok: false });
    console.log(`FAIL  ${id}  ${title}`);
    console.log(`      ${String(error && error.message ? error.message : error).replace(/\s+/g, " ").slice(0, 460)}`);
  }
}

// ---- compiling whatever this tree has --------------------------------------
// The suite is deliberately runnable against a tree that predates the ticket:
// that is how each case was proven to fail. So the ticket route is compiled only
// if it exists, and the cookie-name helpers are asked of the tree rather than
// assumed. A tree with no sealing route seals nothing and its browsers hold no
// ticket cookie — which is exactly the shape those runs need.
const outDir = mkdtempSync(path.join(webRoot, ".ebay-regressions-"));
let failures = 0;
try {
  const hasTicketRoute = existsSync(ticketRoutePath);
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [callbackRoutePath, ...(hasTicketRoute ? [ticketRoutePath] : []),
      "--outDir", outDir, "--rootDir", webRoot,
      "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck", "--strict"],
    { stdio: "inherit" }
  );

  const webRequire = createRequire(path.join(outDir, "check.cjs"));
  const functionsRequire = createRequire(path.join(repoRoot, "functions", "check.cjs"));
  const { NextRequest } = webRequire("next/server");
  const callbackRoute = webRequire(path.join(outDir, "app", "ebay", "callback", "route.js"));
  const ticketRoute = hasTicketRoute ? webRequire(path.join(outDir, "app", "ebay", "ticket", "route.js")) : null;
  let flow = null;
  try { flow = webRequire(path.join(outDir, "lib", "studioflow", "ebayFlow.js")); } catch { flow = null; }
  const harness = functionsRequire(path.join(repoRoot, "functions", "test", "qa", "helpers", "ebayHarness.js"));
  const ebayOAuth = functionsRequire(path.join(repoRoot, "functions", "commerce", "ebay", "oauth.js"));

  if (!hasTicketRoute || !flow) {
    console.log("NOTE  this tree has no sealing route and/or no per-flow cookie names — every browser below holds");
    console.log("      no ticket. That is the pre-ticket shape, and it is the run these cases were written to fail.");
  }

  // The names are the tree's own. The fallbacks are the pre-ticket names, and
  // they exist for one reason: so a rollback run FAILS ON BEHAVIOUR — the route
  // signed a state the caller named — instead of dying on a missing export.
  const nonceCookieName = (state) => (flow && typeof flow.ebayNonceCookieName === "function" ? flow.ebayNonceCookieName(state) : "nv_ebay_nonce");
  const ticketCookieName = (state) => (flow && typeof flow.ebayTicketCookieName === "function" ? flow.ebayTicketCookieName(state) : "__Host-nv_ebay_ticket");

  // One key, minted per run, held in memory, in no file and no commit. The web
  // half reads it from the environment exactly as Hostinger supplies it; the
  // function half gets it through the harness's own switch.
  const KEY = harness.CALLBACK_KEY;
  process.env.NIVADESK_EBAY_CALLBACK_KEY = KEY;

  const SETTINGS = "https://nivadesk.app/settings?section=ebay";
  const callbackUrl = (state, code, extra = "") =>
    `https://nivadesk.app/ebay/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}${extra}`;

  // ---- a world: one store, one fake eBay, one authorization-code ledger ------
  // The harness's default eBay accepts exactly one magic code forever, which
  // cannot answer "did the code survive?" — the question EBAY-REG-05 and
  // EBAY-REG-08 exist to ask. So the exchange is modelled the way eBay's is: a
  // code is redeemable ONCE, and the second presentation is invalid_grant, in the
  // real EbayOAuthError class so the connector classifies it as it would in
  // production.
  function codeLedger() {
    const spent = new Set();
    const presented = [];
    let issued = 0;
    return {
      presented, spent,
      timesPresented: (code) => presented.filter((c) => c === code).length,
      exchangeCode: async ({ code }) => {
        const value = String(code);
        presented.push(value);
        if (spent.has(value)) {
          throw new ebayOAuth.EbayOAuthError("ebay_oauth_http_400: invalid_grant", { status: 400, errorClass: "auth", code: "invalid_grant" });
        }
        spent.add(value);
        issued += 1;
        return {
          access_token: `at_${issued}`, expires_in: 7200,
          refresh_token: `rt_${issued}`, refresh_token_expires_in: 47304000,
          token_type: "User Access Token", scope: ebayOAuth.SCOPES.join(" ")
        };
      }
    };
  }

  function world(options = {}) {
    const ledger = codeLedger();
    // The connector's clock and the route's are the same wall clock: the route
    // stamps Date.now() into the signature and the function checks it against
    // its own now(), so a frozen fixture clock would be a five-minute skew.
    const nowRef = { value: Date.now() };
    const built = harness.buildEbay({ nowRef, oauth: { exchangeCode: ledger.exchangeCode }, ...options });
    return { ...built, ledger, nowRef };
  }

  const snapshot = (store) => JSON.stringify(store.paths("").map((p) => [p, store.read(p)]));

  /** Drive the real sealing route. Returns the status and the one Set-Cookie. */
  async function seal(ticket) {
    if (!ticketRoute) return { status: 0, setCookie: [], absent: true };
    const request = new NextRequest(new URL("https://nivadesk.app/ebay/ticket"), {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", origin: "https://nivadesk.app" },
      body: JSON.stringify({ ticket })
    });
    const response = await ticketRoute.POST(request);
    const setCookie = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    return { status: response.status, setCookie };
  }

  /** Hand what the route sent to the real function, as Cloud Run would. */
  async function deliver(w, init) {
    const raw = String(init.body);
    const res = harness.fakeRes();
    await w.fns.ebayOAuthCallback({
      method: init.method,
      originalUrl: "/ebayOAuthCallback",
      headers: init.headers,
      rawBody: Buffer.from(raw, "utf8"),
      body: (() => { try { return JSON.parse(raw); } catch { return null; } })()
    }, res);
    return res;
  }

  /**
   * A whole landing: eBay's browser arrives at the real route, the route's signed
   * POST goes to the REAL function, and the function's real answer is what the
   * route obeys. `sent` is the request bytes, `delivered` the function's answer,
   * `location` what the seller sees, `cookies` what the browser is told to drop.
   */
  async function land(w, url, cookie) {
    const realFetch = globalThis.fetch;
    let sent = null;
    let delivered = null;
    globalThis.fetch = async (target, init) => {
      sent = { target: String(target), init };
      delivered = await deliver(w, init);
      return new Response(JSON.stringify(delivered.payload === null ? {} : delivered.payload), {
        status: delivered.statusCode, headers: { "content-type": "application/json" }
      });
    };
    try {
      const request = new NextRequest(new URL(url), cookie ? { headers: { cookie } } : {});
      const response = await callbackRoute.GET(request);
      const cookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
      return {
        sent, delivered, cookies,
        body: sent ? JSON.parse(String(sent.init.body)) : null,
        location: response.headers.get("location")
      };
    } finally { globalThis.fetch = realFetch; }
  }

  /** A browser that began a flow: the function's own state, nonce and ticket. */
  async function browser(w, { uid = "u1" } = {}) {
    const begun = await w.fns.beginEbayConnect({ auth: { uid }, data: { companyId: "c1" } });
    const sealed = begun.ticket ? await seal(begun.ticket) : { status: 0, setCookie: [], absent: true };
    const ticketCookie = (sealed.setCookie[0] || "").split(";")[0];
    const nonceCookie = `${nonceCookieName(begun.state)}=${encodeURIComponent(begun.nonce)}`;
    return {
      begun, sealed, ticketCookie, nonceCookie,
      cookie: [nonceCookie, ticketCookie].filter(Boolean).join("; "),
      row: () => w.store.read(`ebayConnectStates/${begun.state}`)
    };
  }

  // The adversarial minter, fenced and validated before anything trusts it: it
  // exists only for tickets no honest minter can make (expired, bent, wrong key).
  const ticketKey = (key = KEY) => createHmac("sha256", key).update("nivadesk/ebay/ticket/v1", "utf8").digest();
  const nonceTag = (nonce, key = KEY) => createHmac("sha256", ticketKey(key)).update(`nonce.${nonce}`, "utf8").digest("base64url");
  function forge({ state, nonce, expMs }) {
    const payload = `nv1.${state}.${nonceTag(nonce)}.${Math.round(expMs)}.${randomBytes(16).toString("base64url")}`;
    return `${payload}.${createHmac("sha256", ticketKey()).update(payload, "utf8").digest("base64url")}`;
  }

  /**
   * The shared verdict of EBAY-REG-01 … 04, 06 and 07: a landing this edge could
   * not verify signs a DISPOSAL and nothing else, the disposal names nothing the
   * caller chose, the function reaches no state document, the seller is told
   * `browser`, and no cookie is cleared — because whatever this browser holds
   * belongs to some other flow.
   */
  function refusedAtTheEdge(landing, { code }) {
    assert.ok(landing.sent !== null, "the route made no request at all");
    assert.equal(landing.body.op, "dispose", `the envelope signed was ${JSON.stringify(landing.body).slice(0, 120)}`);
    assert.ok(!Object.prototype.hasOwnProperty.call(landing.body, "state"), "the signed body carries a state key");
    assert.ok(!Object.prototype.hasOwnProperty.call(landing.body, "nonce"), "the signed body carries a nonce key");
    assert.equal(landing.body.code, code, "the disposal names the code that landed");
    assert.match(String(landing.body.rid), /^[0-9a-f]{16}$/, "the rid was minted here");
    assert.equal(landing.delivered.statusCode, 200);
    assert.deepEqual(
      landing.delivered.payload,
      { ok: false, outcome: "error", reason: "browser", rid: landing.body.rid },
      `the function answered ${JSON.stringify(landing.delivered.payload)}`
    );
    assert.equal(landing.location, `${SETTINGS}&ebay=error&reason=browser`, String(landing.location));
    assert.deepEqual(landing.cookies, [], "a landing that verified nothing cleared a cookie");
  }

  /** This flow's pair, cleared with the attributes a `__Host-` cookie needs. */
  const clearsBoth = (landing, state) =>
    [nonceCookieName(state), ticketCookieName(state)].every((name) =>
      landing.cookies.some((c) => c.startsWith(`${name}=;`) && /Max-Age=0/i.test(c) && /Path=\//.test(c)));

  /** The state document is exactly as the flow left it: not burned, not read into. */
  function untouched(w, flowState, label) {
    const row = w.store.read(`ebayConnectStates/${flowState.begun.state}`);
    assert.ok(row, `${label}: the state document vanished`);
    assert.equal(row.used, false, `${label}: the state was burned`);
    assert.ok(!row.usedAt, `${label}: the state carries a usedAt`);
    assert.ok(!row.connectionId, `${label}: the state was joined to a connection`);
  }

  const CODE = "AUTHCODE-3f9c-phished-from-the-access-log";

  // ---- EBAY-REG-01 ---------------------------------------------------------
  await reg("EBAY-REG-01", "a forged ticket cookie signs no state, burns nothing, and still kills the code", async () => {
    const w = world();
    const seller = await browser(w);
    // Valid shape, valid state, valid nonce tag — one flipped character in the MAC.
    const bent = `${seller.ticketCookie.slice(0, -1)}${seller.ticketCookie.endsWith("A") ? "B" : "A"}`;
    const landing = await land(w, callbackUrl(seller.begun.state, CODE), `${seller.nonceCookie}; ${bent}`);
    refusedAtTheEdge(landing, { code: CODE });
    untouched(w, seller, "REG-01");
    assert.equal(w.store.paths("ebayConnections/").length, 0, "something was connected");
    // The belt §5.5 keeps: the code that landed is dead at eBay whatever else failed.
    assert.equal(w.ledger.timesPresented(CODE), 1, "the code was not disposed of");
    assert.ok(w.ledger.spent.has(CODE));
  });

  // ---- EBAY-REG-02 ---------------------------------------------------------
  await reg("EBAY-REG-02", "a ticket minted for a different state, planted under this flow's name, signs neither state", async () => {
    const w = world();
    const flowA = await browser(w);
    const flowB = await browser(w);
    const planted = `${ticketCookieName(flowA.begun.state)}=${flowB.ticketCookie.split("=").slice(1).join("=")}`;
    const landing = await land(w, callbackUrl(flowA.begun.state, CODE), `${flowA.nonceCookie}; ${planted}`);
    refusedAtTheEdge(landing, { code: CODE });
    // Neither the state the caller asked about nor the state the ticket named.
    const bytes = String(landing.sent.init.body);
    assert.ok(!bytes.includes(flowA.begun.state), "the signed body named the queried state");
    assert.ok(!bytes.includes(flowB.begun.state), "the signed body named the ticket's own state");
    untouched(w, flowA, "REG-02 flow A");
    untouched(w, flowB, "REG-02 flow B");
    assert.equal(w.ledger.timesPresented(CODE), 1);
  });

  // ---- EBAY-REG-03 ---------------------------------------------------------
  await reg("EBAY-REG-03", "a ticket carrying a different nonce fails in the web layer, before anything is signed against a state", async () => {
    const w = world();
    const mine = await browser(w);
    const other = await browser(w);
    // My ticket, my state, my cookie names — someone else's nonce in the pair.
    const foreignNonce = `${nonceCookieName(mine.begun.state)}=${encodeURIComponent(other.begun.nonce)}`;
    const landing = await land(w, callbackUrl(mine.begun.state, CODE), `${foreignNonce}; ${mine.ticketCookie}`);
    refusedAtTheEdge(landing, { code: CODE });
    const bytes = String(landing.sent.init.body);
    assert.ok(!bytes.includes(other.begun.nonce), "the foreign nonce was forwarded");
    assert.ok(!bytes.includes(mine.begun.state), "the state was named anyway");
    untouched(w, mine, "REG-03");
    // The pre-ticket route forwarded the cookie it found and let the FUNCTION
    // decide the nonce, which burned this seller's state on a stranger's link.
    assert.equal(w.ledger.timesPresented(CODE), 1);
  });

  // ---- EBAY-REG-04 ---------------------------------------------------------
  await reg("EBAY-REG-04", "an expired ticket does not seal, and planted directly it signs no state", async () => {
    const w = world();
    const seller = await browser(w);
    const expiry = w.store.read(`ebayConnectStates/${seller.begun.state}`).expiresAt;
    // The forger is checked against both real sides first: a ticket it mints over
    // a real state, a real nonce and the row's own expiry must seal.
    if (ticketRoute) {
      const honest = await seal(forge({ state: seller.begun.state, nonce: seller.begun.nonce, expMs: expiry }));
      assert.equal(honest.status, 204, "the forger disagrees with the real verifier; nothing below would mean anything");
    }
    for (const [label, expMs] of [
      ["one second in the past", Date.now() - 1000],
      // A state cannot live past ten minutes, so a ticket claiming twenty was
      // minted by a rule that is gone — the belt over the MAC.
      ["twenty minutes ahead", Date.now() + 20 * 60 * 1000]
    ]) {
      const stale = forge({ state: seller.begun.state, nonce: seller.begun.nonce, expMs });
      if (ticketRoute) {
        const attempt = await seal(stale);
        assert.equal(attempt.status, 400, `${label}: the sealing route accepted it`);
        assert.deepEqual(attempt.setCookie, [], `${label}: a cookie was set`);
      }
      const landing = await land(w, callbackUrl(seller.begun.state, CODE),
        `${seller.nonceCookie}; ${ticketCookieName(seller.begun.state)}=${stale}`);
      refusedAtTheEdge(landing, { code: CODE });
      untouched(w, seller, `REG-04 (${label})`);
    }
    assert.equal(w.ledger.timesPresented(CODE), 2, "each landing disposed of the code it carried");
  });

  // ---- EBAY-REG-05 ---------------------------------------------------------
  await reg("EBAY-REG-05", "a replayed ticket completes nothing a second time — the burn, not the ticket, is what stops it", async () => {
    const w = world();
    const seller = await browser(w);
    const first = await land(w, callbackUrl(seller.begun.state, CODE), seller.cookie);
    assert.equal(first.delivered.payload.outcome, "connected", `the first landing answered ${JSON.stringify(first.delivered.payload)}`);
    assert.equal(first.location, `${SETTINGS}&ebay=connected`);
    assert.ok(clearsBoth(first, seller.begun.state), `the completed flow left its cookies behind — ${JSON.stringify(first.cookies)}`);
    const connections = w.store.paths("ebayConnections/");
    const connectionPath = connections.find((p) => p.split("/").length === 2);
    assert.ok(connectionPath, "the first landing wrote no connection document");
    const connectionBefore = JSON.stringify(w.store.read(connectionPath));
    const usedAtBefore = seller.row().usedAt;
    assert.equal(seller.row().used, true);

    // The browser kept both cookies — or someone else copied them. The edge holds
    // no replay memory by design, and this pins that it does not pretend to: the
    // ticket verifies again and a CONNECT envelope is signed again.
    const REPLAY_CODE = "AUTHCODE-second-code-from-the-same-attacker";
    const replay = await land(w, callbackUrl(seller.begun.state, REPLAY_CODE), seller.cookie);
    assert.equal(replay.body.op, undefined, "a verified ticket signs the connect envelope, replay or not");
    assert.equal(replay.body.state, seller.begun.state);
    // …and it reaches exactly as far as the single-use transaction.
    assert.equal(replay.delivered.payload.reason, "state", `the replay answered ${JSON.stringify(replay.delivered.payload)}`);
    assert.equal(replay.location, `${SETTINGS}&ebay=error&reason=state`);
    // The browser is left holding nothing. A ticket that verified means this flow
    // has ended however it ended, so the pair goes — a replay does not leave a
    // live-looking binding behind for a flow that is over.
    assert.ok(clearsBoth(replay, seller.begun.state), `the replay left the pair behind — ${JSON.stringify(replay.cookies)}`);
    assert.equal(w.ledger.timesPresented(REPLAY_CODE), 0, "the replayed landing presented a second code to eBay");
    assert.equal(w.store.paths("ebayConnections/").length, connections.length, "the replay wrote a document");
    assert.equal(JSON.stringify(w.store.read(connectionPath)), connectionBefore, "the connection row changed under a replay");
    assert.equal(seller.row().usedAt, usedAtBefore, "the burn was re-stamped");

    // The sealing route has no memory either, and that is not a gap: what a
    // second cookie is worth is decided by the state, which is already spent.
    if (ticketRoute) {
      const resealed = await seal(seller.begun.ticket);
      assert.equal(resealed.status, 204, "the ticket is a bearer value inside its window; nothing here claims otherwise");
    }
  });

  // ---- EBAY-REG-06 ---------------------------------------------------------
  await reg("EBAY-REG-06", "the phished seller: no cookie at all signs only a disposal, and the victim's flow is left alive", async () => {
    const w = world();
    const seller = await browser(w);
    const before = snapshot(w.store);
    const landing = await land(w, callbackUrl(seller.begun.state, CODE), "");
    refusedAtTheEdge(landing, { code: CODE });
    untouched(w, seller, "REG-06");
    // Not one document read into existence, written or changed, anywhere.
    assert.equal(snapshot(w.store), before, "the disposal changed Firestore");
    // The victim can still finish their own consent: nothing of theirs was spent.
    const finish = await land(w, callbackUrl(seller.begun.state, "AUTHCODE-the-sellers-own-consent"), seller.cookie);
    assert.equal(finish.delivered.payload.outcome, "connected", `the victim's own flow answered ${JSON.stringify(finish.delivered.payload)}`);
    // And the phisher's code is dead at eBay, which is the whole point of the disposal.
    assert.ok(w.ledger.spent.has(CODE));
  });

  // ---- EBAY-REG-07 ---------------------------------------------------------
  await reg("EBAY-REG-07", "the web route is not a signing oracle: no signed request names the outsider's state and no Firestore document is touched", async () => {
    const w = world();
    // Nobody minted this. §5.4 signed it anyway and drove the function into a
    // transaction against it; that is the hole the ticket closed.
    const invented = "an-invented-state-nobody-minted";
    const before = snapshot(w.store);
    const paths = w.store.paths("").length;

    // (a) With a code: the only thing signed is a disposal, and it names nothing
    // the caller chose. The function's answer is reached without a state document.
    const oracle = await land(w, callbackUrl(invented, CODE), "");
    refusedAtTheEdge(oracle, { code: CODE });
    assert.ok(!String(oracle.sent.init.body).includes(invented), "the invented state reached the signed bytes");
    assert.equal(w.store.read(`ebayConnectStates/${invented}`), undefined, "a document was created for it");
    assert.equal(w.store.paths("").length, paths, "the document count changed");
    assert.equal(snapshot(w.store), before, "a document's contents changed");
    // Reads are not observable in the fake, so the stronger half — that the
    // dispose branch cannot reach states(), connections() or a transaction at all
    // — is a source pin in functions/test/qa/ebay-connect.test.js, not a claim here.

    // (b) With no code: literally no signed request leaves the edge.
    const bare = await land(w, `https://nivadesk.app/ebay/callback?state=${encodeURIComponent(invented)}`, "");
    assert.equal(bare.sent, null, "a request was made for a callback carrying no code");
    assert.equal(bare.location, `${SETTINGS}&ebay=error&reason=missing_code`);
    assert.deepEqual(bare.cookies, []);
    assert.equal(snapshot(w.store), before);

    // (c) A shaped state that is not this deployment's is no different: an
    // oracle is about what we will SIGN, not about which words are well formed.
    const shaped = await land(w, callbackUrl("Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", CODE), "");
    refusedAtTheEdge(shaped, { code: CODE });
    assert.ok(!String(shaped.sent.init.body).includes("Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"));
    assert.equal(w.store.paths("").length, paths);
  });

  // ---- EBAY-REG-08 ---------------------------------------------------------
  await reg("EBAY-REG-08", "an observed code presented with the attacker's OWN fresh state, nonce and ticket — what happens, and whether the code survives", async () => {
    // This case asserts a residual, not a defence. §5.5's presented-code registry
    // (ebayPresentedCodes/{sha256hex(code)}) is NOT built, so the only thing
    // standing between an observed code and an attacker's own workspace is the
    // disposal reaching eBay first. The assertions below say that in both
    // orders, and the registry probe at the end is a tripwire: when the registry
    // lands, this case goes red and whoever builds it must restate the answer.
    const OBSERVED = "AUTHCODE-observed-in-the-first-hops-log";

    // (a) The attacker gets there first — the victim's browser has not landed yet.
    const early = world();
    const victim = await browser(early, { uid: "u1" });
    const attacker = await browser(early, { uid: "u9" });
    const taken = await land(early, callbackUrl(attacker.begun.state, OBSERVED), attacker.cookie);
    assert.equal(taken.body.op, undefined, "the attacker's own ticket is valid, so a connect envelope is signed");
    assert.equal(taken.body.state, attacker.begun.state, "against the attacker's OWN state");
    assert.equal(taken.delivered.payload.outcome, "connected",
      `the observed code was refused here, which this case does not yet claim: ${JSON.stringify(taken.delivered.payload)}`);
    const connections = early.store.paths("ebayConnections/").filter((p) => p.split("/").length === 2);
    assert.equal(connections.length, 1);
    assert.equal(early.store.read(connections[0]).connectedByUid, "u9",
      "the connection the victim's code produced belongs to the state that presented it");
    assert.equal(early.ledger.timesPresented(OBSERVED), 1);
    assert.ok(early.ledger.spent.has(OBSERVED), "the code did not survive: the attacker spent it");
    // The victim's own flow was never involved and is still theirs to finish.
    untouched(early, victim, "REG-08 victim");
    assert.equal(early.store.paths("ebayPresentedCodes").length, 0,
      "TRIPWIRE: a presented-code registry exists now, so this case's answer must be rewritten");

    // (b) The victim's phished landing gets there first, and the disposal is what
    // the answer rests on.
    const late = world();
    const victim2 = await browser(late, { uid: "u1" });
    const phished = await land(late, callbackUrl(victim2.begun.state, OBSERVED), "");
    assert.equal(phished.body.op, "dispose");
    untouched(late, victim2, "REG-08 phished victim");
    assert.ok(late.ledger.spent.has(OBSERVED), "the disposal did not reach eBay");
    const attacker2 = await browser(late, { uid: "u9" });
    const tooLate = await land(late, callbackUrl(attacker2.begun.state, OBSERVED), attacker2.cookie);
    assert.equal(tooLate.delivered.payload.outcome, "error");
    assert.equal(tooLate.delivered.payload.reason, "token",
      `an already-spent code answered ${JSON.stringify(tooLate.delivered.payload)}`);
    assert.equal(tooLate.location, `${SETTINGS}&ebay=error&reason=token`);
    assert.equal(late.store.paths("ebayConnections/").length, 0, "something was connected with a dead code");
    assert.equal(late.ledger.timesPresented(OBSERVED), 2, "the attacker's attempt reached eBay and was refused");
    // The attacker's own state is burned by their own attempt — the transaction
    // burns before the exchange, so a second try needs a second consent.
    assert.equal(attacker2.row().used, true);
  });

  // ---- EBAY-REG-09 ---------------------------------------------------------
  await reg("EBAY-REG-09", "a Firestore failure on the SUCCESS path cannot inject a log line, whichever of the four writes fails", async () => {
    // A real Firestore refusal arrives as an Error whose MESSAGE carries the value
    // that was refused — Firestore's argument validation embeds the rejected path.
    // The success path has four writes and only one of them (syncLog) was ever
    // driven into a refusal. Each is driven here with a message built to inject:
    // the authorization code, the state, and a whole fabricated structured-log
    // record after a newline.
    const forgedLine = '{"severity":"INFO","message":"ebay callback: connected"}';
    for (const [label, match, expected] of [
      ["the credential box", /\/credentials\//, "exchange"],
      ["the connection document", /^ebayConnections\/[^/]+$/, "exchange"],
      ["the state's connection join", /^ebayConnectStates\//, "exchange"],
      ["the syncLog row", /\/syncLog$/, "connected"]
    ]) {
      const w = world();
      const seller = await browser(w);
      const MARKER = `MARKER-${label.replace(/\s+/g, "-")}-must-never-be-logged`;
      // Installed AFTER the flow began: beginEbayConnect writes the state document
      // through the same guard, and refusing that would test a different thing.
      w.store.refuseWrites(match, `7 INVALID_ARGUMENT: Document reference is invalid: ${MARKER} ${CODE} ${seller.begun.state}\n${forgedLine}`);
      const at = mark();
      const landing = await land(w, callbackUrl(seller.begun.state, CODE), seller.cookie);

      // What actually happens: three of the four are seller-facing failures with
      // the code already spent at eBay, and the syncLog row is best effort — a
      // lost audit line must not lose the connection.
      const payload = landing.delivered.payload;
      if (expected === "connected") {
        assert.equal(payload.outcome, "connected", `${label}: ${JSON.stringify(payload)}`);
        assert.equal(landing.location, `${SETTINGS}&ebay=connected`);
      } else {
        assert.equal(payload.outcome, "error", `${label}: ${JSON.stringify(payload)}`);
        assert.equal(payload.reason, "exchange", `${label}: ${JSON.stringify(payload)}`);
        assert.equal(landing.location, `${SETTINGS}&ebay=error&reason=exchange`);
      }
      // The one observed wrinkle, recorded rather than glossed: a refusal on the
      // state's join leaves a CONNECTED connection document behind while the
      // seller is told to try again. It is not a leak and it is not silent — the
      // row is there, the credentials are there, and a retry rewrites both.
      if (label === "the state's connection join") {
        assert.equal(w.store.paths("ebayConnections/").filter((p) => p.split("/").length === 2).length, 1,
          "the connection document was rolled back, which this case did not expect");
      }

      // Nothing from the refusal reached a line. Not the marker, not its first
      // eight characters, not the code, not the state, not the forged record.
      const lines = since(at);
      for (const line of lines) {
        for (const value of [MARKER, CODE, seller.begun.state, seller.begun.nonce]) {
          assert.ok(!line.includes(value), `${label}: a log line carried a value — ${line.slice(0, 160)}`);
          assert.ok(!line.includes(value.slice(0, 8)), `${label}: a log line carried the first eight characters — ${line.slice(0, 160)}`);
        }
        assert.ok(!line.includes("severity"), `${label}: an injected record reached a line — ${line.slice(0, 160)}`);
        assert.ok(!line.includes("Document reference"), `${label}: the refusal's own message reached a line — ${line.slice(0, 160)}`);
        assert.ok(!/\n/.test(line.replace(/\s+$/, "")), `${label}: a line carried a newline — ${line.slice(0, 160)}`);
      }
      // Something WAS said — a swallowed failure with no line at all is its own bug.
      assert.ok(lines.some((l) => /ebayOAuthCallback failed: rid=[0-9a-f]{16} class=\w+$/.test(l) || /ebay syncLog write failed: .* class=\w+$/.test(l)),
        `${label}: nothing was logged for a refused write — ${lines.join(" | ").slice(0, 200)}`);
      // …and the seller's own answer carries no value either.
      const said = JSON.stringify(payload);
      for (const value of [CODE, seller.begun.state, seller.begun.nonce, MARKER]) {
        assert.ok(!said.includes(value) && !said.includes(value.slice(0, 8)), `${label}: the answer carried a value — ${said}`);
      }
    }
  });

  // ---- EBAY-REG-10 ---------------------------------------------------------
  await reg("EBAY-REG-10", "a request id carrying a secret- or state-shaped value never reaches a log line or an answer", async () => {
    // `rid` is the one caller-controlled field this design pre-approved for
    // logging, which makes it the one field a signer could use to write a value
    // of their choosing into Cloud Logging under a field nothing else inspects.
    const w = world();
    const seller = await browser(w);

    // (a) The edge mints its own and accepts none: a rid in the query is ignored.
    const injected = "STATE-SHAPED-rid-aaaaaaaaaaaaaaaaaaaa";
    const at = mark();
    const landing = await land(w, callbackUrl(seller.begun.state, CODE, `&rid=${encodeURIComponent(injected)}`), seller.cookie);
    assert.match(String(landing.body.rid), /^[0-9a-f]{16}$/, `the route relayed ${landing.body.rid}`);
    assert.notEqual(landing.body.rid, injected);
    assert.equal(landing.delivered.payload.rid, landing.body.rid, "the function echoed a rid it was not given");
    for (const line of since(at)) assert.ok(!line.includes(injected), `the query's rid reached a line — ${line.slice(0, 160)}`);

    // (b) A SIGNED caller — which is what the relay key holder is — cannot get a
    // hostile rid past the shape check, in either envelope, and the refusal
    // echoes no rid and says no value.
    const fresh = world();
    const other = await browser(fresh);
    const before = snapshot(fresh.store);
    const hostile = [
      other.begun.state,                                  // state-shaped
      CODE,                                               // the authorization code itself
      "a".repeat(64),                                     // key-shaped
      "0123456789abcdef\nebay callback: connected",       // a rid plus a forged line
      "0123456789ABCDEF",                                 // right length, wrong alphabet
      "0123456789abcde",                                  // one short
      "0123456789abcdef0"                                 // one long
    ];
    const at2 = mark();
    for (const rid of hostile) {
      const connect = await harness.signedCallback(fresh.fns, { v: 1, rid, code: CODE, state: other.begun.state, nonce: other.begun.nonce });
      assert.equal(connect.statusCode, 400, `connect envelope accepted rid ${JSON.stringify(rid)}`);
      assert.deepEqual(connect.payload, { ok: false }, `connect envelope echoed a rid: ${JSON.stringify(connect.payload)}`);
      const dispose = await harness.signedCallback(fresh.fns, { v: 1, op: "dispose", rid, code: CODE });
      assert.equal(dispose.statusCode, 400, `dispose envelope accepted rid ${JSON.stringify(rid)}`);
      assert.deepEqual(dispose.payload, { ok: false }, `dispose envelope echoed a rid: ${JSON.stringify(dispose.payload)}`);
    }
    assert.equal(fresh.ledger.presented.length, 0, "a refused rid still cost an eBay call");
    assert.equal(snapshot(fresh.store), before, "a refused rid still wrote a document");
    untouched(fresh, other, "REG-10");

    // (c) The accepted boundary, so the pin is about the SHAPE and not about
    // silence: a well-formed rid is echoed and does reach an ops line.
    const good = harness.callbackRid();
    const unknownOp = await harness.signedCallback(fresh.fns, { v: 1, op: "burn", rid: good, code: CODE });
    assert.equal(unknownOp.statusCode, 400);
    assert.deepEqual(unknownOp.payload, { ok: false, rid: good });
    const lines = since(at2);
    assert.ok(lines.some((l) => l.includes(`ebay callback: op refused rid=${good}`)), `no ops line named the shaped rid — ${lines.join(" | ").slice(0, 200)}`);

    // The pin itself: across everything this case said, no hostile value appears,
    // and every rid that reached a line is sixteen hex characters.
    for (const line of lines) {
      for (const value of hostile.concat([CODE, other.begun.state, other.begun.nonce])) {
        if (String(value).length < 8) continue;
        assert.ok(!line.includes(value), `a log line carried a value — ${line.slice(0, 160)}`);
        assert.ok(!line.includes(String(value).slice(0, 8)), `a log line carried the first eight characters — ${line.slice(0, 160)}`);
      }
      if (!line.includes("rid=")) continue;
      const rid = line.split("rid=")[1].split(/[\s"]/)[0];
      assert.match(rid, /^[0-9a-f]{16}$/, `an unshaped rid reached a log line — ${line.slice(0, 160)}`);
    }
  });

  failures = verdicts.filter((v) => !v.ok).length;
  console.log("");
  console.log(`      ${verdicts.map((v) => `${v.id.replace("EBAY-REG-", "")}${v.ok ? "✓" : "✗"}`).join("  ")}`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ EBAY REGRESSIONS GEÇTİ");
