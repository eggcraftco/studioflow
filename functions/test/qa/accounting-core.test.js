// Pure tests for the accounting connector core: the webhook contract, the
// fingerprint, the one-writer rule and the mapping suggestions. No emulator.
//   node --test functions/test/qa/accounting-core.test.js
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const core = require("../../accounting/core/adapter");
const store = require("../../accounting/core/store");
const fingerprint = require("../../accounting/core/fingerprint");
const webhook = require("../../accounting/quickbooks/webhook");
const normalize = require("../../accounting/quickbooks/normalize");
const oauth = require("../../accounting/quickbooks/oauth");
const { createQuickBooksClient, QuickBooksApiError } = require("../../accounting/quickbooks/client");

test("the adapter contract lists every method the engine calls, and a stub missing one is rejected", () => {
  assert.ok(core.ADAPTER_METHODS.includes("reconcile"));
  assert.throws(() => core.assertAdapter({ connect() {} }, "stub"), /missing: disconnect/);
  assert.ok(core.canTransition("queued", "synced"));
  assert.ok(!core.canTransition("synced", "draft"), "a synced posting never goes back to draft");
  assert.ok(!core.canTransition("ignored", "ready"));
});

test("QuickBooks never claims the bank feed's For Review rows; Pandle keeps its confirm capability", () => {
  const qbo = core.defaultCapabilities("quickbooks_online");
  assert.deepStrictEqual(qbo.bankFeedPendingRows, { read: false, write: false });
  assert.strictEqual(qbo.bankFeedMatchWrite, false);
  assert.strictEqual(qbo.webhooks, true);
  const pandle = core.defaultCapabilities("pandle");
  assert.strictEqual(pandle.bankFeedMatchWrite, true);
  assert.strictEqual(pandle.invoices.write, false);
});

test("the posting fingerprint ignores names and memos and changes with policy and period", () => {
  const base = { workspaceId: "w1", sourceProvider: "etsy", sourceConnectionId: "shop-1", economicEventKey: fingerprint.economicEventKey({ kind: "sale", provider: "etsy", connectionId: "shop-1", externalId: "882" }), postingPolicy: "detailed", accountingPeriod: "2026-09" };
  const a = fingerprint.postingFingerprint(base);
  assert.strictEqual(a, fingerprint.postingFingerprint({ ...base }), "deterministic");
  assert.notStrictEqual(a, fingerprint.postingFingerprint({ ...base, postingPolicy: "daily_summary" }));
  assert.notStrictEqual(a, fingerprint.postingFingerprint({ ...base, accountingPeriod: "2026-10" }));
  assert.strictEqual(fingerprint.accountingPeriodOf("2026-09-02T10:00:00Z"), "2026-09");
  assert.strictEqual(fingerprint.economicEventKey({ kind: "refund", provider: "paypal", connectionId: "pp", externalId: "T1", suffix: "1" }), "refund:paypal:pp:T1#1");
});

test("one primary writer per period: overlap refused, a dated hand-over allowed", () => {
  const pandle = { connectionId: "pandle__main", provider: "pandle", mode: "primary_write", writeBoundaryDate: "", writeUntilDate: "" };
  const qbo = { connectionId: "quickbooks_online__123", mode: "primary_write", writeBoundaryDate: "2027-01-01" };
  const conflict = store.primaryWriterConflict([pandle], qbo);
  assert.ok(conflict && conflict.code === "double_writer", "an open-ended Pandle writer blocks QuickBooks");
  assert.strictEqual(store.primaryWriterConflict([{ ...pandle, writeUntilDate: "2026-12-31" }], qbo), null, "Pandle until 31 Dec, QuickBooks from 1 Jan");
  assert.ok(store.primaryWriterConflict([{ ...pandle, writeUntilDate: "2027-01-15" }], qbo), "an overlap of two weeks is still a double writer");
  assert.strictEqual(store.primaryWriterConflict([pandle], { ...qbo, mode: "shadow_read" }), null, "read-only never conflicts");
  assert.strictEqual(store.primaryWriterConflict([qbo], qbo), null, "a connection does not conflict with itself");
});

