// Every shop the server can import an order from must be its own channel on
// the dashboard, and its currency must be readable.
//
// The dashboard's channel filter was written when Shopify and WooCommerce were
// the only connectors, and it named them in `if` branches. Etsy and Square
// shipped afterwards stamping `Source: "Etsy"` / `Source: "Square"` exactly as
// asked, and both fell off the end into the "manual" bucket: a workshop selling
// on Etsy saw that money labelled as orders it had typed in by hand, and an
// Etsy-only workshop got no channel pills at all because the row itself was
// gated on the same two names.
//
// The currency half was quieter and worse. Each connector files its currency
// under its own display name ("Etsy Currency"), and the dashboard named two of
// those keys by hand. An Etsy order therefore reported NO currency code, so the
// Revenue card's foreign-currency breakdown skipped it while the total still
// counted it — a USD sale shown with a pound sign and no disclosure.
//
// Nothing tied the dashboard's list to the server's. This does: it reads the
// connector vocabulary out of the server source, lifts the real helpers out of
// the shipping page (not a copy of them) and runs the server's own labels
// through them. A fifth connector that forgets the dashboard fails here.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failed = 0;
const check = (name, fn) => { try { fn(); console.log("PASS ", name); } catch (e) { failed++; console.log("FAIL ", name, "-", e.message); } };

const FUNCTIONS = path.join(__dirname, "..", "..");
const WEB = path.join(FUNCTIONS, "..", "studioflow-web");
const read = (file) => fs.readFileSync(file, "utf8");

// ---------------------------------------------------------------- the server

