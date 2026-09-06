// The eight capabilities that came OUT of 1.2.0, and the one thing that must
// stay true of them: they cannot come back by accident.
//
// On 6 September 2026 the operator reduced the flagged capability set to the
// read surface they were willing to ship — order search, and the workspace's
// ONE inventory search. Everything else that had been written behind
// NIVADESK_MCP_ORCHESTRATOR was taken out of the release: every banking
// capability, marketplace payouts, the sales and per-channel money summaries,
// the inventory valuation, connection health and the accounting sync status.
//
// "Out" was defined precisely, and this file is that definition executed:
//
//   1. no registry row          — so nothing can publish it under any flag;
//   2. nothing in the listing   — checked in all eight flag combinations, from
//                                 a child process per combination, because the
//                                 flags are read once at require time;
//   3. nothing dispatchable     — not in the MCP action list, not in HANDLERS,
//                                 not reachable through a capability alias, and
//                                 refused by run() with every flag on;
//   4. unreachable on disk      — the modules are still there and nothing on
//                                 the live require graph pulls them in.
//
// ON THE ONE HAND-WRITTEN LIST IN THIS FILE. Every other test that enumerates
// capabilities reads them from the registry, because the registry is what the
// deployment publishes. This file is the exception on purpose and can only be
// the exception: a name that has been removed is by definition not in the
// registry, so a denylist cannot be derived from it. What IS derived is the
// other half — REMOVED and the registry's own published set are asserted
// disjoint, and the published set is read live — so the day somebody adds a row
// back, this file fails rather than silently agreeing with it.
//
// Bringing one of these back is a decision, not a merge: add the registry row,
// the schema, the dispatcher case and the handler, and delete its name here.
//
// Run: node test/qa/mcp-reduced-surface.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const INDEX = path.join(FUNCTIONS_DIR, "index.js");
const registry = require("../../orchestrator/registry");
const contextModule = require("../../orchestrator/context");
const {
  createOrchestrator, HANDLERS, CAPABILITY_NAMES, CAPABILITY_ALIASES, resolveCapabilityName
} = require("../../orchestrator");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};
const asyncChecks = [];
const checkAsync = (name, run) => { asyncChecks.push([name, run]); };

/** The eight names, and the one-line reason each is not in this release. */
const REMOVED = Object.freeze({
  get_business_attention_summary: "spans payments, banking, payouts and accounting — a financial summary by any other name",
  get_commerce_overview: "gross sales, refunds, VAT and platform fees: payment amounts",
  get_channel_performance: "the same money, per channel, plus profit and margin",
  get_inventory_overview: "counts stock and values it — 'what the shelf is worth' is a money figure",
  get_payout_reconciliation_overview: "marketplace payouts against the bank",
  get_integration_health: "operational, but its answer is the workspace's bank and accounting connection roster",
  get_accounting_sync_status: "accounting",
  get_banking_attention_summary: "banking"
});
const REMOVED_NAMES = Object.freeze(Object.keys(REMOVED));

/** The modules behind them, which may stay on disk but must stay unreachable. */
const ORPHANED_MODULES = Object.freeze([
  "orchestrator/attention.js",
  "orchestrator/payouts.js",
  "orchestrator/integrationHealth.js",
  "orchestrator/accountingStatus.js"
]);

/** Every combination of the three review flags — eight, not a chosen few. */
const FLAG_STATES = [];
for (const emailReceipts of [false, true]) {
  for (const inventory of [false, true]) {
    for (const orchestrator of [false, true]) {
      FLAG_STATES.push({ emailReceipts, inventory, orchestrator });
    }
  }
}
const label = (flags) => Object.entries(flags).filter(([, on]) => on).map(([key]) => key).join("+") || "all flags off";

