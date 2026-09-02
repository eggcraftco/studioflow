// Xero accounting connector (XR phases 1–2) against the Firestore emulator with
// a fake Xero: connect through a single-use state, the one-organisation and the
// choose-an-organisation consents, catalogue import through If-Modified-Since,
// UK mapping suggestions, the intent-to-receive handshake and a signed
// webhook, reconciliation with an accountant's edit, the shared-grant token
// rotation, disconnect that removes one organisation and revokes only when the
// consent has no other organisation left. Network is blocked; Xero is a fake.
//   Terminal 1:  firebase emulators:start --only firestore
//   Terminal 2:  node functions/test/e2e/accounting-xero-emulator.test.js
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
process.env.NIVADESK_XERO_CLIENT_ID = "xero-client-id";
process.env.NIVADESK_XERO_CLIENT_SECRET = "xero-client-secret";
process.env.NIVADESK_XERO_WEBHOOK_KEY = "xero-webhook-key-base64";

const TENANT = "1f8b6c9e-0d2a-4f6b-9a3e-1234567890ab";
const TENANT2 = "2a9c7d1e-5b3f-4c8a-8d2e-abcdef123456";
const remote = {
  organisation: { OrganisationID: TENANT, Name: "EGGcraft Ltd", LegalName: "EGGcraft Limited", CountryCode: "GB", BaseCurrency: "GBP", FinancialYearEndDay: 31, FinancialYearEndMonth: 3, PeriodLockDate: "/Date(1767139200000+0000)/", TaxNumber: "GB123456789", IsDemoCompany: false, CreatedDateUTC: "/Date(1600000000000)/" },
  Currencies: [{ Code: "GBP" }],
  Accounts: [
    { AccountID: "acc-200", Code: "200", Name: "Sales", Type: "REVENUE", Class: "REVENUE", Status: "ACTIVE", UpdatedDateUTC: "/Date(1700000000000+0000)/" },
    { AccountID: "acc-404", Code: "404", Name: "Bank Fees", Type: "EXPENSE", Class: "EXPENSE", Status: "ACTIVE" },
    { AccountID: "acc-pp", Code: "095", Name: "PayPal Clearing", Type: "CURRENT", Class: "ASSET", Status: "ACTIVE" },
    { AccountID: "acc-old", Code: "999", Name: "Old Sales", Type: "REVENUE", Class: "REVENUE", Status: "ARCHIVED" }
  ],
  TaxRates: [
    { Name: "20% (VAT on Income)", TaxType: "OUTPUT2", Status: "ACTIVE", EffectiveRate: 20, CanApplyToRevenue: true, CanApplyToExpenses: false, TaxComponents: [{ Name: "VAT", Rate: 20 }] },
    { Name: "20% (VAT on Expenses)", TaxType: "INPUT2", Status: "ACTIVE", EffectiveRate: 20, CanApplyToRevenue: false, CanApplyToExpenses: true },
    { Name: "Zero Rated Income", TaxType: "ZERORATEDOUTPUT", Status: "ACTIVE", EffectiveRate: 0, CanApplyToRevenue: true },
    { Name: "Zero Rated EC Goods Income", TaxType: "ECZROUTPUT", Status: "ACTIVE", EffectiveRate: 0, CanApplyToRevenue: true },
    { Name: "No VAT", TaxType: "NONE", Status: "ACTIVE", EffectiveRate: 0, CanApplyToRevenue: true, CanApplyToExpenses: true }
  ],
  Contacts: [
    { ContactID: "con-ada", Name: "Ada Lovelace", EmailAddress: "Ada@Example.com", ContactStatus: "ACTIVE", IsCustomer: true, IsSupplier: false, UpdatedDateUTC: "/Date(1725148800000+0000)/" },
    { ContactID: "con-beads", Name: "Beads Ltd", ContactStatus: "ACTIVE", IsCustomer: false, IsSupplier: true },
    { ContactID: "con-fresh", Name: "Fresh Contact", ContactStatus: "ACTIVE", IsCustomer: false, IsSupplier: false }
  ],
  Items: [{ ItemID: "item-1", Code: "RING-1", Name: "Signet ring", IsSold: true, IsPurchased: false, SalesDetails: { UnitPrice: 240, AccountCode: "200", TaxType: "OUTPUT2" } }],
  Invoices: [{ InvoiceID: "inv-7", Type: "ACCREC", InvoiceNumber: "INV-1007", DateString: "2026-09-01T00:00:00", Total: 240, AmountDue: 0, Status: "AUTHORISED", Contact: { ContactID: "con-ada", Name: "Ada Lovelace" }, UpdatedDateUTC: "/Date(1788339600000+0000)/", LineItems: [{}] }],
  modified: {}
};
let tenantsToOffer = [{ xeroConnectionId: "xc-1", authEventId: "auth-evt-1", tenantId: TENANT, tenantType: "ORGANISATION", tenantName: "EGGcraft Ltd" }];
const calls = { exchange: 0, refresh: 0, revoke: 0, connections: 0, removed: [], reads: [] };
const SCOPES = ["openid", "profile", "email", "offline_access", "accounting.settings.read", "accounting.contacts.read", "accounting.invoices.read", "accounting.payments.read", "accounting.banktransactions.read", "accounting.attachments.read"];
global.__nivadeskXeroFakeOAuth = {
  exchangeCode: async ({ code, redirectUri }) => {
    calls.exchange += 1;
    assert.strictEqual(redirectUri, "https://europe-west2-eggcraft-studio.cloudfunctions.net/xeroOAuthCallback");
    if (code !== "good-code") { const e = new Error("xero_token_400"); e.errorClass = "auth"; throw e; }
    return { accessToken: "xat-1", refreshToken: "xrt-1", idToken: "", expiresAtMs: Date.now() + 1800e3, refreshExpiresAtMs: Date.now() + 60 * 86400e3, scopes: SCOPES, authenticationEventId: "auth-evt-1", xeroUserId: "user-1" };
  },
  refreshTokens: async ({ refreshToken }) => { calls.refresh += 1; return { accessToken: `xat-${calls.refresh + 1}`, refreshToken: `${refreshToken}-rotated`, expiresAtMs: Date.now() + 1800e3, refreshExpiresAtMs: Date.now() + 60 * 86400e3, scopes: SCOPES }; },
  listConnections: async ({ accessToken, authEventId }) => { calls.connections += 1; assert.ok(accessToken); assert.strictEqual(authEventId, "auth-evt-1", "the tenant list is narrowed to this consent"); return tenantsToOffer; },
  removeConnection: async ({ xeroConnectionId }) => { calls.removed.push(xeroConnectionId); return true; },
  revokeToken: async () => { calls.revoke += 1; return true; }
};
global.__nivadeskXeroFakeClient = ({ tenantId, accessToken }) => ({
  tenantId,
  async organisation() { assert.ok(accessToken, "a token is always presented"); return tenantId === TENANT ? remote.organisation : { ...remote.organisation, OrganisationID: tenantId, Name: "Second Org", IsDemoCompany: true }; },
  async currencies() { return remote.Currencies; },
  async accounts() { return remote.Accounts; },
  async taxRates() { return remote.TaxRates; },
  async contacts() { calls.reads.push("Contacts@all"); return remote.Contacts; },
  async items() { return remote.Items; },
  async getAll(resource, { ifModifiedSince } = {}) { calls.reads.push(`${resource}@${ifModifiedSince ? "since" : "all"}`); return remote.modified[resource] || []; },
  async read(resource, id) {
    calls.reads.push(`${resource}:${id}`);
    const row = (remote[resource] || []).find((item) => Object.values(item).includes(id));
    if (!row) { const e = new Error("xero_404"); e.errorClass = "not_found"; throw e; }
    return row;
  }
});
globalThis.fetch = async () => { throw new Error("no real network in this test"); };

