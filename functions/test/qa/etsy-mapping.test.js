// Turning an Etsy receipt into a NivaDesk order.
//
// The fixtures below follow the published Etsy Open API v3 schema
// (ShopReceipt / ShopReceiptTransaction / Money), not a guess at it.

const assert = require("assert");
const { normalizeEtsyReceipt, etsyMoney, splitVariations } = require("../../etsy");

let failed = 0;
function check(fn, what) {
  try { fn(); console.log("  ok  " + what); } catch (error) {
    failed += 1;
    console.log("  FAIL " + what + "\n        " + (error?.message || error));
  }
}

console.log("Etsy receipt normalisation");

const CREATED = 1756000000;   // unix seconds
const receipt = {
  receipt_id: 3312345678,
  receipt_type: 0,
  status: "paid",
  is_paid: true,
  is_shipped: false,
  is_gift: false,
  buyer_user_id: 987654321,
  buyer_email: "Buyer.Relay@etsy.example",
  name: "Ada Lovelace",
  first_line: "12 Analytical Way",
  second_line: "Flat 3",
  city: "London",
  state: "",
  zip: "EC1A 1BB",
  country_iso: "GB",
  message_from_buyer: "Please engrave in italics.",
  payment_method: "cc",
  create_timestamp: CREATED,
  update_timestamp: CREATED + 600,
  grandtotal: { amount: 12500, divisor: 100, currency_code: "GBP" },
  subtotal: { amount: 10000, divisor: 100, currency_code: "GBP" },
  total_shipping_cost: { amount: 500, divisor: 100, currency_code: "GBP" },
  total_tax_cost: { amount: 1500, divisor: 100, currency_code: "GBP" },
  total_vat_cost: { amount: 500, divisor: 100, currency_code: "GBP" },
  discount_amt: { amount: 0, divisor: 100, currency_code: "GBP" },
  refunds: [],
  transactions: [{
    transaction_id: 44551122,
    listing_id: 1234567890,
    product_id: 555,
    sku: "RING-18K",
    title: "Personalised 18k Ring",
    quantity: 2,
    is_digital: false,
    price: { amount: 5000, divisor: 100, currency_code: "GBP" },
    expected_ship_date: CREATED + 14 * 86400,
    variations: [
      { property_id: 200, value_id: 9, formatted_name: "Size", formatted_value: "M" },
      { property_id: 54, value_id: null, question_id: 77, formatted_name: "Engraving", formatted_value: "For Ada, 1843" }
    ]
  }]
};

const opts = { companyId: "c1", shopId: "222", shopName: "Ada Studio", shopCurrency: "GBP", defaultDeliveryTime: 30 };

// --- the divisor trap -------------------------------------------------------
check(() => {
  assert.deepStrictEqual(etsyMoney({ amount: 12500, divisor: 100, currency_code: "GBP" }), { value: 125, currency: "GBP" });
  assert.deepStrictEqual(etsyMoney({ amount: 12500, divisor: 0, currency_code: "usd" }), { value: 12500, currency: "USD" });
  assert.deepStrictEqual(etsyMoney(null), { value: 0, currency: "" });
  assert.strictEqual(etsyMoney({ amount: 999, divisor: 1000 }).value, 1);
}, "money is scaled by its divisor, and a zero divisor never divides by zero");

check(() => {
  const { order } = normalizeEtsyReceipt(receipt, opts);
  assert.strictEqual(order.orderValue, 125, "12500/100 is 125.00, not 12500");
  assert.strictEqual(order.paidAmount, 125);
  assert.strictEqual(order.remainingAmount, 0);
  assert.strictEqual(order.deliveryCost, 5);
  assert.strictEqual(order.taxAmount, 20, "tax and VAT add up");
}, "the order totals come out in real money");

check(() => {
  const unpaid = { ...receipt, is_paid: false, status: "open" };
  const { order } = normalizeEtsyReceipt(unpaid, opts);
  assert.strictEqual(order.paidAmount, 0);
  assert.strictEqual(order.remainingAmount, 125);
}, "an unpaid receipt owes the full amount");

// --- personalization --------------------------------------------------------
check(() => {
  const { personalization, options } = splitVariations(receipt.transactions[0].variations);
  assert.strictEqual(personalization.length, 1);
  assert.strictEqual(personalization[0].value, "For Ada, 1843");
  assert.strictEqual(options.length, 1);
  assert.strictEqual(options[0].value, "M");
}, "question_id tells personalization apart from a product option");

check(() => {
  // The same shape with the labels in another language must still split right;
  // matching on the word "Personalization" would fail here.
  const turkish = [
    { property_id: 200, value_id: 9, formatted_name: "Beden", formatted_value: "M" },
    { property_id: 54, value_id: null, question_id: 77, formatted_name: "Kişiselleştirme", formatted_value: "Ada için" }
  ];
  const { personalization, options } = splitVariations(turkish);
  assert.strictEqual(personalization.length, 1);
  assert.strictEqual(personalization[0].value, "Ada için");
  assert.strictEqual(options.length, 1);
}, "the split does not depend on the language Etsy rendered");

