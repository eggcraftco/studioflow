// CARD-001 — one Sync health contract, proven in the three layers that have to
// agree: the capability registry, the health module, and the web card.
//
//   Not connected  no connection with this provider in this workspace
//   Not supported  connected, but nothing here records health for it
//   Never synced   connected and instrumented, but nothing recorded yet
//
// The registry's `healthInstrumented` is not trusted as a written fact: it is
// derived here by reading which code actually calls touchHealth, so the day
// somebody instruments Etsy the registry must move with it or this fails.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const health = require("../../commerce/health");
const { getCapabilities } = require("../../commerce/capabilities");

let failures = 0;
function check(name, fn) {
  try { fn(); console.log("PASS ", name); }
  catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 400)); }
}

const root = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const PROVIDERS = ["shopify", "etsy", "woocommerce", "square", "amazon", "ebay", "inbound"];
const SOURCES = ["index.js", "wooConnector.js", "squareConnector.js", "ebayConnector.js", "etsy.js", "etsySync.js", "commerce/amazon/ingest.js"];

/** Which providers does this codebase actually record health for? Read, not declared. */
function instrumentedFromSource() {
  const found = new Set();
  for (const file of SOURCES) {
    const source = read(file);
    // A direct call that names its provider.
    for (const match of source.matchAll(/touchHealth\(([\s\S]{0,400}?)\)\s*[;.]/g)) {
      const provider = /provider:\s*"([a-z]+)"/.exec(match[1]);
      if (provider) found.add(provider[1]);
    }
    // The queue wrapper touches health for whatever the dispatcher accepts.
    if (/touchHealth\([\s\S]{0,400}?provider:\s*String\(task\.provider/.test(source)) {
      for (const match of source.matchAll(/task\.provider === "([a-z]+)"/g)) found.add(match[1]);
    }
  }
  return found;
}

const instrumented = instrumentedFromSource();

check("layer 1 — the registry's healthInstrumented is what the source actually does", () => {
  assert.ok(instrumented.size >= 4, `the scan found almost nothing (${[...instrumented].join(", ")}), so it is broken`);
  for (const provider of PROVIDERS) {
    const declared = getCapabilities(provider).healthInstrumented === true;
    assert.strictEqual(declared, instrumented.has(provider), `${provider}: registry says ${declared}, the source says ${instrumented.has(provider)}`);
  }
});

check("layer 1 — Etsy and Amazon read orders and still record no health", () => {
  for (const provider of ["etsy", "amazon"]) {
    assert.strictEqual(getCapabilities(provider).implemented.orders, true, `${provider} no longer reads orders — the contract below changes with it`);
    assert.strictEqual(getCapabilities(provider).healthInstrumented, false, `${provider} started recording health: update the contract and the record`);
    assert.strictEqual(health.recordsHealth(provider), false);
  }
  // The control: a provider that does record health, so the test is not vacuous.
  assert.strictEqual(health.recordsHealth("shopify"), true);
});

check("layer 2 — the three states, decided in one place", () => {
  const state = (provider, connected, rows = 0) => health.healthCardState({ provider, connected, rows });
  for (const provider of PROVIDERS) assert.strictEqual(state(provider, false), "not_connected", `${provider} without a connection`);
  for (const provider of ["etsy", "amazon", "inbound"]) assert.strictEqual(state(provider, true), "not_supported", `${provider} connected`);
  for (const provider of ["shopify", "woocommerce", "square", "ebay"]) assert.strictEqual(state(provider, true), "never_synced", `${provider} connected, nothing recorded`);
  assert.strictEqual(state("shopify", true, 1), "rows", "a recorded connection must fall through to the per-entity view");
  // Never the other way round: an uninstrumented provider cannot reach "never synced".
  assert.notStrictEqual(state("etsy", true, 0), "never_synced");
});

check("layer 2 — per entity, Etsy and Amazon stay 'not supported', never 'never'", () => {
  for (const provider of ["etsy", "amazon"]) {
    for (const entity of ["products", "inventory", "finance"]) {
      assert.strictEqual(health.healthView(null, provider, { now: Date.now() })[entity].state, "unsupported", `${provider}.${entity}`);
    }
  }
});

check("layer 3 — the callable decides the state and hands it over", () => {
  const source = read("index.js");
  assert.match(source, /healthCardState\(\{ provider, connected, rows:/, "getCommerceHealth no longer decides the card state");
  assert.match(source, /HEALTH_CARD_CONNECTIONS = Object\.freeze\(/, "the connection lookup is gone");
  assert.ok(!/amazon:\s*"/.test(source.split("HEALTH_CARD_CONNECTIONS")[1].split("}")[0]), "Amazon is listed as a Firestore connection: it is not one");
  assert.match(source, /return \{ ok: true, connections, card \};/, "the callable no longer returns the card state");
});

check("layer 3 — the web card renders those three words and works nothing out itself", () => {
  const file = path.join(root, "..", "studioflow-web", "app", "settings", "CommerceSyncHealthCard.tsx");
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /not_connected:\s*"Not connected"/, "the card lost the Not connected label");
  assert.match(source, /not_supported:\s*"Not supported"/, "the card lost the Not supported label");
  assert.match(source, /never_synced:\s*"Never synced"/, "the card lost the Never synced label");
  assert.match(source, /getCommerceHealth"\)\(\{ companyId, provider \}\)/, "the card no longer tells the server which provider it is showing");
  assert.match(source, /EMPTY_STATE_LABEL\[card\?\.state/, "the card no longer renders the state the server decided");
  // The bug this closes: an empty card that said nothing was wrong.
  assert.ok(!/connections\.length === 0 \? \(\s*<p className="muted-copy">\{t\("No sync activity recorded yet\."\)\}<\/p>/.test(source),
    "the card is back to claiming there is no activity when it simply does not measure any");
});

check("layer 3 — the three words are translated, not raw English in ten languages", () => {
  const language = fs.readFileSync(path.join(root, "..", "studioflow-web", "lib", "studioflow", "language.ts"), "utf8");
  for (const label of ["Never synced", "Not supported", "Not connected"]) {
    assert.ok(language.includes(`"${label}": {`), `${label} has no translation entry`);
  }
});

check("the row that stays hidden on purpose is written down", () => {
  const record = fs.readFileSync(path.join(root, "..", "docs", "commerce", "sync-health-contract-2026-09-12.md"), "utf8");
  assert.match(record, /Amazon/, "the record does not mention Amazon");
  assert.match(record, /planned/, "the record does not say why Amazon has no card");
  for (const label of ["Not connected", "Not supported", "Never synced"]) {
    assert.ok(record.includes(label), `the record does not carry the ${label} state`);
  }
});

console.log(failures ? `\n${failures} check(s) failed` : "\nsync health contract: all checks passed");
process.exit(failures ? 1 : 0);
