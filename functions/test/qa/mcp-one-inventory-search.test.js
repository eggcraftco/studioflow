// ONE inventory search. In every flag state. On every list a user or a model
// can see.
//
// The defect this pins: `search_inventory` (the older MCP handler, behind
// NIVADESK_MCP_INVENTORY) and `search_inventory_items` (the orchestrator
// capability, behind NIVADESK_MCP_ORCHESTRATOR) were two tools with the SAME
// title — "Search inventory" — over the same collection, and with both flags on
// `tools/list` served both. Neither was ever public; production runs with every
// MCP flag unset. They are one tool now (docs/mcp-inventory-search-decision.md),
// and the old name survives only as an internal alias.
//
// The check is written against the SHAPE of the defect rather than against the
// two names, because the next duplicate will not be called
// `search_inventory_items`. A published tool counts as an inventory search when
// its name or title says both "search-ish" and "stock-ish": that is the pair of
// words a user reads in a client's tool picker, and two entries that read the
// same way are the problem whatever they are called. `get_inventory_overview`
// is not one (no search verb) and `create_inventory_item` is not one (create is
// not a search verb) — both are asserted below, so the predicate is shown to
// discriminate rather than merely to pass.
//
// Run: node test/qa/mcp-one-inventory-search.test.js
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const INDEX = path.join(FUNCTIONS_DIR, "index.js");
const registry = require("../../orchestrator/registry");
const { createOrchestrator, CAPABILITY_ALIASES } = require("../../orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

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

const SEARCH_WORD = /(search|find|lookup|look_up|query|browse)/i;
const STOCK_WORD = /(inventory|stock|shelf)/i;

/** Does this published tool read, to a user, as "search the stock"? */
function isInventorySearch(tool) {
  const text = `${tool.name || ""} ${tool.title || ""}`;
  return SEARCH_WORD.test(text) && STOCK_WORD.test(text);
}

/**
 * The listing and the dispatcher's action list, as this deployment would serve
 * them under one flag state. A child process per state, because the flags are
 * read once at require time.
 */
function servedUnder(flags) {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify({
      tools: api._nvMcpToolsWithSecuritySchemes().map((tool) => ({ name: tool.name, title: tool.title })),
      actions: api._nvMcpAvailableActions()
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
 * 0. The predicate discriminates.
 * ------------------------------------------------------------------ */

check("the predicate catches an inventory search and nothing else on the shelf", () => {
  const all = served.get("inventory+orchestrator").tools;
  const byName = new Map(all.map((tool) => [tool.name, tool]));
  assert.ok(byName.has("search_inventory"), "the fully-flagged listing has no inventory search at all");
  assert.strictEqual(isInventorySearch(byName.get("search_inventory")), true);
  // Two neighbours that must NOT trip it, or "exactly one" would be a
  // tautology rather than a constraint.
  assert.strictEqual(isInventorySearch(byName.get("get_inventory_overview")), false,
    "the overview is not a search; if the predicate counts it, the counts below mean nothing");
  assert.strictEqual(isInventorySearch(byName.get("create_inventory_item")), false,
    "adding an item is not a search");
  // And a hypothetical second one, named nothing like the first, IS caught.
  assert.strictEqual(isInventorySearch({ name: "find_stock_rows", title: "Find stock" }), true,
    "the next duplicate will not be called search_inventory_items");
  assert.strictEqual(isInventorySearch({ name: "search_inventory_items", title: "Search inventory" }), true);
});

/* ------------------------------------------------------------------ *
 * 1. The invariant, over all eight flag states.
 * ------------------------------------------------------------------ */

check("no flag state publishes two inventory searches", () => {
  for (const [state, listing] of served) {
    const searches = listing.tools.filter(isInventorySearch).map((tool) => tool.name);
    assert.ok(searches.length <= 1,
      `${state}: tools/list carries ${searches.length} inventory searches (${searches.join(", ")}). ` +
      "One job, one tool — see docs/mcp-inventory-search-decision.md. If a second one is genuinely a " +
      "different job, its name and title have to say so, and the decision document has to say why.");
  }
});

check("no flag state makes two inventory searches dispatchable", () => {
  // The listing and the dispatcher were two lists once, and a tool hidden from
  // one answered on the other. A duplicate that is only reachable by name is
  // still a duplicate.
  for (const [state, listing] of served) {
    const searches = listing.actions.filter((name) => isInventorySearch({ name }));
    assert.ok(searches.length <= 1, `${state}: the dispatcher answers ${searches.length} inventory searches (${searches.join(", ")})`);
    const duplicates = listing.actions.filter((name, index) => listing.actions.indexOf(name) !== index);
    assert.deepStrictEqual(duplicates, [], `${state}: an action is listed twice: ${duplicates.join(", ")}`);
  }
});

check("the listing and the dispatcher agree about the inventory search, in every state", () => {
  for (const [state, listing] of served) {
    const published = listing.tools.filter(isInventorySearch).map((tool) => tool.name);
    const dispatchable = listing.actions.filter((name) => isInventorySearch({ name }));
    assert.deepStrictEqual(dispatchable, published,
      `${state}: the listing serves [${published}] and the dispatcher answers [${dispatchable}]`);
  }
});

check("with every flag off — production today — there is no inventory search at all", () => {
  // Stated as its own case because it is the fact that decided which tool is
  // canonical: the rule was "whichever is public in 1.1.1 is canonical", and
  // the answer was NEITHER. If this ever starts failing, an inventory surface
  // has escaped its flag into the reviewed listing.
  const off = served.get("all flags off");
  assert.strictEqual(off.tools.length, 19);
  assert.deepStrictEqual(off.tools.filter(isInventorySearch), []);
  assert.deepStrictEqual(off.actions.filter((name) => isInventorySearch({ name })), []);
});

/* ------------------------------------------------------------------ *
 * 2. The registry, which is where a duplicate would be born.
 * ------------------------------------------------------------------ */

check("the registry holds one inventory-search row, published by both inventory flags", () => {
  const rows = registry.TOOL_REGISTRY.filter(isInventorySearch);
  assert.strictEqual(rows.length, 1, `the registry has ${rows.length} inventory-search rows: ${rows.map((r) => r.name).join(", ")}`);
  assert.strictEqual(rows[0].name, "search_inventory");
  assert.deepStrictEqual(registry.flagsFor(rows[0]).slice().sort(), ["inventory", "orchestrator"],
    "the one inventory search must be publishable by either flag; otherwise a flag state exists with a create tool and no search");
  for (const flags of FLAG_STATES) {
    const published = registry.publishedEntries(flags).filter(isInventorySearch);
    assert.ok(published.length <= 1, `${label(flags)}: the registry publishes ${published.length} inventory searches`);
  }
});

check("the orchestrator offers one inventory search to a channel, too", () => {
  // A second channel reads the same table. A duplicate that MCP hides and
  // WhatsApp shows is the same defect with a different audience.
  const instance = createOrchestrator({ flags: { inventory: true, orchestrator: true } });
  for (const profile of [null, { capabilities: ["read"], security: { assurance_level: 1 } }]) {
    const names = instance.listCapabilities(profile ? { channelProfile: profile } : {});
    const searches = names.filter((name) => isInventorySearch({ name }));
    assert.deepStrictEqual(searches, ["search_inventory"], `a channel is offered ${searches.length} inventory searches`);
  }
});

/* ------------------------------------------------------------------ *
 * 3. The alias is an alias, not a second tool.
 * ------------------------------------------------------------------ */

check("search_inventory_items resolves, and is published nowhere", () => {
  assert.strictEqual(CAPABILITY_ALIASES.search_inventory_items, "search_inventory");
  assert.strictEqual(registry.entryFor("search_inventory_items"), null,
    "an alias with a registry row is a tool; the row is what puts a name on the wire");
  for (const [state, listing] of served) {
    assert.ok(!listing.tools.some((tool) => tool.name === "search_inventory_items"), `${state}: the alias is published`);
    assert.ok(!listing.actions.includes("search_inventory_items"), `${state}: the alias is dispatchable over MCP`);
  }
});

console.log(failures === 0 ? "\n✅ ONE INVENTORY SEARCH GEÇTİ" : `\n❌ ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
