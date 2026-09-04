// The split that keeps an Amazon buyer out of the order document.
//
// Every other connector hands its payload to an adapter and the adapter hands
// an envelope to the shared engine, which writes the customer block onto the
// order — name, email, phone, both addresses. For a shop the workshop runs
// itself that is correct. For a marketplace buyer it is the thing the access
// control policy exists to prevent, and an Amazon connector written by
// faithfully copying the Square one would do it on its first order with nothing
// complaining.
//
// So the response is split first. These checks are about the half that travels.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sanitize = require("../../commerce/amazon/sanitize");
const { normalizeAmazonOrder } = require("../../commerce/adapters/amazon");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const root = path.join(__dirname, "..", "..");

// A response with a person in every place Amazon puts one.
const RAW_ORDER = {
  AmazonOrderId: "203-0000000-0000001",
  SellerOrderId: "NIV-1041",
  OrderStatus: "Unshipped",
  PurchaseDate: "2026-09-01T10:00:00Z",
  LastUpdateDate: "2026-09-02T10:00:00Z",
  MarketplaceId: "A1F83G8C2ARO7P",
  OrderTotal: { CurrencyCode: "GBP", Amount: "120.00" },
  FulfillmentChannel: "MERCHANT",
  BuyerInfo: { BuyerEmail: "ada@marketplace.amazon.co.uk", BuyerName: "Ada Lovelace", BuyerCounty: "Greater London" },
  ShippingAddress: { Name: "Ada Lovelace", AddressLine1: "10 Analytical Way", City: "London", PostalCode: "N1 1AA", CountryCode: "GB", Phone: "+44 7700 900000" },
  DefaultShipFromLocationAddress: { Name: "The workshop", AddressLine1: "1 Bench Row" },
  BuyerTaxInformation: { BuyerTaxRegistrationId: "GB123456789" }
};
const RAW_ITEMS = [{
  OrderItemId: "i1", SellerSKU: "RING-SIG-1", ASIN: "B00XXXXXXX", Title: "Signet ring",
  QuantityOrdered: 1, ItemPrice: { CurrencyCode: "GBP", Amount: "120.00" },
  BuyerInfo: { GiftMessageText: "Happy birthday, love Charles" },
  BuyerCustomizedInfo: { CustomizedURL: "https://example.invalid/x" }
}];

check("the person is removed from the half that travels", () => {
  const { safe } = sanitize.splitAmazonOrder(RAW_ORDER, RAW_ITEMS);
  for (const field of ["BuyerInfo", "ShippingAddress", "DefaultShipFromLocationAddress", "BuyerTaxInformation"]) {
    assert.strictEqual(safe.order[field], undefined, `${field} survived the split`);
  }
  for (const field of ["BuyerInfo", "BuyerCustomizedInfo"]) {
    assert.strictEqual(safe.items[0][field], undefined, `item ${field} survived the split`);
  }
  // The sale is untouched. A split that also loses the money has not protected
  // anybody, it has broken the feature.
  assert.strictEqual(safe.order.AmazonOrderId, "203-0000000-0000001");
  assert.strictEqual(safe.order.OrderTotal.Amount, "120.00");
  assert.strictEqual(safe.order.FulfillmentChannel, "MERCHANT");
  assert.strictEqual(safe.items[0].SellerSKU, "RING-SIG-1");
  assert.strictEqual(safe.items[0].ItemPrice.Amount, "120.00");
});

check("nothing personal survives, checked by looking rather than by remembering", () => {
  // The split works from a list of field names. This is the check that the list
  // is still complete: it reads what is actually there. A new SP-API field
  // carrying a buyer's name fails here rather than in a document.
  const { safe } = sanitize.splitAmazonOrder(RAW_ORDER, RAW_ITEMS);
  assert.deepStrictEqual(sanitize.scanForPii(safe), []);
  // And the scanner is not vacuous.
  assert.ok(sanitize.scanForPii(RAW_ORDER).length >= 3, "the scanner cannot see the buyer it is meant to catch");
  // Two separate nets, tested separately. The value below is not an email, so
  // only the key-name net can catch it; the case after it is only catchable by
  // the value net. Testing one case that both nets catch proves neither.
  assert.ok(sanitize.scanForPii({ Contact: { AddressLine1: "10 Analytical Way" } }).length > 0,
    "a personal field under a name nobody listed is not caught");
  assert.ok(sanitize.scanForPii({ Recipient: { Name: "Ada Lovelace" } }).length > 0,
    "a name under an unlisted parent is not caught");
  assert.ok(sanitize.scanForPii({ note: "write to ada@example.com" }).length > 0,
    "an address in free text is not caught");
});

check("the envelope the engine receives has no customer at all", () => {
  // This is the end the policy actually cares about: what reaches the shared
  // engine, which writes the customer block onto the order document.
  const { safe } = sanitize.splitAmazonOrder(RAW_ORDER, RAW_ITEMS);
  const envelope = normalizeAmazonOrder(safe.order, {
    items: safe.items, connectionId: "c1", marketplaceId: "A1F83G8C2ARO7P", sellerId: "S1"
  });
  for (const field of ["name", "email", "phone", "billing_address", "shipping_address", "external_customer_id"]) {
    assert.strictEqual(envelope.customer[field], null, `envelope.customer.${field} is populated`);
  }
  assert.strictEqual(envelope.customer.identity_confidence, "none");
  assert.deepStrictEqual(sanitize.scanForPii(envelope), []);
  // The sale still arrived.
  assert.strictEqual(envelope.order.grand_total, "120.00");
  assert.strictEqual(envelope.order.currency, "GBP");
  assert.strictEqual(envelope.identity.external_id, "203-0000000-0000001");
});

