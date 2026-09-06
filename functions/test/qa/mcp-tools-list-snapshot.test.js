// The published tool list, pinned byte for byte (§20, §30).
//
// The rule this enforces is the operator's, not a style preference: the listing
// serving the connection OpenAI is reviewing does not change because somebody
// merged a branch. Every new capability ships behind NIVADESK_MCP_ORCHESTRATOR,
// default off, and flipping it is a submission decision.
//
// The four flag states without that flag were recorded from index.js BEFORE the
// orchestrator existed, so this is evidence rather than a photograph of
// whatever the code does today. If one of them fails, the reviewed surface
// moved.
//
// The TWO orchestrator states are a different kind of record: they are the 1.2.0
// proposal, re-recorded whenever it deliberately changes. They were compared by
// nothing for a while, and went stale by exactly the defect 70c474fd says "can
// never appear in a published listing again" — the `inventory+orchestrator`
// state on disk carried 31 tools including BOTH `search_inventory` and
// `search_inventory_items`, the duplicate this branch was written to remove,
// while the builder produced 30. A fixture nothing reads records whatever was
// true the day somebody wrote it, and a `--write` regeneration would have put
// the defect back.
//
// Run: node test/qa/mcp-tools-list-snapshot.test.js
//      node test/qa/mcp-tools-list-snapshot.test.js --write   (re-record)
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const INDEX = path.join(FUNCTIONS_DIR, "index.js");
const FIXTURE = path.join(FUNCTIONS_DIR, "test", "fixtures", "mcp", "tools-list-full.json");
// How many capabilities the flag adds is READ FROM THE REGISTRY, never counted
// out here. The scope reduction of 6 September 2026 took the flagged set from
// ten down to two, and a literal `+ 10` in this file was one of the places that
// said ten after it was two — a hand-written count of a published surface is a
// second registry that nothing updates.
const registry = require("../../orchestrator/registry");
const ORCHESTRATOR_ADDS = registry.publishedNames({ orchestrator: true })
  .filter((name) => !registry.publishedNames({}).includes(name));
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const FLAG_STATES = {
  "off": { emailReceipts: false, inventory: false, orchestrator: false },
  "emailReceipts": { emailReceipts: true, inventory: false, orchestrator: false },
  "inventory": { emailReceipts: false, inventory: true, orchestrator: false },
  "emailReceipts+inventory": { emailReceipts: true, inventory: true, orchestrator: false },
  "orchestrator": { emailReceipts: false, inventory: false, orchestrator: true },
  "inventory+orchestrator": { emailReceipts: false, inventory: true, orchestrator: true }
};

/** The whole listing — names, descriptions, schemas, annotations, scopes. */
function served(flags) {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify({ tools: api._nvMcpToolsWithSecuritySchemes() }));
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

const listings = {};
for (const [label, flags] of Object.entries(FLAG_STATES)) listings[label] = served(flags);

// `--write` re-records the two ORCHESTRATOR states only. The four flag-off
// states are evidence about a listing recorded before the orchestrator existed;
// regenerating those would destroy the only thing they prove, so this refuses
// to touch them and the checks below still compare them.
if (process.argv.includes("--write")) {
  const next = { ...fixture, states: { ...fixture.states } };
  for (const label of ["orchestrator", "inventory+orchestrator"]) next.states[label] = listings[label];
  fs.writeFileSync(FIXTURE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`re-recorded the orchestrator states (${listings.orchestrator.tools.length} and ${listings["inventory+orchestrator"].tools.length} tools)`);
  console.log("the four flag-off states were NOT touched: they are the pre-orchestrator recording");
  process.exit(0);
}

for (const label of ["off", "emailReceipts", "inventory", "emailReceipts+inventory"]) {
  check(`the reviewed listing is byte-identical with the orchestrator flag off (${label})`, () => {
    const expected = fixture.states[label];
    assert.ok(expected, `no recording for flag state ${label}`);
    assert.strictEqual(
      JSON.stringify(listings[label]),
      JSON.stringify(expected),
      `${label}: the published tool list changed. With NIVADESK_MCP_ORCHESTRATOR off it must equal what OpenAI is reviewing, to the byte. If the change is intended it is a submission decision, not a merge.`
    );
  });
}

