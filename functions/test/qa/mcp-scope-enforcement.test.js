// What an OAuth grant actually buys, and what an empty one does not.
//
// The rule this file pins is one sentence: a delegated grant is the whole of
// what that caller may do. Three things were wrong before it existed, and all
// three are checked below.
//
//   1. FAIL-OPEN. `if (granted.size > 0 && required.some(...))` reads as "deny
//      if the token names scopes and one is missing", so a token carrying NO
//      scope string passed every gate — while context.js's header claimed
//      "Scopes are enforced, not just carried".
//   2. HALF A SURFACE. Only the orchestrator capabilities were checked at all;
//      the 19 tools dispatched through nvChatGPTDispatchAction were not, so
//      `get_financial_overview` answered a token with no finance.read while a
//      flagged capability refused the same token.
//   3. A DEFAULT SMALLER THAN THE LISTING. tools/list is one document served
//      before any token exists and advertises tools needing finance.read and
//      notes.*; the mint sites defaulted to "orders.read orders.write", so a
//      connection made without an explicit scope could not call tools the same
//      server had just advertised to it.
//
// Run: node test/qa/mcp-scope-enforcement.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const context = require("../../orchestrator/context");
const registry = require("../../orchestrator/registry");
const fixtures = require("../fixtures/orchestrator");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const INDEX = path.join(FUNCTIONS_DIR, "index.js");
const indexSource = fs.readFileSync(INDEX, "utf8");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", String(error.message).split("\n")[0].slice(0, 300)); }
};

// ---- the rule itself ---------------------------------------------------------

// Every capability the flags can publish, read from the registry rather than
// typed out. The three names this file used as vehicles — get_commerce_overview,
// get_inventory_overview, get_banking_attention_summary — were removed from the
// release on 6 September 2026, and a scope test that names its subjects by hand
// stops testing the surface the moment the surface changes.
const FLAGGED = registry.publishedNames({ inventory: true, orchestrator: true })
  .filter((name) => !registry.publishedNames({}).includes(name))
  .map((name) => registry.entryFor(name));

check("a delegated token that carries no scope may do nothing", () => {
  // The fail-open branch. An empty grant is not every grant.
  const empty = fixtures.ownerContext({ scope: [] });
  assert.ok(FLAGGED.length > 0, "no flagged capability to check the empty grant against");
  for (const entry of FLAGGED) {
    assert.throws(
      () => context.assertCapability(empty, entry),
      /not granted any scope/,
      `${entry.name} answered a token that was granted nothing`
    );
  }
  assert.deepStrictEqual(
    context.missingScopes({ authType: "chatgpt_oauth", scope: "" }, ["orders.read"]),
    ["orders.read"]
  );
});

check("an auth type nobody has named is treated as a token, not waved through", () => {
  // Fail closed: a new delegated surface that forgets to declare itself is
  // refused rather than silently exempt.
  assert.strictEqual(context.scopeGateApplies("chatgpt_oauth"), true);
  assert.strictEqual(context.scopeGateApplies("some_new_gateway"), true);
  assert.strictEqual(context.scopeGateApplies(""), true);
  for (const first of context.FIRST_PARTY_AUTH_TYPES) {
    assert.strictEqual(context.scopeGateApplies(first), false, `${first} should hold no delegated grant`);
  }
});

check("a member signed in with their own ID token is not scope-checked", () => {
  // chatgptWorkspaceAction: no consent screen, no third party, no grant. Their
  // role and the workspace area switches are the whole gate, as in the app —
  // and the answer comes from WHO is asking, not from an empty string.
  const session = fixtures.ownerContext({ authType: "firebase_session", scope: [] });
  for (const name of registry.publishedNames({ orchestrator: true })) {
    const entry = registry.entryFor(name);
    if (!entry.domainNeeds) continue;
    assert.doesNotThrow(() => context.assertCapability(session, entry), `${name} demanded a scope of a first-party session`);
  }
  // The gates that are not about scope still apply to them. The vehicle used to
  // be the bankFeed gate on get_banking_attention_summary; no capability in the
  // reduced release carries that gate, so the check moves to one that is still
  // published — `search_inventory`, whose `permission.inventory` is the same
  // shape of area gate and is the app's own nvRequireInventoryAccess.
  const noInventory = fixtures.ownerContext({
    authType: "firebase_session", scope: [], isOwner: false,
    areas: { orders: true }, inventoryAccess: false
  });
  assert.throws(() => context.assertCapability(noInventory, registry.entryFor("search_inventory")), /Inventory is not enabled/);
});

