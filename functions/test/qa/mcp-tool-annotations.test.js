// Every published MCP tool says what it does, in four explicit booleans, with
// a reason for each — and the listing OpenAI is reviewing does not move.
//
// OpenAI rejected NivaDesk 1.1.1 with "annotations do not appear to match the
// tool's behavior ... explicitly set to true or false (not null) for every tool
// ... include a clear justification". This test is the standing answer to all
// three halves of that: no hint may be null or missing, every hint carries a
// justification, and the values on the wire are pinned to a fixture so a future
// edit cannot quietly change the surface a reviewer already looked at.
//
// The fixture's "off" and "inventory" projections were recorded from index.js
// at commit d4399da1 — before the hints moved into orchestrator/registry.js —
// so they are independent evidence rather than a copy of what this code
// happens to produce today.
//
// Run: node test/qa/mcp-tool-annotations.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const INDEX = path.join(FUNCTIONS_DIR, "index.js");
const REGISTRY_PATH = path.join(FUNCTIONS_DIR, "orchestrator", "registry.js");
const FIXTURE = path.join(FUNCTIONS_DIR, "test", "fixtures", "mcp", "tools-list-annotations.json");
const DOC = path.join(FUNCTIONS_DIR, "..", "docs", "mcp-tool-annotations.md");

const registry = require(REGISTRY_PATH);
const registrySource = fs.readFileSync(REGISTRY_PATH, "utf8");
const indexSource = fs.readFileSync(INDEX, "utf8");
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const doc = fs.readFileSync(DOC, "utf8");

const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const FLAG_STATES = {
  "off": {},
  "inventory": { inventory: true },
  "orchestrator": { orchestrator: true },
  "inventory+orchestrator": { inventory: true, orchestrator: true }
};

let failures = 0;
function check(name, run) {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
}

/* ------------------------------------------------------------------ *
 * 1. Every hint is an explicit boolean, in every flag state.
 * ------------------------------------------------------------------ */

check("no published tool has a null or missing hint, under any flag combination", () => {
  for (const [label, flags] of Object.entries(FLAG_STATES)) {
    const names = registry.publishedNames(flags);
    assert.ok(names.length > 0, `${label}: nothing published`);
    for (const name of names) {
      const annotations = registry.annotationsFor(name, flags);
      assert.deepStrictEqual(
        Object.keys(annotations), HINTS,
        `${label}/${name}: expected exactly the four hints in wire order, got ${Object.keys(annotations).join(", ")}`
      );
      for (const hint of HINTS) {
        const value = annotations[hint];
        assert.notStrictEqual(value, null, `${label}/${name}.${hint} is null`);
        assert.notStrictEqual(value, undefined, `${label}/${name}.${hint} is missing`);
        assert.strictEqual(typeof value, "boolean", `${label}/${name}.${hint} is ${typeof value}, not a boolean`);
      }
    }
  }
});

check("every hint is a literal true/false in the registry source, not an expression", () => {
  const start = registrySource.indexOf("const TOOL_REGISTRY = [");
  const end = registrySource.indexOf("\n];", start);
  assert.ok(start > 0 && end > start, "could not find the registry table in the source");
  const table = registrySource.slice(start, end);

  for (const hint of HINTS) {
    const occurrences = table.match(new RegExp(`${hint}\\s*:`, "g")) || [];
    const literals = table.match(new RegExp(`${hint}\\s*:\\s*(?:true|false)\\b`, "g")) || [];
    // Each entry has an `annotations` block; two entries also carry the frozen
    // 1.1.1 `liveAnnotations`. The justification map repeats the four keys once
    // per entry, and those values are strings.
    const annotationBlocks = registry.TOOL_REGISTRY.length + registry.TOOL_REGISTRY.filter((e) => e.liveAnnotations).length;
    const justificationLines = registry.TOOL_REGISTRY.length;
    assert.strictEqual(
      occurrences.length, annotationBlocks + justificationLines,
      `${hint} appears ${occurrences.length} times in the table; expected ${annotationBlocks + justificationLines}`
    );
    assert.strictEqual(
      literals.length, annotationBlocks,
      `${hint} has ${literals.length} literal boolean values; expected ${annotationBlocks}. A hint written as anything but a bare true/false is what the rejection was about.`
    );
    assert.ok(!new RegExp(`${hint}\\s*:\\s*null`).test(table), `${hint} is set to null somewhere in the table`);
  }
});