function servedUnder(flags) {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify({
      tools: api._nvMcpToolsWithSecuritySchemes().map((tool) => tool.name),
      actions: api._nvMcpAvailableActions(),
      logged: [...api._nvMcpPiiLoggedActions()]
    }));
  `;
  const out = execFileSync(process.execPath, ["-e", script], {
    cwd: FUNCTIONS_DIR,
    env: {
      ...process.env,
      NIVADESK_MCP_EMAIL_RECEIPTS: flags.emailReceipts ? "1" : "0",
      NIVADESK_MCP_INVENTORY: flags.inventory ? "1" : "0",
      NIVADESK_MCP_ORCHESTRATOR: flags.orchestrator ? "1" : "0"
    },
    maxBuffer: 40 * 1024 * 1024
  }).toString();
  return JSON.parse(out.trim().split("\n").pop());
}

const served = new Map(FLAG_STATES.map((flags) => [label(flags), servedUnder(flags)]));

/* ------------------------------------------------------------------ *
 * 0. The denylist and the registry are two halves of one statement.
 * ------------------------------------------------------------------ */

check("the removed set and the published set are disjoint, in every flag state", () => {
  // The half that is derived. REMOVED is written down; what it is compared
  // against is read from the registry, so this fails the moment a row returns.
  for (const flags of FLAG_STATES) {
    const published = registry.publishedNames(flags);
    for (const name of REMOVED_NAMES) {
      assert.ok(!published.includes(name),
        `${name} has a registry row again and is published under ${label(flags)} — ${REMOVED[name]}`);
    }
  }
  // And it is not vacuous: the reduced set is what it says it is.
  const orchestratorAdds = registry.publishedNames({ orchestrator: true })
    .filter((name) => !registry.publishedNames({}).includes(name));
  assert.deepStrictEqual(orchestratorAdds, ["search_inventory", "search_commerce_orders"],
    "the orchestrator flag publishes something other than the two capabilities the reduction kept");
});

check("no removed name has a registry row at all", () => {
  for (const name of REMOVED_NAMES) {
    assert.strictEqual(registry.entryFor(name), null, `${name} is back in the registry table`);
  }
});

/* ------------------------------------------------------------------ *
 * 1. Nothing is listed. Eight flag states, one child process each.
 * ------------------------------------------------------------------ */

check("no flag state lists a removed capability", () => {
  for (const [state, { tools }] of served) {
    for (const name of REMOVED_NAMES) {
      assert.ok(!tools.includes(name), `${name} appears in tools/list under ${state}`);
    }
  }
});

check("the listing every flag state serves is exactly what the registry publishes", () => {
  // Not just "the removed ones are absent" — the listing and the registry are
  // the same set, so a tool cannot be published from a literal in index.js
  // while the registry says nothing about it.
  for (const flags of FLAG_STATES) {
    const state = label(flags);
    assert.deepStrictEqual(served.get(state).tools, registry.publishedNames(flags),
      `the listing under ${state} is not the registry's published set`);
  }
});

/* ------------------------------------------------------------------ *
 * 2. Nothing is dispatchable.
 * ------------------------------------------------------------------ */

check("no flag state can dispatch a removed capability", () => {
  for (const [state, { actions, logged }] of served) {
    for (const name of REMOVED_NAMES) {
      assert.ok(!actions.includes(name), `${name} is still a dispatchable action under ${state}`);
      assert.ok(!logged.includes(name), `${name} still has an access-log row waiting for it under ${state}`);
    }
  }
});

check("the handler table and the alias table have forgotten them too", () => {
  for (const name of REMOVED_NAMES) {
    assert.ok(!Object.prototype.hasOwnProperty.call(HANDLERS, name), `HANDLERS still answers ${name}`);
    assert.ok(!CAPABILITY_NAMES.includes(name), `${name} is still a capability name`);
    assert.strictEqual(resolveCapabilityName(name), name,
      `${name} is aliased to something that still runs, which is the same tool under a second spelling`);
  }
  for (const target of Object.values(CAPABILITY_ALIASES)) {
    assert.ok(!REMOVED_NAMES.includes(target), `an alias resolves to the removed capability ${target}`);
  }
  // The two halves agree in the other direction as well: every handler has a
  // registry row, so nothing is runnable that nothing publishes.
  for (const name of Object.keys(HANDLERS)) {
    assert.ok(registry.entryFor(name), `${name} is dispatchable and has no registry row`);
  }
});