const ADAPTERS = fs.readdirSync(path.join(FUNCTIONS, "commerce", "adapters"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join(FUNCTIONS, "commerce", "adapters", f));
// The live mappers that still write orders directly, next to the common engine.
const LIVE_MAPPERS = ["index.js", "etsy.js"].map((f) => path.join(FUNCTIONS, f));

// A connector's display name is the one string that matters here: the server
// writes it as `Source` and uses it as the prefix of every field it owns.
const connectorSources = (() => {
  const found = new Set();
  for (const file of ADAPTERS) {
    for (const m of read(file).matchAll(/provider_display_name:\s*"([^"]+)"/g)) found.add(m[1]);
  }
  for (const file of LIVE_MAPPERS) {
    for (const m of read(file).matchAll(/\bSource:\s*"([^"]+)"/g)) found.add(m[1]);
  }
  return [...found].sort();
})();

check("the server's connector vocabulary was found", () => {
  // A floor, not a count: it catches the extractor going quiet, which is how a
  // test like this passes while checking nothing.
  assert(connectorSources.length >= 4, `only found ${connectorSources.length}: ${connectorSources.join(", ")}`);
  for (const expected of ["Shopify", "WooCommerce", "Etsy", "Square"]) {
    assert(connectorSources.includes(expected), `${expected} missing from ${connectorSources.join(", ")}`);
  }
});

// ------------------------------------------------- the shipping web helpers

const PAGE_PATH = path.join(WEB, "app", "dashboard", "page.tsx");
const PAGE = read(PAGE_PATH);

// Lift the table and both helpers out of the page so this tests what ships.
function lift(marker) {
  const start = PAGE.indexOf(marker);
  assert(start > 0, `${marker} not found in dashboard/page.tsx`);
  // Every one of these is top-level, so the next line that is exactly "}" or
  // "];" closes it.
  const end = PAGE.indexOf(marker.startsWith("const") ? "\n];" : "\n}", start);
  assert(end > start, `${marker} does not close`);
  return PAGE.slice(start, end + (marker.startsWith("const") ? 3 : 2));
}

const shipped = (() => {
  const source = [lift("const DASHBOARD_CHANNELS"), lift("function dashboardOrderCurrency"), lift("function dashboardOrderChannel")]
    .join("\n")
    .replace(/\(order: DashboardFinanceOrder\):\s*\w+/g, "(order)")
    .replace(/:\s*Array<[^=]+>\s*=/g, " =");
  assert(!/DashboardFinanceOrder|DashboardChannel/.test(source), "type annotations survived the strip; the helpers cannot be run");
  return new Function(`${source}\nreturn { DASHBOARD_CHANNELS, dashboardOrderCurrency, dashboardOrderChannel };`)();
})();

const order = (customFields) => ({ customFields });

check("the helpers were lifted from the page, not reimplemented here", () => {
  assert(shipped.DASHBOARD_CHANNELS.length >= 4, `only ${shipped.DASHBOARD_CHANNELS.length} channels parsed`);
  assert.strictEqual(typeof shipped.dashboardOrderChannel, "function");
  assert.strictEqual(typeof shipped.dashboardOrderCurrency, "function");
});

// ------------------------------------------------------------ the two claims

check("every shop the server imports from is its own channel", () => {
  const orphans = connectorSources.filter((source) => shipped.dashboardOrderChannel(order({ Source: source })) === "manual");
  assert.deepStrictEqual(orphans, [], `filed as manually created orders: ${orphans.join(", ")}`);
});

check("every shop's currency is read", () => {
  // The key each connector actually writes, built the way the server builds it.
  const blind = connectorSources.filter(
    (source) => shipped.dashboardOrderCurrency(order({ Source: source, [`${source} Currency`]: "USD" })) !== "USD"
  );
  assert.deepStrictEqual(blind, [], `no currency code for: ${blind.join(", ")}`);
});

check("the server really writes the currency key the dashboard reads", () => {
  // The dashboard now derives "<Source> Currency" instead of naming keys. That
  // only works because every writer uses the display name as the prefix, so
  // assert the shape at the source rather than trusting the convention.
  const writers = [...ADAPTERS, ...LIVE_MAPPERS].map(read).join("\n");
  for (const source of connectorSources) {
    assert(writers.includes(`"${source} Currency"`), `${source} does not write "${source} Currency"`);
  }
});

check("an Etsy sale in another currency reaches the foreign-currency breakdown", () => {
  // The exact case that was counted at face value with the disclosure
  // suppressed: the breakdown drops any order whose code is empty.
  const etsy = order({ Source: "Etsy", "Etsy Currency": "USD", "Etsy Total": "1000" });
  assert.strictEqual(shipped.dashboardOrderCurrency(etsy), "USD");
  assert.notStrictEqual(shipped.dashboardOrderCurrency(etsy), "", "empty code — the order would be skipped and shown in workspace currency");
  assert.strictEqual(shipped.dashboardOrderChannel(etsy), "etsy");
});

check("the channels that already worked still work", () => {
  assert.strictEqual(shipped.dashboardOrderChannel(order({ Source: "Shopify" })), "shopify");
  assert.strictEqual(shipped.dashboardOrderChannel(order({ Source: "WooCommerce" })), "woocommerce");
  assert.strictEqual(shipped.dashboardOrderCurrency(order({ Source: "Shopify", "Shopify Currency": "EUR" })), "EUR");
  assert.strictEqual(shipped.dashboardOrderCurrency(order({ Source: "WooCommerce", "WooCommerce Currency": "gbp" })), "GBP");
});

check("hand-typed and generic inbound orders stay manual", () => {
  // The generic webhook's own labels have no connector behind them and no
  // per-source fields; the plain "Currency" key is still read.
  assert.strictEqual(shipped.dashboardOrderChannel(order({})), "manual");
  assert.strictEqual(shipped.dashboardOrderCurrency(order({})), "");
  for (const label of ["Website", "Wix", "Squarespace", "Zapier", "Make"]) {
    assert.strictEqual(shipped.dashboardOrderChannel(order({ Source: label })), "manual", label);
  }
  assert.strictEqual(shipped.dashboardOrderCurrency(order({ Source: "Wix", Currency: "eur" })), "EUR");
});

check("the pill row is not gated on two connectors", () => {
  // An Etsy-only workshop saw no pills at all because the row itself asked for
  // Shopify or WooCommerce before rendering.
  assert(
    !/availableChannels\.has\("shopify"\)\s*\|\|\s*availableChannels\.has\("woocommerce"\)/.test(PAGE),
    "the channel row still renders only for Shopify or WooCommerce"
  );
  assert(
    /DASHBOARD_CHANNELS\.some\(channel => availableChannels\.has\(channel\.key\)\)/.test(PAGE),
    "the channel row no longer asks the channel table what exists"
  );
});

console.log(`\n${connectorSources.length} server connectors checked: ${connectorSources.join(", ")}`);
console.log(failed ? `${failed} FAILED` : "✅ DASHBOARD CHANNELS GEÇTİ");
process.exit(failed ? 1 : 0);
