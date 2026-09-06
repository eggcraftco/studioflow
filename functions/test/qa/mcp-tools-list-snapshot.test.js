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
// Run: node test/qa/mcp-tools-list-snapshot.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const INDEX = path.join(FUNCTIONS_DIR, "index.js");
const FIXTURE = path.join(FUNCTIONS_DIR, "test", "fixtures", "mcp", "tools-list-full.json");
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
  assert.strictEqual(after.length, before.length + 10, `expected ten new capabilities, got ${after.length - before.length}`);
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
  assert.strictEqual(added.length, 10);
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

check("the inventory flag and the orchestrator flag do not interfere", () => {
  const both = listings["inventory+orchestrator"].tools.map((tool) => tool.name);
  const inventoryOnly = listings.inventory.tools.map((tool) => tool.name);
  const orchestratorOnly = listings.orchestrator.tools.map((tool) => tool.name);
  assert.deepStrictEqual(both, [...inventoryOnly, ...orchestratorOnly.slice(19)]);
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

check("the fixture says where it came from", () => {
  assert.ok(/BEFORE the orchestrator/.test(fixture.note),
    "the recording's provenance is the whole reason it is evidence; keep it written down");
});

console.log(failures === 0 ? "\nAll tools/list snapshot checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
