// Matching an Etsy buyer to a customer the studio already has.
//
// The test cases are the ones the brief names, because they are the ones that
// go wrong: a new buyer, an exact buyer-id match, two different people with the
// same name, an Etsy relay email, a buyer who has moved, and a field the studio
// corrected by hand.

const assert = require("assert");
const match = require("../../etsyCustomerMatch");

let failed = 0;
function check(fn, what) {
  try { fn(); console.log("  ok  " + what); } catch (error) {
    failed += 1;
    console.log("  FAIL " + what + "\n        " + (error?.message || error));
  }
}

console.log("Etsy buyer → NivaDesk customer");

// --- normalisation ----------------------------------------------------------
check(() => {
  assert.strictEqual(match.normalizeName("Ada Lovelace"), match.normalizeName("lovelace,  ADA"));
  assert.strictEqual(match.normalizeName("Ada Lovelace"), match.normalizeName("Ada   Lovelace"));
  assert.notStrictEqual(match.normalizeName("Ada Lovelace"), match.normalizeName("Ada Byron"));
}, "names compare regardless of order, case and punctuation");

check(() => {
  // Diacritics must fold, or the same Turkish or French buyer looks like two
  // people depending on how their keyboard was set up.
  assert.strictEqual(match.normalizeName("Boğaç Öz"), match.normalizeName("Bogac Oz"));
  assert.strictEqual(match.normalizeName("Chloé Dupont"), match.normalizeName("Chloe Dupont"));
  assert.strictEqual(match.normalizeName("José García"), match.normalizeName("Jose Garcia"));
}, "accented names fold to the same comparison key");

check(() => {
  assert.strictEqual(match.normalizePostcode("ec1a 1bb"), "EC1A1BB");
  assert.strictEqual(match.normalizeAddress({ streetAddress: "12 Analytical Way" }).houseNumber, "12");
  assert.strictEqual(match.normalizePhone("+44 7700 900123"), match.normalizePhone("07700900123"));
}, "postcodes, house numbers and phone numbers compare sensibly");

check(() => {
  assert.strictEqual(match.isEtsyRelayEmail("abc123@etsy.com"), true);
  assert.strictEqual(match.isEtsyRelayEmail("x@convos.etsy.com"), true);
  assert.strictEqual(match.isEtsyRelayEmail("ada@lovelace.co.uk"), false);
  assert.strictEqual(match.isEtsyRelayEmail("ada@notetsy.com"), false, "a lookalike domain is not a relay");
  assert.strictEqual(match.isEtsyRelayEmail(""), false);
}, "Etsy relay addresses are recognised, lookalikes are not");

// --- the six cases ----------------------------------------------------------
const source = {
  buyerUserId: "987654321",
  buyerEmail: "relay-abc@etsy.com",
  address: { name: "Ada Lovelace", street: "12 Analytical Way", city: "London", postalCode: "EC1A 1BB" }
};

check(() => {
  const result = match.proposeCustomerMatch({ source, candidates: [] });
  assert.strictEqual(result.decision, "create");
  assert.strictEqual(result.matchMethod, "new");
}, "a buyer nobody resembles becomes a new customer");

check(() => {
  const result = match.proposeCustomerMatch({
    source,
    candidates: [{ id: "cust1", name: "Someone Else", externalCustomerId: "987654321" }]
  });
  assert.strictEqual(result.decision, "link");
  assert.strictEqual(result.matchMethod, "etsy_buyer_id");
  assert.strictEqual(result.customerId, "cust1");
  assert.ok(result.signals.includes("etsy_buyer_id"));
}, "the Etsy buyer id links automatically, even when the name differs");

check(() => {
  // Two people called Ada Lovelace, different addresses. Guessing here posts a
  // parcel to the wrong house.
  const result = match.proposeCustomerMatch({
    source,
    candidates: [
      { id: "cust1", name: "Ada Lovelace", city: "London", postalCode: "N1 9GU" },
      { id: "cust2", name: "Ada Lovelace", city: "London", postalCode: "SW1A 1AA" }
    ]
  });
  assert.strictEqual(result.decision, "review", "a name alone must never link");
  assert.strictEqual(result.confidence, "ambiguous");
  assert.strictEqual(result.candidates.length, 2);
}, "the same name on two people is always a review, never a guess");

check(() => {
  const result = match.proposeCustomerMatch({
    source,
    candidates: [{ id: "cust9", name: "Someone Else", email: "relay-abc@etsy.com" }]
  });
  assert.strictEqual(result.decision, "create",
    "a shared relay address is not evidence these are the same person");
  const scored = match.scoreCandidate({ name: "Someone Else", email: "relay-abc@etsy.com" }, {
    buyerUserId: "", name: "", email: "relay-abc@etsy.com", phone: "", address: {}
  });
  assert.ok(scored.signals.includes("relay_email_ignored"));
  assert.strictEqual(scored.score, 0, "a relay match must add nothing to the score");
}, "an Etsy relay email never links two people");

check(() => {
  const realEmail = { ...source, buyerEmail: "ada@lovelace.co.uk" };
  const result = match.proposeCustomerMatch({
    source: realEmail,
    candidates: [{ id: "cust1", name: "Ada Lovelace", email: "ada@lovelace.co.uk", postalCode: "EC1A 1BB" }]
  });
  assert.strictEqual(result.decision, "review",
    "even a strong match asks, because only the buyer id is certain");
  assert.strictEqual(result.confidence, "strong");
  assert.ok(result.signals.includes("email") && result.signals.includes("name"));
}, "a real email plus name plus postcode is strong, and still asks");

check(() => {
  // The buyer moved. Name and buyer id still match; the address does not.
  const result = match.proposeCustomerMatch({
    source,
    candidates: [{ id: "cust1", name: "Ada Lovelace", externalCustomerId: "987654321", postalCode: "N1 9GU" }]
  });
  assert.strictEqual(result.decision, "link", "an address change must not break a known buyer");
  assert.strictEqual(result.customerId, "cust1");
}, "a buyer who has moved still links on their Etsy id");

check(() => {
  const result = match.proposeCustomerMatch({
    source,
    candidates: [{ id: "cust1", name: "Ada Lovelace" }],
    existingLink: { customerId: "cust7" }
  });
  assert.strictEqual(result.decision, "link");
  assert.strictEqual(result.customerId, "cust7");
  assert.strictEqual(result.matchMethod, "remembered_decision");
}, "a decision the seller already made is remembered, not asked again");

// --- merge policy -----------------------------------------------------------
check(() => {
  const existing = { email: "ada@lovelace.co.uk", shippingStreetAddress: "12 Analytical Way, Flat 3", city: "" };
  const incoming = {
    email: "relay-abc@etsy.com",
    shippingStreetAddress: "12 Analytical Way",
    city: "London",
    externalCustomerId: "987654321"
  };
  const patch = match.customerPatchForExisting(existing, incoming);
  assert.ok(!("email" in patch), "a corrected email must survive the next sync");
  assert.ok(!("shippingStreetAddress" in patch), "a corrected address must survive the next sync");
  assert.strictEqual(patch.city, "London", "a blank field may be filled");
  assert.strictEqual(patch.externalCustomerId, "987654321", "the id is stamped so the next order links itself");
}, "a sync fills blanks and never overwrites what the studio corrected");

check(() => {
  const patch = match.customerPatchForExisting(
    { externalCustomerId: "111" },
    { externalCustomerId: "222", city: "London" }
  );
  assert.ok(!("externalCustomerId" in patch), "an existing link is not repointed by a later receipt");
}, "an existing buyer id is never repointed");

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nPASS");