check("a token missing one scope is refused, and told which", () => {
  // A partial grant, not an empty one: the caller holds a scope and is missing
  // a different one. get_commerce_overview (orders.read + finance.read) carried
  // this check and is out of the release; every capability the flags publish now
  // asks for a single scope, so the two-scope case is taken where it still
  // exists — the legacy table — through the SAME pure rule assertCapability
  // uses, and the one-scope case is taken on the flagged surface.
  const twoScope = registry.TOOL_REGISTRY.find((entry) => entry.scopes.length > 1);
  assert.ok(twoScope, "no tool asks for two scopes; this check has nothing to hold");
  const held = twoScope.scopes[0];
  const withheld = twoScope.scopes[1];
  assert.deepStrictEqual(
    context.missingScopes({ authType: "chatgpt_oauth", scope: [held] }, twoScope.scopes),
    [withheld],
    `${twoScope.name}: a grant holding ${held} should still be missing ${withheld}`
  );
  assert.throws(
    () => context.assertCapability(fixtures.ownerContext({ scope: [held] }), twoScope),
    new RegExp(`was not granted the ${withheld.replace(".", "\\.")} scope`)
  );
  assert.doesNotThrow(() => context.assertCapability(fixtures.ownerContext({ scope: twoScope.scopes }), twoScope));

  // And on the flagged surface, where one scope is the whole ask.
  for (const entry of FLAGGED) {
    const wrong = fixtures.ownerContext({ scope: ["notes.read"] });
    assert.throws(
      () => context.assertCapability(wrong, entry),
      new RegExp(`was not granted the ${entry.scopes[0].replace(".", "\\.")} scope`),
      `${entry.name} answered a token granted only notes.read`
    );
  }
});

// ---- the same rule over the whole surface ------------------------------------

check("the dispatcher applies the rule to the 19 legacy tools too", () => {
  const api = require("../../index");
  const token = (scope) => ({ companyId: "acme", uid: "u1", email: "u@example.com", authType: "chatgpt_oauth", scope });
  // The asymmetry that made a default-scope token able to read the money
  // through one tool and not through another.
  assert.throws(
    () => api._nvMcpAssertScope(token("orders.read orders.write"), "get_financial_overview"),
    /finance\.read/,
    "a legacy finance tool still answers a token with no finance grant"
  );
  assert.throws(
    () => api._nvMcpAssertScope(token("orders.read orders.write"), "get_dashboard_summary"),
    /finance\.read/
  );
  assert.throws(() => api._nvMcpAssertScope(token(""), "search_orders"), /not granted any scope/);
  assert.throws(() => api._nvMcpAssertScope(token("orders.read"), "create_note"), /notes\.write/);
  // A token granted what the tool asks for passes, and a first-party session
  // passes everything.
  assert.doesNotThrow(() => api._nvMcpAssertScope(token("orders.read finance.read"), "get_financial_overview"));
  assert.doesNotThrow(() => api._nvMcpAssertScope({ companyId: "acme", uid: "u1", authType: "firebase_session" }, "get_financial_overview"));
  // An unknown action is the allowlist's business, not this gate's.
  assert.doesNotThrow(() => api._nvMcpAssertScope(token(""), "not_a_tool"));
});

check("the gate runs before the access-log row and before dispatch", () => {
  const body = indexSource.slice(
    indexSource.indexOf("function nvChatGPTDispatchAction("),
    indexSource.indexOf("\n}\n", indexSource.indexOf("function nvChatGPTDispatchAction("))
  );
  const gate = body.indexOf("nvMcpAssertScope(");
  const log = body.indexOf("nvMcpPiiAccessEntry(");
  const dispatch = body.indexOf("switch (requested)");
  assert.ok(gate > 0 && log > gate, "a refused call would be filed as a read that happened");
  assert.ok(dispatch > gate, "the gate must run before the switch");
});

check("enforcement ships with the submission flag, not under the reviewer", () => {
  // Enforcing scope on the 19 is a behaviour change: a live connection whose
  // token was minted with the old two-scope default would start being refused
  // on the finance tools. That belongs to the operator's 1.2.0 flip, next to
  // the annotation corrections, not to a merge — so the dispatcher calls the
  // gate only under NIVADESK_MCP_ORCHESTRATOR, and tools-list-snapshot proves
  // the wire is unmoved in that state.
  assert.ok(
    /if \(NV_MCP_ORCHESTRATOR\) nvMcpAssertScope\(context, requested\);/.test(indexSource),
    "the dispatcher's scope gate is no longer tied to the submission flag; say so deliberately if that is intended"
  );
});

// ---- the default grant covers the listing it is served alongside -------------