test("webhook signature: base64 HMAC-SHA256 of the raw body under the verifier, constant-time", () => {
  const verifier = "verifier-token-123";
  const body = Buffer.from(JSON.stringify([{ specversion: "1.0", id: "e1", type: "qbo.customer.updated.v1", intuitentityid: "5", intuitaccountid: "9130" }]));
  const good = crypto.createHmac("sha256", verifier).update(body).digest("base64");
  assert.ok(webhook.verifySignature({ rawBody: body, header: good, verifier }));
  assert.ok(!webhook.verifySignature({ rawBody: body, header: good.slice(0, -2) + "==", verifier }));
  assert.ok(!webhook.verifySignature({ rawBody: body, header: good, verifier: "other" }));
  assert.ok(!webhook.verifySignature({ rawBody: body, header: "", verifier }));
});

test("the parser reads the CloudEvents array Intuit sends today and the legacy envelope, and keeps the merge's deleted id", () => {
  const cloud = webhook.parseNotifications(JSON.stringify([
    { specversion: "1.0", id: "88cd52aa", source: "intuit.x", type: "qbo.salesreceipt.updated.v1", datacontenttype: "application/json", time: "2026-03-17T16:19:17Z", intuitentityid: "150", intuitaccountid: "9341455" },
    { specversion: "1.0", id: "merge-1", type: "qbo.customer.merged.v1", time: "2025-12-04T15:25:05Z", intuitentityid: "123", intuitaccountid: "9341455", data: { deletedid: "27" } },
    { specversion: "1.0", id: "junk", type: "qbo", intuitaccountid: "9341455" }
  ]));
  assert.strictEqual(cloud.format, "cloudevents");
  assert.strictEqual(cloud.events.length, 2, "the unreadable element is dropped, the rest kept");
  assert.deepStrictEqual(cloud.events[0], { eventId: "88cd52aa", realmId: "9341455", entity: "SalesReceipt", externalId: "150", operation: "Update", occurredAt: "2026-03-17T16:19:17Z", data: {}, format: "cloudevents" });
  assert.strictEqual(cloud.events[1].entity, "Customer");
  assert.strictEqual(cloud.events[1].operation, "Merge");
  assert.strictEqual(cloud.events[1].data.deletedid, "27");
  const legacy = webhook.parseNotifications({ eventNotifications: [{ realmId: "1234", dataChangeEvent: { entities: [{ name: "Invoice", id: "77", operation: "Create", lastUpdated: "2026-09-01T10:00:00.000Z" }, { name: "Customer", id: "9", operation: "Delete", lastUpdated: "2026-09-01T10:00:01.000Z" }] } }] });
  assert.strictEqual(legacy.format, "legacy");
  assert.strictEqual(legacy.events.length, 2);
  assert.strictEqual(legacy.events[0].entity, "Invoice");
  assert.ok(legacy.events[0].eventId.startsWith("derived_"));
  assert.strictEqual(legacy.events[0].eventId, webhook.parseNotifications({ eventNotifications: [{ realmId: "1234", dataChangeEvent: { entities: [{ name: "Invoice", id: "77", operation: "Create", lastUpdated: "2026-09-01T10:00:00.000Z" }] } }] }).events[0].eventId, "the same legacy event derives the same id");
  assert.strictEqual(webhook.parseNotifications("not json").format, "unknown");
  assert.strictEqual(webhook.parseNotifications({ hello: 1 }).format, "unknown");
});

