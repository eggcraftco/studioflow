// Who may see a marketplace buyer's protected details, and what they see
// (design §3.3, access-control policy §5.3): the tier table, a payload that
// carries shipping identity only, and the rolling budget.
const assert = require("assert");
const reveal = require("../../privacy/reveal");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

const order = { assignedToUid: "u-assigned", assignedUids: ["u-assigned", "u-other"] };

check("the tier table", () => {
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: true }), { allowed: true, reason: "" }, "the owner");
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: {}, order, uid: "u1" }), { allowed: false, reason: "no_grant" }, "a member without the grant");
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: { restrictedCustomer: true }, order, uid: "u1" }), { allowed: true, reason: "" }, "a member with the grant");
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: { restrictedCustomer: true, workflowOnly: true }, order, uid: "u1" }), { allowed: false, reason: "workflow_only" }, "workflow-only even with the grant");
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: { restrictedCustomer: true, assignedProjectsOnly: true }, order, uid: "u-stranger" }), { allowed: false, reason: "not_assigned" }, "assigned-only, not assigned");
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: { restrictedCustomer: true, assignedProjectsOnly: true }, order, uid: "u-assigned" }), { allowed: true, reason: "" }, "assigned-only, assigned");
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: { restrictedCustomer: true, assignedProjectsOnly: true, manageProjectAssignments: true }, order, uid: "u-stranger" }), { allowed: true, reason: "" }, "may manage assignments → not restricted to own");
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: { restrictedCustomer: true }, order, uid: "u1", suspended: true }), { allowed: false, reason: "suspended" });
  assert.deepStrictEqual(reveal.revealAllowed({ isOwner: false, access: { restrictedCustomer: "yes" }, order, uid: "u1" }), { allowed: false, reason: "no_grant" }, "only an explicit true is a grant");
});

check("the payload is shipping identity only: never taxIdentifier, paths, notes or gift messages", () => {
  const doc = {
    provider: "ebay", orderId: "ebay_acme_12-09113-42375", externalId: "12-09113-42375", buyerUsername: "ada_l", updatedAtMs: Date.parse("2026-09-01T00:00:00Z"),
    paths: ["buyer.buyerRegistrationAddress"],
    fields: { fullName: "Ada Lovelace", companyName: "Lovelace Ltd", email: "Ada@Example.com", phone: "+44 7700 900000", address: { line1: "10 Analytical Way", line2: "Flat 3", city: "London", stateOrProvince: "Greater London", postalCode: "N1 1AA", countryCode: "GB" }, taxIdentifier: { taxpayerId: "GB999999973" }, buyerCheckoutNotes: "leave with neighbour", giftDetails: [{ message: "happy birthday" }], registration: { fullName: "Ada" } }
  };
  const payload = reveal.revealPayloadOf(doc, { now: Date.parse("2026-09-06T00:00:00Z") });
  assert.deepStrictEqual(payload, {
    provider: "ebay", orderId: "ebay_acme_12-09113-42375", buyerUsername: "ada_l",
    fields: { fullName: "Ada Lovelace", address: { line1: "10 Analytical Way", city: "London", postalCode: "N1 1AA", countryCode: "GB", line2: "Flat 3", stateOrProvince: "Greater London" }, companyName: "Lovelace Ltd", email: "ada@example.com", phone: "+44 7700 900000" },
    updatedAtMs: Date.parse("2026-09-01T00:00:00Z"), ageDays: 5
  });
  const text = JSON.stringify(payload);
  for (const forbidden of ["taxIdentifier", "GB999999973", "paths", "neighbour", "birthday", "registration"]) assert.ok(!text.includes(forbidden), forbidden);
  assert.deepStrictEqual(reveal.revealCategoriesOf(payload), ["name", "email", "phone", "address"]);
  assert.strictEqual(reveal.revealHasContent(doc), true);
  assert.strictEqual(reveal.revealHasContent({ fields: { taxIdentifier: { taxpayerId: "x" } } }), false, "a document with nothing to ship to is not revealed");
  assert.strictEqual(reveal.revealHasContent(null), false);
});

check("the budget: 60 an hour, 300 a day, windows that reset", () => {
  const T0 = Date.parse("2026-09-06T12:00:00Z");
  let counters = null;
  for (let i = 0; i < 60; i += 1) { const out = reveal.revealBudget(counters, T0 + i * 1000); assert.strictEqual(out.allowed, true, `reveal ${i + 1}`); counters = out.next; }
  const sixtyFirst = reveal.revealBudget(counters, T0 + 61 * 1000);
  assert.strictEqual(sixtyFirst.allowed, false); assert.strictEqual(sixtyFirst.reason, "hour");
  const nextHour = reveal.revealBudget(counters, T0 + 61 * 60 * 1000);
  assert.strictEqual(nextHour.allowed, true); assert.strictEqual(nextHour.hourCount, 1); assert.strictEqual(nextHour.dayCount, 61, "the day keeps counting");
  const heavy = { hourStartMs: T0, hourCount: 10, dayStartMs: T0 - 60 * 60 * 1000, dayCount: 300 };
  const day = reveal.revealBudget(heavy, T0 + 1000);
  assert.strictEqual(day.allowed, false); assert.strictEqual(day.reason, "day");
  const tomorrow = reveal.revealBudget(heavy, T0 + 25 * 60 * 60 * 1000);
  assert.strictEqual(tomorrow.allowed, true); assert.strictEqual(tomorrow.dayCount, 1);
  assert.deepStrictEqual(reveal.REVEAL_LIMITS, { perHour: 60, perDay: 300 });
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ PRIVACY REVEAL GEÇTİ");
