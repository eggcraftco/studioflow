// Faz 2 — the common contracts, as pure functions: the envelope, money,
// field ownership, the event/retry model, capabilities, the Shopify adapter
// and the projection back to the order document. No Firestore here; the
// engine that writes is proven in test/e2e/commerce-engine-emulator.test.js.
const assert = require("assert");
const money = require("../../commerce/money");
const { buildEnvelope, validateEnvelope, identityKey, identityDocId, contentHash } = require("../../commerce/envelope");
const ownership = require("../../commerce/ownership");
const events = require("../../commerce/events");
const { getCapabilities, listProviders } = require("../../commerce/capabilities");
const { normalizeShopifyOrder } = require("../../commerce/adapters/shopify");
const projection = require("../../commerce/envelopeToOrder");

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function check(name, fn) { try { fn(); pass(name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 240)); } }

const restOrder = (extra = {}) => ({
  id: 1042, name: "#1042", order_number: 1042, financial_status: "paid", fulfillment_status: null, currency: "GBP",
  subtotal_price: "100.00", total_discounts: "10.00", total_tax: "18.00", total_price: "113.00",
  total_shipping_price_set: { shop_money: { amount: "5.00" } },
  created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:10:00Z", note: "engrave AL",
  email: "Buyer@Example.com", customer: { id: 9, first_name: "Example", last_name: "Customer", phone: "+44 7700 900000" },
  billing_address: { first_name: "Example", last_name: "Customer", address1: "1 Test St", address2: "Flat 2", city: "Leeds", province: "West Yorkshire", zip: "LS1", country: "United Kingdom", phone: "" },
  shipping_address: { name: "Example Customer", address1: "1 Test St", city: "Leeds", zip: "LS1", country: "United Kingdom" },
  payment_gateway_names: ["shopify_payments"], order_status_url: "https://shop.example/status/1",
  line_items: [{ id: 501, sku: "RING-1", title: "Signet ring", quantity: 1, price: "90.00", product_id: 77, properties: [{ name: "engraving", value: "AL" }] }, { id: 502, title: "Band", quantity: 2, price: "5.00" }],
  fulfillments: [], refunds: [], ...extra
});
const ctx = { shop: "eggcraft.myshopify.com", shopName: "Eggcraft Store", eventOrigin: "provider" };

check("money is a decimal string with its currency, never a float, and absence stays absent", () => {
  assert.strictEqual(money.toDecimalString("40"), "40.00");
  assert.strictEqual(money.toDecimalString(40.005), "40.01");
  assert.strictEqual(money.toDecimalString({ amount: 4000, divisor: 100 }), "40.00");
  assert.strictEqual(money.toDecimalString({ shop_money: { amount: "5" } }), "5.00");
  assert.strictEqual(money.toDecimalString(undefined), null);
  assert.strictEqual(money.toDecimalString(""), null);
  assert.strictEqual(money.toMinorUnits("40.05"), 4005);
  assert.strictEqual(money.sumDecimal(["1.10", null, "2.20"]), "3.30");
  assert.strictEqual(money.sumDecimal([null]), null);
  assert.strictEqual(money.normalizeCurrency("gbp"), "GBP");
  assert.strictEqual(money.normalizeCurrency("£"), null);
});

check("identity is provider + connection + entity + external id, and the same id in two stores is two entities", () => {
  const a = buildEnvelope({ identity: { provider: "shopify", connection_id: "a.myshopify.com", external_id: "1042" }, order: { currency: "GBP", grand_total: "1" } });
  const b = buildEnvelope({ identity: { provider: "shopify", connection_id: "b.myshopify.com", external_id: "1042" }, order: { currency: "GBP", grand_total: "1" } });
  assert.notStrictEqual(identityKey(a.identity), identityKey(b.identity));
  assert.notStrictEqual(identityDocId(a.identity), identityDocId(b.identity));
  assert.ok(/^shopify__a\.myshopify\.com__order__1042$/.test(identityDocId(a.identity)), identityDocId(a.identity));
  assert.deepStrictEqual(validateEnvelope(a), []);
});

check("an envelope that names no provider, connection or id is refused before it can be applied", () => {
  const bad = buildEnvelope({ identity: { provider: "amazon", connection_id: "", external_id: "" }, order: { grand_total: "9.99" } });
  const problems = validateEnvelope(bad);
  for (const p of ["identity.provider", "identity.connection_id", "identity.external_id", "order.currency"]) assert.ok(problems.includes(p), p);
});

