// The Etsy adapter, pure: a v3 receipt → the same envelope shape Shopify fills.
const assert = require("assert");
const { normalizeEtsyReceipt, deliveryTimeDaysFor } = require("../../commerce/adapters/etsy");
const { validateEnvelope, contentHash } = require("../../commerce/envelope");
const projection = require("../../commerce/envelopeToOrder");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 240)); } }
const money = (n, cur = "GBP") => ({ amount: Math.round(n * 100), divisor: 100, currency_code: cur });
const receipt = (extra = {}) => ({
  receipt_id: 3344, receipt_type: 0, status: "Paid", is_paid: true, is_shipped: false, is_gift: true, gift_message: "Happy birthday",
  buyer_user_id: 9001, buyer_email: "Buyer@Example.com", name: "Ada Lovelace", first_line: "10 Analytical Way", second_line: "Flat 3", city: "London", state: "", zip: "N1 1AA", country_iso: "GB",
  message_from_buyer: "please engrave AL", payment_method: "cc", create_timestamp: 1788307200, update_timestamp: 1788310800,
  grandtotal: money(113), subtotal: money(100), total_shipping_cost: money(5), total_tax_cost: money(8), total_vat_cost: money(10), discount_amt: money(10),
  transactions: [
    { transaction_id: 1, listing_id: 555, sku: "RING-1", title: "Signet ring", quantity: 1, price: money(90), expected_ship_date: 1788912000,
      variations: [{ formatted_name: "Size", formatted_value: "M", question_id: null }, { formatted_name: "Engraving", formatted_value: "AL", question_id: 77 }] },
    { transaction_id: 2, listing_id: 556, title: "Band", quantity: 2, price: money(5), variations: [] }
  ],
  shipments: [], refunds: [], ...extra
});
const ctx = { connectionId: "c1_777", shopId: "777", shopName: "Ada's Shop", shopCurrency: "GBP", eventOrigin: "provider" };

check("identity, money and dates come across; the connection is the identity, the shop the marketplace", () => {
  const env = normalizeEtsyReceipt(receipt(), ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.identity.provider, "etsy"); assert.strictEqual(env.identity.connection_id, "c1_777"); assert.strictEqual(env.identity.marketplace_id, "777");
  assert.strictEqual(env.identity.external_id, "3344");
  assert.strictEqual(env.identity.external_updated_at, "2026-09-02T01:00:00.000Z");
  assert.strictEqual(env.order.placed_at, "2026-09-02T00:00:00.000Z");
  assert.strictEqual(env.order.grand_total, "113.00"); assert.strictEqual(env.order.tax_total, "18.00", "tax + VAT, as the live path sums them");
  assert.strictEqual(env.order.shipping_total, "5.00"); assert.strictEqual(env.order.discount_total, "10.00"); assert.strictEqual(env.order.currency, "GBP");
  assert.strictEqual(env.order.payment_status, "paid"); assert.strictEqual(env.order.fulfillment_status, "unfulfilled"); assert.strictEqual(env.order.platform_status, "paid");
});
check("line labels carry options, personalisation goes to properties and to the note in the live format", () => {
  const env = normalizeEtsyReceipt(receipt(), ctx);
  assert.strictEqual(env.order.line_items[0].title, "Signet ring (Size: M)");
  assert.deepStrictEqual(env.order.line_items[0].properties, [{ name: "Engraving", value: "AL" }]);
  assert.strictEqual(env.order.line_items[0].unit_price, "90.00"); assert.strictEqual(env.order.line_items[1].line_total, "10.00");
  assert.strictEqual(env.order.buyer_note, "Personalisation — Engraving: AL\nBuyer note — please engrave AL\nGift message — Happy birthday");
  assert.strictEqual(env.customer.email, "buyer@example.com"); assert.strictEqual(env.customer.external_customer_id, "9001");
  assert.strictEqual(env.customer.shipping_address.street, "10 Analytical Way, Flat 3"); assert.strictEqual(env.customer.shipping_address.country, "GB");
  assert.strictEqual(env.source.provider_metadata.custom_fields["Etsy Receipt ID"], "3344");
  assert.strictEqual(deliveryTimeDaysFor(env), 7, "placed 2 Sep, ships 9 Sep");
});
check("cancelled, refunded and shipped receipts say so in canonical words, and review reasons are honest", () => {
  const cancelled = normalizeEtsyReceipt(receipt({ status: "Canceled" }), ctx);
  assert.strictEqual(cancelled.order.platform_status, "cancelled"); assert.strictEqual(cancelled.order.cancelled_at, "2026-09-02T01:00:00.000Z");
  const refunded = normalizeEtsyReceipt(receipt({ refunds: [{ amount: money(20), created_timestamp: 1788314400, note: "chipped" }] }), ctx);
  assert.strictEqual(refunded.order.payment_status, "refunded"); assert.strictEqual(refunded.refunds[0].amount, "20.00");
  const shipped = normalizeEtsyReceipt(receipt({ is_shipped: true, shipments: [{ receipt_shipping_id: 5, carrier_name: "Royal Mail", tracking_code: "RM99", shipment_notification_timestamp: 1788314400 }] }), ctx);
  assert.strictEqual(shipped.order.fulfillment_status, "fulfilled"); assert.strictEqual(shipped.shipments[0].tracking_number, "RM99");
  const odd = normalizeEtsyReceipt(receipt({ grandtotal: money(113, "USD"), transactions: [], buyer_user_id: null }), ctx);
  for (const r of ["currency_mismatch", "no_line_items", "no_buyer_id"]) assert.ok(odd.review.reasons.includes(r), r);
  assert.strictEqual(normalizeEtsyReceipt(receipt({ is_paid: false }), ctx).order.payment_status, "unpaid");
});
check("the projection gives the Etsy order the live document's shape", () => {
  const env = normalizeEtsyReceipt(receipt(), ctx);
  const doc = projection.shopOwnedFields(env, { companyId: "c1" });
  assert.strictEqual(doc.customerName, "Ada Lovelace"); assert.strictEqual(doc.paidAmount, 113); assert.strictEqual(doc.taxAmount, 18); assert.strictEqual(doc.deliveryCost, 5);
  assert.strictEqual(doc.notes, env.order.buyer_note); assert.strictEqual(doc.customFields["Etsy Receipt ID"], "3344"); assert.strictEqual(doc.customFields["Etsy Shop"], "Ada's Shop"); assert.strictEqual(doc.customFields["Etsy Total"], "113"); assert.strictEqual(doc.designName, "Signet ring (Size: M) — Engraving: AL"); assert.strictEqual(doc.lineItems[0].sku, "RING-1");
  assert.deepStrictEqual(doc.communication, ["Etsy"]); assert.strictEqual(doc.shippingCountry, "GB");
  assert.strictEqual(contentHash(env), contentHash(normalizeEtsyReceipt(receipt(), { ...ctx, rawSnapshotRef: "x" })));
});
console.log(failures === 0 ? "\n✅ COMMERCE ETSY ADAPTER GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