/** What this deployment mints, challenges with and advertises, in one flag state. */
function oauthStrings(flagOn) {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify({
      mint: api._nvOAuthMintDefaultScope(),
      challenge: api._nvMcpChallengeScope(),
      advertised: api._nvOAuthDefaultScope()
    }));
  `;
  const env = { ...process.env };
  if (flagOn) env.NIVADESK_MCP_ORCHESTRATOR = "1"; else delete env.NIVADESK_MCP_ORCHESTRATOR;
  const out = execFileSync(process.execPath, ["-e", script], { cwd: FUNCTIONS_DIR, env, maxBuffer: 16 * 1024 * 1024 }).toString();
  return JSON.parse(out.trim().split("\n").pop());
}

check("flag off, the OAuth surface mints and challenges exactly what 1.1.1 does", () => {
  // The half of "all of it is dormant with the flags off" that was not true.
  // Nothing enforces scope while the flag is off, so widening the default
  // changed nothing a caller could DO and everything a connection RECORDED:
  // every connection minted after the deploy — the reviewer's included — would
  // have stored notes.write, tasks.write and finance.read it did not carry
  // before, invisibly until flip day, and a thirty-day access token means
  // turning the flag back off would not take them back.
  const off = oauthStrings(false);
  assert.strictEqual(off.mint, "orders.read orders.write", "a deploy with the flag off changes what the live OAuth surface mints");
  assert.strictEqual(off.challenge, "orders.read notes.read finance.read", "a deploy with the flag off changes the 401 challenge");
  // The one thing that does NOT move with the flag, because it never did: the
  // metadata and the registration response have always named all six.
  assert.strictEqual(off.advertised, "orders.read orders.write notes.read notes.write finance.read tasks.write");
});

check("flag on, a connection minted with no explicit scope can call everything tools/list advertises", () => {
  const on = oauthStrings(true);
  assert.deepStrictEqual([...context.scopeSet(on.mint)].sort(), [...registry.SCOPES_SUPPORTED].sort());
  assert.strictEqual(on.challenge, on.mint, "a client that takes WWW-Authenticate at its word must ask for the grant the listing needs");
  for (const entry of registry.publishedEntries({ emailReceipts: true, inventory: true, orchestrator: true })) {
    const missing = context.missingScopes({ authType: "chatgpt_oauth", scope: on.mint }, entry.scopes);
    assert.deepStrictEqual(missing, [], `${entry.name} is advertised but a default-scope connection cannot call it`);
  }
  // The exact bytes the OAuth metadata documents have always advertised.
  assert.strictEqual(on.advertised, "orders.read orders.write notes.read notes.write finance.read tasks.write");
});

check("one place decides the mint, one decides the challenge, and both are the flag's", () => {
  // Three places used to answer "what does this connection get?" and they did
  // not agree: registration promised six, the challenge asked for three, and
  // authorize/approve issued two. The pre-1.2.0 strings survive in exactly two
  // places — the flag-off branch of each function — and nowhere else.
  const literals = indexSource.split("\n")
    .filter((row) => /"orders\.read orders\.write"|"orders\.read notes\.read finance\.read"/.test(row))
    // Prose about the old strings is not a mint site.
    .filter((row) => !/^\s*(\*|\/\/|\/\*)/.test(row))
    .map((row) => row.trim());
  assert.deepStrictEqual(
    literals,
    [
      'const NV_OAUTH_MINT_SCOPE_1_1_1 = "orders.read orders.write";',
      'const NV_OAUTH_CHALLENGE_SCOPE_1_1_1 = "orders.read notes.read finance.read";'
    ],
    `a hand-typed grant is back somewhere else: ${literals.join(" | ")}`
  );
  for (const [fn, call] of [["chatgptOAuthApprove", "nvOAuthMintDefaultScope()"], ["nvOAuthExtractScope", "nvOAuthMintDefaultScope()"], ["nvSendMcpOAuthChallenge", "nvMcpChallengeScope()"]]) {
    const start = indexSource.indexOf(fn === "chatgptOAuthApprove" ? "exports.chatgptOAuthApprove" : `function ${fn}(`);
    const body = indexSource.slice(start, indexSource.indexOf("\n}\n", start));
    assert.ok(body.includes(call), `${fn} no longer asks ${call} for its default`);
  }
  const web = path.join(FUNCTIONS_DIR, "..", "studioflow-web", "app", "chatgpt", "connect");
  for (const file of ["ChatGPTConnectClient.tsx", "page.tsx"]) {
    const source = fs.readFileSync(path.join(web, file), "utf8");
    assert.ok(
      !/"orders\.read orders\.write"/.test(source),
      `${file} still sends a grant the connect page invented; the server owns the default`
    );
  }
});

console.log(failures === 0 ? "\nAll scope checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
