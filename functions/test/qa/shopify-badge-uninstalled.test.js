// A Shopify store that was uninstalled must not read "Connected".
//
// Uninstalling the app does not detach the store from the workspace: the
// webhook merges {status:"uninstalled", accessToken:""} and deliberately leaves
// companyId in place so a re-install resumes. So the store is still returned by
// getShopifyIntegrationsForWorkspace, while reconcileShopifyStore skips every
// non-active store — orders have stopped arriving. The hub card, however, only
// counted "paused" as broken and filtered on "unlinked", a status nothing in
// the repo ever writes, so it painted the store green. A badge that says
// everything is fine while the shop has gone quiet is the worst thing this card
// can do, and the honest version was a click away in the detail panel.
//
// This lifts the real resolver out of the shipping web source and runs it —
// no copy of the rule lives here. The Android mirror has its own executable
// test at studioflow-android/app/src/test/.../IntegrationsHubStateTest.kt.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failed = 0;
const check = (name, fn) => { try { fn(); console.log("PASS ", name); } catch (e) { failed++; console.log("FAIL ", name, "-", e.message); } };

const FUNCTIONS = path.join(__dirname, "..", "..");
const WEB = path.join(FUNCTIONS, "..", "studioflow-web");
const SOURCE_PATH = path.join(WEB, "lib", "studioflow", "integrations.ts");
const SOURCE = fs.readFileSync(SOURCE_PATH, "utf8");

// ------------------------------------------------ the status the server writes

check("the server really stamps the status this test feeds in", () => {
  // Keeps the fixture tied to the server rather than to this file's memory of
  // it: both the app/uninstalled webhook and the bridge write exactly this.
  const server = fs.readFileSync(path.join(FUNCTIONS, "index.js"), "utf8");
  assert(server.includes('status: "uninstalled"'), 'no writer of status: "uninstalled" left in functions/index.js');
  assert(
    !/status:\s*"unlinked"/.test(server),
    'the server now writes status:"unlinked" — the hub filter that drops it is no longer dead code and this test needs revisiting'
  );
});

// ------------------------------------------------------ the shipping resolver

function lift(marker, close) {
  const start = SOURCE.indexOf(marker);
  assert(start > 0, `${marker} not found in lib/studioflow/integrations.ts`);
  const end = SOURCE.indexOf(close, start);
  assert(end > start, `${marker} does not close`);
  return SOURCE.slice(start, end + close.length);
}