const admin = require("firebase-admin");
const index = require("../../index.js");
const store = require("../../accounting/core/store");
const { derivedEventId } = require("../../accounting/xero/webhook");
const db = admin.firestore();

const COMPANY = "e2e-xero-company";
const OWNER = COMPANY;
const MEMBER = "e2e-xero-member";
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const memberAuth = { uid: MEMBER, token: { email: "member@example.com" } };
const company = () => db.collection("companies").doc(COMPANY);
const CONNECTION_ID = store.connectionDocId("xero", TENANT);
const CONNECTION_ID_2 = store.connectionDocId("xero", TENANT2);
const TOKEN_DOC = "xero_grant__auth-evt-1";

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
function signed(body, key = process.env.NIVADESK_XERO_WEBHOOK_KEY) {
  const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  return { rawBody: raw, headers: { "x-xero-signature": crypto.createHmac("sha256", key).update(raw).digest("base64") }, method: "POST", body };
}
async function callback(query) {
  const res = fakeResponse();
  await index.xeroOAuthCallback(Object.assign({ query, method: "GET", headers: {} }), res);
  return new URL(res.redirectedTo);
}
const contactEvent = (resourceId, eventDateUtc, tenantId = TENANT) => ({ resourceUrl: `https://api.xero.com/api.xro/2.0/Contacts/${resourceId}`, resourceId, eventDateUtc, eventType: "UPDATE", eventCategory: "CONTACT", tenantId, tenantType: "ORGANISATION" });