test("suggestions propose the obvious accounts and VAT codes with a reason, and never more than one per key", () => {
  const accounts = [
    normalize.normalizeAccount({ Id: "1", Name: "Sales of Product Income", FullyQualifiedName: "Sales of Product Income", AccountType: "Income", AccountSubType: "SalesOfProductIncome", Active: true }),
    normalize.normalizeAccount({ Id: "2", Name: "PayPal Fees", FullyQualifiedName: "PayPal Fees", AccountType: "Expense", AccountSubType: "BankCharges", Active: true }),
    normalize.normalizeAccount({ Id: "3", Name: "PayPal GBP Clearing", FullyQualifiedName: "PayPal GBP Clearing", AccountType: "Other Current Asset", AccountSubType: "OtherCurrentAssets", Active: true }),
    normalize.normalizeAccount({ Id: "4", Name: "Cost of sales", FullyQualifiedName: "Cost of sales", AccountType: "Cost of Goods Sold", AccountSubType: "SuppliesMaterialsCogs", Active: true }),
    normalize.normalizeAccount({ Id: "5", Name: "Old sales", AccountType: "Income", AccountSubType: "SalesOfProductIncome", Active: false })
  ];
  const suggested = normalize.suggestAccountMappings(accounts);
  assert.strictEqual(suggested.product_sales.externalId, "1");
  assert.strictEqual(suggested.paypal_fees.externalId, "2");
  assert.strictEqual(suggested.clearing_paypal.externalId, "3");
  assert.strictEqual(suggested.cogs.externalId, "4");
  assert.ok(suggested.product_sales.reason.includes("SalesOfProductIncome"));
  assert.ok(suggested.product_sales.confidence > 0.5 && suggested.product_sales.confidence < 1);
  const rates = new Map([["r20", { externalId: "r20", name: "Standard", rateValue: 20 }], ["r5", { externalId: "r5", name: "Reduced", rateValue: 5 }], ["r0", { externalId: "r0", name: "Zero", rateValue: 0 }]]);
  const codes = [
    normalize.normalizeTaxCode({ Id: "S", Name: "20.0% S", Description: "Standard", Active: true, Taxable: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "r20" }, TaxTypeApplicable: "TaxOnAmount", TaxOrder: 0 }] } }, rates),
    normalize.normalizeTaxCode({ Id: "R", Name: "5.0% R", Description: "Reduced", Active: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "r5" } }] } }, rates),
    normalize.normalizeTaxCode({ Id: "Z", Name: "0.0% Z", Description: "Zero-rated", Active: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "r0" } }] } }, rates),
    normalize.normalizeTaxCode({ Id: "E", Name: "Exempt", Description: "Exempt", Active: true, Taxable: false }, rates),
    normalize.normalizeTaxCode({ Id: "N", Name: "No VAT", Description: "Out of scope", Active: true, Taxable: false }, rates)
  ];
  assert.strictEqual(codes[0].effectiveSalesRate, 20);
  const taxes = normalize.suggestTaxMappings(codes);
  assert.strictEqual(taxes.ST.externalId, "S");
  assert.strictEqual(taxes.RR.externalId, "R");
  assert.strictEqual(taxes.ZR.externalId, "Z");
  assert.strictEqual(taxes.EX.externalId, "E");
  assert.strictEqual(taxes.OS.externalId, "N");
  assert.strictEqual(taxes.NV.externalId, "N");
});

test("duplicate candidates match on email or normalised name, and only report, never merge", () => {
  const local = [{ id: "c1", name: "Ada Lovelace Ltd", email: "ada@example.com" }, { id: "c2", name: "Nobody", email: "" }];
  const remote = [
    normalize.normalizeCustomer({ Id: "10", DisplayName: "Ada Lovelace Limited", PrimaryEmailAddr: { Address: "ADA@example.com" } }),
    normalize.normalizeCustomer({ Id: "11", DisplayName: "ada lovelace" })
  ];
  const report = normalize.duplicateContactCandidates(local, remote);
  assert.strictEqual(report.length, 1);
  assert.strictEqual(report[0].localId, "c1");
  assert.deepStrictEqual(report[0].candidates.map((c) => [c.externalId, c.reason]), [["10", "same_email"], ["11", "same_name"]]);
});