for (const label of ["orchestrator", "inventory+orchestrator"]) {
  check(`the recorded 1.2.0 proposal is what the builder serves (${label})`, () => {
    // Nothing compared these two, so they aged into a record of the duplicate
    // inventory search. A recording that nothing reads is not evidence; it is a
    // trap for the next `--write`.
    const expected = fixture.states[label];
    assert.ok(expected, `no recording for flag state ${label}`);
    assert.strictEqual(
      JSON.stringify(listings[label]),
      JSON.stringify(expected),
      `${label}: the recorded 1.2.0 listing is not what the builder produces. If the change is intended, re-record with --write and say what moved in the fixture's note.`
    );
  });
}

check("neither recorded orchestrator state carries two inventory searches", () => {
  // The defect itself, asserted against the FIXTURE rather than the builder —
  // mcp-one-inventory-search.test.js already holds the builder to it, and the
  // file on disk is what a reviewer diffs and what `--write` starts from.
  for (const label of ["orchestrator", "inventory+orchestrator"]) {
    const names = fixture.states[label].tools.map((tool) => tool.name);
    assert.ok(!names.includes("search_inventory_items"),
      `${label}: search_inventory_items is an internal alias and was never a published tool`);
    const searches = names.filter((name) => /^search_inventor/.test(name));
    assert.deepStrictEqual(searches, ["search_inventory"],
      `${label}: the recorded listing offers ${searches.length} inventory searches over one collection`);
  }
});

check("with the flag off, the nineteen reviewed tools are all that is served", () => {
  assert.strictEqual(listings.off.tools.length, 19);
  const names = listings.off.tools.map((tool) => tool.name);
  assert.ok(!names.some((name) => /commerce|attention|integration_health|accounting_sync|payout_reconciliation|inventory/.test(name)),
    `an orchestrator tool escaped the flag: ${names.join(", ")}`);
});

check("with the flag on, the list only GAINS tools — nothing is removed or reordered", () => {
  const before = listings.off.tools.map((tool) => tool.name);
  const after = listings.orchestrator.tools.map((tool) => tool.name);
  assert.deepStrictEqual(after.slice(0, before.length), before, "the existing tools must keep their names and their order");
  assert.deepStrictEqual(after.slice(before.length), ORCHESTRATOR_ADDS,
    `the flag adds ${after.length - before.length} tool(s); the registry publishes ${ORCHESTRATOR_ADDS.length}`);
});

check("the flag-on listing differs from the reviewed one ONLY by the new tools and the two known annotation corrections", () => {
  // The corrections create_order/update_order_status carry are the ones the
  // runtime audit found; they ride the same submission flag. Anything else
  // changing here is an accident.
  const before = new Map(listings.off.tools.map((tool) => [tool.name, tool]));
  const changed = [];
  for (const tool of listings.orchestrator.tools) {
    const previous = before.get(tool.name);
    if (!previous) continue;
    if (JSON.stringify(previous) !== JSON.stringify(tool)) changed.push(tool.name);
  }
  assert.deepStrictEqual(changed.sort(), ["create_order", "update_order_status"],
    `unexpected changes to reviewed tools: ${changed.join(", ")}`);
});

check("every new capability is fully described: title, description, schema, annotations, scopes", () => {
  const existing = new Set(listings.off.tools.map((tool) => tool.name));
  const added = listings.orchestrator.tools.filter((tool) => !existing.has(tool.name));
  assert.deepStrictEqual(added.map((tool) => tool.name), ORCHESTRATOR_ADDS);
  for (const tool of added) {
    assert.ok(tool.title && tool.title.length > 3, `${tool.name} has no title`);
    assert.ok(tool.description && tool.description.length > 120, `${tool.name}: the description must tell the model when to use it (§21)`);
    assert.strictEqual(tool.inputSchema.type, "object");
    assert.strictEqual(tool.inputSchema.additionalProperties, false, `${tool.name} accepts undeclared arguments`);
    assert.ok(/companyId/.test(JSON.stringify(tool.inputSchema.properties)), `${tool.name} must accept companyId as an optional lookup key`);
    assert.ok(/Do not ask for companyId/.test(tool.description), `${tool.name} must tell the model not to ask for a workspace id`);
    for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
      assert.strictEqual(typeof tool.annotations[hint], "boolean", `${tool.name}.${hint} is not an explicit boolean`);
    }
    assert.strictEqual(tool.annotations.readOnlyHint, true, `${tool.name} is published as a read capability`);
    assert.strictEqual(tool.annotations.openWorldHint, false, `${tool.name} contacts nothing outside NivaDesk`);
    const scopes = tool.securitySchemes[0].scopes;
    assert.ok(Array.isArray(scopes) && scopes.length > 0, `${tool.name} advertises no scope`);
    assert.ok(scopes.every((scope) => /\.read$/.test(scope)), `${tool.name} is a read capability but asks for ${scopes.join(", ")}`);
  }
});