check("the content hash ignores presentation and changes only when the provider's facts change", () => {
  const base = normalizeShopifyOrder(restOrder(), ctx);
  const same = normalizeShopifyOrder(restOrder(), { ...ctx, rawSnapshotRef: "raw_other" });
  assert.strictEqual(contentHash(base), contentHash(same), "a different raw ref is not a different order");
  const changed = normalizeShopifyOrder(restOrder({ financial_status: "refunded" }), ctx);
  assert.notStrictEqual(contentHash(base), contentHash(changed));
});

check("the Shopify adapter fills the envelope from a REST order and never invents what Shopify did not send", () => {
  const env = normalizeShopifyOrder(restOrder(), ctx);
  assert.strictEqual(env.identity.provider, "shopify");
  assert.strictEqual(env.identity.connection_id, "eggcraft.myshopify.com");
  assert.strictEqual(env.identity.external_id, "1042");
  assert.strictEqual(env.identity.external_updated_at, "2026-09-01T12:10:00.000Z");
  assert.strictEqual(env.order.grand_total, "113.00");
  assert.strictEqual(env.order.shipping_total, "5.00");
  assert.strictEqual(env.order.tax_total, "18.00");
  assert.strictEqual(env.order.payment_status, "paid");
  assert.strictEqual(env.order.fulfillment_status, "unfulfilled");
  assert.strictEqual(env.order.platform_status, "paid");
  assert.strictEqual(env.order.buyer_note, "engrave AL");
  assert.strictEqual(env.customer.email, "buyer@example.com");
  assert.strictEqual(env.customer.identity_confidence, "external_id");
  assert.strictEqual(env.customer.billing_address.street, "1 Test St, Flat 2");
  assert.strictEqual(env.order.line_items[0].unit_price, "90.00");
  assert.strictEqual(env.order.line_items[1].line_total, "10.00");
  assert.deepStrictEqual(env.payments, [], "gateway names are not transactions");
  assert.strictEqual(env.source.external_admin_url, "https://eggcraft.myshopify.com/admin/orders/1042");
  assert.strictEqual(env.source.provider_metadata.payment_method, "shopify_payments");
  assert.strictEqual(env.review.required, false);
  const sparse = normalizeShopifyOrder({ id: 7, line_items: [{ title: "Thing", quantity: 1 }] }, ctx);
  assert.strictEqual(sparse.order.grand_total, null, "no total → null, not 0");
  assert.strictEqual(sparse.order.tax_total, null);
  assert.ok(sparse.review.reasons.includes("missing_total"));
});

check("a test order and a cancellation are visible in the envelope, not hidden in raw JSON", () => {
  const test = normalizeShopifyOrder(restOrder({ test: true }), ctx);
  assert.strictEqual(test.order.is_test, true);
  assert.ok(test.review.required && test.review.reasons.includes("test_order"));
  const cancelled = normalizeShopifyOrder(restOrder({ cancelled_at: "2026-09-01T13:00:00Z" }), ctx);
  assert.strictEqual(cancelled.order.platform_status, "cancelled");
  assert.strictEqual(cancelled.order.cancelled_at, "2026-09-01T13:00:00.000Z");
  const shipped = normalizeShopifyOrder(restOrder({ fulfillment_status: "fulfilled", fulfillments: [{ id: 1, tracking_number: "RM1", tracking_company: "Royal Mail", status: "success" }] }), ctx);
  assert.strictEqual(shipped.order.fulfillment_status, "fulfilled");
  assert.deepStrictEqual(shipped.shipments[0].tracking_number, "RM1");
});

check("the same order through a webhook payload and through the GraphQL-converted shape agree (TEST-008)", () => {
  const webhook = normalizeShopifyOrder(restOrder(), ctx);
  // shopifyGraphQLOrderToRest output: strings for ids, no updated_at on import nodes, same facts otherwise
  const converted = normalizeShopifyOrder({ ...restOrder(), id: "1042", updated_at: undefined, processed_at: "2026-09-01T12:10:00Z" }, { ...ctx, eventOrigin: "import" });
  assert.strictEqual(contentHash(webhook), contentHash(converted));
  assert.strictEqual(identityKey(webhook.identity), identityKey(converted.identity));
});