test("the client builds the documented URLs, and errors carry the class the retry policy needs", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (url.includes("/cdc")) return { ok: true, status: 200, headers: { get: () => "" }, text: async () => JSON.stringify({ CDCResponse: [{ QueryResponse: [{ Customer: [{ Id: "1", SyncToken: "3", MetaData: { LastUpdatedTime: "2026-09-01T00:00:00Z" } }, { Id: "2", status: "Deleted" }] }] }] }) };
    if (url.includes("/query")) return { ok: true, status: 200, headers: { get: () => "" }, text: async () => JSON.stringify({ QueryResponse: { Account: [{ Id: "1" }] } }) };
    return { ok: false, status: 429, headers: { get: (h) => (h === "retry-after" ? "7" : "") }, text: async () => JSON.stringify({ Fault: { Error: [{ code: "3001", Message: "throttled", Detail: "slow down" }] } }) };
  };
  const client = createQuickBooksClient({ environment: "sandbox", realmId: "9130", accessToken: "tok", fetchImpl });
  const rows = await client.queryAll("Account", { pageSize: 10 });
  assert.strictEqual(rows.length, 1);
  assert.ok(seen[0].url.startsWith("https://sandbox-quickbooks.api.intuit.com/v3/company/9130/query?"));
  assert.ok(seen[0].url.includes("minorversion=75"));
  assert.ok(decodeURIComponent(seen[0].url).includes("SELECT * FROM Account STARTPOSITION 1 MAXRESULTS 10"));
  assert.strictEqual(seen[0].init.headers.Authorization, "Bearer tok");
  const changes = await client.cdc(["Customer"], "2026-08-31T00:00:00Z");
  assert.strictEqual(changes.length, 2);
  assert.strictEqual(changes[1].deleted, true);
  await assert.rejects(client.companyInfo(), (error) => error instanceof QuickBooksApiError && error.errorClass === "transient" && error.retryAfterSeconds === 7 && error.code === "3001");
  const url = oauth.authorizeUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "s1" });
  assert.ok(url.startsWith("https://appcenter.intuit.com/connect/oauth2?"));
  assert.ok(url.includes("scope=com.intuit.quickbooks.accounting") && url.includes("state=s1") && url.includes("response_type=code"));
});

test("token exchange sends Basic auth and keeps the rotated refresh token", async () => {
  let posted = null;
  const fetchImpl = async (url, init) => { posted = { url, init }; return { ok: true, status: 200, text: async () => JSON.stringify({ token_type: "bearer", expires_in: 3600, refresh_token: "rt-new", x_refresh_token_expires_in: 8640000, access_token: "at-new" }) }; };
  const tokens = await oauth.refreshTokens({ clientId: "cid", clientSecret: "sec", refreshToken: "rt-old", fetchImpl, now: () => 1000 });
  assert.strictEqual(posted.url, oauth.TOKEN_URL);
  assert.strictEqual(posted.init.headers.Authorization, `Basic ${Buffer.from("cid:sec").toString("base64")}`);
  assert.strictEqual(posted.init.body, "grant_type=refresh_token&refresh_token=rt-old");
  assert.strictEqual(tokens.refreshToken, "rt-new");
  assert.strictEqual(tokens.expiresAtMs, 1000 + 3600 * 1000);
  const denied = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Token invalid" }) });
  await assert.rejects(oauth.refreshTokens({ clientId: "cid", clientSecret: "sec", refreshToken: "x", fetchImpl: denied }), (error) => error.errorClass === "auth" && error.code === "invalid_grant");
});

// ---------------------------------------------------------------------------
// Xero (XR phases 1–2): the registry, the OAuth scope sets, the webhook
// contract with its intent-to-receive handshake, the client's error classes
// and .NET dates, the UK chart suggestions, the provider prefix.

const xeroOAuth = require("../../accounting/xero/oauth");
const xeroWebhook = require("../../accounting/xero/webhook");
const xeroNormalize = require("../../accounting/xero/normalize");
const { createXeroClient, XeroApiError, parseXeroDate } = require("../../accounting/xero/client");
const matching = require("../../accounting/core/matching");
const { providerOf, PROVIDER_IDS } = require("../../accountingFunctions");

test("Xero is a registered provider with honest capabilities: no bank-feed rows, webhooks only for the five entities, no full journal read", () => {
  assert.deepStrictEqual(PROVIDER_IDS, ["quickbooks_online", "xero"]);
  const xero = core.defaultCapabilities("xero");
  assert.deepStrictEqual(xero.bankFeedPendingRows, { read: false, write: false });
  assert.strictEqual(xero.bankFeedMatchWrite, false);
  assert.strictEqual(xero.webhooks.contacts, true);
  assert.strictEqual(xero.webhooks.payments, false);
  assert.strictEqual(xero.webhooks.bankTransactions, false);
  assert.strictEqual(xero.journals.fullJournalRead, false);
  assert.strictEqual(xero.salesReceipts.write, false, "Xero has receive-money bank transactions, not sales receipts");
  assert.ok(core.BANK_MATCH_STATUSES.includes("awaiting_reconciliation_in_provider"));
  assert.strictEqual(providerOf("xero__1f8b-tenant"), "xero");
  assert.strictEqual(providerOf("quickbooks_online__9341"), "quickbooks_online");
  assert.strictEqual(providerOf("pandle__main"), "");
});

