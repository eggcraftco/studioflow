// Square Faz 1, pure: the adapter against POS / Online / Invoice / ad-hoc /
// refund fixtures (SQ-TEST-011/012/015), minor-unit money by currency
// (SQ-PAY-003), the URL+body signature (SQ-TEST-006/007), the authorize URL
// and environments (SQ-AUTH-009), and the client's pinned version, paging and
// error classes with a fake fetch (SQ-TEST-023).
const assert = require("assert");
const crypto = require("crypto");
const { normalizeSquareOrder, normalizeSquarePayment, normalizeSquareRefund, squareMoneyToDecimal, squareProductOf } = require("../../commerce/adapters/square");
const { verifySquareSignature, expectedSquareSignature } = require("../../commerce/square/signature");
const oauth = require("../../commerce/square/oauth");
const { createSquareClient, createSquareEventsClient, SquareApiError } = require("../../commerce/square/client");
const { validateEnvelope, contentHash } = require("../../commerce/envelope");
const { classifyError } = require("../../commerce/events");
const projection = require("../../commerce/envelopeToOrder");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name), (error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 260)); }); }

const money = (amount, currency = "GBP") => ({ amount, currency });
const onlineOrder = (extra = {}) => ({
  id: "ORD_ONLINE_1", location_id: "LOC_LONDON", reference_id: "1042", version: 7, state: "COMPLETED", customer_id: "CUST_1",
  source: { name: "Square Online" }, created_at: "2026-09-02T09:00:00Z", updated_at: "2026-09-02T09:30:00Z", closed_at: "2026-09-02T09:30:00Z",
  line_items: [
    { uid: "li1", name: "Signet ring", quantity: "1", catalog_object_id: "VAR_1", variation_name: "Gold", base_price_money: money(8000), total_money: money(9600), total_tax_money: money(1600), modifiers: [{ uid: "m1", name: "Engraving", total_price_money: money(500) }], note: "AL" },
    { uid: "li2", name: "Band", quantity: "2", catalog_object_id: "VAR_2", base_price_money: money(500), total_money: money(1200), total_tax_money: money(200) }
  ],
  fulfillments: [{ uid: "f1", type: "SHIPMENT", state: "PROPOSED", shipment_details: { recipient: { display_name: "Ada Lovelace", email_address: "Ada@Example.com", phone_number: "+44 7700 900000", address: { address_line_1: "10 Analytical Way", address_line_2: "Flat 3", locality: "London", postal_code: "N1 1AA", country: "GB" } }, note: "engrave AL" } }],
  tenders: [{ id: "T1", type: "CARD", payment_id: "PAY_1", amount_money: money(11300), created_at: "2026-09-02T09:05:00Z" }],
  total_money: money(11300), total_tax_money: money(1800), total_discount_money: money(1000), total_tip_money: money(0), total_service_charge_money: money(500), net_amount_due_money: money(0), ...extra
});
const posOrder = (extra = {}) => ({
  id: "ORD_POS_1", location_id: "LOC_FAIR", version: 2, state: "COMPLETED", source: { name: "Square Point of Sale" }, created_at: "2026-09-02T12:00:00Z", updated_at: "2026-09-02T12:00:05Z",
  line_items: [{ uid: "a1", name: "Custom item", quantity: "1", base_price_money: money(2500), total_money: money(2500) }],
  tenders: [{ id: "T2", type: "CASH", amount_money: money(2500) }], total_money: money(2500), total_tax_money: money(0), ...extra
});
const ctx = { connectionId: "c1__MERCH", environment: "production", merchantId: "MERCH", merchantName: "EGGcraft Square", locationName: "London Studio", eventOrigin: "provider" };

