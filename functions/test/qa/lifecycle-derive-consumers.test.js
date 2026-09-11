// derive.js has two production readers: getActivationFunnel and nvRetentionTriggerFor (the hourly
// retentionSweep and the read-time getRetentionMessage). This file shows what the candidate's
// per-connector "live" rule changes for each of them on the one row shape that flips — a Shopify
// store the merchant uninstalled — and therefore what stays different if ONLY the funnel is deployed.
// The live reader's rule (status !== "unlinked") is written out here as a literal so both sides are
// computed from the same rows; it is a copy of what runs in getactivationfunnel-00003-cuv and in the
// live retentionSweep/getRetentionMessage, labelled as such.
const assert = require("assert");
const derive = require("../../lifecycle/derive");
const activation = require("../../lifecycle/activation");
const retention = require("../../lifecycle/retention");
const writer = require("../../retention/writer");
let failures = 0; const checks = []; const check = (name, run) => checks.push({ name, run });
const HOUR = 3600 * 1000, DAY = 24 * HOUR; const T0 = Date.UTC(2026, 8, 1, 9, 0, 0); const NOW = T0 + 3 * DAY;
const ts = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
const settings = { businessOnboardingCompleted: true, businessOnboardingCompletedAt: ts(T0), onboardingStartChoice: "shopify" };   // the wizard answer that puts a workspace on the commerce path
const uninstalled = { id: "shop.myshopify.com", companyId: "c1", linkedUid: "u1", linkedAt: ts(T0 + HOUR), status: "uninstalled", uninstalledAt: ts(T0 + DAY), accessToken: "" };
const snapshot = { settings, orders: [], customers: [], shopifyStores: [uninstalled], etsyConnections: [], wooConnections: [], squareConnections: [], ebayConnections: [] };
const liveEvents = () => {
  // the live reader: every row whose status is not "unlinked" is a connection
  const events = derive.deriveEvents({ ...snapshot, shopifyStores: [] }).events;
  for (const row of snapshot.shopifyStores) if (row.status !== "unlinked") events.push({ name: "integration_connected", atMs: derive.firstTime(row.linkedAt, row.createdAt, row.updatedAt), subjectId: row.id });
  return events.sort((a, b) => a.atMs - b.atMs);
};
const candidateEvents = () => derive.deriveEvents(snapshot).events;
const path = activation.activationPathFor(settings);
function fakeDb() {
  const store = new Map();
  const docRef = (p) => ({ id: p.split("/").pop(), path: p, async get() { return { exists: store.has(p), id: p.split("/").pop(), data: () => (store.has(p) ? { ...store.get(p) } : undefined) }; }, async set(d, o) { store.set(p, o && o.merge && store.has(p) ? { ...store.get(p), ...d } : { ...d }); }, async update(d) { store.set(p, { ...(store.get(p) || {}), ...d }); }, collection(n) { return colRef(`${p}/${n}`); } });
  const colRef = (p) => ({ doc(id) { return docRef(`${p}/${id}`); }, async get() { const docs = []; for (const [k, v] of store) if (k.startsWith(p + "/") && !k.slice(p.length + 1).includes("/")) docs.push({ id: k.split("/").pop(), data: () => ({ ...v }) }); return { docs, size: docs.length, empty: !docs.length }; }, where() { return this; }, limit() { return this; } });
  return { store, collection: (n) => colRef(n), async runTransaction(fn) { return fn({ async get(r) { return r.get(); }, set(r, d) { store.set(r.path, { ...d }); }, update(r, d) { store.set(r.path, { ...(store.get(r.path) || {}), ...d }); } }); } };
}
const ctx = { history: [], dismissals: [], unsubscribed: false, userReplied: false, supportCaseOpen: false, activated: false, workspaceCancelled: false };

check("the funnel (getActivationFunnel): an uninstalled Shopify store is a connection for the live reader and not for the candidate; the activation verdict is the same either way", () => {
  assert.strictEqual(path, "commerce");
  const live = activation.lifecycleState({ events: liveEvents(), path, nowMs: NOW });
  const cand = activation.lifecycleState({ events: candidateEvents(), path, nowMs: NOW });
  assert.ok(liveEvents().some((e) => e.name === "integration_connected"), "live counts it");
  assert.ok(!candidateEvents().some((e) => e.name === "integration_connected"), "the candidate does not");
  assert.strictEqual(live.progress.activated, false); assert.strictEqual(cand.progress.activated, false);
  assert.notStrictEqual(live.state, cand.state, "the funnel stage moves back one step for that workspace: " + live.state + " → " + cand.state);
});

check("campaign selection (retentionSweep, live derive): the uninstalled store counts as connected, so no connect_first_store nudge is ever proposed — the candidate rule would propose it after the setup-reminder delay", () => {
  const base = { nowMs: NOW, signedUpAtMs: T0, path, state: "onboarded", firstOrder: { state: "none" } };
  const live = retention.triggerCandidates({ ...base, events: liveEvents() }).map((c) => c.campaign);
  const cand = retention.triggerCandidates({ ...base, events: candidateEvents() }).map((c) => c.campaign);
  assert.ok(!live.includes("connect_first_store"), "live: " + live.join(","));
  assert.ok(cand.includes("connect_first_store"), "candidate: " + cand.join(","));
});

check("the pending card (getRetentionMessage / the sweep's review): with the live derive an open connect_first_store card is withdrawn goal_met by the uninstalled store; with the candidate rule it stays open", async () => {
  for (const [label, events, expectWithdrawn] of [["live", liveEvents(), true], ["candidate", candidateEvents(), false]]) {
    const db = fakeDb(); const id = "m1";
    await db.collection("companies").doc("c1").collection("retentionMessages").doc(id).set({ campaign: "connect_first_store", kind: "onboarding", status: "open", createdAtMs: NOW - HOUR });
    const r = await writer.reviewOpenMessages(db, "c1", { nowMs: NOW, messages: [{ id, campaign: "connect_first_store", kind: "onboarding", createdAtMs: NOW - HOUR, status: "open" }], doneEventNames: events.map((e) => e.name), context: ctx });
    const withdrawn = (r.withdrawn || []).some((w) => w.id === id && w.reason === "goal_met");
    assert.strictEqual(withdrawn, expectWithdrawn, label + ": " + JSON.stringify(r));
    assert.strictEqual(db.store.get("companies/c1/retentionMessages/m1").status, expectWithdrawn ? "withdrawn" : "open", label);
  }
});

check("the checklist path (getSetupChecklist) is not a derive.js reader — its own reads are untouched by this candidate", () => {
  const fs = require("fs"); const path_ = require("path");
  const index = fs.readFileSync(path_.join(__dirname, "..", "..", "index.js"), "utf8");
  const readers = [...index.matchAll(/deriveEvents\(/g)].length;
  assert.strictEqual(readers, 2, "exactly two deriveEvents call sites in index.js: getActivationFunnel and nvRetentionTriggerFor");
  const checklist = index.slice(index.indexOf("exports.getSetupChecklist"), index.indexOf("exports.getSetupChecklist") + 6000);
  assert.ok(!checklist.includes("deriveEvents("), "getSetupChecklist does not call deriveEvents");
});

(async () => {
  for (const { name, run } of checks) { try { await run(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n").slice(0, 4).join(" | ").slice(0, 500)); } }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ DERIVE CONSUMERS GEÇTİ");
})();