check("field ownership: the studio's fields are never in a sync patch, blanks never overwrite, notes append (MERGE-001..005)", () => {
  const env = normalizeShopifyOrder(restOrder(), ctx);
  const mapped = { ...projection.shopOwnedFields(env, { companyId: "c1" }), status: "Cancelled", designStatus: "Done", trackingNumber: "MANUAL-1", todoItems: [{ title: "x" }], taxRate: 0, whatsappNumber: "" };
  const existing = { status: "In Progress", designStatus: "Approved", trackingNumber: "MANUAL-1", whatsappNumber: "+44 1", notes: "bench: resize to M", taxRate: 20, emailAddress: "old@example.com" };
  const patch = ownership.updatePatch(mapped, existing, "shopify");
  for (const owned of ["status", "designStatus", "trackingNumber", "todoItems"]) assert.strictEqual(patch[owned], undefined, `${owned} untouched`);
  assert.strictEqual(patch.whatsappNumber, undefined, "a blank never overwrites a stored value");
  assert.strictEqual(patch.taxRate, undefined, "the channel's constant taxRate stays out (MERGE-005)");
  assert.strictEqual(patch.notes, "bench: resize to M\n\nengrave AL", "the buyer's note is appended, the bench's kept");
  assert.strictEqual(patch.emailAddress, "buyer@example.com", "a real new value does land");
  const again = ownership.updatePatch(mapped, { ...existing, notes: patch.notes }, "shopify");
  assert.strictEqual(again.notes, undefined, "a note already delivered is not news");
  const created = ownership.createPatch({ ...mapped });
  assert.strictEqual(created.status, undefined, "even on create the sync does not set the studio's status; defaults do");
});

check("provider tracking fills a blank and marks dispatch, but never replaces what the studio typed", () => {
  const shipments = [{ tracking_number: "RM123", carrier: "Royal Mail" }];
  assert.deepStrictEqual(ownership.shipmentPatch(shipments, {}), { trackingNumber: "RM123", courier: "Royal Mail", isDispatched: true });
  assert.deepStrictEqual(ownership.shipmentPatch(shipments, { trackingNumber: "MANUAL-9", courier: "DPD", isDispatched: true }), {}, "manual tracking wins, nothing to do");
  assert.deepStrictEqual(ownership.shipmentPatch(shipments, { trackingNumber: "RM123", courier: "", isDispatched: false }), { courier: "Royal Mail", isDispatched: true });
  assert.deepStrictEqual(ownership.shipmentPatch([], {}), {});
});

check("the projection writes the document the clients read: provider custom fields, money as numbers, the live summary format", () => {
  const env = normalizeShopifyOrder(restOrder(), ctx);
  const doc = projection.shopOwnedFields(env, { companyId: "c1", reconcileLineItems: (items, total) => { const sum = items.reduce((a, i) => a + i.lineTotal, 0); if (Math.abs(total - sum) > 0.01) items.push({ id: "adj", name: total > sum ? "Shipping & other" : "Discount", quantity: 1, unitPrice: total - sum, lineTotal: total - sum }); return items; } });
  assert.strictEqual(doc.customFields["Shopify Order ID"], "1042");
  assert.strictEqual(doc.customFields["Shopify Order Number"], "#1042");
  assert.strictEqual(doc.customFields["Shopify Total"], "113.00"); assert.strictEqual(doc.customFields.Source, "Shopify");
  assert.strictEqual(doc.customFields["Shopify Status"], "paid");
  assert.strictEqual(doc.customFields["Shopify Products"], "Signet ring x1, Band x2");
  assert.strictEqual(doc.customFields["Shopify Store"], "Eggcraft Store");
  assert.strictEqual(doc.customFields.communicationAddress, "1 Test St, Flat 2, Leeds, West Yorkshire, LS1, United Kingdom");
  assert.strictEqual(doc.paidAmount, 113); assert.strictEqual(doc.remainingAmount, 0); assert.strictEqual(doc.orderValue, 113);
  assert.strictEqual(doc.deliveryCost, 5); assert.strictEqual(doc.taxAmount, 18);
  assert.strictEqual(doc.designName, "Signet ring x1, Band x2");
  assert.strictEqual(doc.lineItems.length, 3, "reconciler added the shipping line to reach the total");
  assert.strictEqual(doc.lineItems[2].name, "Shipping & other");
  assert.strictEqual(doc.paymentMethod, "shopify_payments");
  assert.strictEqual(doc.designLink, "https://shop.example/status/1");
  assert.ok(doc.paymentDate instanceof Date);
  assert.strictEqual(doc.orderSource, undefined, "no top-level source: the commerce map carries identity");
  const unpaid = projection.shopOwnedFields(normalizeShopifyOrder(restOrder({ financial_status: "pending" }), ctx), { companyId: "c1" });
  assert.strictEqual(unpaid.paidAmount, 0); assert.strictEqual(unpaid.remainingAmount, 113);
  const defaults = projection.newOrderDefaults({ defaultDeliveryTime: 12 });
  assert.strictEqual(defaults.status, "Not Yet"); assert.strictEqual(defaults.deliveryTime, 12); assert.strictEqual(defaults.courier, "Auto Detect");
});

