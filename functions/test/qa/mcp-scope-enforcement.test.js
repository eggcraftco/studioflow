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
//   2. HALF A SURFACE. Only the ten orchestrator capabilities were checked at
//      all; the 19 tools dispatched through nvChatGPTDispatchAction were not,
//      so `get_financial_overview` answered a token with no finance.read while
//      `get_commerce_overview` refused the same token.
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

check("a delegated token that carries no scope may do nothing", () => {
  // The fail-open branch. An empty grant is not every grant.
  const empty = fixtures.ownerContext({ scope: [] });
  for (const name of ["get_commerce_overview", "get_inventory_overview", "get_banking_attention_summary"]) {
    assert.throws(
      () => context.assertCapability(empty, registry.entryFor(name)),
      /not granted any scope/,
      `${name} answered a token that was granted nothing`
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
  // The gates that are not about scope still apply to them.
  const noBank = fixtures.ownerContext({ authType: "firebase_session", scope: [], isOwner: false, areas: { orders: true, bankFeed: false } });
  assert.throws(() => context.assertCapability(noBank, registry.entryFor("get_banking_attention_summary")), /Bank Spending/);
});

check("a token missing one scope is refused, and told which", () => {
  const ctx = fixtures.ownerContext({ scope: ["orders.read", "orders.write"] });
  assert.throws(
    () => context.assertCapability(ctx, registry.entryFor("get_commerce_overview")),
    /was not granted the finance\.read scope/
  );
  const full = fixtures.ownerContext({ scope: ["orders.read", "finance.read"] });
  assert.doesNotThrow(() => context.assertCapability(full, registry.entryFor("get_commerce_overview")));
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
    () => api._nvMcpAssertScope(token("orders.read orders.write"), "get_commerce_overview"),
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

check("a connection minted with no explicit scope can call everything tools/list advertises", () => {
  const api = require("../../index");
  const granted = context.scopeSet(api._nvOAuthDefaultScope());
  assert.deepStrictEqual([...granted].sort(), [...registry.SCOPES_SUPPORTED].sort());
  for (const entry of registry.publishedEntries({ emailReceipts: true, inventory: true, orchestrator: true })) {
    const missing = context.missingScopes({ authType: "chatgpt_oauth", scope: api._nvOAuthDefaultScope() }, entry.scopes);
    assert.deepStrictEqual(missing, [], `${entry.name} is advertised but a default-scope connection cannot call it`);
  }
});

check("the 401 challenge asks for the grant the listing needs", () => {
  // A client that takes WWW-Authenticate at its word asks for exactly what it
  // names. This header named three read scopes, so a connection built from it
  // could not call create_order or add_order_note — the fourth place with its
  // own opinion about what a connection gets. studioflow-web's proxy already
  // emits the full list when the function sets no header of its own.
  const challenge = indexSource.slice(
    indexSource.indexOf("function nvSendMcpOAuthChallenge("),
    indexSource.indexOf("\n}\n", indexSource.indexOf("function nvSendMcpOAuthChallenge("))
  );
  assert.ok(/scope="\$\{nvOAuthDefaultScope\(\)\}"/.test(challenge),
    "the challenge names a scope list of its own again");
});

check("no mint site invents a narrower grant of its own", () => {
  // Three places used to answer "what does this connection get?" and they did
  // not agree: registration promised six, the challenge asked for six, and
  // authorize/approve issued two.
  const mintSites = indexSource.match(/scope[^\n]*"orders\.read orders\.write"/g) || [];
  assert.deepStrictEqual(mintSites, [], `a hand-typed default grant is back: ${mintSites.join(" | ")}`);
  const web = path.join(FUNCTIONS_DIR, "..", "studioflow-web", "app", "chatgpt", "connect");
  for (const file of ["ChatGPTConnectClient.tsx", "page.tsx"]) {
    const source = fs.readFileSync(path.join(web, file), "utf8");
    assert.ok(
      !/"orders\.read orders\.write"/.test(source),
      `${file} still sends a grant the connect page invented; the server owns the default`
    );
  }
});

check("the advertised metadata and the registry are one list", () => {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    const registry = require(${JSON.stringify(path.join(FUNCTIONS_DIR, "orchestrator", "registry.js"))});
    console.log(JSON.stringify({ default: api._nvOAuthDefaultScope(), supported: registry.SCOPES_SUPPORTED }));
  `;
  const out = execFileSync(process.execPath, ["-e", script], {
    cwd: FUNCTIONS_DIR,
    env: { ...process.env, NIVADESK_MCP_ORCHESTRATOR: "1" },
    maxBuffer: 16 * 1024 * 1024
  }).toString();
  const served = JSON.parse(out.trim().split("\n").pop());
  assert.strictEqual(served.default, served.supported.join(" "));
  // The exact bytes the OAuth metadata documents have always advertised.
  assert.strictEqual(served.default, "orders.read orders.write notes.read notes.write finance.read tasks.write");
});

console.log(failures === 0 ? "\nAll scope checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
