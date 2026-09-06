// The eBay split (design §8.1): the person leaves the order BEFORE the adapter
// sees it, by path first and by key name second; the buyer's username and the
// delivery country stay; the scanner trips on anything personal that survives.
//
// Runs against the CAPTURED sandbox fixture when the owner has committed it
// (test/fixtures/ebay-sandbox-order.json with a `_captured` header) and against
// the hand-written stand-in until then — loudly, and with a pin that the
// production gate (the secrets marker) cannot be committed without the capture.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sanitize = require("../../commerce/ebay/sanitize");
const { normalizeEbayOrder } = require("../../commerce/adapters/ebay");
const { validateEnvelope } = require("../../commerce/envelope");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

const fixtures = path.join(__dirname, "..", "fixtures");
const capturedPath = path.join(fixtures, "ebay-sandbox-order.json");
const capturedFulfillmentsPath = path.join(fixtures, "ebay-sandbox-fulfillments.json");
const captured = fs.existsSync(capturedPath);
const orderFixture = JSON.parse(fs.readFileSync(captured ? capturedPath : path.join(fixtures, "ebay-synthetic-order.json"), "utf8"));
const fulfillmentFixture = JSON.parse(fs.readFileSync(captured && fs.existsSync(capturedFulfillmentsPath) ? capturedFulfillmentsPath : path.join(fixtures, "ebay-synthetic-fulfillments.json"), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const orderOf = () => { const o = clone(orderFixture); delete o._captured; delete o._synthetic; return o; };
const fulfillmentsOf = () => clone(fulfillmentFixture.fulfillments || []);

check("the fixture is the captured sandbox response, or the stand-in is named as such and the production gate is not yet committed", () => {
  if (captured) {
    assert.ok(orderFixture._captured && orderFixture._captured.environment === "sandbox" && orderFixture._captured.capturedAt && orderFixture._captured.orderId,
      "ebay-sandbox-order.json exists but carries no _captured header — a hand-written file must be named ebay-synthetic-order.json");
    assert.ok(typeof orderFixture._captured.lastModifiedMovedOnFulfillment === "boolean", "the capture must record whether shipment moved lastModifiedDate (design §1)");
    return;
  }
  console.log("      (no captured sandbox fixture yet — running against test/fixtures/ebay-synthetic-order.json; capturing it is an owner action and a gate on NIVADESK_EBAY_CONNECTOR=1 in production)");
  assert.ok(orderFixture._synthetic, "the stand-in must say it is one");
  const marker = path.join(__dirname, "..", "..", ".ebay-secrets-ready");
  assert.ok(!fs.existsSync(marker), "functions/.ebay-secrets-ready is committed but no captured sandbox fixture exists — capture the fixture before shipping (design §8.1, §15)");
});

check("the documented paths are removed: registration identity, tax identity, checkout notes, shipTo, pickup, gift details", () => {
  const { safe, restricted, removed } = sanitize.splitEbayOrder(orderOf(), fulfillmentsOf());
  assert.strictEqual(safe.buyer.buyerRegistrationAddress, undefined);
  assert.strictEqual(safe.buyer.taxAddress, undefined);
  assert.strictEqual(safe.buyer.taxIdentifier, undefined);
  assert.strictEqual(safe.buyerCheckoutNotes, undefined);
  assert.strictEqual(safe.fulfillmentStartInstructions[0].shippingStep.shipTo.fullName, undefined);
  assert.strictEqual(safe.fulfillmentStartInstructions[0].shippingStep.shipTo.contactAddress.addressLine1, undefined);
  assert.strictEqual(safe.fulfillmentStartInstructions[0].shippingStep.shipTo.contactAddress.postalCode, undefined);
  assert.ok(!safe.lineItems.some((li) => li.giftDetails), "gift messages are written by one person to another");
  for (const p of ["buyer.buyerRegistrationAddress", "buyer.taxIdentifier", "buyerCheckoutNotes", "fulfillmentStartInstructions[0].shippingStep.shipTo", "lineItems[0].giftDetails"]) assert.ok(removed.includes(p), `${p} not in removed[]: ${removed.join(", ")}`);
  assert.strictEqual(restricted.fullName, "Ada Lovelace");
  assert.strictEqual(restricted.address.line1, "10 Analytical Way"); assert.strictEqual(restricted.address.line2, "Flat 3"); assert.strictEqual(restricted.address.postalCode, "N1 1AA");
  assert.strictEqual(restricted.email, "ada@example.com"); assert.strictEqual(restricted.phone, "+44 7700 900000"); assert.strictEqual(restricted.companyName, "Lovelace Analytical Ltd");
  assert.ok(restricted.buyerCheckoutNotes.includes("neighbour"));
  assert.strictEqual(restricted.giftDetails[0].senderName, "Charles Babbage");
  assert.strictEqual(restricted.taxIdentifier.taxpayerId, "GB999999973");
});

check("the username and the delivery country stay; shipping codes and dates stay; tracking stays", () => {
  const { safe } = sanitize.splitEbayOrder(orderOf(), fulfillmentsOf());
  assert.strictEqual(safe.buyer.username, "ada_l", "the pseudonymous handle eBay itself shows the seller");
  assert.strictEqual(safe.fulfillmentStartInstructions[0].shippingStep.shipTo.contactAddress.countryCode, "GB", "the one deliberate exception: a country is not a person");
  assert.strictEqual(safe.fulfillmentStartInstructions[0].shippingStep.shippingCarrierCode, "RoyalMail");
  assert.strictEqual(safe.fulfillmentStartInstructions[0].shippingStep.shippingServiceCode, "UK_RoyalMailSecondClassStandard");
  assert.ok(safe.fulfillmentStartInstructions[0].minEstimatedDeliveryDate);
  assert.strictEqual(safe.fulfillments[0].shipmentTrackingNumber, "RM123456789GB");
  assert.strictEqual(safe.fulfillments[0].shippingCarrierCode, "RoyalMail");
  assert.strictEqual(safe.fulfillments[0].shipTo, undefined);
  assert.strictEqual(safe.fulfillments[0].contactEmail, undefined, "a contact* field on a fulfilment goes");
  assert.deepStrictEqual(safe.fulfillments[0].lineItems, [{ lineItemId: "10001", quantity: 1 }, { lineItemId: "10002", quantity: 2 }]);
  assert.strictEqual(safe.pricingSummary.total.value, "116.00"); assert.strictEqual(safe.paymentSummary.payments[0].paymentReferenceId[0].referenceId, "PAY-9F2-7710");
  assert.strictEqual(safe.lineItems[0].ebayCollectAndRemitTaxes[0].amount.value, "19.00", "tax lines stay");
});

check("a personalised variation aspect is diverted and the line reads [personalised item]; the seller's own postcode inside itemLocation goes too", () => {
  const { safe, restricted, removed } = sanitize.splitEbayOrder(orderOf(), []);
  const line = safe.lineItems[0];
  assert.strictEqual(line.title, sanitize.PERSONALISED_TITLE);
  const engraving = line.variationAspects.find((a) => a.name === "Engraving");
  assert.strictEqual(engraving.value, sanitize.PERSONALISED_VALUE);
  assert.strictEqual(line.variationAspects.find((a) => a.name === "Size").value, "M", "an ordinary aspect is untouched");
  assert.strictEqual(restricted.lineItems["0"].title, "Signet ring");
  assert.strictEqual(restricted.lineItems["0"].variationAspects[0].value, "Ada & Charles 07700 900123");
  assert.ok(removed.includes("lineItems[0].variationAspects[1].value") && removed.includes("lineItems[0].title"));
  assert.strictEqual(line.itemLocation.postalCode, undefined, "the seller's own postcode is stripped rather than argued about");
  assert.strictEqual(line.itemLocation.countryCode, "GB");
  assert.strictEqual(safe.lineItems[1].title, "Wedding band", "an unpersonalised line keeps its title");
});

check("removed[] names paths and never values", () => {
  const { removed } = sanitize.splitEbayOrder(orderOf(), fulfillmentsOf());
  const text = removed.join("\n");
  for (const value of ["Ada", "Lovelace", "example.com", "Analytical", "N1 1AA", "7700", "neighbour", "Babbage", "GB999999973"]) assert.ok(!text.includes(value), `a value leaked into removed[]: ${value}`);
});

check("the scanner finds nothing on the safe half, and trips on an email, a phone, a postcode and a fullName planted at unknown paths", () => {
  const { safe } = sanitize.splitEbayOrder(orderOf(), fulfillmentsOf());
  assert.deepStrictEqual(sanitize.scanForPii(safe), [], "the split must hold on the fixture itself");
  const plant = (mutate) => { const copy = clone(safe); mutate(copy); return sanitize.scanForPii(copy); };
  assert.ok(plant((o) => { o.pricingSummary.note = "reach me at ada@example.com"; }).some((p) => /email/.test(p)), "email");
  assert.ok(plant((o) => { o.lineItems[1].sellerNote = "call 07700 900123 please"; }).some((p) => /phone/.test(p)), "phone");
  assert.ok(plant((o) => { o.lineItems[1].sellerNote = "deliver to N1 1AA"; }).some((p) => /postcode/.test(p)), "UK postcode");
  assert.ok(plant((o) => { o.lineItems[1].sellerNote = "deliver to 90210"; }).some((p) => /postcode/.test(p)), "US zip");
  assert.ok(plant((o) => { o.newBlock = { fullName: "Somebody" }; }).some((p) => p === "newBlock.fullName"), "a key on the list, anywhere");
  assert.ok(plant((o) => { o.fulfillments[0].recipientName = "Somebody"; }).some((p) => /recipientName/.test(p)), "inside a fulfilment too");
});

check("the scanner never trips on a country code, an order id, a legacy id, a tracking number, a VAT reference, a date or a money value", () => {
  const { safe } = sanitize.splitEbayOrder(orderOf(), fulfillmentsOf());
  const found = sanitize.scanForPii({
    ...safe,
    countryCode: "GB", orderId: "12-09113-42375", legacyOrderId: "170009134375-2314958900123", shipmentTrackingNumber: "RM123456789GB", ebayReference: { name: "VAT", value: "GB123456789" },
    creationDate: "2026-09-02T09:00:00.000Z", total: { value: "12345.00", currency: "GBP" }, salesRecordReference: "1042", paymentReferenceId: [{ referenceId: "PAY-9F2-7710123456" }]
  });
  assert.deepStrictEqual(found, []);
});

check("the sanitized fixture, run through the adapter, has no email, no phone, no address — and the username as the name", () => {
  const { safe } = sanitize.splitEbayOrder(orderOf(), fulfillmentsOf());
  const envelope = normalizeEbayOrder(safe, { connectionId: "acme__ebayuser_xxx", accountName: "eggcraft_uk", marketplaceId: "EBAY_GB", eventOrigin: "reconcile", fulfillments: safe.fulfillments });
  assert.deepStrictEqual(validateEnvelope(envelope), []);
  assert.strictEqual(envelope.customer.email, null); assert.strictEqual(envelope.customer.phone, null);
  assert.strictEqual(envelope.customer.shipping_address.street, null); assert.strictEqual(envelope.customer.shipping_address.city, null); assert.strictEqual(envelope.customer.shipping_address.postalCode, null);
  assert.strictEqual(envelope.customer.shipping_address.country, "GB", "the country survives for VAT and delivery logic");
  assert.strictEqual(envelope.customer.name, "ada_l");
  assert.strictEqual(envelope.customer.external_customer_id, "ada_l");
  assert.strictEqual(envelope.order.buyer_note, null, "the checkout note went with the address");
  assert.strictEqual(envelope.shipments[0].tracking_number, "RM123456789GB", "shipments still come from the fulfilments");
  assert.strictEqual(envelope.order.line_items[0].title, sanitize.PERSONALISED_TITLE);
  assert.ok(!JSON.stringify(envelope).includes("Lovelace") && !JSON.stringify(envelope).includes("example.com") && !JSON.stringify(envelope).includes("Analytical"));
});

check("an order that carries nobody splits to an empty restricted half and writes nothing", () => {
  const bare = { orderId: "x", buyer: { username: "ada_l" }, lineItems: [{ lineItemId: "1", title: "Ring", quantity: 1, lineItemCost: { value: "1.00", currency: "GBP" } }], fulfillmentStartInstructions: [{ shippingStep: { shipTo: { contactAddress: { countryCode: "GB" } } } }] };
  const { safe, restricted, removed } = sanitize.splitEbayOrder(bare, []);
  assert.deepStrictEqual(restricted, {}); assert.deepStrictEqual(removed, []);
  assert.strictEqual(safe.fulfillmentStartInstructions[0].shippingStep.shipTo.contactAddress.countryCode, "GB");
  assert.deepStrictEqual(sanitize.scanForPii(safe), []);
});

check("countryCode is deliberately absent from PII_KEY_NAMES; city, stateOrProvince and postalCode are present", () => {
  assert.ok(!sanitize.PII_KEY_NAMES.test("countryCode"));
  for (const key of ["city", "stateOrProvince", "postalCode", "fullName", "email", "shipTo", "contactAddress", "buyerCheckoutNotes", "giftDetails", "taxpayerId"]) assert.ok(sanitize.PII_KEY_NAMES.test(key), key);
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ COMMERCE EBAY SANITIZE GEÇTİ");
