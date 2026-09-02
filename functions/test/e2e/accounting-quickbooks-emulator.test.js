// QuickBooks Online accounting connector (phases 1–2) against the Firestore
// emulator with a fake Intuit: connect through a single-use state, catalogue
// import, mapping suggestions and validation, the one-writer rule next to a
// linked Pandle, webhook idempotency, CDC reconciliation with an accountant's
// edit, token rotation, disconnect. Network is blocked; Intuit is a fake.
//   firebase emulators:exec --only firestore --project eggcraft-studio "test/e2e/run-one.sh accounting-quickbooks-emulator"
const assert = require("assert");
const crypto = require("crypto");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.NIVADESK_QBO_CLIENT_ID = "qbo-client-id";
process.env.NIVADESK_QBO_CLIENT_SECRET = "qbo-client-secret";
process.env.NIVADESK_QBO_WEBHOOK_VERIFIER = "qbo-verifier-token";
process.env.NIVADESK_QBO_TOKEN_KEY = crypto.randomBytes(32).toString("hex");

const REALM = "9130350000000001";
const remote = {
  companyInfo: { Id: "1", CompanyName: "EGGcraft Ltd", LegalName: "EGGcraft Limited", Country: "GB", FiscalYearStartMonth: "April", SyncToken: "0", MetaData: { LastUpdatedTime: "2026-01-01T00:00:00Z" } },
  preferences: { CurrencyPrefs: { HomeCurrency: { value: "GBP" }, MultiCurrencyEnabled: false }, TaxPrefs: { UsingSalesTax: true }, AccountingInfoPrefs: { BookCloseDate: "2025-12-31" } },
  Account: [
    { Id: "a1", Name: "Sales of Product Income", FullyQualifiedName: "Sales of Product Income", AccountType: "Income", AccountSubType: "SalesOfProductIncome", Active: true, SyncToken: "1", MetaData: { LastUpdatedTime: "2026-01-01T00:00:00Z" } },
    { Id: "a2", Name: "PayPal Fees", FullyQualifiedName: "PayPal Fees", AccountType: "Expense", AccountSubType: "BankCharges", Active: true, SyncToken: "1" },
    { Id: "a3", Name: "PayPal GBP Clearing", FullyQualifiedName: "PayPal GBP Clearing", AccountType: "Other Current Asset", AccountSubType: "OtherCurrentAssets", Active: true, SyncToken: "1" }
  ],
  TaxRate: [{ Id: "r20", Name: "Standard 20%", RateValue: 20, Active: true }, { Id: "r0", Name: "Zero 0%", RateValue: 0, Active: true }],
  TaxCode: [
    { Id: "S", Name: "20.0% S", Description: "Standard", Active: true, Taxable: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "r20" } }] } },
    { Id: "Z", Name: "0.0% Z", Description: "Zero-rated", Active: true, Taxable: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "r0" } }] } },
    { Id: "N", Name: "No VAT", Description: "Out of scope", Active: true, Taxable: false }
  ],
  Customer: [{ Id: "c10", DisplayName: "Ada Lovelace", PrimaryEmailAddr: { Address: "ada@example.com" }, Balance: 0, Active: true, SyncToken: "2", MetaData: { LastUpdatedTime: "2026-08-01T00:00:00Z" } }],
  Vendor: [{ Id: "v1", DisplayName: "Beads Ltd", Active: true, SyncToken: "0" }],
  Item: [{ Id: "i1", Name: "Signet ring", Type: "NonInventory", IncomeAccountRef: { value: "a1" }, Active: true, SyncToken: "0" }],
  Invoice: [{ Id: "inv-7", DocNumber: "1007", TxnDate: "2026-09-01", TotalAmt: 240, Balance: 0, CustomerRef: { value: "c10", name: "Ada Lovelace" }, SyncToken: "4", MetaData: { LastUpdatedTime: "2026-09-02T09:00:00Z" }, Line: [] }],
  cdc: []
};
const calls = { exchange: 0, refresh: 0, revoke: 0, reads: [] };
global.__nivadeskQboFakeOAuth = {
  exchangeCode: async ({ code }) => { calls.exchange += 1; if (code !== "good-code") { const e = new Error("intuit_token_400"); e.errorClass = "auth"; throw e; } return { accessToken: "at-1", refreshToken: "rt-1", expiresAtMs: Date.now() + 3600e3, refreshExpiresAtMs: Date.now() + 100 * 86400e3 }; },
  refreshTokens: async ({ refreshToken }) => { calls.refresh += 1; return { accessToken: `at-${calls.refresh + 1}`, refreshToken: `${refreshToken}-rotated`, expiresAtMs: Date.now() + 3600e3, refreshExpiresAtMs: Date.now() + 100 * 86400e3 }; },
  revokeToken: async () => { calls.revoke += 1; return true; }
};
global.__nivadeskQboFakeClient = ({ realmId, accessToken }) => ({
  environment: "sandbox", realmId,
  async companyInfo() { assert.ok(accessToken, "a token is always presented"); return remote.companyInfo; },
  async preferences() { return remote.preferences; },
  async queryAll(entity) { return remote[entity] || []; },
  async cdc() { return remote.cdc; },
  async read(entity, id) { calls.reads.push(`${entity}:${id}`); return (remote[entity] || []).find((row) => row.Id === id) || null; }
});
globalThis.fetch = async () => { throw new Error("no real network in this test"); };