const shipped = (() => {
  const source = [
    lift("export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [", "\n];"),
    lift("export function resolveIntegrationState(", "\n}"),
    // The exported entry point is a thin wrapper — it adds the retired-address
    // notice and hands off. Lifting both keeps this test on the door the hub
    // actually calls rather than on the rule behind it.
    lift("function resolveProviderState(", "\n}"),
    lift("export const INTEGRATION_STATE_LABELS: Record<IntegrationState, string> = {", "\n};"),
  ]
    .join("\n")
    .replace(/^export /gm, "")
    .replace(/const INTEGRATION_PROVIDERS: IntegrationProvider\[\] =/, "const INTEGRATION_PROVIDERS =")
    .replace(/const INTEGRATION_STATE_LABELS: Record<IntegrationState, string> =/, "const INTEGRATION_STATE_LABELS =")
    .replace(
      /function resolveIntegrationState\(\s*provider: IntegrationProvider,\s*signals: IntegrationSignals,\s*\): IntegrationLiveState \{/,
      "function resolveIntegrationState(provider, signals) {"
    )
    .replace(
      /function resolveProviderState\(\s*provider: IntegrationProvider,\s*signals: IntegrationSignals,\s*\): IntegrationLiveState \{/,
      "function resolveProviderState(provider, signals) {"
    )
    .replace(/const decorate = \(live: IntegrationLiveState\): IntegrationLiveState =>/, "const decorate = (live) =>");
  assert(
    !/IntegrationProvider|IntegrationSignals|IntegrationLiveState|IntegrationState,/.test(source),
    "type annotations survived the strip; the resolver cannot be run"
  );
  return new Function(`${source}\nreturn { INTEGRATION_PROVIDERS, resolveIntegrationState, INTEGRATION_STATE_LABELS };`)();
})();

const SHOPIFY = shipped.INTEGRATION_PROVIDERS.find((p) => p.id === "shopify");

// The signals object the hub builds; only the Shopify list matters here.
const signals = (...stores) => ({
  shopifyStores: stores,
  channels: {}, etsyShops: [], bankConnections: 0, wooConnections: [],
  squareConnections: [], paypalConnections: [], accountingConnections: [], chatgptConnections: [],
  retiredHolds: [],
});
const store = (shop, status) => ({ shop, status });
const label = (state) => shipped.INTEGRATION_STATE_LABELS[state];

check("a workspace still holding the retired webhook address is told, green badge or not", () => {
  // The badge is about the NEW connector; the old pasted-URL address is the one
  // the shop may still be posting to, and it answers 410 and writes nothing.
  // The notice therefore has to survive a card that is otherwise perfectly fine.
  const live = { ...signals(store("live.myshopify.com", "active")), retiredHolds: ["shopify"] };
  const resolved = shipped.resolveIntegrationState(SHOPIFY, live);
  assert.strictEqual(resolved.state, "connected", "the connector's own state is unchanged");
  assert.strictEqual(resolved.legacyAddress, true, "the retired address goes unmentioned on a green card");
  // And a workspace holding nothing says nothing.
  assert.ok(!shipped.resolveIntegrationState(SHOPIFY, signals(store("live.myshopify.com", "active"))).legacyAddress);
  // A hold against another provider is not this card's business.
  const other = { ...signals(store("live.myshopify.com", "active")), retiredHolds: ["woocommerce"] };
  assert.ok(!shipped.resolveIntegrationState(SHOPIFY, other).legacyAddress);
});

check("the resolver was lifted from the shipping file, not reimplemented here", () => {
  assert.strictEqual(typeof shipped.resolveIntegrationState, "function");
  assert(SHOPIFY, "no shopify provider in the shipped list");
  assert.strictEqual(SHOPIFY.kind, "native", "a planned card short-circuits before the Shopify branch");
});

// ------------------------------------------------------------- the two claims

check("an uninstalled store does not read Connected", () => {
  const state = shipped.resolveIntegrationState(SHOPIFY, signals(store("eggcraft.myshopify.com", "uninstalled"))).state;
  assert.notStrictEqual(label(state), "Connected", "the card still claims Connected over a store that has been uninstalled");
  assert.strictEqual(state, "attention");
});

check("one dead store among live ones still lowers the card", () => {
  // The all-or-nothing rule would keep this green, and the orders from the
  // uninstalled shop have stopped just the same.
  const state = shipped.resolveIntegrationState(
    SHOPIFY,
    signals(store("live.myshopify.com", "active"), store("gone.myshopify.com", "uninstalled"))
  ).state;
  assert.notStrictEqual(label(state), "Connected", "a dead store beside a live one is still hidden behind a green badge");
  assert.strictEqual(state, "attention");
});

// ------------------------------------------- what the card said before, intact

check("a working store is still Connected", () => {
  const live = shipped.resolveIntegrationState(SHOPIFY, signals(store("eggcraft.myshopify.com", "active")));
  assert.strictEqual(live.state, "connected");
  assert.strictEqual(label(live.state), "Connected");
  assert.strictEqual(live.detail, "eggcraft.myshopify.com");
});

check("pausing every store still asks for attention, pausing one does not", () => {
  assert.strictEqual(
    shipped.resolveIntegrationState(SHOPIFY, signals(store("a.myshopify.com", "paused"))).state,
    "attention"
  );
  assert.strictEqual(
    shipped.resolveIntegrationState(SHOPIFY, signals(store("a.myshopify.com", "paused"), store("b.myshopify.com", "active"))).state,
    "connected",
    "pausing one store of two is a decision, not a fault"
  );
});

check("a workspace with no store is Available", () => {
  assert.strictEqual(shipped.resolveIntegrationState(SHOPIFY, signals()).state, "available");
});

check("the other cards are untouched", () => {
  const woo = shipped.INTEGRATION_PROVIDERS.find((p) => p.id === "woocommerce");
  const openbanking = shipped.INTEGRATION_PROVIDERS.find((p) => p.id === "openbanking");
  const withWoo = { ...signals(), wooConnections: [{ store: "eggcraft.co.uk", status: "connected", needsAttention: false }] };
  assert.strictEqual(shipped.resolveIntegrationState(woo, withWoo).state, "connected");
  assert.strictEqual(shipped.resolveIntegrationState(openbanking, { ...signals(), bankConnections: 1 }).state, "connected");
});


// ---- all four mirrors, not three -------------------------------------------
//
// The rule lives in four places and the first version of this fix updated
// three. Mac and iPhone went on painting an uninstalled store green, which is
// the same bug on a different screen — so this reads all four and insists they
// agree that an uninstall lowers the badge and that pausing only does so when
// every store is paused.
{
  const ROOT = path.join(__dirname, "..", "..", "..");
  // Each mirror's RESOLVER branch, not the first mention of the word — the
  // provider catalogue names shopify long before the rule does.
  const mirrors = [
    ["web", path.join(ROOT, "studioflow-web", "lib", "studioflow", "integrations.ts"), 'provider.id === "shopify"'],
    ["Mac/iPhone", path.join(ROOT, "EGGcraft", "NivaDeskIntegrations.swift"), 'id == "shopify"'],
    ["Android", path.join(ROOT, "studioflow-android", "app", "src", "main", "java", "uk", "co", "eggcraft", "studioflow", "features", "settings", "IntegrationsHub.kt"), 'if (id == "shopify") {']
  ];
  for (const [name, file, marker] of mirrors) {
    const text = fs.readFileSync(file, "utf8");
    const at = text.indexOf(marker);
    assert(at > 0, `${name}: no shopify resolver branch (${marker})`);
    const region = text.slice(at, at + 1600);
    assert(/uninstalled/.test(region), `${name} still ignores an uninstalled store`);
    assert(
      !/allSatisfy \{ \$0\.1 == "paused" \}/.test(region) && !/all \{ it\.status == "paused" \}/.test(region),
      `${name} still lowers the badge only when every store is paused`
    );
  }
  console.log("PASS  all four mirrors agree that an uninstalled store is not connected");
}

console.log(failed ? `${failed} FAILED` : "✅ SHOPIFY BADGE GEÇTİ");
process.exit(failed ? 1 : 0);