(async () => {
  await db.recursiveDelete(company());
  for (const id of [`xero__${TENANT}`, `xero__${TENANT2}`]) await db.collection("accountingRealms").doc(id).delete().catch(() => undefined);
  await company().set({ companyName: "Xero Co", ownerUid: OWNER, billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe", memberAccess: { [MEMBER]: { bankFeed: true } } });
  await db.collection("musteriler").doc("cust-ada-xero").set({ companyId: COMPANY, customerName: "Ada Lovelace Ltd", emailAddress: "ada@example.com" });

  let state = "";
  await check("connect start hands back a single-use state and a read-only Xero authorize URL", async () => {
    const result = await index.xeroConnectStart.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.strictEqual(result.ok, true);
    const url = new URL(result.authorizeUrl);
    assert.strictEqual(url.origin + url.pathname, "https://login.xero.com/identity/connect/authorize");
    assert.strictEqual(url.searchParams.get("redirect_uri"), "https://europe-west2-eggcraft-studio.cloudfunctions.net/xeroOAuthCallback");
    const scope = url.searchParams.get("scope").split(" ");
    assert.ok(scope.includes("offline_access") && scope.includes("accounting.contacts.read") && scope.includes("accounting.settings.read"));
    assert.ok(!scope.includes("accounting.contacts") && !scope.includes("accounting.transactions"), "no write and no retiring broad scope in the read-only phase");
    state = result.state;
    const stateDoc = (await db.collection("accountingConnectStates").doc(state).get()).data();
    assert.strictEqual(stateDoc.companyId, COMPANY); assert.strictEqual(stateDoc.provider, "xero"); assert.strictEqual(stateDoc.used, false); assert.strictEqual(stateDoc.scopeLevel, "read");
    await assert.rejects(index.xeroConnectStart.run({ auth: memberAuth, data: { companyId: COMPANY }, rawRequest: {} }), /owner/, "members cannot connect");
  });

  await check("the callback refuses an unknown state, a QuickBooks state and a denied consent without touching Xero", async () => {
    const bad = await callback({ code: "good-code", state: "nope" });
    assert.strictEqual(bad.searchParams.get("section"), "xero"); assert.strictEqual(bad.searchParams.get("xero"), "error"); assert.strictEqual(bad.searchParams.get("reason"), "state");
    const qbo = await index.quickbooksConnectStart.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    const crossed = await callback({ code: "good-code", state: qbo.state });
    assert.strictEqual(crossed.searchParams.get("reason"), "state", "a state issued for QuickBooks does not open a Xero callback");
    const denied = await callback({ error: "access_denied", state });
    assert.strictEqual(denied.searchParams.get("xero"), "cancelled");
    assert.strictEqual(calls.exchange, 0);
  });

  await check("a good callback with one organisation links it: tokens boxed under the consent, a linked shadow_read connection, the realm map, one audit line — and the state cannot be replayed", async () => {
    const ok = await callback({ code: "good-code", state });
    assert.strictEqual(ok.searchParams.get("xero"), "connected", ok.toString());
    assert.strictEqual(ok.searchParams.get("connection"), CONNECTION_ID);
    const conn = (await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(conn.provider, "xero"); assert.strictEqual(conn.status, "linked"); assert.strictEqual(conn.mode, "shadow_read");
    assert.strictEqual(conn.companyName, "EGGcraft Ltd"); assert.strictEqual(conn.homeCurrency, "GBP"); assert.strictEqual(conn.countryCode, "GB"); assert.strictEqual(conn.setupState, "importing");
    assert.strictEqual(conn.tokenDocId, TOKEN_DOC); assert.strictEqual(conn.xeroConnectionId, "xc-1"); assert.strictEqual(conn.environment, "production"); assert.strictEqual(conn.scopeLevel, "read");
    assert.strictEqual(conn.profile.fiscalYearStartMonth, "4"); assert.strictEqual(conn.profile.bookCloseDate, "2025-12-31"); assert.strictEqual(conn.profile.taxTrackingEnabled, true);
    assert.deepStrictEqual(conn.capabilities.bankFeedPendingRows, { read: false, write: false });
    assert.strictEqual(conn.capabilities.webhooks.contacts, true); assert.strictEqual(conn.capabilities.webhooks.payments, false); assert.strictEqual(conn.capabilities.journals.fullJournalRead, false);
    assert.deepStrictEqual(conn.capabilities.scopes, { granted: SCOPES, level: "read" });
    const tokens = (await company().collection("accountingTokens").doc(TOKEN_DOC).get()).data();
    assert.strictEqual(tokens.provider, "xero"); assert.strictEqual(typeof tokens.accessTokenEncrypted, "object"); assert.ok(!JSON.stringify(tokens).includes("xat-1") && !JSON.stringify(tokens).includes("xrt-1"), "no plaintext token at rest");
    assert.strictEqual((await company().collection("accountingTokens").doc(CONNECTION_ID).get()).exists, false, "Xero tokens live per consent, not per organisation");
    const realm = (await db.collection("accountingRealms").doc(`xero__${TENANT}`).get()).data();
    assert.strictEqual(realm.companyId, COMPANY); assert.strictEqual(realm.connectionId, CONNECTION_ID); assert.strictEqual(realm.provider, "xero");
    const audit = await company().collection("accountingAudit").where("action", "==", "connected").get();
    assert.strictEqual(audit.docs.filter((doc) => doc.data().provider === "xero").length, 1);
    const replay = await callback({ code: "good-code", state });
    assert.strictEqual(replay.searchParams.get("reason"), "state", "a used state is dead");
    assert.strictEqual(calls.exchange, 1); assert.strictEqual(calls.connections, 1);
  });

  await check("sync now imports the catalogue (one Contacts read for customers and suppliers), the archived account stays inactive, and the If-Modified-Since cursors start", async () => {
    const before = calls.reads.filter((row) => row === "Contacts@all").length;
    const result = await index.xeroSyncNow.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.counts, { accounts: 4, taxCodes: 5, taxRates: 5, customers: 2, vendors: 1, items: 1 });
    assert.strictEqual(calls.reads.filter((row) => row === "Contacts@all").length - before, 1, "customers and suppliers come from one Contacts read");
    const catalog = (await company().collection("accountingCatalog").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(catalog.provider, "xero");
    assert.strictEqual(catalog.accounts.find((a) => a.externalId === "acc-200").fullyQualifiedName, "200 · Sales");
    assert.strictEqual(catalog.accounts.find((a) => a.externalId === "acc-old").active, false);
    const output2 = catalog.taxCodes.find((t) => t.externalId === "OUTPUT2");
    assert.strictEqual(output2.effectiveSalesRate, 20); assert.strictEqual(output2.canApplyToRevenue, true);
    const contacts = (await company().collection("accountingCatalog").doc(`${CONNECTION_ID}__contacts`).get()).data();
    assert.deepStrictEqual(contacts.customers.map((c) => c.displayName), ["Ada Lovelace", "Fresh Contact"]); assert.strictEqual(contacts.customers[0].email, "ada@example.com");
    assert.deepStrictEqual(contacts.vendors.map((v) => v.displayName), ["Beads Ltd"]);
    const identity = (await company().collection("accountingIdentities").doc(store.identityDocId("xero", CONNECTION_ID, "Customer", "con-ada")).get()).data();
    assert.strictEqual(identity.externalUpdatedAt, "2024-09-01T00:00:00.000Z"); assert.strictEqual(identity.externalSyncToken, ""); assert.strictEqual(identity.snapshot.email, "ada@example.com");
    const conn = (await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(conn.setupState, "ready"); assert.strictEqual(conn.counts.accounts, 4); assert.ok(conn.lastReconciliationAtMs > 0);
    assert.ok(calls.reads.includes("Invoices@since"), "reconciliation reads with If-Modified-Since");
    const cursor = (await company().collection("accountingCursors").doc(`${CONNECTION_ID}__Invoice`).get()).data();
    assert.ok(cursor.changedSinceMs > 0);
    assert.ok((await company().collection("accountingCursors").doc(`${CONNECTION_ID}__BankTransaction`).get()).exists, "bank transactions are swept, never assumed to have a webhook");
    await assert.rejects(index.xeroSyncNow.run({ auth: memberAuth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} }), /owner/);
    await assert.rejects(index.quickbooksSyncNow.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} }), /Only QuickBooks/);
  });

  await check("suggestions follow the Xero UK chart: Sales, Bank Fees as the fee fallback, PayPal Clearing, OUTPUT2 over INPUT2, Zero Rated Income over the EC code, and the duplicate customer; saving validates against the catalogue", async () => {
    const suggestions = await index.accountingMappingSuggestions.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} });
    assert.strictEqual(suggestions.provider, "xero");
    assert.strictEqual(suggestions.accounts.product_sales.externalId, "acc-200"); assert.strictEqual(suggestions.accounts.paypal_fees.externalId, "acc-404"); assert.strictEqual(suggestions.accounts.clearing_paypal.externalId, "acc-pp");
    assert.strictEqual(suggestions.taxes.ST.externalId, "OUTPUT2"); assert.strictEqual(suggestions.taxes.ZR.externalId, "ZERORATEDOUTPUT"); assert.strictEqual(suggestions.taxes.OS.externalId, "NONE"); assert.strictEqual(suggestions.taxes.RC, undefined);
    assert.strictEqual(suggestions.duplicates.length, 1); assert.strictEqual(suggestions.duplicates[0].candidates[0].externalId, "con-ada"); assert.strictEqual(suggestions.duplicates[0].candidates[0].reason, "same_email");
    await assert.rejects(index.accountingSaveMappings.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, taxes: { ST: "INPUT9" } }, rawRequest: {} }), /not in the imported list/);
    const saved = await index.accountingSaveMappings.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID, accounts: { product_sales: "acc-200", paypal_fees: "acc-404" }, taxes: { ST: "OUTPUT2", ZR: "ZERORATEDOUTPUT" }, policies: { sources: { manual: "detailed" }, estimatesToProvider: true } }, rawRequest: {} });
    assert.strictEqual(saved.mappings.provider, "xero"); assert.strictEqual(saved.mappings.accounts.product_sales.name, "200 · Sales"); assert.strictEqual(saved.mappings.taxes.ST.rate, 20); assert.strictEqual(saved.mappings.policies.estimatesToQuickBooks, true);
    const overview = await index.accountingOverview.run({ auth: memberAuth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.ok(overview.mappings[CONNECTION_ID], "the overview carries the Xero mappings too");
    assert.strictEqual(overview.connections.find((row) => row.connectionId === CONNECTION_ID).provider, "xero");
  });

  await check("the webhook answers Xero's intent-to-receive with 200/401, writes a signed event once, and reads the contact back; ten deliveries are one read", async () => {
    const itrBody = JSON.stringify({ events: [], firstEventSequence: 0, lastEventSequence: 0, entropy: "S0m3r4nd0mt3xt" });
    const good = fakeResponse();
    await index.xeroWebhook(signed(itrBody), good);
    assert.strictEqual(good.statusCode, 200);
    const wrong = fakeResponse();
    await index.xeroWebhook(signed(itrBody, "not-the-key"), wrong);
    assert.strictEqual(wrong.statusCode, 401);
    assert.strictEqual((await company().collection("accountingInbox").get()).size, 0, "intent-to-receive payloads are not queued");
    remote.Contacts[0] = { ...remote.Contacts[0], Name: "Ada Lovelace (edited)", UpdatedDateUTC: "/Date(1788343200000+0000)/" };
    const payload = { events: [contactEvent("con-ada", "2026-09-02T10:00:01.000Z")], firstEventSequence: 11, lastEventSequence: 11, entropy: "abc" };
    const readsBefore = calls.reads.length;
    for (let i = 0; i < 10; i += 1) { const res = fakeResponse(); await index.xeroWebhook(signed(payload), res); assert.strictEqual(res.statusCode, 200); }
    assert.strictEqual(calls.reads.length - readsBefore, 1, "one fetch for ten deliveries");
    const inboxId = `xero__${derivedEventId([TENANT, "Contact", "con-ada", "UPDATE", "2026-09-02T10:00:01.000Z"])}`;
    const inbox = (await company().collection("accountingInbox").doc(inboxId).get()).data();
    assert.ok(inbox, "the inbox row is keyed by the derived event id"); assert.strictEqual(inbox.status, "processed"); assert.strictEqual(inbox.provider, "xero"); assert.strictEqual(inbox.connectionId, CONNECTION_ID);
    const identity = (await company().collection("accountingIdentities").doc(store.identityDocId("xero", CONNECTION_ID, "Contact", "con-ada")).get()).data();
    assert.strictEqual(identity.snapshot.displayName, "Ada Lovelace (edited)"); assert.strictEqual(identity.externalUpdatedAt, "2026-09-02T10:00:00.000Z"); assert.strictEqual(identity.lastSource, "webhook");
    const conn = (await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data();
    assert.ok(conn.lastWebhookAtMs > 0);
    const foreign = fakeResponse();
    await index.xeroWebhook(signed({ events: [contactEvent("con-x", "2026-09-02T10:00:02.000Z", "unknown-tenant")], firstEventSequence: 12, lastEventSequence: 12, entropy: "x" }), foreign);
    assert.strictEqual(foreign.payload.unknownRealm, 1);
    const activity = await index.accountingSyncActivity.run({ auth: memberAuth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} });
    assert.strictEqual(activity.inbox.length, 1); assert.strictEqual(activity.inbox[0].entityType, "Contact");
  });

  await check("reconciliation reads modified rows, marks a voided invoice deleted, and opens Needs Attention when a document NivaDesk posted was changed in Xero; the sweep covers the Xero realm", async () => {
    await company().collection("accountingIdentities").doc(store.identityDocId("xero", CONNECTION_ID, "Invoice", "inv-7")).set({ companyId: COMPANY, provider: "xero", connectionId: CONNECTION_ID, entityType: "Invoice", externalId: "inv-7", externalSyncToken: "", externalUpdatedAt: "2026-09-02T09:00:00.000Z", nivadeskEntityType: "order", nivadeskEntityId: "order-1", snapshot: { totalAmount: 240 } });
    remote.modified = {
      Invoices: [{ ...remote.Invoices[0], Total: 260, UpdatedDateUTC: "/Date(1788350400000+0000)/" }, { InvoiceID: "inv-8", Type: "ACCREC", Status: "VOIDED", Total: 0, UpdatedDateUTC: "/Date(1788350400000+0000)/" }],
      Contacts: [{ ContactID: "con-new", Name: "New Customer", ContactStatus: "ACTIVE", UpdatedDateUTC: "/Date(1788354000000+0000)/" }]
    };
    const conn = { connectionId: CONNECTION_ID, ...(await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data() };
    const summary = await index._e2e.accounting.reconcileConnection(COMPANY, conn);
    assert.strictEqual(summary.scanned, 3); assert.strictEqual(summary.changed, 1); assert.strictEqual(summary.deleted, 1); assert.strictEqual(summary.created, 1); assert.strictEqual(summary.failed, 0);
    const voided = (await company().collection("accountingIdentities").doc(store.identityDocId("xero", CONNECTION_ID, "Invoice", "inv-8")).get()).data();
    assert.ok(voided.deletedAtMs > 0);
    const attention = await company().collection("accountingAttention").where("status", "==", "open").get();
    const changed = attention.docs.map((doc) => doc.data()).find((row) => row.kind === "changed_in_xero");
    assert.ok(changed, "the accountant's edit is surfaced, not overwritten"); assert.ok(changed.message.includes("2026-09-02T09:00:00.000Z → 2026-09-02T12:00:00.000Z"), changed.message);
    assert.deepStrictEqual(changed.options, ["keep_xero", "review"]);
    const invoice = (await company().collection("accountingIdentities").doc(store.identityDocId("xero", CONNECTION_ID, "Invoice", "inv-7")).get()).data();
    assert.strictEqual(invoice.externalUpdatedAt, "2026-09-02T12:00:00.000Z"); assert.strictEqual(invoice.snapshot.totalAmount, 260); assert.strictEqual(invoice.nivadeskEntityId, "order-1", "the NivaDesk link survives");
    remote.modified = {};
    const sweep = await index._e2e.accounting.sweep();
    assert.ok(sweep.connections >= 1 && sweep.reconciled >= 1 && sweep.errors === 0, JSON.stringify(sweep));
  });

  let state2 = "";
  await check("a consent covering two organisations parks the tokens on the server and lets the owner choose; the chooser sees names only", async () => {
    tenantsToOffer = [tenantsToOffer[0], { xeroConnectionId: "xc-2", authEventId: "auth-evt-1", tenantId: TENANT2, tenantType: "ORGANISATION", tenantName: "Second Org" }];
    state2 = (await index.xeroConnectStart.run({ auth, data: { companyId: COMPANY }, rawRequest: {} })).state;
    const choose = await callback({ code: "good-code", state: state2 });
    assert.strictEqual(choose.searchParams.get("xero"), "choose"); assert.strictEqual(choose.searchParams.get("state"), state2);
    assert.strictEqual((await db.collection("accountingRealms").doc(`xero__${TENANT2}`).get()).exists, false, "nothing is linked before the choice");
    const listed = await index.xeroListTenants.run({ auth, data: { companyId: COMPANY, state: state2 }, rawRequest: {} });
    assert.deepStrictEqual(listed.tenants.map((t) => t.tenantName), ["EGGcraft Ltd", "Second Org"]);
    assert.ok(!JSON.stringify(listed).includes("xat-") && !JSON.stringify(listed).includes("xc-"), "no tokens, no Xero connection ids in the chooser");
    await assert.rejects(index.xeroListTenants.run({ auth: memberAuth, data: { companyId: COMPANY, state: state2 }, rawRequest: {} }), /owner/);
    await assert.rejects(index.xeroSelectTenant.run({ auth, data: { companyId: COMPANY, state: state2, tenantId: "someone-elses-org" }, rawRequest: {} }), /not part of this sign-in/);
    const picked = await index.xeroSelectTenant.run({ auth, data: { companyId: COMPANY, state: state2, tenantId: TENANT2 }, rawRequest: {} });
    assert.strictEqual(picked.connectionId, CONNECTION_ID_2);
    const conn2 = (await company().collection("accountingConnections").doc(CONNECTION_ID_2).get()).data();
    assert.strictEqual(conn2.status, "linked"); assert.strictEqual(conn2.companyName, "Second Org"); assert.strictEqual(conn2.environment, "demo"); assert.strictEqual(conn2.tokenDocId, TOKEN_DOC, "both organisations share the consent's tokens");
    assert.strictEqual((await db.collection("accountingRealms").doc(`xero__${TENANT2}`).get()).data().connectionId, CONNECTION_ID_2);
    await assert.rejects(index.xeroListTenants.run({ auth, data: { companyId: COMPANY, state: state2 }, rawRequest: {} }), /already chosen/);
  });

  await check("a forced refresh rotates the shared refresh token once for both organisations; disconnecting one removes it at Xero and keeps the consent, disconnecting the last revokes and forgets the tokens", async () => {
    const token = await index._e2e.accounting.refreshTokenWithLock(COMPANY, { connectionId: CONNECTION_ID, tokenDocId: TOKEN_DOC, provider: "xero" }, { force: true });
    assert.strictEqual(token, "xat-2"); assert.strictEqual(calls.refresh, 1);
    const stored = (await company().collection("accountingTokens").doc(TOKEN_DOC).get()).data();
    assert.strictEqual(stored.tokenRefreshLockUntilMs, 0);
    const again = await index._e2e.accounting.refreshTokenWithLock(COMPANY, CONNECTION_ID_2, { force: false });
    assert.strictEqual(again, "xat-2", "the other organisation reuses the fresh access token instead of refreshing again");
    const rotated = await index._e2e.accounting.refreshTokenWithLock(COMPANY, { connectionId: CONNECTION_ID_2, tokenDocId: TOKEN_DOC, provider: "xero" }, { force: true });
    assert.strictEqual(rotated, "xat-3", "the second refresh used the rotated refresh token");
    await assert.rejects(index.quickbooksDisconnect.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} }), /Only QuickBooks/);
    const first = await index.xeroDisconnect.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID }, rawRequest: {} });
    assert.strictEqual(first.removed, true); assert.strictEqual(first.revoked, false); assert.deepStrictEqual(calls.removed, ["xc-1"]); assert.strictEqual(calls.revoke, 0);
    assert.strictEqual((await company().collection("accountingTokens").doc(TOKEN_DOC).get()).exists, true, "the consent still serves the second organisation");
    assert.strictEqual((await db.collection("accountingRealms").doc(`xero__${TENANT}`).get()).exists, false);
    const conn = (await company().collection("accountingConnections").doc(CONNECTION_ID).get()).data();
    assert.strictEqual(conn.status, "disconnected"); assert.strictEqual(conn.mode, "disabled");
    const gone = fakeResponse();
    await index.xeroWebhook(signed({ events: [contactEvent("con-ada", "2026-09-02T13:00:00.000Z")], firstEventSequence: 20, lastEventSequence: 20, entropy: "z" }), gone);
    assert.strictEqual(gone.payload.unknownRealm, 1, "a disconnected organisation's events are not applied");
    const second = await index.xeroDisconnect.run({ auth, data: { companyId: COMPANY, connectionId: CONNECTION_ID_2, purge: true }, rawRequest: {} });
    assert.strictEqual(second.removed, true); assert.strictEqual(second.revoked, true); assert.strictEqual(calls.revoke, 1);
    assert.strictEqual((await company().collection("accountingTokens").doc(TOKEN_DOC).get()).exists, false, "the last organisation takes the tokens with it");
    assert.strictEqual((await company().collection("accountingConnections").doc(CONNECTION_ID_2).get()).exists, false, "purge removes the connection");
    assert.strictEqual((await company().collection("accountingCatalog").doc(CONNECTION_ID).get()).exists, true, "the first organisation's catalogue stays (no purge asked)");
  });

  await db.collection("musteriler").doc("cust-ada-xero").delete();
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