checkAsync("run() refuses every removed capability with all three flags on", async () => {
  const snapshot = fixtures.mixedSnapshot();
  const orchestrator = createOrchestrator({
    flags: { emailReceipts: true, inventory: true, orchestrator: true },
    now: () => snapshot.nowMs,
    loaders: {
      loadCompany: async () => ({ companyData: { ownerUid: "u_owner" }, settings: fixtures.settings }),
      snapshotFor: async () => snapshot
    }
  });
  const ctx = fixtures.ownerContext();
  for (const name of REMOVED_NAMES) {
    await assert.rejects(
      () => orchestrator.run({ capability: name, args: {}, ctx }),
      (error) => error instanceof contextModule.OrchestratorError && /Unknown capability/.test(error.message),
      `${name} was not refused with every flag on`
    );
  }
});

/* ------------------------------------------------------------------ *
 * 3. The modules are on disk, and nothing reaches them.
 * ------------------------------------------------------------------ */

check("nothing on the live require graph pulls an orphaned module in", () => {
  // The strongest available proof, and the reason it runs in a child process:
  // require.cache after loading the orchestrator IS the reachable set. A lazy
  // `require()` inside a dead branch of a live module — commerce.js has one,
  // for payouts — does not load the file, and this is what says so.
  const script = `
    require(${JSON.stringify(path.join(FUNCTIONS_DIR, "orchestrator"))});
    console.log(JSON.stringify(Object.keys(require.cache)));
  `;
  const loaded = JSON.parse(execFileSync(process.execPath, ["-e", script], {
    cwd: FUNCTIONS_DIR, maxBuffer: 40 * 1024 * 1024
  }).toString().trim().split("\n").pop());
  for (const relative of ORPHANED_MODULES) {
    const absolute = path.join(FUNCTIONS_DIR, relative);
    assert.ok(!loaded.includes(absolute),
      `${relative} was loaded by requiring the orchestrator, so it is reachable again`);
  }
});

check("render.js branches on names it can never be handed", () => {
  // render.js is NOT an orphaned module — it is on the live path, and it still
  // carries a summary branch for each of the eight removed capabilities. Those
  // branches are dead rather than reachable, and this is the proof rather than
  // the assumption: `summaryFor` has exactly one caller, `run()` at
  // orchestrator/index.js, which passes the capability it just dispatched — and
  // run() refuses every removed name (checked above, with all three flags on).
  // So a removed name cannot reach the renderer even though the renderer would
  // still recognise it.
  //
  // They are left in place because the reduction did not need to touch this
  // file, and a diff that rewrites a live module to delete unreachable branches
  // is a refactor riding along with a scope change. What is not left to
  // assumption is the claim: every capability name render.js tests for must be
  // one run() can actually produce, or one run() provably refuses.
  const source = fs.readFileSync(path.join(FUNCTIONS_DIR, "orchestrator", "render.js"), "utf8");
  const branched = [...source.matchAll(/capability === "([a-z_]+)"/g)].map((match) => match[1]);
  assert.ok(branched.length > 0, "render.js no longer branches on the capability; rewrite this check");
  for (const name of new Set(branched)) {
    const dispatchable = CAPABILITY_NAMES.includes(name);
    assert.ok(dispatchable || REMOVED_NAMES.includes(name),
      `render.js renders "${name}", which is neither dispatchable nor one of the names this file proves unreachable`);
  }
  // And the renderer's only caller is the one that gates it.
  const runner = fs.readFileSync(path.join(FUNCTIONS_DIR, "orchestrator", "index.js"), "utf8");
  assert.strictEqual((runner.match(/render\.summaryFor\(/g) || []).length, 1,
    "render.summaryFor has more than one caller; the unreachability argument above covers only run()");
});

check("the orphaned modules are still on disk, unchanged and unpublished", () => {
  // They stay because deleting them would churn a diff the reduction did not
  // need to touch. The claim being made about them is only ever "unreachable",
  // so the file existing is part of the fixture this test describes.
  const fs = require("fs");
  for (const relative of ORPHANED_MODULES) {
    assert.ok(fs.existsSync(path.join(FUNCTIONS_DIR, relative)), `${relative} is gone; update this test with it`);
  }
});

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  if (failures > 0) {
    console.error(`\n❌ ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\n✅ REDUCED MCP SURFACE GEÇTİ");
})();
