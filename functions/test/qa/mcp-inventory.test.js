// The ChatGPT inventory tools: published surface, the confirmation gate, and
// the one confusion that must never happen — a receipt filed as stock.
//
// Run: node test/qa/mcp-inventory.test.js
const assert = require("assert");
const { execFileSync } = require("child_process");
const path = require("path");

const INDEX = path.join(__dirname, "..", "..", "index.js");

function pass(name) { console.log("PASS ", name); }

// The tool list is read in a child process so each case gets a clean module
// load with its own flag value (the flags are read at require time).
//
// This used to slice nvMcpOrderToolSchemas out of index.js and eval the text.
// It stopped working the moment the annotations moved into
// orchestrator/registry.js — the sliced body referenced a module the eval had
// never heard of — and that is the good news: the slice was only ever testing a
// copy of the function. The child now loads index.js and asks for the list the
// deployment actually serves.
function toolNames(flagValue) {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify(api._nvMcpToolsWithSecuritySchemes().map((tool) => tool.name)));
  `;
  const out = execFileSync(process.execPath, ["-e", script], {
    env: { ...process.env, NIVADESK_MCP_INVENTORY: flagValue }
  }).toString().trim();
  return JSON.parse(out.split("\n").pop());
}

// 1. With the flag off — the state the app in OpenAI review is published with —
// the tool list must not gain anything.
{
  const names = toolNames("0");
  assert(!names.includes("create_inventory_item"), "inventory tool must stay hidden while the flag is off");
  assert(!names.includes("search_inventory"), "inventory search must stay hidden while the flag is off");
  assert(names.includes("attach_bank_receipt"), "the reviewed tools are still there");
  pass("flag off: published tools/list unchanged");
}

// 2. With the flag on, exactly the two new tools appear, in a stable order.
{
  const off = toolNames("0");
  const on = toolNames("1");
  const added = on.filter(name => !off.includes(name));
  assert.deepStrictEqual(added, ["search_inventory", "create_inventory_item"]);
  assert.deepStrictEqual(on.slice(0, off.length), off, "existing tools keep their order");
  pass("flag on: exactly two tools added, order preserved");
}

// 3. The document guard: names that read like paperwork are refused.
{
  const src = require("fs").readFileSync(INDEX, "utf8");
  const start = src.indexOf("const NV_RECEIPT_LOOKING_WORDS");
  const end = src.indexOf("function nvRequireInventoryAccess");
  const body = src.slice(start, end);
  const fn = new Function(
    "nvCleanString",
    body + "; return nvInventoryLooksLikeDocument;"
  );
  const looksLikeDocument = fn((value) => String(value || ""));

  for (const name of ["Invoice 4471", "VAT no 22114", "Fatura — Ekim", "Rechnung 88", "receipt from Amazon", "Total due 240"]) {
    assert.strictEqual(looksLikeDocument({ name }), true, `should refuse: ${name}`);
  }
  for (const name of ["Rolex Oyster bracelet 20mm", "Silver wire 0.8mm", "Leather duffle bag", "Movement ETA 2824"]) {
    assert.strictEqual(looksLikeDocument({ name }), false, `should allow: ${name}`);
  }
  // A receipt filename gives it away even when the name looks innocent.
  assert.strictEqual(looksLikeDocument({ name: "Bag", photo: { file_name: "invoice-2211.jpg" } }), true);
  pass("receipts are refused, real items are not");
}

console.log("\n✅ MCP INVENTORY GEÇTİ");
