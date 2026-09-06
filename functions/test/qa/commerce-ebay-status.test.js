// The one status table (design §2.1, §10), row by row: stored status + error
// code + flag + staleness → the specification's enum → the card state. The
// three clients copy this mapping line for line, so the sets are exported
// constants and the staleness rule lives inside the table, not beside it.
const assert = require("assert");
const status = require("../../commerce/ebay/status");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

const NOW = Date.parse("2026-09-06T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const connected = (extra = {}) => ({ status: "connected", lastErrorCode: "", lastSuccessAtMs: NOW - HOUR, settings: { autoSync: true }, importState: "done", ...extra });
const spec = (doc, opts = {}) => status.specStatusOf(doc, { flagOn: true, now: NOW, ...opts });

check("the exported sets are the ones the clients copy", () => {
  assert.deepStrictEqual(status.BENIGN_ERROR_CODES.slice(), ["", "truncated", "paused_by_owner"]);
  assert.deepStrictEqual(status.TRANSIENT_ERROR_CODES.slice(), ["rate_limited", "partial_pass", "provider_unavailable", "permission_missing", "token_request_invalid", "app_credentials_invalid"]);
  assert.strictEqual(status.STALE_AFTER_MS, 6 * HOUR);
  assert.deepStrictEqual(status.ATTENTION_STATUSES.slice(), ["reauthorization_required", "suspended", "degraded"]);
});

check("connected with a benign code is connected_read_only — never plain connected, because this half proves no write", () => {
  assert.strictEqual(spec(connected()), "connected_read_only");
  assert.strictEqual(spec(connected({ lastErrorCode: "truncated" })), "connected_read_only", "the watermark advanced through what was read");
  assert.strictEqual(spec(connected({ lastErrorCode: "paused_by_owner" })), "connected_read_only");
  assert.ok(!Object.values({ a: spec(connected()) }).includes("connected"));
});

check("a transient code is degraded", () => {
  for (const code of status.TRANSIENT_ERROR_CODES) assert.strictEqual(spec(connected({ lastErrorCode: code })), "degraded", code);
});

check("the flag off, or an environment mismatch, is suspended (whatever the code)", () => {
  assert.strictEqual(spec(connected(), { flagOn: false }), "suspended");
  assert.strictEqual(spec(connected({ lastErrorCode: "rate_limited" }), { flagOn: false }), "suspended");
  assert.strictEqual(spec(connected({ lastErrorCode: "environment_mismatch" })), "suspended");
});

check("reconnect_required is reauthorization_required; disconnected is disconnected; no status yet is connecting", () => {
  assert.strictEqual(spec({ status: "reconnect_required", lastErrorCode: "credentials_rejected" }), "reauthorization_required");
  assert.strictEqual(spec({ status: "reconnect_required", lastErrorCode: "token_unreadable" }), "reauthorization_required");
  assert.strictEqual(spec({ status: "reconnect_required", lastErrorCode: "refresh_token_expiring" }), "reauthorization_required");
  assert.strictEqual(spec({ status: "disconnected" }), "disconnected");
  assert.strictEqual(spec({ status: "disconnected" }, { flagOn: false }), "disconnected", "a disconnected row is not suspended, it is gone");
  assert.strictEqual(spec({}), "connecting");
});

check("no successful pass for six hours is degraded even with a benign code — but only when auto-sync is on and the import is done", () => {
  assert.strictEqual(spec(connected({ lastSuccessAtMs: NOW - 7 * HOUR })), "degraded");
  assert.strictEqual(spec(connected({ lastSuccessAtMs: NOW - 5 * HOUR })), "connected_read_only");
  assert.strictEqual(spec(connected({ lastSuccessAtMs: NOW - 7 * HOUR, settings: { autoSync: false } })), "connected_read_only", "auto-sync off: nothing was supposed to run");
  assert.strictEqual(spec(connected({ lastSuccessAtMs: 0, importState: "none" })), "connected_read_only", "awaiting the first import: nothing was supposed to run");
  assert.strictEqual(spec(connected({ lastSuccessAtMs: 0, importState: "running" })), "connected_read_only");
});

check("card state: no rows → connect (coming_soon when the server is not configured); every live row needing attention → attention; else connected", () => {
  assert.strictEqual(status.cardStateOf([]), "connect");
  assert.strictEqual(status.cardStateOf([], { configured: false }), "coming_soon");
  assert.strictEqual(status.cardStateOf([{ status: "disconnected", specStatus: "disconnected" }]), "connect", "a disconnected row is not a connection");
  assert.strictEqual(status.cardStateOf([{ status: "connected", specStatus: "connected_read_only" }]), "connected");
  assert.strictEqual(status.cardStateOf([{ status: "reconnect_required", specStatus: "reauthorization_required" }]), "attention");
  assert.strictEqual(status.cardStateOf([{ status: "connected", specStatus: "suspended" }]), "attention");
  assert.strictEqual(status.cardStateOf([{ status: "connected", specStatus: "degraded" }]), "attention");
  assert.strictEqual(status.cardStateOf([{ status: "connected", specStatus: "degraded" }, { status: "connected", specStatus: "connected_read_only" }]), "connected", "one healthy account keeps the card connected");
  assert.strictEqual(status.needsAttention("degraded"), true); assert.strictEqual(status.needsAttention("connected_read_only"), false);
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ COMMERCE EBAY STATUS GEÇTİ");