(async () => {
  await check("a Square Online order becomes a valid envelope: money by minor units, tenders, recipient, fulfilment, source (SQ-TEST-011)", () => {
    const env = normalizeSquareOrder(onlineOrder(), ctx);
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.identity.provider, "square"); assert.strictEqual(env.identity.external_id, "ORD_ONLINE_1"); assert.strictEqual(env.identity.external_updated_at, "2026-09-02T09:30:00.000Z");
    assert.strictEqual(env.order.grand_total, "113.00"); assert.strictEqual(env.order.tax_total, "18.00"); assert.strictEqual(env.order.discount_total, "10.00"); assert.strictEqual(env.order.shipping_total, "5.00", "service charges stay a separate component (SQ-ORD-008)");
    assert.strictEqual(env.order.subtotal, "108.00"); assert.strictEqual(env.order.payment_status, "paid"); assert.strictEqual(env.order.platform_status, "completed"); assert.strictEqual(env.order.fulfillment_status, "unfulfilled");
    assert.strictEqual(env.order.sales_channel, "square_online"); assert.strictEqual(env.order.buyer_note, "engrave AL");
    assert.strictEqual(env.customer.name, "Ada Lovelace"); assert.strictEqual(env.customer.email, "ada@example.com"); assert.strictEqual(env.customer.external_customer_id, "CUST_1");
    assert.strictEqual(env.customer.shipping_address.street, "10 Analytical Way, Flat 3"); assert.strictEqual(env.customer.shipping_address.postalCode, "N1 1AA");
    assert.strictEqual(env.order.line_items[0].line_total, "96.00"); assert.strictEqual(env.order.line_items[0].product_external_id, "VAR_1", "the variation id is the inventory key (SQ-CAT-002)");
    assert.strictEqual(env.order.line_items[1].unit_price, "6.00"); assert.strictEqual(env.order.line_items[0].sku, null, "SKU is not on the order object; never invented (SQ-CAT-003)");
    assert.deepStrictEqual(env.order.line_items[0].properties, [{ name: "Variation", value: "Gold" }, { name: "Engraving", value: "5.00" }, { name: "Note", value: "AL" }]);
    assert.strictEqual(env.payments[0].external_id, "PAY_1"); assert.strictEqual(env.payments[0].amount, "113.00");
    const meta = env.source.provider_metadata;
    assert.strictEqual(meta.square_source, "SQUARE_ONLINE"); assert.strictEqual(meta.location_id, "LOC_LONDON"); assert.strictEqual(meta.location_name, "London Studio"); assert.strictEqual(meta.order_version, 7); assert.strictEqual(meta.has_fulfillment, true);
    assert.strictEqual(meta.order_number, "1042"); assert.strictEqual(meta.custom_fields["Square Order ID"], "ORD_ONLINE_1"); assert.strictEqual(meta.custom_fields.Source, "Square");
    assert.strictEqual(env.source.external_admin_url, "https://app.squareup.com/dashboard/orders/overview/ORD_ONLINE_1");
    assert.deepStrictEqual(env.review.reasons, []);
  });
  await check("a POS cash sale with an ad-hoc item is kept, flagged for review, and never rejected (SQ-TEST-012)", () => {
    const env = normalizeSquareOrder(posOrder(), { ...ctx, locationName: "Fair Stand" });
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.order.sales_channel, "square_pos"); assert.strictEqual(env.source.provider_metadata.square_source, "SQUARE_POS"); assert.strictEqual(env.source.provider_metadata.has_fulfillment, false);
    assert.strictEqual(env.order.fulfillment_status, "unknown", "no fulfilment is not invented (SQ-ORD-009)");
    assert.strictEqual(env.order.payment_status, "paid"); assert.strictEqual(env.payments[0].provider, "CASH");
    assert.ok(env.review.reasons.includes("ad_hoc_line_item")); assert.strictEqual(env.review.required, true);
    assert.strictEqual(env.customer.name, null, "a guest sale has no name (SQ-CUST-003)");
    assert.strictEqual(env.source.provider_metadata.order_number, "RD_POS_1".slice(-8).toUpperCase() === "RD_POS_1" ? "RD_POS_1" : env.source.provider_metadata.order_number);
  });
  await check("an Invoice payment and a prefetched Customer fill the buyer; POS/Online/Invoice pass the same contract (SQ-TEST-011)", () => {
    const customer = { id: "CUST_9", given_name: "Grace", family_name: "Hopper", email_address: "grace@example.com", phone_number: "+1 555 0100", address: { address_line_1: "1 Navy Yard", locality: "Arlington", administrative_district_level_1: "VA", postal_code: "22202", country: "US" } };
    const env = normalizeSquareOrder(posOrder({ id: "ORD_INV_1", source: { name: "Invoices" }, customer_id: "CUST_9", total_money: money(250000, "USD"), tenders: [{ id: "T3", type: "CARD", payment_id: "PAY_3", amount_money: money(250000, "USD") }] }), { ...ctx, customer });
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.source.provider_metadata.square_source, "INVOICE"); assert.strictEqual(env.order.currency, "USD"); assert.strictEqual(env.order.grand_total, "2500.00");
    assert.strictEqual(env.customer.name, "Grace Hopper"); assert.strictEqual(env.customer.email, "grace@example.com"); assert.strictEqual(env.customer.billing_address.city, "Arlington"); assert.strictEqual(env.customer.billing_address.state, "VA");
    const fields = projection.shopOwnedFields(env, { companyId: "c1" });
    assert.strictEqual(fields.customerName, "Grace Hopper"); assert.strictEqual(fields.orderValue, 2500); assert.strictEqual(fields.paidAmount, 2500); assert.strictEqual(fields.customFields["Square Source"], "Invoices");
  });
  await check("money follows the currency's exponent: JPY has none, KWD has three, GBP two (SQ-PAY-003)", () => {
    assert.strictEqual(squareMoneyToDecimal(money(4000, "JPY")), "4000.00"); assert.strictEqual(squareMoneyToDecimal(money(12345, "KWD")), "12.35"); assert.strictEqual(squareMoneyToDecimal(money(4005, "GBP")), "40.05");
    assert.strictEqual(squareMoneyToDecimal(null), null); assert.strictEqual(squareMoneyToDecimal({ amount: "x" }), null); assert.strictEqual(squareMoneyToDecimal({ amount: 0, currency: "GBP" }), "0.00");
  });
  await check("payment states: partial tenders, partial refund, full refund, cancelled, draft and open (SQ-TEST-015, SQ-PAY-007)", () => {
    const partial = normalizeSquareOrder(onlineOrder({ tenders: [{ id: "T", type: "CARD", amount_money: money(5000) }] }), ctx);
    assert.strictEqual(partial.order.payment_status, "partially_paid");
    const partRefund = normalizeSquareOrder(onlineOrder({ refunds: [{ id: "R1", amount_money: money(2000), reason: "chipped", created_at: "2026-09-03T00:00:00Z" }] }), ctx);
    assert.strictEqual(partRefund.order.payment_status, "partially_refunded", "a partial refund is not a full one (SQ-REF-005)"); assert.strictEqual(partRefund.refunds[0].amount, "20.00"); assert.strictEqual(partRefund.refunds[0].reason, "chipped");
    const fullRefund = normalizeSquareOrder(onlineOrder({ refunds: [{ id: "R2", amount_money: money(11300) }] }), ctx);
    assert.strictEqual(fullRefund.order.payment_status, "refunded");
    const cancelled = normalizeSquareOrder(onlineOrder({ state: "CANCELED", tenders: [], closed_at: "2026-09-02T10:00:00Z" }), ctx);
    assert.strictEqual(cancelled.order.platform_status, "cancelled"); assert.strictEqual(cancelled.order.payment_status, "voided"); assert.strictEqual(cancelled.order.cancelled_at, "2026-09-02T10:00:00.000Z");
    assert.strictEqual(normalizeSquareOrder(onlineOrder({ state: "DRAFT", tenders: [] }), ctx).order.payment_status, "unpaid");
    assert.strictEqual(normalizeSquareOrder(onlineOrder({ state: "OPEN", tenders: [], net_amount_due_money: money(11300) }), ctx).order.payment_status, "pending");
    const shipped = normalizeSquareOrder(onlineOrder({ fulfillments: [{ uid: "f1", type: "SHIPMENT", state: "COMPLETED", shipment_details: { carrier: "Royal Mail", tracking_number: "RM77", tracking_url: "https://t.example/RM77", shipped_at: "2026-09-03T08:00:00Z", recipient: { display_name: "Ada" } } }] }), ctx);
    assert.strictEqual(shipped.order.fulfillment_status, "fulfilled"); assert.strictEqual(shipped.shipments[0].tracking_number, "RM77"); assert.strictEqual(shipped.shipments[0].carrier, "Royal Mail"); assert.strictEqual(shipped.shipments[0].status, "shipped");
  });
  await check("Square's return order is recognised and never mistaken for a sale; recorded refunds show on the sale (SQ-REF-002/005)", () => {
    const { isSquareReturnOrder, returnSourceOrderId } = require("../../commerce/adapters/square");
    const ret = { id: "RET_1", location_id: "LOC_LONDON", state: "COMPLETED", returns: [{ uid: "r1", source_order_id: "ORD_ONLINE_1", return_amounts: { total_money: money(500) } }], total_money: money(0), created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z" };
    assert.strictEqual(isSquareReturnOrder(ret), true); assert.strictEqual(returnSourceOrderId(ret), "ORD_ONLINE_1");
    assert.strictEqual(isSquareReturnOrder(onlineOrder()), false); assert.strictEqual(isSquareReturnOrder(onlineOrder({ returns: [{ uid: "x", source_order_id: "y" }] })), false, "a sale with returns listed is still a sale");
    const env = normalizeSquareOrder(onlineOrder(), { ...ctx, refunds: [{ externalId: "REF_9", amount: "20.00", currency: "GBP", status: "COMPLETED", reason: "chipped" }, { externalId: "REF_10", amount: "5.00", currency: "GBP", status: "REJECTED" }] });
    assert.strictEqual(env.order.payment_status, "partially_refunded"); assert.strictEqual(env.refunds.length, 1, "a rejected refund is not a refund");
    assert.strictEqual(env.source.provider_metadata.custom_fields["Square Refunded"], "20.00");
    const dedup = normalizeSquareOrder(onlineOrder({ refunds: [{ id: "REF_9", amount_money: money(2000) }] }), { ...ctx, refunds: [{ externalId: "REF_9", amount: "20.00", currency: "GBP", status: "COMPLETED" }] });
    assert.strictEqual(dedup.refunds.length, 1, "the same refund from two sources counts once (SQ-REF-004)");
  });
  await check("the same order normalizes to the same hash whichever path brought it; a newer version differs (SQ-TEST-009/010)", () => {
    const a = normalizeSquareOrder(onlineOrder(), { ...ctx, eventOrigin: "provider" }); const b = normalizeSquareOrder(onlineOrder(), { ...ctx, eventOrigin: "reconcile" });
    assert.strictEqual(contentHash(a), contentHash(b));
    const newer = normalizeSquareOrder(onlineOrder({ version: 8, updated_at: "2026-09-02T10:00:00Z", state: "CANCELED" }), ctx);
    assert.notStrictEqual(contentHash(a), contentHash(newer)); assert.ok(Date.parse(newer.identity.external_updated_at) > Date.parse(a.identity.external_updated_at));
  });
  await check("source names map to Square products; unknown names are kept as OTHER, not dropped (SQ-ORD-005)", () => {
    assert.strictEqual(squareProductOf({ source: { name: "Square Point of Sale" } }).code, "SQUARE_POS"); assert.strictEqual(squareProductOf({ source: { name: "Square Online" } }).code, "SQUARE_ONLINE");
    assert.strictEqual(squareProductOf({ source: { name: "Invoices" } }).code, "INVOICE"); assert.strictEqual(squareProductOf({}).code, "API"); assert.strictEqual(squareProductOf({ source: { name: "Some Partner App" } }).code, "OTHER");
  });
  await check("a payment and a refund normalize to compact records with their own ids and the order they name (SQ-PAY-001/002, SQ-REF-001/002)", () => {
    const p = normalizeSquarePayment({ id: "PAY_1", order_id: "ORD_ONLINE_1", location_id: "LOC_LONDON", status: "COMPLETED", amount_money: money(11300), tip_money: money(200), total_money: money(11500), processing_fee: [{ amount_money: money(190), type: "INITIAL" }], source_type: "CARD", card_details: { card: { card_brand: "VISA", last_4: "4242" } }, customer_id: "CUST_1", receipt_url: "https://squareup.com/receipt/x", created_at: "2026-09-02T09:05:00Z", updated_at: "2026-09-02T09:06:00Z" }, { connectionId: "c1__MERCH", companyId: "c1" });
    assert.strictEqual(p.externalId, "PAY_1"); assert.strictEqual(p.orderExternalId, "ORD_ONLINE_1"); assert.strictEqual(p.status, "COMPLETED"); assert.strictEqual(p.amount, "113.00"); assert.strictEqual(p.tip, "2.00"); assert.strictEqual(p.total, "115.00"); assert.strictEqual(p.processingFee, "1.90"); assert.strictEqual(p.cardBrand, "VISA"); assert.strictEqual(p.last4, "4242");
    const r = normalizeSquareRefund({ id: "REF_1", payment_id: "PAY_1", order_id: "ORD_ONLINE_1", status: "PENDING", amount_money: money(2000), reason: "chipped", created_at: "2026-09-03T00:00:00Z" }, { connectionId: "c1__MERCH", companyId: "c1" });
    assert.strictEqual(r.externalId, "REF_1"); assert.strictEqual(r.paymentExternalId, "PAY_1"); assert.strictEqual(r.status, "PENDING"); assert.strictEqual(r.amount, "20.00");
  });
  await check("the webhook signature is HMAC over the notification URL and the raw body, compared in constant time (SQ-TEST-006/007)", () => {
    const key = "sig_key_123"; const url = "https://europe-west2-eggcraft-studio.cloudfunctions.net/squareWebhook"; const body = Buffer.from('{"merchant_id":"M","type":"order.created"}');
    const header = crypto.createHmac("sha256", key).update(url + body.toString()).digest("base64");
    assert.strictEqual(expectedSquareSignature(url, body, key), header);
    assert.strictEqual(verifySquareSignature({ notificationUrl: url, rawBody: body, header, signatureKey: key }), true);
    assert.strictEqual(verifySquareSignature({ notificationUrl: url + "/", rawBody: body, header, signatureKey: key }), false, "the URL must match byte for byte (SQ-WEB-002)");
    assert.strictEqual(verifySquareSignature({ notificationUrl: url, rawBody: Buffer.from(body.toString() + " "), header, signatureKey: key }), false);
    assert.strictEqual(verifySquareSignature({ notificationUrl: url, rawBody: body, header: "", signatureKey: key }), false); assert.strictEqual(verifySquareSignature({ notificationUrl: url, rawBody: body, header, signatureKey: "" }), false);
  });
  await check("the authorize URL asks for read scopes only, session=false, and the sandbox host is a different host (SQ-AUTH-009/011)", () => {
    const url = new URL(oauth.squareAuthorizeUrl({ environment: "production", applicationId: "sq0idp-abc", state: "st4te" }));
    assert.strictEqual(url.origin, "https://connect.squareup.com"); assert.strictEqual(url.pathname, "/oauth2/authorize"); assert.strictEqual(url.searchParams.get("client_id"), "sq0idp-abc"); assert.strictEqual(url.searchParams.get("session"), "false"); assert.strictEqual(url.searchParams.get("state"), "st4te");
    const scopes = url.searchParams.get("scope").split(" ");
    assert.ok(scopes.includes("ORDERS_READ") && scopes.includes("PAYMENTS_READ") && scopes.includes("MERCHANT_PROFILE_READ") && scopes.includes("PAYOUTS_READ"));
    assert.ok(!scopes.some((s) => s.endsWith("_WRITE")), "no write scope in the read-first phase");
    assert.strictEqual(new URL(oauth.squareAuthorizeUrl({ environment: "sandbox", applicationId: "x", state: "s" })).origin, "https://connect.squareupsandbox.com");
    assert.strictEqual(oauth.squareEnvironment("SANDBOX"), "sandbox"); assert.strictEqual(oauth.squareEnvironment(""), "production");
    assert.match(oauth.SQUARE_API_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  });
  await check("the token exchange and refresh post the secret server-side only, and errors carry Square's code", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ access_token: "at", refresh_token: "rt", expires_at: "2026-10-02T00:00:00Z", merchant_id: "MERCH" }) }; };
    const tokens = await oauth.exchangeAuthorizationCode({ environment: "production", applicationId: "id", applicationSecret: "sec", code: "c0de", fetchImpl });
    assert.strictEqual(tokens.access_token, "at"); assert.strictEqual(calls[0].url, "https://connect.squareup.com/oauth2/token");
    const body = JSON.parse(calls[0].init.body); assert.strictEqual(body.grant_type, "authorization_code"); assert.strictEqual(body.client_secret, "sec"); assert.strictEqual(body.redirect_uri, undefined);
    assert.strictEqual(calls[0].init.headers["Square-Version"], oauth.SQUARE_API_VERSION);
    await oauth.refreshAccessToken({ environment: "sandbox", applicationId: "id", applicationSecret: "sec", refreshToken: "rt", fetchImpl });
    assert.strictEqual(calls[1].url, "https://connect.squareupsandbox.com/oauth2/token"); assert.strictEqual(JSON.parse(calls[1].init.body).grant_type, "refresh_token");
    const failing = async () => ({ ok: false, status: 401, json: async () => ({ errors: [{ code: "UNAUTHORIZED" }] }) });
    await assert.rejects(oauth.refreshAccessToken({ environment: "production", applicationId: "id", applicationSecret: "sec", refreshToken: "rt", fetchImpl: failing }), (e) => e.status === 401 && e.code === "UNAUTHORIZED" && classifyError(e) === "auth");
  });
  await check("the client pins Square-Version on every call, pages by cursor, sorts by the filtered field, retries once on 401 via refresh, and classifies errors (SQ-TEST-023)", async () => {
    const calls = [];
    let unauthorizedOnce = true;
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/v2/orders/search")) {
        const body = JSON.parse(init.body);
        if (unauthorizedOnce) { unauthorizedOnce = false; return { ok: false, status: 401, headers: { get: () => null }, json: async () => ({ errors: [{ code: "ACCESS_TOKEN_EXPIRED" }] }) }; }
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ orders: [{ id: body.cursor ? "O2" : "O1" }], cursor: body.cursor ? null : "next" }) };
      }
      if (url.includes("/v2/orders/MISSING")) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ errors: [{ code: "NOT_FOUND" }] }) };
      if (url.includes("/v2/payments/RATE")) return { ok: false, status: 429, headers: { get: (h) => (h === "retry-after" ? "7" : null) }, json: async () => ({ errors: [{ code: "RATE_LIMITED" }] }) };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ merchant: { id: "MERCH", business_name: "EGGcraft" }, locations: [{ id: "L1", status: "ACTIVE" }] }) };
    };
    let refreshed = 0;
    const client = createSquareClient({ environment: "production", accessToken: "old", fetchImpl, onUnauthorized: async () => { refreshed += 1; return "new"; } });
    const first = await client.searchOrders({ locationIds: ["L1"], updatedAfterIso: "2026-09-01T00:00:00Z" });
    assert.strictEqual(refreshed, 1); assert.deepStrictEqual(first.orders.map((o) => o.id), ["O1"]); assert.strictEqual(first.cursor, "next");
    assert.strictEqual(calls[1].init.headers.Authorization, "Bearer new", "the retried call carries the refreshed token");
    const second = await client.searchOrders({ locationIds: ["L1"], updatedAfterIso: "2026-09-01T00:00:00Z", cursor: "next" });
    assert.deepStrictEqual(second.orders.map((o) => o.id), ["O2"]); assert.strictEqual(second.cursor, null);
    const searchBody = JSON.parse(calls[1].init.body);
    assert.strictEqual(searchBody.query.sort.sort_field, "UPDATED_AT"); assert.ok(searchBody.query.filter.date_time_filter.updated_at.start_at); assert.strictEqual(searchBody.return_entries, false);
    await client.searchOrders({ locationIds: ["L1"], createdAfterIso: "2026-06-01T00:00:00Z" });
    const importBody = JSON.parse(calls[calls.length - 1].init.body); assert.strictEqual(importBody.query.sort.sort_field, "CREATED_AT"); assert.ok(importBody.query.filter.date_time_filter.created_at);
    assert.ok(calls.every((c) => c.init.headers["Square-Version"] === oauth.SQUARE_API_VERSION), "every call is pinned");
    assert.strictEqual(await client.getOrder("MISSING"), null);
    await assert.rejects(client.getPayment("RATE"), (e) => e instanceof SquareApiError && e.status === 429 && e.retryAfter === "7" && classifyError(e) === "transient");
    assert.strictEqual((await client.probe()).merchantId, "MERCH");
    const ev = createSquareEventsClient({ environment: "sandbox", appAccessToken: "app", fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ events: [], cursor: null }) }; } });
    await ev.searchEvents({ createdAfterIso: "2026-09-01T00:00:00Z", merchantId: "MERCH", eventTypes: ["order.created"] });
    const evCall = calls[calls.length - 1]; assert.strictEqual(evCall.url, "https://connect.squareupsandbox.com/v2/events"); assert.strictEqual(evCall.init.headers.Authorization, "Bearer app"); assert.deepStrictEqual(JSON.parse(evCall.init.body).query.filter.merchant_ids, ["MERCH"]);
  });
  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ SQUARE ADAPTER / SIGNATURE / OAUTH / CLIENT GEÇTİ");
})();
