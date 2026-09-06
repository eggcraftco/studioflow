// The structural guarantees the orchestrator's annotations rest on.
//
// Every new capability is published as readOnlyHint: true. That claim is only
// as good as the code's inability to write, so this file checks the code rather
// than the claim: one impure module, no writers imported anywhere, orders read
// in exactly one place and redacted there, and no output that looks like a
// credential.
//
// It is a source-level test on purpose. A behavioural test can only prove that
// the paths it happened to exercise wrote nothing.
//
// Run: node test/qa/orchestrator-purity.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const DIR = path.join(__dirname, "..", "..", "orchestrator");
const FILES = fs.readdirSync(DIR).filter((name) => name.endsWith(".js"));
const sourceOf = (file) => fs.readFileSync(path.join(DIR, file), "utf8");
const requiresOf = (file) => [...sourceOf(file).matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);

check("the orchestrator is a real module set, not one file with a hopeful name", () => {
  assert.ok(FILES.length >= 12, `expected the capability modules, found ${FILES.join(", ")}`);
  for (const expected of ["index.js", "registry.js", "context.js", "envelope.js", "freshness.js", "loaders.js", "render.js"]) {
    assert.ok(FILES.includes(expected), `${expected} is missing`);
  }
});

check("loaders.js is the only module that can reach Firestore", () => {
  for (const file of FILES) {
    if (file === "loaders.js") continue;
    assert.ok(
      !requiresOf(file).some((name) => name === "firebase-admin" || name === "firebase-functions"),
      `${file} imports the Cloud Functions runtime; only loaders.js may, and even it takes db by injection`
    );
  }
  // And loaders takes its handle by injection rather than importing admin.
  assert.ok(!requiresOf("loaders.js").includes("firebase-admin"), "loaders.js should receive db(), not import admin");
});

