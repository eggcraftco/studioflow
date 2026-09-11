// The five store connections, read the way each connector actually writes them. Every row shape
// below copies the fields the writer stores (functions/index.js for Shopify, etsyConnect.js,
// wooConnector.js, squareConnector.js, ebayConnector.js) — the status words are theirs, not ours.
// A dry run that happens to change nothing is not proof; these are.
const assert = require("assert");
const { deriveEvents } = require("../../lifecycle/derive");
let failures = 0; const checks = []; const check = (name, run) => checks.push({ name, run });
const T0 = Date.UTC(2026, 8, 1, 9, 0, 0), T1 = T0 + 3600 * 1000;
const ts = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });   // a Firestore Timestamp as the Admin SDK returns it (seconds/nanoseconds)
const connected = (result) => result.events.filter((e) => e.name === "integration_connected").map((e) => [e.subjectId, e.atMs]);

check("Shopify: a linked store (status active) is a connection; uninstalled, pending (before the link or after a workspace deletion) and unlinked are not", () => {
  const r = deriveEvents({ shopifyStores: [
    { id: "live.myshopify.com", companyId: "c1", linkedUid: "u1", linkedAt: ts(T0), status: "active" },
    { id: "gone.myshopify.com", companyId: "c1", linkedAt: ts(T0), status: "uninstalled", uninstalledAt: ts(T1), accessToken: "" },
    { id: "half.myshopify.com", companyId: "c1", status: "pending", connectNonce: "n" },
    { id: "deleted-ws.myshopify.com", companyId: "", linkedUid: "", status: "pending", unlinkedAt: ts(T1) },
    { id: "legacy.myshopify.com", companyId: "c1", linkedAt: ts(T0), status: "unlinked" }
  ] });
  assert.deepStrictEqual(connected(r), [["live.myshopify.com", T0]]);
});

check("Etsy: connected is a connection at connectedAtMs; disconnected is not", () => {
  const r = deriveEvents({ etsyConnections: [
    { id: "e1", companyId: "c1", status: "connected", connectedAtMs: T0, createdAt: ts(T1) },
    { id: "e2", companyId: "c1", status: "disconnected", connectedAtMs: T0 }
  ] });
  assert.deepStrictEqual(connected(r), [["e1", T0]]);
});

check("WooCommerce: connected and needs_reconnect are connections (the shop is still linked, the token has to be renewed); disconnected is not", () => {
  const r = deriveEvents({ wooConnections: [
    { id: "w1", companyId: "c1", status: "connected", connectedAtMs: T0, webhooksHealthy: true },
    { id: "w2", companyId: "c1", status: "needs_reconnect", connectedAtMs: T0, lastErrorCode: "credentials_rejected" },
    { id: "w3", companyId: "c1", status: "disconnected", connectedAtMs: T0, disconnectedAtMs: T1, webhooks: [] }
  ] });
  assert.deepStrictEqual(connected(r), [["w1", T0], ["w2", T0]]);
});

check("Square: connected and reconnect_required are connections; disconnected is not", () => {
  const r = deriveEvents({ squareConnections: [
    { id: "s1", companyId: "c1", provider: "square", merchantId: "M1", status: "connected", connectedAtMs: T0 },
    { id: "s2", companyId: "c1", provider: "square", merchantId: "M2", status: "reconnect_required", connectedAtMs: T0 },
    { id: "s3", companyId: "c1", provider: "square", merchantId: "M3", status: "disconnected", connectedAtMs: T0 }
  ] });
  assert.deepStrictEqual(connected(r), [["s1", T0], ["s2", T0]]);
});

check("eBay: connected (read-only sandbox connection included) and reconnect_required are connections; a fresh row whose connectedAtMs is 0 takes its time from createdAt; disconnected (owner or account deleted) is not", () => {
  const r = deriveEvents({ ebayConnections: [
    { id: "b1", companyId: "c1", status: "connected", readOnly: true, connectedAtMs: T0, disconnectedAtMs: 0 },
    { id: "b2", companyId: "c1", status: "connected", connectedAtMs: 0, createdAt: ts(T1), disconnectedAtMs: 0 },
    { id: "b3", companyId: "c1", status: "reconnect_required", connectedAtMs: T0, lastErrorCode: "credentials_rejected" },
    { id: "b4", companyId: "c1", status: "disconnected", connectedAtMs: T0, disconnectedAtMs: T1, disconnectReason: "owner" },
    { id: "b5", companyId: "c1", status: "disconnected", connectedAtMs: T0, disconnectReason: "ebay_account_deleted", sellerUsername: "" }
  ] });
  assert.deepStrictEqual(connected(r), [["b1", T0], ["b3", T0], ["b2", T1]], "events come back in time order");
});

check("a row with no status word counts only when it carries a connect time (older rows); a row with neither is nothing", () => {
  const r = deriveEvents({ wooConnections: [{ id: "old1", companyId: "c1", connectedAtMs: T0 }, { id: "old2", companyId: "c1" }] });
  assert.deepStrictEqual(connected(r), [["old1", T0]]);
});

check("a workspace whose only store rows are disconnected/uninstalled derives no connection at all — and a workspace with none derives none", () => {
  const none = deriveEvents({ shopifyStores: [{ id: "x", status: "uninstalled" }], etsyConnections: [{ id: "y", status: "disconnected" }], wooConnections: [], squareConnections: [], ebayConnections: [{ id: "z", status: "disconnected" }] });
  assert.deepStrictEqual(connected(none), []);
  assert.deepStrictEqual(connected(deriveEvents({})), []);
});

check("one connected event per connection, across connectors, in time order", () => {
  const r = deriveEvents({ shopifyStores: [{ id: "shop", status: "active", linkedAt: ts(T1) }], ebayConnections: [{ id: "ebay", status: "connected", connectedAtMs: T0 }] });
  assert.deepStrictEqual(connected(r), [["ebay", T0], ["shop", T1]]);
});

(async () => {
  for (const { name, run } of checks) { try { await run(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n").slice(0, 4).join(" | ").slice(0, 400)); } }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ DERIVE CONNECTIONS GEÇTİ");
})();