test("Xero OAuth: granular read scopes only in the read phase, the write set on request, never the retiring broad scope; the JWT payload names the consent", () => {
  const read = xeroOAuth.scopesFor("read");
  assert.ok(read.includes("offline_access") && read.includes("accounting.invoices.read") && read.includes("accounting.settings.read"));
  assert.ok(!read.includes("accounting.invoices") && !read.some((scope) => scope.startsWith("accounting.transactions")));
  const write = xeroOAuth.scopesFor("write", { manualJournals: true });
  assert.ok(write.includes("accounting.invoices") && write.includes("accounting.manualjournals") && !write.includes("accounting.invoices.read"));
  const url = new URL(xeroOAuth.authorizeUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "st", scopes: read }));
  assert.strictEqual(url.origin + url.pathname, "https://login.xero.com/identity/connect/authorize");
  assert.strictEqual(url.searchParams.get("response_type"), "code");
  assert.strictEqual(url.searchParams.get("scope"), read.join(" "));
  const payload = { authentication_event_id: "evt-1", xero_userid: "u-1", scope: ["openid", "accounting.contacts.read"] };
  const jwt = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
  assert.deepStrictEqual(xeroOAuth.decodeJwtPayload(jwt), payload);
  assert.deepStrictEqual(xeroOAuth.decodeJwtPayload("not-a-jwt"), {});
  const error = new xeroOAuth.XeroOAuthError("x", { status: 400, code: "invalid_grant" });
  assert.strictEqual(error.errorClass, "auth");
});

test("Xero webhook: base64 HMAC over the raw body, empty events are the intent-to-receive handshake, events map to the engine's shape with a stable derived id", () => {
  const key = "webhook-key";
  const itr = Buffer.from(JSON.stringify({ events: [], firstEventSequence: 0, lastEventSequence: 0, entropy: "S0m3" }));
  const header = crypto.createHmac("sha256", key).update(itr).digest("base64");
  assert.ok(xeroWebhook.verifySignature({ rawBody: itr, header, key }));
  assert.ok(!xeroWebhook.verifySignature({ rawBody: itr, header, key: "other" }));
  assert.ok(!xeroWebhook.verifySignature({ rawBody: itr, header: "", key }));
  const parsedItr = xeroWebhook.parseNotifications(itr);
  assert.strictEqual(parsedItr.format, "xero_v1"); assert.strictEqual(parsedItr.intentToReceive, true); assert.strictEqual(parsedItr.events.length, 0);
  const body = { events: [{ resourceUrl: "https://api.xero.com/api.xro/2.0/Invoices/inv-1", resourceId: "inv-1", eventDateUtc: "2026-09-03T10:00:00.000Z", eventType: "UPDATE", eventCategory: "INVOICE", tenantId: "t-1", tenantType: "ORGANISATION" }], firstEventSequence: 5, lastEventSequence: 5, entropy: "x" };
  const parsed = xeroWebhook.parseNotifications(JSON.stringify(body));
  assert.strictEqual(parsed.intentToReceive, false);
  const [event] = parsed.events;
  assert.strictEqual(event.entity, "Invoice"); assert.strictEqual(event.realmId, "t-1"); assert.strictEqual(event.externalId, "inv-1"); assert.strictEqual(event.operation, "Update"); assert.strictEqual(event.format, "xero_v1");
  assert.strictEqual(event.eventId, xeroWebhook.parseNotifications(JSON.stringify(body)).events[0].eventId, "the same delivery derives the same id");
  assert.strictEqual(xeroWebhook.parseNotifications("not json").format, "unknown");
  assert.deepStrictEqual(xeroWebhook.SUBSCRIBED_ENTITIES, ["Contact", "Invoice", "CreditNote", "Overpayment", "Prepayment"]);
});