check("errors are classified, and the class — not the message — decides the retry (RETRY-001/006, TEST-009)", () => {
  assert.strictEqual(events.classifyError({ status: 429 }), "transient");
  assert.strictEqual(events.classifyError(new Error("shopify_graphql_http_503")), "transient");
  assert.strictEqual(events.classifyError(new Error("token expired, reconnect")), "auth");
  assert.strictEqual(events.classifyError({ status: 403, message: "missing scope read_orders" }), "permission");
  assert.strictEqual(events.classifyError(new Error("order_not_in_shopify")), "not_found");
  assert.strictEqual(events.classifyError({ status: 422, message: "invalid payload" }), "validation");
  assert.strictEqual(events.classifyError(new Error("something odd")), "unknown");
  assert.ok(events.retryDelayMs("transient", 1) >= 30000, "backoff starts at 30s");
  assert.ok(events.retryDelayMs("transient", 3) >= 120000, "and grows");
  assert.strictEqual(events.retryDelayMs("transient", 6), null, "then stops → DLQ");
  assert.strictEqual(events.retryDelayMs("auth", 1), null, "auth is never blindly retried");
  assert.strictEqual(events.retryDelayMs("validation", 1), null, "validation goes straight to review");
  assert.strictEqual(events.retryDelayMs("transient", 1, 120), 120000, "Retry-After wins (RETRY-002)");
  assert.strictEqual(events.parseRetryAfter("90"), 90);
  const dead = events.outcomeForError({ status: 422, message: "invalid" }, 1);
  assert.strictEqual(dead.status, "dead"); assert.strictEqual(dead.errorClass, "validation");
  const retry = events.outcomeForError({ status: 500, message: "boom" }, 1);
  assert.strictEqual(retry.status, "retrying"); assert.ok(retry.nextRetryInMs > 0);
});

check("a log line never carries a token or an address, and the idempotency key is stable (SYNC-003, OBS-002)", () => {
  const msg = events.safeMessage("auth", new Error("token shpat_0123456789abcdef0123456789abcdef revoked for buyer@example.com"));
  assert.ok(!msg.includes("shpat_0123456789abcdef"), msg);
  assert.ok(!msg.includes("buyer@example.com"), msg);
  assert.strictEqual(events.idempotencyKey({ provider: "shopify", connectionId: "s", eventId: "evt-1" }), "shopify|s|evt-1");
  const derived = events.idempotencyKey({ provider: "etsy", connectionId: "c", externalId: "r1", eventType: "receipt.updated" });
  assert.strictEqual(derived, events.idempotencyKey({ provider: "etsy", connectionId: "c", externalId: "r1", eventType: "receipt.updated" }));
  assert.ok(derived.startsWith("etsy|c|derived_"));
  const record = events.buildEventRecord({ provider: "shopify", connectionId: "s", companyId: "c1", externalId: "1042", eventType: "orders/create", idempotencyKey: "shopify|s|evt-1", status: "queued" });
  for (const field of ["correlation_id", "provider", "connection_id", "entity_type", "external_id", "event_type", "source", "attempt", "status", "started_at", "expireAtMs"]) assert.ok(record[field] !== undefined, field);
});

check("capabilities are declared per provider, and WooCommerce now declares the connector it has become", () => {
  assert.deepStrictEqual(listProviders(), ["shopify", "etsy", "woocommerce", "inbound"]);
  const shopify = getCapabilities("shopify");
  assert.strictEqual(shopify.orders.reconcile, true); assert.strictEqual(shopify.webhooks.coverage, "full");
  assert.strictEqual(getCapabilities("etsy").webhooks.coverage, "partial");
  const woo = getCapabilities("woocommerce");
  assert.strictEqual(woo.orders.read, true); assert.strictEqual(woo.orders.reconcile, true);
  assert.strictEqual(woo.webhooks.signature, "hmac_sha256_raw_body"); assert.strictEqual(woo.connection_model, "wc_auth");
  assert.strictEqual(getCapabilities("inbound").customers.read, "partial");
  assert.strictEqual(getCapabilities("amazon"), null);
  shopify.orders.read = false; assert.strictEqual(getCapabilities("shopify").orders.read, true, "the registry cannot be mutated through a copy");
});

console.log(failures === 0 ? "\n✅ COMMERCE CONTRACTS GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
