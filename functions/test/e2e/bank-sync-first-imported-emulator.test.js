// Bank feed sync on a real Firestore with TrueLayer replaced by a stub fetch:
// a row keeps the firstImportedAt it was given on its first sync, a later sync
// only moves importedAt, a new row gets its own stamp, and re-syncs upsert
// instead of duplicating. (The id scan that guards firstImportedAt used an
// upper bound equal to its lower bound — an empty range — so every sync
// re-stamped every row; this pins the fix.)
//   firebase emulators:exec --only firestore "node functions/test/e2e/bank-sync-first-imported-emulator.test.js"
const assert = require("assert");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.NIVADESK_TL_CLIENT_ID = "tl-test-id";
process.env.NIVADESK_TL_CLIENT_SECRET = "tl-test-secret";

const bank = { transactions: [], tokenCalls: 0, dataCalls: [] };
function tx(id, amount, description, iso) {
  return { transaction_id: id, normalised_provider_transaction_id: `norm_${id}`, provider_transaction_id: `prov_${id}`, timestamp: iso, amount, currency: "GBP",
    description, merchant_name: description.split(" ")[0], transaction_type: amount < 0 ? "DEBIT" : "CREDIT", transaction_category: "PURCHASE" };
}
const jsonResponse = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/connect/token")) { bank.tokenCalls += 1; return jsonResponse({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }); }
  bank.dataCalls.push(u);
  if (u.includes("/transactions/pending")) return jsonResponse({ results: [] });
  if (u.includes("/transactions")) return jsonResponse({ results: bank.transactions.map((t) => ({ ...t })) });
  return jsonResponse({ error: "not stubbed: " + u }, 404);
};

const admin = require("firebase-admin");
const index = require("../../index");
const db = admin.firestore();

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 320)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

const COMPANY = "e2e-bank-company"; const OWNER = COMPANY; const CONN = "conn-1"; const ACCOUNT = "acc_1";
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const company = () => db.collection("companies").doc(COMPANY);
const txDoc = (id) => company().collection("bankTransactions").doc(`${ACCOUNT}_${id}`);
const millis = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : null);

(async () => {
  await db.recursiveDelete(company());
  await company().set({ companyName: "Bank Co", ownerUid: OWNER, bankFeedEnabled: true });
  await company().collection("bankConnections").doc(CONN).set({ status: "linked", providerName: "Test Bank", accounts: [{ id: ACCOUNT, name: "Current" }] });
  await company().collection("bankTokens").doc(CONN).set({ refreshToken: "rt-0" });
  bank.transactions = [tx("t1", -12.5, "CAFE NERO", "2026-09-01T10:00:00Z"), tx("t2", 250, "STRIPE PAYOUT", "2026-09-01T12:00:00Z")];

  let first1 = null; let imported1 = null;
  await check("the first sync imports both rows and stamps firstImportedAt once", async () => {
    const out = await index.bankSyncTransactions.run({ auth, data: { companyId: COMPANY, force: true }, rawRequest: {} });
    assert.strictEqual(out.synced, 1); assert.strictEqual(out.imported, 2);
    const t1 = (await txDoc("t1").get()).data();
    assert.ok(t1, "row t1 exists"); assert.strictEqual(t1.amount, -12.5); assert.strictEqual(t1.provider, "truelayer");
    first1 = millis(t1.firstImportedAt); imported1 = millis(t1.importedAt);
    assert.ok(first1 > 0 && imported1 > 0, "both stamps set on a brand-new row");
    assert.strictEqual((await company().collection("bankTransactions").get()).size, 2);
  });

  await new Promise((resolve) => setTimeout(resolve, 1200));
  bank.transactions.push(tx("t3", -8, "TFL TRAVEL", "2026-09-02T08:00:00Z"));
  await check("a later sync keeps t1's firstImportedAt, moves its importedAt, stamps the new row and duplicates nothing", async () => {
    const out = await index.bankSyncTransactions.run({ auth, data: { companyId: COMPANY, force: true }, rawRequest: {} });
    assert.strictEqual(out.imported, 3);
    const t1 = (await txDoc("t1").get()).data();
    assert.strictEqual(millis(t1.firstImportedAt), first1, "firstImportedAt is written on the first sync only");
    assert.ok(millis(t1.importedAt) > imported1, "importedAt is rewritten every sync");
    const t3 = (await txDoc("t3").get()).data();
    assert.ok(millis(t3.firstImportedAt) > first1, "the new row gets its own, later stamp");
    assert.strictEqual((await company().collection("bankTransactions").get()).size, 3, "re-syncs upsert, never duplicate");
  });

  await check("the id scan only ever asked the bank for what it needed: one token exchange per sync", async () => {
    assert.strictEqual(bank.tokenCalls, 2);
  });

  await db.recursiveDelete(company());
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