test("Xero client: tenant header, If-Modified-Since, paging on paged resources only, rate-limit headers, and .NET dates", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init.headers });
    const page = Number(new URL(url).searchParams.get("page") || 0);
    const rows = page === 1 ? Array.from({ length: 100 }, (_, i) => ({ InvoiceID: `p1-${i}` })) : page === 2 ? [{ InvoiceID: "p2-0" }] : [];
    const body = url.includes("/Invoices") ? { Invoices: rows } : url.includes("/Accounts") ? { Accounts: [{ AccountID: "a" }] } : { Organisations: [{ Name: "Org" }] };
    return { ok: true, status: 200, headers: { get: (name) => ({ "x-daylimit-remaining": "990", "x-minlimit-remaining": "59", "x-appminlimit-remaining": "9999" })[name] || null }, text: async () => JSON.stringify(body) };
  };
  const client = createXeroClient({ tenantId: "t-1", accessToken: "tok", fetchImpl });
  const invoices = await client.invoices({ ifModifiedSince: "2026-09-01T00:00:00.000Z" });
  assert.strictEqual(invoices.length, 101);
  assert.strictEqual(seen.filter((row) => row.url.includes("/Invoices")).length, 2, "stops after the short page");
  assert.strictEqual(seen[0].headers["xero-tenant-id"], "t-1");
  assert.strictEqual(seen[0].headers["If-Modified-Since"], "Tue, 01 Sep 2026 00:00:00 GMT");
  assert.strictEqual(seen[0].headers.Authorization, "Bearer tok");
  await client.accounts();
  assert.ok(!seen[seen.length - 1].url.includes("page="), "Accounts does not page");
  assert.strictEqual(client.lastLimits.dayRemaining, 990); assert.strictEqual(client.lastLimits.minuteRemaining, 59);
  assert.strictEqual(parseXeroDate("/Date(1439434356790+0000)/"), "2015-08-13T02:52:36.790Z");
  assert.strictEqual(parseXeroDate("2026-09-01T00:00:00"), "2026-09-01T00:00:00.000Z", "a zone-less Xero date is the organisation's calendar date, not local time");
  assert.strictEqual(parseXeroDate("2026-09-01"), "2026-09-01T00:00:00.000Z");
  assert.strictEqual(parseXeroDate(""), "");
  const limited = new XeroApiError("xero_429", { status: 429, retryAfterSeconds: 12, limitProblem: "minute" });
  assert.strictEqual(limited.errorClass, "transient"); assert.strictEqual(limited.retryAfterSeconds, 12);
  const scope = new XeroApiError("xero_403", { status: 403, detail: "AuthorizationUnsuccessful: scope accounting.journals.read missing" });
  assert.strictEqual(scope.errorClass, "permission"); assert.strictEqual(scope.scopeProblem, true);
  assert.strictEqual(new XeroApiError("xero_401", { status: 401 }).errorClass, "auth");
  assert.throws(() => createXeroClient({ tenantId: "", accessToken: "tok", fetchImpl }), /xero_tenant_required/);
});