const admin = require("firebase-admin");
const index = require("../../index.js");
const db = admin.firestore();

const COMPANY = "e2e-qbo-company";
const OWNER = COMPANY;
const MEMBER = "e2e-qbo-member";
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const memberAuth = { uid: MEMBER, token: { email: "member@example.com" } };
const company = () => db.collection("companies").doc(COMPANY);
const CONNECTION_ID = `quickbooks_online__${REALM}`;

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; const where = String(error && error.stack || "").split("\n").find((line) => line.includes("emulator.test.js")) || ""; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 320), where.trim()); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }
function fakeResponse() {
  const res = { statusCode: 200, payload: null, redirectedTo: "" };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.payload = payload; return res; };
  res.send = res.json;
  res.set = () => res;
  res.redirect = (code, url) => { res.statusCode = code; res.redirectedTo = url; return res; };
  return res;
}
function signed(body) {
  const raw = Buffer.from(JSON.stringify(body));
  return { rawBody: raw, headers: { "intuit-signature": crypto.createHmac("sha256", process.env.NIVADESK_QBO_WEBHOOK_VERIFIER).update(raw).digest("base64") }, method: "POST", body };
}
async function callback(query) {
  const res = fakeResponse();
  await index.quickbooksOAuthCallback(Object.assign({ query, method: "GET", headers: {} }), res);
  return new URL(res.redirectedTo);
}