check("every hint carries its own reason", () => {
  for (const entry of registry.TOOL_REGISTRY) {
    const lines = registry.justificationFor(entry.name);
    assert.deepStrictEqual(Object.keys(lines).sort(), [...HINTS].sort(), `${entry.name}: justification keys`);
    for (const hint of HINTS) {
      assert.ok(typeof lines[hint] === "string" && lines[hint].trim().length >= 20, `${entry.name}.${hint}: no justification`);
      assert.ok(/^Because /.test(lines[hint]), `${entry.name}.${hint}: justification must read as a reason ("Because ...")`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * 2. The values are defensible, not just present.
 * ------------------------------------------------------------------ */

check("openWorldHint and the declared effects agree", () => {
  // The check that would have caught 1.1.1: create_order and
  // update_order_status both reach the customer through
  // notifyCustomerOnStatusChange, and both shipped openWorldHint false.
  for (const entry of registry.TOOL_REGISTRY) {
    const open = entry.annotations.openWorldHint;
    if (entry.effects.length > 0) {
      assert.strictEqual(open, true, `${entry.name} declares effects [${entry.effects}] but claims openWorldHint false`);
    } else {
      assert.strictEqual(open, false, `${entry.name} claims openWorldHint true but names no effect`);
    }
  }
  // And the two tools whose write fires the customer notification say so.
  for (const name of ["create_order", "update_order_status"]) {
    assert.ok(registry.effectsFor(name).includes("customer_message"), `${name} must declare customer_message`);
    assert.ok(
      /notifyCustomerOnStatusChange/.test(registry.justificationFor(name).openWorldHint),
      `${name}: the openWorldHint reason must name the trigger it depends on`
    );
  }
});

check("the runtime still has the trigger the openWorldHint values rest on", () => {
  // If somebody deletes or renames the notification trigger, two openWorldHint
  // values become false and this test is where that is noticed.
  assert.ok(
    /exports\.notifyCustomerOnStatusChange\s*=\s*onDocumentWritten\(/.test(indexSource),
    "notifyCustomerOnStatusChange is no longer an onDocumentWritten trigger"
  );
  assert.ok(
    /document:\s*"siparisler\/\{orderId\}"/.test(indexSource),
    "the notification trigger no longer listens on siparisler/{orderId}"
  );
});

check("a read tool that hands over people discloses its access-log row", () => {
  for (const entry of registry.TOOL_REGISTRY) {
    if (entry.annotations.readOnlyHint === true && entry.piiAccessLogged) {
      assert.ok(
        /piiAccessLog/.test(entry.justification.readOnlyHint),
        `${entry.name}: readOnlyHint is true and the dispatcher writes an access-log row; the reason must say so on the tool, not only in a design document`
      );
    }
  }
});

check("piiAccessLogged matches the dispatcher's own list", () => {
  // MCP_ACTIONS_READING_PII decides which tools file a piiAccessLog row. The
  // registry claims about the access log have to come from that set, not from
  // an opinion about which tools feel sensitive.
  const start = indexSource.indexOf("const MCP_ACTIONS_READING_PII = new Set([");
  const end = indexSource.indexOf("]);", start);
  assert.ok(start > 0 && end > start, "could not read MCP_ACTIONS_READING_PII");
  const logged = new Set((indexSource.slice(start, end).match(/"([a-z_]+)"/g) || []).map((s) => s.slice(1, -1)));
  for (const entry of registry.TOOL_REGISTRY) {
    assert.strictEqual(
      entry.piiAccessLogged, logged.has(entry.name),
      `${entry.name}: registry says piiAccessLogged=${entry.piiAccessLogged}, dispatcher says ${logged.has(entry.name)}`
    );
  }
});

check("assertRegistry refuses the mistakes it exists for", () => {
  const clone = () => JSON.parse(JSON.stringify(registry.TOOL_REGISTRY));
  const rejects = (mutate, why) => {
    const table = clone();
    mutate(table);
    assert.throws(() => registry.assertRegistry(table), /MCP tool registry/, `should have refused: ${why}`);
  };

  rejects((t) => { t[0].annotations.readOnlyHint = null; }, "a null hint");
  rejects((t) => { delete t[0].annotations.openWorldHint; }, "a missing hint");
  rejects((t) => { t[0].annotations.readOnlyHint = "false"; }, "a stringified hint");
  rejects((t) => { t[0].justification.readOnlyHint = ""; }, "an empty justification");
  rejects((t) => { t[0].justification.destructiveHint = "It only adds a record."; }, "a justification that is not a reason");
  rejects((t) => { t[0].scopes = ["inventory.write"]; }, "a scope the OAuth metadata does not advertise");
  rejects((t) => { t[0].scopes = []; }, "no scope at all");
  rejects((t) => { t[0].annotations.openWorldHint = false; }, "an effect with openWorldHint false");
  rejects((t) => { t[t.length - 1].effects = []; }, "openWorldHint true with no effect named");
  rejects((t) => { t[1].justification.readOnlyHint = "Because it reads orders."; }, "a logged read that hides its access-log row");
  rejects((t) => { t[1].name = t[0].name; }, "a duplicate tool name");
  rejects((t) => { t[0].name = "debug_orders"; }, "a name that reads like an internal action");
  rejects((t) => { t[0].riskClass = "Z"; }, "an unknown risk class");
  rejects((t) => { t[0].permission.ownerOnly = "yes"; }, "a non-boolean permission flag");

  // The pending-guard coupling, in both directions.
  const withGuard = clone();
  const guarded = withGuard.find((e) => e.pendingGuard);
  assert.ok(guarded, "expected at least one entry waiting on a behaviour guard");
  const token = guarded.pendingGuard.token;
  rejects(
    (t) => { const e = t.find((x) => x.pendingGuard); e.annotations[e.pendingGuard.hint] = e.pendingGuard.flipsTo; },
    "a hint flipped ahead of the guard it names"
  );
  assert.throws(
    () => registry.assertRegistry(clone(), `function ${token}() {}`),
    /flip idempotentHint to true/,
    "should have refused a hint left behind after its guard shipped"
  );
  // And it passes against the real handler source, where the guard is absent.
  assert.strictEqual(registry.assertRegistry(registry.TOOL_REGISTRY, indexSource), true);
});

/* ------------------------------------------------------------------ *
 * 3. The served tools/list, snapshotted.
 * ------------------------------------------------------------------ */

/** tools/list as this deployment would serve it, under the given flags. */
function servedTools(flags) {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify(api._nvMcpToolsWithSecuritySchemes().map((tool) => ({
      name: tool.name,
      annotations: tool.annotations,
      scopes: (tool.securitySchemes[0] || {}).scopes
    }))));
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
  return JSON.parse(out.trim().split("\n").pop());
}

for (const [label, flags] of Object.entries(FLAG_STATES)) {
  check(`tools/list matches the recorded snapshot (${label})`, () => {
    const expected = fixture.states[label];
    assert.ok(expected, `no fixture for flag state ${label}`);
    const served = servedTools(flags);
    assert.deepStrictEqual(
      served.map((t) => t.name), expected.tools.map((t) => t.name),
      `${label}: the published tool names or their order changed`
    );
    assert.deepStrictEqual(
      served, expected.tools,
      `${label}: the published annotations or scopes changed. If that is intended, it is a submission decision — update the fixture in the same commit and say so in docs/mcp-tool-annotations.md.`
    );
    for (const tool of served) {
      for (const hint of HINTS) {
        assert.strictEqual(typeof tool.annotations[hint], "boolean", `${label}/${tool.name}.${hint} left the wire as ${JSON.stringify(tool.annotations[hint])}`);
      }
    }
  });
}

check("the review connection's listing is exactly the 19 reviewed tools", () => {
  // Flag off is what the 1.1.1 connection is served. Nothing may be added to
  // it, and the two corrected hints must still show their pre-correction
  // values, because moving them is the operator's submission decision.
  const served = fixture.states.off.tools;
  assert.strictEqual(served.length, 19);
  const byName = Object.fromEntries(served.map((t) => [t.name, t.annotations]));
  assert.strictEqual(byName.create_order.openWorldHint, false);
  assert.strictEqual(byName.update_order_status.openWorldHint, false);
  assert.strictEqual(byName.update_order_status.idempotentHint, true);
});

check("the corrections waiting on the flag are exactly the three the audit found", () => {
  const pending = registry.correctionsPending();
  assert.deepStrictEqual(
    pending.map((row) => `${row.name}.${row.changes.map((c) => c.hint).join("+")}`),
    ["create_order.openWorldHint", "update_order_status.idempotentHint+openWorldHint"]
  );
  for (const row of pending) {
    for (const change of row.changes) {
      assert.strictEqual(registry.annotationsFor(row.name, {})[change.hint], change.live);
      assert.strictEqual(registry.annotationsFor(row.name, { orchestrator: true })[change.hint], change.verified);
    }
  }
});

/* ------------------------------------------------------------------ *
 * 4. The registry is the only list.
 * ------------------------------------------------------------------ */

check("the tool list, the dispatcher and the registry name the same tools", () => {
  // A tool hidden from tools/list for a review used to answer anyway, because
  // the list and the dispatcher were two lists. Three lists now, all pinned.
  for (const entry of registry.TOOL_REGISTRY) {
    assert.ok(
      indexSource.includes(`case "${entry.name}":`),
      `${entry.name} is published but the dispatcher has no case for it`
    );
    assert.ok(
      indexSource.includes(`annotationsFor("${entry.name}", NV_MCP_FLAGS)`),
      `${entry.name}'s schema does not take its annotations from the registry`
    );
  }
  const inSchemas = (indexSource.slice(indexSource.indexOf("function nvMcpOrderToolSchemas()"), indexSource.indexOf("function nvMcpInitializeResult"))
    .match(/annotationsFor\("([a-z_]+)"/g) || []).map((s) => s.slice(16, -1));
  assert.deepStrictEqual(
    inSchemas, registry.TOOL_REGISTRY.map((e) => e.name),
    "the schema list and the registry disagree about which tools exist, or about their order"
  );
});

check("no annotation literal is left behind in index.js", () => {
  const schemas = indexSource.slice(
    indexSource.indexOf("function nvMcpOrderToolSchemas()"),
    indexSource.indexOf("function nvMcpInitializeResult")
  );
  assert.ok(
    !/readOnlyHint\s*:/.test(schemas),
    "a tool schema still spells its hints out inline; the registry has to be the only place they are written"
  );
  assert.ok(
    !/function nvMcpNormalizedAnnotations|nvMcpNormalizedAnnotations\(/.test(indexSource),
    "the coercing normaliser is back: `=== true` turns a null hint into false silently, which is what 1.1.1 was rejected for"
  );
});

check("the advertised scope of each tool comes from one table", () => {
  const scopesFor = new Function(
    indexSource.slice(
      indexSource.indexOf("function nvMcpOAuthScopesForTool"),
      indexSource.indexOf("function nvMcpAssertAnnotations")
    ) + "; return nvMcpOAuthScopesForTool;"
  )();
  for (const entry of registry.TOOL_REGISTRY) {
    assert.deepStrictEqual(
      scopesFor(entry.name), entry.scopes,
      `${entry.name}: the OAuth scope table and the registry disagree`
    );
  }
});

/* ------------------------------------------------------------------ *
 * 5. The document a reviewer is handed says what the code says.
 * ------------------------------------------------------------------ */

check("docs/mcp-tool-annotations.md carries every tool and every reason verbatim", () => {
  for (const entry of registry.TOOL_REGISTRY) {
    assert.ok(doc.includes(`\`${entry.name}\``), `${entry.name} is missing from the justification document`);
    for (const hint of HINTS) {
      assert.ok(
        doc.includes(entry.justification[hint]),
        `${entry.name}: the document does not carry the ${hint} justification the code serves`
      );
    }
  }
});

check("the document states the four values it claims for each tool", () => {
  // The table rows are "| `name` | ✓/✗ | ..." — a value written one way in the
  // code and another in the document is worse than no document.
  for (const entry of registry.TOOL_REGISTRY) {
    const row = doc.split("\n").find((line) => line.startsWith(`| \`${entry.name}\` |`));
    assert.ok(row, `${entry.name} has no row in the annotation table`);
    const cells = row.split("|").map((c) => c.trim());
    const values = cells.slice(2, 6).map((c) => c.startsWith("true"));
    assert.deepStrictEqual(
      values, HINTS.map((hint) => entry.annotations[hint]),
      `${entry.name}: the table row does not match the registry`
    );
  }
});

if (failures > 0) {
  console.error(`\n❌ MCP TOOL ANNOTATIONS: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\n✅ MCP TOOL ANNOTATIONS GEÇTİ");