check("phase A1 asks for no personal dataset, and says so in the request", () => {
  assert.ok(!sanitize.INCLUDED_DATA_A1.includes("BUYER"), "A1 requests the buyer dataset");
  assert.ok(!sanitize.INCLUDED_DATA_A1.includes("RECIPIENT"), "A1 requests the recipient dataset");
  // Withheld on purpose, with the reason recorded next to it, so a later phase
  // adds it deliberately rather than by noticing something is missing.
  assert.strictEqual(sanitize.WITHHELD_DATA.BUYER, "a1_no_pii_role");
  assert.strictEqual(sanitize.WITHHELD_DATA.RECIPIENT, "a1_no_pii_role");
});

check("TAX is withheld too, and the tax is then reported as unknown rather than zero", () => {
  // The dataset is about the sale, but it carries buyer tax registration
  // details in some marketplaces, so it waits for somebody to read a real
  // response. The consequence has to be handled honestly: an order with no tax
  // figure must not be recorded as an order with no tax.
  assert.ok(!sanitize.INCLUDED_DATA_A1.includes("TAX"), "A1 requests the tax dataset before it has been reviewed");
  assert.strictEqual(sanitize.WITHHELD_DATA.TAX, "pending_buyer_tax_pii_review");
  assert.strictEqual(sanitize.taxIsKnown(), false);
  assert.strictEqual(sanitize.taxIsKnown(["FULFILLMENT", "TAX"]), true);

  const { safe } = sanitize.splitAmazonOrder(RAW_ORDER, RAW_ITEMS);
  const envelope = normalizeAmazonOrder(safe.order, { items: safe.items, connectionId: "c1" });
  assert.strictEqual(envelope.order.tax_total, null, "a tax figure appeared from a dataset nobody requested");
  assert.strictEqual(envelope.order.tax_responsibility, "unknown");

  // And the projection onto the order document must not turn that into a fact.
  const { shopOwnedFields } = require("../../commerce/envelopeToOrder");
  const fields = shopOwnedFields(envelope, { companyId: "c1" });
  assert.strictEqual(fields.taxAmountKnown, false,
    "an order with no tax figure is recorded as an order whose tax is known to be zero");
});

check("a provider that does state its tax is still believed", () => {
  // The change above must not make every other channel's tax unknown.
  const { shopOwnedFields } = require("../../commerce/envelopeToOrder");
  const { buildEnvelope } = require("../../commerce/envelope");
  const withTax = buildEnvelope({
    identity: { provider: "shopify", connection_id: "c", external_id: "1" },
    order: { currency: "GBP", grand_total: "120.00", tax_total: "20.00" }
  });
  assert.strictEqual(shopOwnedFields(withTax, { companyId: "c1" }).taxAmountKnown, true);
  const zeroTax = buildEnvelope({
    identity: { provider: "shopify", connection_id: "c", external_id: "1" },
    order: { currency: "GBP", grand_total: "120.00", tax_total: "0.00" }
  });
  assert.strictEqual(shopOwnedFields(zeroTax, { companyId: "c1" }).taxAmountKnown, true,
    "a shop that really charged no tax is now treated as a shop that did not say");
});

check("in A1 the restricted half is a fault, not a filing cabinet", () => {
  // A1 holds no role that returns a buyer and has nowhere to put one. Anything
  // personal in a response is a signal that something is wrong — it is removed
  // either way, and it is reported so somebody sees it.
  const { restricted, removed } = sanitize.splitAmazonOrder(RAW_ORDER, RAW_ITEMS);
  assert.ok(Object.keys(restricted).length > 0, "the split cannot tell that a buyer was present");
  assert.ok(removed.includes("order.BuyerInfo") && removed.includes("order.ShippingAddress"));
  // Paths, never values: a report of what was removed must not contain it.
  assert.ok(removed.every((entry) => !/Ada|Analytical|amazon\.co\.uk/.test(entry)),
    "the list of removed fields contains the data it removed");
});

check("an authorised-but-empty buyer block is not reported as a leak", () => {
  // Amazon returns `BuyerInfo: {}` to say "you are not authorised for this".
  // Counting that as a personal field would make every order look like an
  // incident, and an alarm that always rings is one nobody reads.
  const { restricted, removed } = sanitize.splitAmazonOrder(
    { AmazonOrderId: "1", BuyerInfo: {}, ShippingAddress: null }, [{ OrderItemId: "i", BuyerInfo: {} }]
  );
  assert.deepStrictEqual(Object.keys(restricted), []);
  assert.deepStrictEqual(removed, []);
});

check("the split survives a response shaped like nothing", () => {
  for (const bad of [null, undefined, "", 0, [], "an order"]) {
    const out = sanitize.splitAmazonOrder(bad, bad);
    assert.ok(out && out.safe && typeof out.safe.order === "object", `${JSON.stringify(bad)} broke the split`);
    assert.deepStrictEqual(sanitize.scanForPii(out.safe), []);
  }
});

check("nothing reaches the engine except through the split", () => {
  // The rule only holds if the ingestion path obeys it. Any file that calls the
  // Amazon adapter must get its payload from the splitter first.
  const callers = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "test" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
      const body = fs.readFileSync(full, "utf8");
      if (/(?:require\s*\(|import\s*\(|from\s*)["'][^"']*adapters\/amazon(?:\.js)?["']/.test(body)) {
        callers.push({ rel: path.relative(root, full), body });
      }
    }
  };
  walk(root);
  for (const { rel, body } of callers) {
    assert.ok(/splitAmazonOrder\s*\(/.test(body),
      `${rel} calls the Amazon adapter with a payload that never went through splitAmazonOrder. ` +
      "The adapter reads BuyerInfo and ShippingAddress, and the shared engine writes them onto the order.");
  }
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ AMAZON SANITIZER GEÇTİ");