check(() => {
  const { order, source } = normalizeEtsyReceipt(receipt, opts);
  assert.ok(order.notes.includes("For Ada, 1843"), "personalisation must reach the order note");
  assert.ok(order.notes.includes("Please engrave in italics."), "the buyer note must survive");
  assert.deepStrictEqual(source.personalization, ["Engraving: For Ada, 1843"]);
  assert.ok(order.designName.includes("For Ada, 1843"), "the order title carries what makes it custom");
}, "personalisation and the buyer note reach production");

check(() => {
  const { order } = normalizeEtsyReceipt(receipt, opts);
  assert.strictEqual(order.lineItems.length, 1);
  assert.strictEqual(order.lineItems[0].quantity, 2);
  assert.strictEqual(order.lineItems[0].unitPrice, 50);
  assert.strictEqual(order.lineItems[0].lineTotal, 100, "unit price times quantity");
  assert.strictEqual(order.lineItems[0].sku, "RING-18K");
  assert.ok(order.lineItems[0].name.includes("Size: M"), "the product option belongs in the line label");
  assert.ok(!order.lineItems[0].name.includes("For Ada"), "personalisation is not a product option");
}, "line items carry quantity, price and the chosen options");

// --- the workspace's own fields are never seeded from Etsy ------------------
check(() => {
  const { order } = normalizeEtsyReceipt(receipt, opts);
  assert.strictEqual(order.status, "Not Yet");
  assert.strictEqual(order.designStatus, "Not Yet");
  assert.strictEqual(order.priority, "Normal");
  assert.strictEqual(order.assignedToUid, "");
  assert.deepStrictEqual(order.todoItems, []);
  assert.deepStrictEqual(order.workSessions, []);
}, "production fields start empty — Etsy has no opinion about them");

// --- dates ------------------------------------------------------------------
check(() => {
  const { order } = normalizeEtsyReceipt(receipt, opts);
  assert.strictEqual(order.deliveryTime, 14, "Etsy's expected ship date beats the workspace default");
  const noShipDate = JSON.parse(JSON.stringify(receipt));
  delete noShipDate.transactions[0].expected_ship_date;
  assert.strictEqual(normalizeEtsyReceipt(noShipDate, opts).order.deliveryTime, 30, "…and the default applies when Etsy has none");
}, "the promised ship date becomes the delivery time");

// --- review reasons: nothing is skipped silently ----------------------------
check(() => {
  const { review } = normalizeEtsyReceipt(receipt, opts);
  assert.deepStrictEqual(review, [], "a clean paid receipt needs no review");
}, "a good receipt raises nothing");

check(() => {
  const other = { ...receipt, grandtotal: { amount: 12500, divisor: 100, currency_code: "USD" } };
  const { review, order } = normalizeEtsyReceipt(other, opts);
  const flag = review.find((row) => row.code === "currency_mismatch");
  assert.ok(flag, "a foreign currency must be flagged");
  assert.strictEqual(flag.currency, "USD");
  assert.strictEqual(order.orderValue, 125, "the amount is preserved, never converted");
}, "a different currency is flagged and left unconverted");

check(() => {
  const cancelled = { ...receipt, status: "canceled", is_paid: false };
  const { review, source } = normalizeEtsyReceipt(cancelled, opts);
  assert.ok(review.some((row) => row.code === "cancelled_at_source"));
  assert.strictEqual(source.isCancelled, true);
}, "a cancelled receipt is flagged, not imported blindly");

check(() => {
  const digital = JSON.parse(JSON.stringify(receipt));
  digital.transactions[0].is_digital = true;
  assert.ok(normalizeEtsyReceipt(digital, opts).review.some((row) => row.code === "digital_only"));
}, "a digital-only receipt is flagged for the import rule to decide");

check(() => {
  const empty = { ...receipt, transactions: [] };
  assert.ok(normalizeEtsyReceipt(empty, opts).review.some((row) => row.code === "no_line_items"));
  const anon = { ...receipt, buyer_user_id: null };
  assert.ok(normalizeEtsyReceipt(anon, opts).review.some((row) => row.code === "no_buyer_id"));
}, "a receipt with nothing to make, or no buyer id, is flagged");

check(() => {
  const refunded = { ...receipt, status: "partially refunded", refunds: [{ amount: { amount: 500, divisor: 100 } }] };
  assert.strictEqual(normalizeEtsyReceipt(refunded, opts).source.isRefunded, true);
}, "a refund at the source is visible");