check("no orchestrator module imports a writer", () => {
  // openAttention CREATES an attention document and bumps an occurrence
  // counter; settlementMatch writes bankMatch onto a payout and settlement onto
  // a transaction; recordAudit writes an audit row. A readOnlyHint:true tool
  // that reached any of them would be the 1.1.1 rejection all over again.
  const forbidden = /accounting\/core\/store|commerce\/settlementMatch/;
  for (const file of FILES) {
    const bad = requiresOf(file).filter((name) => forbidden.test(name));
    assert.deepStrictEqual(bad, [], `${file} imports a writing module: ${bad.join(", ")}`);
  }
  for (const file of FILES) {
    const calls = sourceOf(file).match(/\b(openAttention|resolveAttention|recordAudit|writeMatch|clearMatch)\s*\(/g) || [];
    assert.deepStrictEqual(calls, [], `${file} calls a writer: ${calls.join(", ")}`);
  }
});

check("nothing under orchestrator/ writes to Firestore", () => {
  for (const file of FILES) {
    const writes = sourceOf(file).match(/\.(set|update|delete|add|commit)\s*\(/g) || [];
    // `.set(` on a JS Set is legitimate; Firestore writes are always on a ref.
    const suspicious = (sourceOf(file).match(/(?:doc|ref|Ref|batch|collection\([^)]*\))\s*\.\s*(set|update|delete|add|commit)\s*\(/g) || []);
    assert.deepStrictEqual(suspicious, [], `${file} looks like it writes: ${suspicious.join(", ")}`);
    void writes;
  }
});

check("orders are read in one place, and redacted in that same place", () => {
  const readers = FILES.filter((file) => /collection\("siparisler"\)/.test(sourceOf(file)));
  assert.deepStrictEqual(readers, ["loaders.js"], `siparisler is read in ${readers.join(", ")}`);
  const loaders = sourceOf("loaders.js");
  assert.ok(/redactForChannel\(raw, "assistant"\)/.test(loaders), "the order projection must go through the outbound PII policy");
  assert.ok(/delete projected\.notes/.test(loaders) && /delete projected\.historyLog/.test(loaders),
    "a restricted row must lose the buyer's own free text too: that is where the name leaks back in");
});

check("no orchestrator module reads the restricted customer store", () => {
  for (const file of FILES) {
    assert.ok(!/restrictedCustomer/.test(sourceOf(file)), `${file} mentions restrictedCustomer; the reveal grant is not on this surface`);
  }
});

check("no orchestrator module requires an Amazon adapter", () => {
  // The Amazon PII isolation layer: the adapter belongs to the hardened
  // project, and a test-side import is how it quietly becomes reachable here.
  for (const file of FILES) {
    const bad = requiresOf(file).filter((name) => /amazon|functions-amazon/i.test(name));
    assert.deepStrictEqual(bad, [], `${file} imports ${bad.join(", ")}`);
  }
});

check("capability output carries no field that looks like a credential", () => {
  const fixtures = require("../fixtures/orchestrator");
  const ctx = fixtures.ownerContext();
  const snapshot = fixtures.mixedSnapshot();
  // Connection documents stuffed with token-shaped fields, as a real one is.
  snapshot.connections.shopify[0] = {
    ...snapshot.connections.shopify[0],
    accessToken: "shpat_live", refreshToken: "refresh_live", apiSecret: "secret_live", password: "hunter2"
  };
  snapshot.payouts = { square: [] };
  snapshot.bankRows = [];
  snapshot.connections.bank = [];
  snapshot.connections.accounting = [];
  snapshot.inventoryItems = [];
  snapshot.receiptInbox = [];
  snapshot.accountingAttention = [];
  snapshot.reviewQueue = [];
  snapshot.heldOrders = [];

  const capabilities = [
    ["get_commerce_overview", require("../../orchestrator/commerce").commerceOverview, { fromDate: "2026-09-01", toDate: "2026-09-30" }],
    ["search_commerce_orders", require("../../orchestrator/commerce").searchCommerceOrders, {}],
    ["get_channel_performance", require("../../orchestrator/commerce").channelPerformance, { fromDate: "2026-09-01", toDate: "2026-09-30" }],
    ["get_integration_health", require("../../orchestrator/integrationHealth").integrationHealth, {}],
    ["get_accounting_sync_status", require("../../orchestrator/accountingStatus").accountingSyncStatus, {}],
    ["get_payout_reconciliation_overview", require("../../orchestrator/payouts").payoutReconciliation, {}],
    ["get_inventory_overview", require("../../orchestrator/inventory").inventoryOverview, {}],
    ["get_business_attention_summary", require("../../orchestrator/attention").businessAttentionSummary, {}],
    ["get_banking_attention_summary", require("../../orchestrator/attention").bankingAttentionSummary, {}]
  ];

  for (const [name, handler, args] of capabilities) {
    const result = handler(snapshot, args, ctx, { nowMs: snapshot.nowMs });
    const serialised = JSON.stringify(result.data);
    assert.ok(!/shpat_live|refresh_live|secret_live|hunter2/.test(serialised), `${name} leaked a credential value`);
    const keys = new Set();
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      for (const [key, inner] of Object.entries(value)) { keys.add(key); walk(inner); }
    };
    walk(result.data);
    const bad = [...keys].filter((key) => /token|secret|refresh|password|api_?key/i.test(key));
    assert.deepStrictEqual(bad, [], `${name} exposes credential-shaped keys: ${bad.join(", ")}`);
  }
});

check("every published capability has a handler, and every handler is published", () => {
  const registry = require("../../orchestrator/registry");
  const { CAPABILITY_NAMES } = require("../../orchestrator");
  // What the orchestrator flag adds to the always-published nineteen. The
  // second filter this used to carry — "and not published by the inventory
  // flag" — was a no-op when it was written and became wrong the moment
  // `search_inventory` started being published by EITHER flag: it removed the
  // one capability that is in both projections, and the comparison below then
  // demanded a handler list with a hole in it.
  const published = registry.publishedNames({ orchestrator: true })
    .filter((name) => !registry.publishedNames({}).includes(name));
  assert.deepStrictEqual(published.slice().sort(), CAPABILITY_NAMES.slice().sort(),
    "a name in tools/list with no handler behind it is the list-versus-dispatcher split all over again");
  // `create_inventory_item` is published by the inventory flag and is not a
  // capability; with the orchestrator flag alone it must not appear at all.
  assert.ok(!published.includes("create_inventory_item"), "the inventory write tool is not an orchestrator capability");
});

check("every capability declares only domains the loader knows how to read", () => {
  const registry = require("../../orchestrator/registry");
  const { DOMAINS } = require("../../orchestrator/loaders");
  const { CAPABILITY_NAMES } = require("../../orchestrator");
  for (const name of CAPABILITY_NAMES) {
    const entry = registry.entryFor(name);
    assert.ok(Array.isArray(entry.domainNeeds) && entry.domainNeeds.length > 0, `${name} declares no domainNeeds`);
    for (const domain of entry.domainNeeds) {
      assert.ok(DOMAINS.includes(domain), `${name} asks for unknown domain "${domain}"`);
    }
  }
});

console.log(failures === 0 ? "\nAll purity checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