check("the inventory flag and the orchestrator flag compose, and publish nothing twice", () => {
  // This used to assert a CONCATENATION — inventoryOnly followed by the ten the
  // orchestrator adds — which is exactly why it passed while `tools/list`
  // carried two "Search inventory" tools over one collection. Concatenating two
  // lists cannot notice that a name is in both of them.
  //
  // The two flags now share one tool on purpose: `search_inventory` is the
  // workspace's only inventory search and either flag may publish it
  // (docs/mcp-inventory-search-decision.md). So the relation is a set union,
  // and what is worth asserting is that the union carries no duplicate.
  const both = listings["inventory+orchestrator"].tools.map((tool) => tool.name);
  const inventoryOnly = listings.inventory.tools.map((tool) => tool.name);
  const orchestratorOnly = listings.orchestrator.tools.map((tool) => tool.name);

  assert.deepStrictEqual([...new Set(both)], both,
    `a tool is published twice with both flags on: ${both.filter((name, i) => both.indexOf(name) !== i).join(", ")}`);
  assert.deepStrictEqual(
    both.slice().sort(),
    [...new Set([...inventoryOnly, ...orchestratorOnly])].sort(),
    "with both flags on the listing is neither more nor less than what each flag publishes on its own"
  );
  // The shared tool, named, so "the union has no duplicates" is a claim about a
  // real overlap rather than a vacuous one.
  assert.ok(inventoryOnly.includes("search_inventory") && orchestratorOnly.includes("search_inventory"),
    "search_inventory is published by either flag; if that stops being true this check has stopped testing an overlap");
  assert.strictEqual(both.filter((name) => name === "search_inventory").length, 1);
  assert.ok(!both.includes("search_inventory_items"),
    "search_inventory_items is an internal alias, never a published tool");
});

check("the initialize instructions describe what the flag state actually serves", () => {
  const instructionsFor = (flags) => {
    const script = `
      const api = require(${JSON.stringify(INDEX)});
      console.log(JSON.stringify(api._nvMcpInitializeResult ? api._nvMcpInitializeResult("2025-06-18") : null));
    `;
    const out = execFileSync(process.execPath, ["-e", script], {
      cwd: FUNCTIONS_DIR,
      env: {
        ...process.env,
        NIVADESK_MCP_EMAIL_RECEIPTS: "0",
        NIVADESK_MCP_INVENTORY: flags.inventory ? "1" : "0",
        NIVADESK_MCP_ORCHESTRATOR: flags.orchestrator ? "1" : "0"
      }
    }).toString();
    const parsed = JSON.parse(out.trim().split("\n").pop());
    return parsed ? parsed.instructions : null;
  };
  const off = instructionsFor({ orchestrator: false });
  const on = instructionsFor({ orchestrator: true });
  if (off === null) return; // the helper is not exported; nothing to check
  assert.ok(!/Cross-channel reads/.test(off), "the flag-off instructions must not advertise tools that are not served");
  assert.ok(/Cross-channel reads/.test(on), "the flag-on instructions must say the new domains exist");
  assert.ok(/stale|incomplete/i.test(on), "§14: the model has to be told never to present stale data as live");
});

check("the fixture says where it came from, and how far that goes", () => {
  assert.ok(/before the orchestrator capabilities existed/i.test(fixture.note),
    "the recording's provenance is the whole reason it is evidence; keep it written down");
  // And the limit of the evidence, which the note used to overclaim: it said
  // the four flag-off states are "independent evidence that the listing OpenAI
  // is reviewing did not move". bc718e06 is a commit on THIS branch, so what
  // the fixture proves is that the listing has not moved since it was recorded
  // — between the merge base and that commit it moved by three tools, four
  // annotation values and two descriptions, all of them intended.
  assert.ok(/NOT the deployed/i.test(fixture.note) && /since it was recorded/i.test(fixture.note),
    "the note claims more than a branch-internal recording can: say what it does not prove");
  assert.ok(/before the flip/i.test(fixture.note),
    "the note must name the one thing that closes the gap: diff it against the live listing once");
});

console.log(failures === 0 ? "\nAll tools/list snapshot checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