test("Xero normalisation keeps the QuickBooks snapshot shape; suggestions follow the UK chart and prefer income tax types over expense and EC ones", () => {
  const account = xeroNormalize.normalizeAccount({ AccountID: "a1", Code: "200", Name: "Sales", Type: "REVENUE", Class: "REVENUE", Status: "ACTIVE", UpdatedDateUTC: "/Date(1700000000000+0000)/" });
  assert.strictEqual(account.fullyQualifiedName, "200 · Sales"); assert.strictEqual(account.accountType, "REVENUE"); assert.strictEqual(account.active, true); assert.strictEqual(account.syncToken, ""); assert.strictEqual(account.updatedAt, "2023-11-14T22:13:20.000Z");
  const rate = xeroNormalize.normalizeTaxRate({ Name: "20% (VAT on Income)", TaxType: "OUTPUT2", Status: "ACTIVE", EffectiveRate: 20, CanApplyToRevenue: true });
  assert.strictEqual(rate.externalId, "OUTPUT2"); assert.strictEqual(rate.effectiveSalesRate, 20); assert.strictEqual(rate.canApplyToRevenue, true);
  const contact = xeroNormalize.normalizeContact({ ContactID: "c1", Name: "Ada", EmailAddress: "ADA@example.com", ContactStatus: "ARCHIVED", IsCustomer: true, Balances: { AccountsReceivable: { Outstanding: 12.5 } } });
  assert.strictEqual(contact.email, "ada@example.com"); assert.strictEqual(contact.active, false); assert.strictEqual(contact.balance, 12.5);
  const invoice = xeroNormalize.normalizeTransaction("Invoice", { InvoiceID: "i1", Type: "ACCREC", InvoiceNumber: "INV-1", DateString: "2026-09-01T00:00:00", Total: 100, AmountDue: 40, Status: "VOIDED", Contact: { ContactID: "c1", Name: "Ada" }, LineItems: [{}, {}] });
  assert.strictEqual(invoice.customerId, "c1"); assert.strictEqual(invoice.vendorId, ""); assert.strictEqual(invoice.lineCount, 2); assert.strictEqual(invoice.voided, true); assert.strictEqual(invoice.txnDate, "2026-09-01");
  assert.strictEqual(xeroNormalize.snapshotOf("Customer", { ContactID: "c2", Name: "B" }).payableBalance, undefined);
  assert.strictEqual(xeroNormalize.idOf("BankTransaction", { BankTransactionID: "bt-1" }), "bt-1");
  assert.ok(xeroNormalize.INCREMENTAL_ENTITIES.includes("BankTransaction") && !xeroNormalize.INCREMENTAL_ENTITIES.includes("TaxRate"));
  const accounts = xeroNormalize.suggestAccountMappings([
    { externalId: "a1", name: "Sales", fullyQualifiedName: "200 · Sales", accountType: "REVENUE", active: true },
    { externalId: "a2", name: "Other Revenue", fullyQualifiedName: "260 · Other Revenue", accountType: "REVENUE", active: true },
    { externalId: "a3", name: "Bank Fees", fullyQualifiedName: "404 · Bank Fees", accountType: "EXPENSE", active: true },
    { externalId: "a4", name: "Purchases", fullyQualifiedName: "300 · Purchases", accountType: "DIRECTCOSTS", active: true },
    { externalId: "a5", name: "Cost of Goods Sold", fullyQualifiedName: "310 · Cost of Goods Sold", accountType: "DIRECTCOSTS", active: true },
    { externalId: "a6", name: "Inventory", fullyQualifiedName: "630 · Inventory", accountType: "INVENTORY", active: true },
    { externalId: "a7", name: "Old Sales", fullyQualifiedName: "999 · Old Sales", accountType: "REVENUE", active: false }
  ]);
  assert.strictEqual(accounts.product_sales.externalId, "a1"); assert.strictEqual(accounts.paypal_fees.externalId, "a3"); assert.strictEqual(accounts.materials_purchase.externalId, "a4"); assert.strictEqual(accounts.cogs.externalId, "a5"); assert.strictEqual(accounts.inventory_asset.externalId, "a6");
  assert.strictEqual(accounts.clearing_paypal, undefined, "no clearing account is invented");
  const taxes = xeroNormalize.suggestTaxMappings([
    { externalId: "OUTPUT2", name: "20% (VAT on Income)", description: "20%", active: true, effectiveSalesRate: 20, canApplyToRevenue: true },
    { externalId: "INPUT2", name: "20% (VAT on Expenses)", description: "20%", active: true, effectiveSalesRate: 20, canApplyToRevenue: false },
    { externalId: "ZERORATEDOUTPUT", name: "Zero Rated Income", description: "0%", active: true, effectiveSalesRate: 0, canApplyToRevenue: true },
    { externalId: "ECZROUTPUT", name: "Zero Rated EC Goods Income", description: "0%", active: true, effectiveSalesRate: 0, canApplyToRevenue: true },
    { externalId: "EXEMPTOUTPUT", name: "Exempt Income", description: "0%", active: true, effectiveSalesRate: 0, canApplyToRevenue: true },
    { externalId: "NONE", name: "No VAT", description: "0%", active: true, effectiveSalesRate: 0, canApplyToRevenue: true },
    { externalId: "REVERSECHARGES", name: "Reverse Charge Expenses (20%)", description: "20%", active: true, effectiveSalesRate: 20, canApplyToRevenue: false }
  ]);
  assert.strictEqual(taxes.ST.externalId, "OUTPUT2"); assert.strictEqual(taxes.ZR.externalId, "ZERORATEDOUTPUT"); assert.strictEqual(taxes.EX.externalId, "EXEMPTOUTPUT"); assert.strictEqual(taxes.OS.externalId, "NONE"); assert.strictEqual(taxes.RC.externalId, "REVERSECHARGES");
  assert.strictEqual(matching.duplicateContactCandidates, normalize.duplicateContactCandidates, "one matcher for every provider");
});