(async () => {
  await db.recursiveDelete(company());
  await db.collection("accountingRealms").doc(`quickbooks_online__${REALM}`).delete().catch(() => undefined);
  await company().set({ companyName: "QBO Co", ownerUid: OWNER, billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe", memberAccess: { [MEMBER]: { bankFeed: true } } });
  await db.collection("musteriler").doc("cust-ada").set({ companyId: COMPANY, customerName: "Ada Lovelace Ltd", emailAddress: "ada@example.com" });

  let state = "";
  await check("connect start hands back a single-use state and the Intuit authorize URL", async () => {
    const result = await index.quickbooksConnectStart.run({ auth, data: { companyId: COMPANY, environment: "sandbox" }, rawRequest: {} });
    assert.strictEqual(result.ok, true);
    assert.ok(result.authorizeUrl.startsWith("https://appcenter.intuit.com/connect/oauth2?"));
    assert.ok(result.authorizeUrl.includes("redirect_uri=https%3A%2F%2Feurope-west2-eggcraft-studio.cloudfunctions.net%2FquickbooksOAuthCallback"));
    state = result.state;
    const stateDoc = (await db.collection("accountingConnectStates").doc(state).get()).data();
    assert.strictEqual(stateDoc.companyId, COMPANY); assert.strictEqual(stateDoc.used, false); assert.strictEqual(stateDoc.environment, "sandbox");
    await assert.rejects(index.quickbooksConnectStart.run({ auth: memberAuth, data: { companyId: COMPANY }, rawRequest: {} }), /owner/, "members cannot connect");
  });

  await check("the callback refuses an unknown state and a denied consent without touching Intuit", async () => {
    const bad = await callback({ code: "good-code", state: "nope", realmId: REALM });
    assert.strictEqual(bad.searchParams.get("quickbooks"), "error"); assert.strictEqual(bad.searchParams.get("reason"), "state");
    const denied = await callback({ error: "access_denied", state, realmId: REALM });
    assert.strictEqual(denied.searchParams.get("quickbooks"), "cancelled");
    assert.strictEqual(calls.exchange, 0);
  });

  await check("a good callback links the realm: boxed tokens, a linked shadow_read connection, the realm map, one audit line — and the state cannot be replayed", async () => {
    const ok = await callback({ code: "good-code", state, realmId: REALM });
    assert.strictEqual(ok.searchParams.get("quickbooks"), "connected", ok.toString());
    assert.strictEqual(ok.searchParams.get("section"), "quickbooks");
    const conn = (await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(conn.status, "linked"); assert.strictEqual(conn.mode, "shadow_read"); assert.strictEqual(conn.companyName, "EGGcraft Ltd"); assert.strictEqual(conn.homeCurrency, "GBP"); assert.strictEqual(conn.setupState, "importing");
    assert.deepStrictEqual(conn.capabilities.bankFeedPendingRows, { read: false, write: false });
    const tokens = (await company().collection("accountingTokens").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(typeof tokens.accessTokenEncrypted, "object"); assert.ok(!JSON.stringify(tokens).includes("at-1"), "no plaintext token at rest");
    const realm = (await db.collection("accountingRealms").doc(`quickbooks_online__${REALM}`).get()).data();
    assert.strictEqual(realm.companyId, COMPANY); assert.strictEqual(realm.connectionId, CONNECTION_ID);
    const replay = await callback({ code: "good-code", state, realmId: REALM });
    assert.strictEqual(replay.searchParams.get("reason"), "state", "a used state is dead");
    assert.strictEqual(calls.exchange, 1);
  });

  await check("sync now imports the catalogue into identities and the mapping catalogue, and starts the CDC cursors", async () => {
    const result = await index.quickbooksSyncNow.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.counts, { accounts: 3, taxCodes: 3, taxRates: 2, customers: 1, vendors: 1, items: 1 });
    const catalog = (await company().collection("accountingCatalog").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(catalog.accounts.length, 3); assert.strictEqual(catalog.taxCodes.find((t) => t.externalId === "S").effectiveSalesRate, 20);
    const contacts = (await company().collection("accountingCatalog").doc(`${CONNECTION_ID}__contacts`).get()).data();
    assert.strictEqual(contacts.customers[0].displayName, "Ada Lovelace");
    const identity = (await company().collection("accountingIdentities").doc(`quickbooks_online__${CONNECTION_ID}__Customer__c10`).get()).data();
    assert.strictEqual(identity.externalSyncToken, "2"); assert.strictEqual(identity.snapshot.email, "ada@example.com");
    const conn = (await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(conn.setupState, "ready"); assert.strictEqual(conn.counts.accounts, 3); assert.ok(conn.lastReconciliationAtMs > 0);
    const cursor = (await company().collection("accountingCursors").doc(`${CONNECTION_ID}__Invoice`).get()).data();
    assert.ok(cursor.changedSinceMs > 0);
    await assert.rejects(index.quickbooksSyncNow.run({ auth: memberAuth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} }), /owner/);
  });

  await check("suggestions name the obvious accounts and VAT codes and list the duplicate customer, and saving validates against the catalogue", async () => {
    const suggestions = await index.accountingMappingSuggestions.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} });
    assert.strictEqual(suggestions.accounts.product_sales.externalId, "a1"); assert.strictEqual(suggestions.accounts.paypal_fees.externalId, "a2"); assert.strictEqual(suggestions.accounts.clearing_paypal.externalId, "a3");
    assert.strictEqual(suggestions.taxes.ST.externalId, "S"); assert.strictEqual(suggestions.taxes.ZR.externalId, "Z"); assert.strictEqual(suggestions.taxes.OS.externalId, "N");
    assert.strictEqual(suggestions.duplicates.length, 1); assert.strictEqual(suggestions.duplicates[0].candidates[0].externalId, "c10"); assert.strictEqual(suggestions.duplicates[0].candidates[0].reason, "same_email");
    await assert.rejects(index.accountingSaveMappings.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, accounts: { product_sales: "a999" } }, rawRequest: {} }), /not in the imported chart/);
    await assert.rejects(index.accountingSaveMappings.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, accounts: { made_up: "a1" } }, rawRequest: {} }), /Unknown account mapping/);
    const saved = await index.accountingSaveMappings.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, accounts: { product_sales: "a1", paypal_fees: "a2" }, taxes: { ST: "S", ZR: "Z" }, policies: { sources: { manual: "detailed", etsy: "daily_summary" }, bespoke: "milestone_invoices", inventory: "purchases_expensed", effectiveFrom: "2027-01-01" }, checklist: { paypalAppActive: false, squareAppActive: false, salesAppWrites: false, bankFeedConnected: true, inventoryAppWritesCogs: false } }, rawRequest: {} });
    assert.strictEqual(saved.mappings.accounts.product_sales.name, "Sales of Product Income"); assert.strictEqual(saved.mappings.taxes.ST.rate, 20); assert.strictEqual(saved.mappings.policies.sources.etsy, "daily_summary"); assert.strictEqual(saved.mappings.checklist.bankFeedConnected, true);
    await assert.rejects(index.accountingSaveMappings.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, policies: { sources: { etsy: "sometimes" } } }, rawRequest: {} }), /Unknown posting mode/);
  });

  await check("one writer: a linked Pandle with no end date blocks primary_write; a dated migration hands over cleanly", async () => {
    await assert.rejects(index.accountingSetMode.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, mode: "primary_write" }, rawRequest: {} }), /writeBoundaryDate/);
    await company().collection("pandleConnection").doc("main").set({ status: "linked", pandleCompanyId: "p1", pandleCompanyName: "EGGcraft (Pandle)" });
    await assert.rejects(index.accountingSetMode.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, mode: "primary_write", writeBoundaryDate: "2027-01-01" }, rawRequest: {} }), (error) => /already writes/.test(error.message) && error.details?.code === "double_writer");
    const plan = await index.accountingPlanMigration.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, boundaryDate: "2027-01-01" }, rawRequest: {} });
    assert.strictEqual(plan.pandleUntil, "2026-12-31");
    const byId = Object.fromEntries(plan.connections.map((row) => [row.connectionId, row]));
    assert.strictEqual(byId[CONNECTION_ID].mode, "primary_write"); assert.strictEqual(byId[CONNECTION_ID].writeBoundaryDate, "2027-01-01");
    assert.strictEqual(byId.pandle__main.mode, "migration_read"); assert.strictEqual(byId.pandle__main.writeUntilDate, "2026-12-31");
    const overview = await index.accountingOverview.run({ auth: memberAuth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.strictEqual(overview.connections.length, 2, "a member with bank access sees both providers");
    assert.strictEqual(overview.postings.phase, "read_only");
    assert.ok(overview.audit.some((row) => row.action === "mode"));
  });

  await check("a webhook is verified, written once to the inbox, and the entity is read back into its identity; the same event ten times is one update", async () => {
    remote.Customer[0] = { ...remote.Customer[0], DisplayName: "Ada Lovelace (edited)", SyncToken: "3", MetaData: { LastUpdatedTime: "2026-09-02T10:00:00Z" } };
    const payload = [{ specversion: "1.0", id: "evt-100", source: "intuit.x", type: "qbo.customer.updated.v1", datacontenttype: "application/json", time: "2026-09-02T10:00:01Z", intuitentityid: "c10", intuitaccountid: REALM }];
    const unsigned = fakeResponse();
    await index.quickbooksWebhook({ ...signed(payload), headers: { "intuit-signature": "bad" } }, unsigned);
    assert.strictEqual(unsigned.statusCode, 401);
    const readsBefore = calls.reads.length;
    for (let i = 0; i < 10; i += 1) { const res = fakeResponse(); await index.quickbooksWebhook(signed(payload), res); assert.strictEqual(res.statusCode, 200); }
    assert.strictEqual(calls.reads.length - readsBefore, 1, "one fetch for ten deliveries");
    const inbox = await company().collection("accountingInbox").get();
    assert.strictEqual(inbox.docs.filter((doc) => doc.id === "qbo__evt-100").length, 1);
    assert.strictEqual(inbox.docs.find((doc) => doc.id === "qbo__evt-100").data().status, "processed");
    const identity = (await company().collection("accountingIdentities").doc(`quickbooks_online__${CONNECTION_ID}__Customer__c10`).get()).data();
    assert.strictEqual(identity.snapshot.displayName, "Ada Lovelace (edited)"); assert.strictEqual(identity.externalSyncToken, "3"); assert.strictEqual(identity.lastSource, "webhook");
    const legacy = fakeResponse();
    await index.quickbooksWebhook(signed({ eventNotifications: [{ realmId: REALM, dataChangeEvent: { entities: [{ name: "Vendor", id: "v1", operation: "Update", lastUpdated: "2026-09-02T10:05:00.000Z" }] } }] }), legacy);
    assert.strictEqual(legacy.payload.format, "legacy"); assert.strictEqual(legacy.payload.processed, 1);
    const foreign = fakeResponse();
    await index.quickbooksWebhook(signed([{ specversion: "1.0", id: "evt-x", type: "qbo.customer.updated.v1", intuitentityid: "1", intuitaccountid: "unknown-realm" }]), foreign);
    assert.strictEqual(foreign.payload.unknownRealm, 1);
  });

  await check("reconciliation reads CDC changes, marks deletions, and opens Needs Attention when a document NivaDesk posted was changed by someone else", async () => {
    await company().collection("accountingIdentities").doc(`quickbooks_online__${CONNECTION_ID}__Invoice__inv-7`).set({ companyId: COMPANY, provider: "quickbooks_online", connectionId: CONNECTION_ID, entityType: "Invoice", externalId: "inv-7", externalSyncToken: "3", nivadeskEntityType: "order", nivadeskEntityId: "order-1", snapshot: { totalAmount: 240 } });
    remote.cdc = [
      { entity: "Invoice", row: remote.Invoice[0], deleted: false },
      { entity: "Item", row: { Id: "i1", status: "Deleted" }, deleted: true },
      { entity: "Customer", row: { Id: "c11", DisplayName: "New Customer", SyncToken: "0", MetaData: { LastUpdatedTime: "2026-09-02T11:00:00Z" } }, deleted: false }
    ];
    const conn = { connectionId: CONNECTION_ID, ...(await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data() };
    const summary = await index._e2e.accounting.reconcileConnection(COMPANY, conn);
    assert.strictEqual(summary.scanned, 3); assert.strictEqual(summary.changed, 1); assert.strictEqual(summary.deleted, 1); assert.strictEqual(summary.created, 1); assert.strictEqual(summary.failed, 0);
    const item = (await company().collection("accountingIdentities").doc(`quickbooks_online__${CONNECTION_ID}__Item__i1`).get()).data();
    assert.ok(item.deletedAtMs > 0);
    const attention = await company().collection("accountingAttention").where("status", "==", "open").get();
    const changed = attention.docs.map((doc) => doc.data()).find((row) => row.kind === "changed_in_quickbooks");
    assert.ok(changed, "the accountant's edit is surfaced, not overwritten"); assert.ok(changed.message.includes("3 → 4"));
    const invoice = (await company().collection("accountingIdentities").doc(`quickbooks_online__${CONNECTION_ID}__Invoice__inv-7`).get()).data();
    assert.strictEqual(invoice.externalSyncToken, "4"); assert.strictEqual(invoice.nivadeskEntityId, "order-1", "the NivaDesk link survives");
    await assert.rejects(index.accountingAttentionResolve.run({ auth, data: { companyId: COMPANY, id: attention.docs[0].id, action: "ignore" }, rawRequest: {} }), /reason/);
    await index.accountingAttentionResolve.run({ auth, data: { companyId: COMPANY, id: attention.docs[0].id, action: "ignore", reason: "accountant corrected the total on purpose" }, rawRequest: {} });
    assert.strictEqual((await company().collection("accountingAttention").doc(attention.docs[0].id).get()).data().status, "ignored");
  });

  await check("a forced token refresh keeps the rotated refresh token, and disconnect revokes, forgets the tokens and frees the realm", async () => {
    const token = await index._e2e.accounting.refreshTokenWithLock(COMPANY, CONNECTION_ID, { force: true });
    assert.strictEqual(token, "at-2"); assert.strictEqual(calls.refresh, 1);
    const stored = (await company().collection("accountingTokens").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(stored.tokenRefreshLockUntilMs, 0);
    const again = await index._e2e.accounting.refreshTokenWithLock(COMPANY, CONNECTION_ID, { force: true });
    assert.strictEqual(again, "at-3", "the second refresh used the rotated refresh token");
    const activity = await index.accountingSyncActivity.run({ auth: memberAuth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.ok(activity.inbox.length >= 2); assert.ok(activity.audit.length >= 3);
    const result = await index.quickbooksDisconnect.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} });
    assert.strictEqual(result.revoked, true); assert.strictEqual(calls.revoke, 1);
    assert.strictEqual((await company().collection("accountingTokens").doc(CONNECTION_ID).get()).exists, false);
    assert.strictEqual((await db.collection("accountingRealms").doc(`quickbooks_online__${REALM}`).get()).exists, false);
    const conn = (await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(conn.status, "disconnected"); assert.strictEqual(conn.mode, "disabled");
    const gone = fakeResponse();
    await index.quickbooksWebhook(signed([{ specversion: "1.0", id: "evt-after", type: "qbo.customer.updated.v1", intuitentityid: "c10", intuitaccountid: REALM }]), gone);
    assert.strictEqual(gone.payload.unknownRealm, 1, "a disconnected realm's events are not applied");
  });

  await db.collection("musteriler").doc("cust-ada").delete();
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