// --- the source snapshot ----------------------------------------------------
check(() => {
  const { source, customer } = normalizeEtsyReceipt(receipt, opts);
  assert.strictEqual(source.receiptId, "3312345678");
  assert.strictEqual(source.buyerUserId, "987654321");
  assert.strictEqual(source.currency, "GBP");
  assert.strictEqual(source.grandTotal, 125);
  assert.strictEqual(source.items[0].listingId, "1234567890");
  assert.strictEqual(source.updatedAtMs, (CREATED + 600) * 1000, "the source update time drives ordering");
  assert.strictEqual(customer.externalCustomerId, "987654321", "the buyer id is the identity, not the email");
  assert.strictEqual(customer.email, "buyer.relay@etsy.example");
  assert.strictEqual(customer.shippingCity, "London");
}, "the read-only snapshot keeps what the order screen shows");

check(() => {
  const { order } = normalizeEtsyReceipt(receipt, opts);
  assert.deepStrictEqual(order.communication, ["Etsy"]);
  assert.strictEqual(order.companyId, "c1");
}, "the order is stamped as an Etsy order for this workspace");

// Where an order came from is not decoration. The rest of NivaDesk reads
// customFields.Source: the dashboard's channel pills scope every figure by it,
// and the tax recalculation uses it to decide an order's tax belongs to the
// shop and must be left alone. While it was empty, an Etsy order was invisible
// to the pills and its tax was being overwritten with the workspace default.
check(() => {
  const { order } = normalizeEtsyReceipt(receipt, opts);
  assert.strictEqual(order.customFields.Source, "Etsy", "the order says it came from Etsy");
  assert.strictEqual(order.customFields["Etsy Shop"], "Ada Studio");
  assert.ok(order.customFields["Etsy Receipt ID"], "the receipt id travels with the order");
  assert.strictEqual(order.taxRate, 0, "the rate stays zero so the recalculation skips it");
  assert.ok(
    order.customFields.communicationAddress.includes("Ada Studio") === false,
    "the address block is the buyer's, not the shop's"
  );
}, "an imported order says it came from Etsy, so the pills and the tax rules can see it");

// Every client and reconcileLineItems read lineTotal. The shared schema is
// written down in index.js as { id, name, quantity, unitPrice, lineTotal }, and
// Etsy was writing `total` instead. Three things broke silently: each line
// rendered as zero on the order screen, the CSV export wrote blanks, and
// reconcileLineItems summed the items to nothing and added a phantom
// "Shipping & other" line for the entire order value.
check(() => {
  const { order } = normalizeEtsyReceipt(receipt, opts);
  assert.ok(order.lineItems.length, "there are line items to check");
  for (const item of order.lineItems) {
    for (const field of ["id", "name", "quantity", "unitPrice", "lineTotal"]) {
      assert.ok(field in item, `a line item is missing ${field} — the shared schema is not optional`);
    }
    assert.strictEqual(typeof item.lineTotal, "number", "lineTotal is a number, not undefined");
    assert.ok(!("total" in item), "total is the wrong name and nothing reads it");
  }
  // The reconciler's own arithmetic: items must sum to something, or it invents
  // a line for the difference.
  const sum = order.lineItems.reduce((acc, i) => acc + (Number(i.lineTotal) || 0), 0);
  assert.ok(sum > 0, "the items sum to a real figure, so no phantom line is added");
}, "line items carry lineTotal, the name every client and the reconciler read");

// The app decides an order is cancelled by reading order.status, and Etsy wrote
// "Not Yet" for every receipt including the cancelled ones. A seller who ticks
// "Cancelled orders" to bring their history in would have had those orders sit
// in the workspace as live work, counting as revenue they never received.
check(() => {
  const cancelled = JSON.parse(JSON.stringify(receipt));
  cancelled.status = "canceled";
  const out = normalizeEtsyReceipt(cancelled, opts);
  assert.strictEqual(out.order.status, "Cancelled", "a cancelled receipt arrives cancelled");
  assert.ok(out.source.isCancelled, "the read-only snapshot agrees");
  assert.ok(
    out.review.some((r) => r.code === "cancelled_at_source"),
    "and the preview still says why it needs a decision"
  );

  // The ordinary case must not have moved.
  const normal = normalizeEtsyReceipt(receipt, opts);
  assert.strictEqual(normal.order.status, "Not Yet");
  assert.ok(!normal.source.isCancelled);
}, "a receipt cancelled on Etsy arrives as a cancelled order, not as live work");

// --- robustness -------------------------------------------------------------
check(() => {
  const { order, review } = normalizeEtsyReceipt({ receipt_id: 1 }, opts);
  assert.strictEqual(order.orderValue, 0);
  assert.ok(Number.isFinite(order.orderValue));
  assert.ok(review.length, "an empty receipt is all review, not a crash");
}, "a receipt missing almost everything does not throw");

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nPASS");
