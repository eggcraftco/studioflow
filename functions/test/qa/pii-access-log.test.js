// Who looked at whose personal data.
//
// NivaDesk recorded what CHANGED and nothing about what was READ. "Which
// operator opened which customer's record, and when" had no answer at all —
// and that is the control Amazon's developer review scores most directly.
//
// The trap in building it is that an access log is itself a data store. A row
// carrying the buyer's name and address is a second copy of the problem, in a
// collection nothing ever deletes and everyone treats as safe. Most of the
// checks below exist to hold that line.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const log = require("../../privacy/accessLog");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const buyer = {
  customerName: "Ada Lovelace", emailAddress: "ada@example.com",
  shippingPhone: "+44 7700 900000", shippingStreetAddress: "10 Analytical Way",
  shippingCity: "London", shippingPostalCode: "N1 1AA", paidAmount: 120,
  notes: "engrave AL"
};

// ---- the log must not become a copy of the data --------------------------------

check("an entry carries categories, never values", () => {
  const entry = log.accessEntry({
    atMs: NOW, companyId: "c1", actorUid: "u1", action: "view", source: "web",
    subject: { kind: "order", id: "o1" }, record: buyer
  });
  const serialised = JSON.stringify(entry);
  for (const secret of ["Ada Lovelace", "ada@example.com", "7700 900000", "Analytical Way", "N1 1AA", "engrave AL"]) {
    assert.ok(!serialised.includes(secret), `the log copied the data it is logging: ${secret}`);
  }
  assert.deepStrictEqual(entry.categories, ["address", "email", "financial", "name", "note", "phone"]);
});

check("the categories are derived from the record, not declared by the caller", () => {
  // A caller that had to remember "this one has a phone number" would forget,
  // and a new field carrying a person would go unnoticed.
  assert.deepStrictEqual(log.categoriesOf({ customerName: "Ada" }), ["name"]);
  assert.deepStrictEqual(log.categoriesOf({ emailAddress: "a@b.c" }), ["email"]);
  assert.deepStrictEqual(log.categoriesOf({ shippingPostalCode: "N1" }), ["address"]);
  assert.deepStrictEqual(log.categoriesOf({}), []);
  // Empty is not present.
  assert.deepStrictEqual(log.categoriesOf({ customerName: "", emailAddress: "   " }), []);
});

check("an access that touched no personal data is not a privacy event", () => {
  // Logging every read of an order with no buyer on it would bury the ones that
  // matter under the ones that do not.
  const empty = log.accessEntry({ atMs: NOW, companyId: "c1", action: "view", record: {} });
  assert.strictEqual(log.worthLogging(empty), false);
  const real = log.accessEntry({ atMs: NOW, companyId: "c1", action: "view", record: buyer });
  assert.strictEqual(log.worthLogging(real), true);
});

check("an entry with no workspace or no time is refused", () => {
  assert.strictEqual(log.worthLogging(log.accessEntry({ atMs: NOW, record: buyer })), false);
  assert.strictEqual(log.worthLogging(log.accessEntry({ companyId: "c1", record: buyer })), false);
});

// ---- what the entry has to say ---------------------------------------------------

check("every entry answers the six questions an audit trail exists for", () => {
  const entry = log.accessEntry({
    atMs: NOW, companyId: "c1", actorUid: "u1", actorEmail: "OP@Nivadesk.app", actorRole: "owner",
    action: "export", source: "web", recordCount: 412,
    subject: { kind: "order", id: "o1", provider: "Amazon", externalId: "206-1" }, record: buyer
  });
  assert.strictEqual(entry.atMs, NOW);                       // when
  assert.strictEqual(entry.actorUid, "u1");                  // who
  assert.strictEqual(entry.actorEmail, "op@nivadesk.app");   // who, readably
  assert.strictEqual(entry.companyId, "c1");                 // whose workspace
  assert.strictEqual(entry.subject.id, "o1");                // whose record
  assert.strictEqual(entry.action, "export");                // what they did
  assert.strictEqual(entry.source, "web");                   // through what
  assert.ok(entry.categories.length > 0);                    // what kind of data
  assert.strictEqual(entry.recordCount, 412, "one access to four hundred people is not one access to one");
  assert.strictEqual(entry.subject.provider, "amazon", "without this, 'every access to Amazon data' is unanswerable");
});

check("an unrecognised action or source is narrowed rather than stored as typed", () => {
  // Rows that disagree about their own format cannot be queried, and a query
  // nobody can run is not a control.
  const entry = log.accessEntry({ atMs: NOW, companyId: "c1", action: "rummaged", source: "carrier-pigeon", record: buyer });
  assert.strictEqual(entry.action, "view");
  assert.strictEqual(entry.source, "unknown");
  assert.ok(log.ACCESS_ACTIONS.includes(entry.action));
});

check("an unauthenticated visitor is recorded as one, not attributed to nobody", () => {
  // A portal link is a bearer token: there is no uid, and that is the point.
  const entry = log.accessEntry({
    atMs: NOW, companyId: "c1", actorRole: "portal_visitor", action: "view", source: "portal",
    subject: { kind: "order", id: "o1" }, record: buyer
  });
  assert.strictEqual(entry.actorUid, "");
  assert.strictEqual(entry.actorRole, "portal_visitor");
  assert.strictEqual(log.worthLogging(entry), true);
});

check("Amazon's restricted-data events are always kept, even carrying no categories", () => {
  // The RDT request itself is a fact Amazon asks for, separately from what was
  // then read with it.
  for (const action of ["rdt_requested", "restricted_resource_accessed"]) {
    const entry = log.accessEntry({ atMs: NOW, companyId: "c1", action, source: "server", record: {} });
    assert.strictEqual(entry.action, action);
    assert.strictEqual(log.worthLogging(entry), true, `${action} was dropped`);
  }
});

// ---- immutable, and wired in -------------------------------------------------------

check("no client may write the log, and the wildcard cannot re-open it", () => {
  const rules = fs.readFileSync(path.join(__dirname, "..", "..", "..", "firestore.rules"), "utf8");
  const at = rules.indexOf("match /companies/{companyId}/piiAccessLog/");
  assert.ok(at > 0, "there is no rule for the log at all");
  const block = rules.slice(at, rules.indexOf("}", rules.indexOf("allow write", at)));
  assert.ok(/allow write: if false;/.test(block), "a client can write to the audit trail");
  assert.ok(/allow read: if isCompanyOwner\(companyId\)/.test(block), "the log is readable by more than the owner");
  // The company wildcard is a deny-list: named in one place only, a later rule
  // re-opens it. It has to appear in both.
  assert.strictEqual(
    (rules.match(/collectionId != 'piiAccessLog'/g) || []).length, 2,
    "the log is missing from one of the two wildcard deny-lists, so members can read it"
  );
});

check("the server records the four paths where it hands out personal data", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  assert.ok(source.includes("async function recordPiiAccess("), "the writer is gone");
  const sites = [
    { what: "a data export", near: 'action: "export"' },
    { what: "a customer portal view", near: 'source: "portal"' },
    { what: "the assistant reading orders", near: 'action: "assistant"' },
    { what: "NivaDesk staff reading across tenants", near: 'action: "support"' }
  ];
  for (const { what, near } of sites) {
    assert.ok(source.includes(near), `${what} is not recorded`);
  }
  // Every call is fire-and-forget: an audit write must never be the reason a
  // customer's export fails or their portal link will not open.
  const calls = source.split("recordPiiAccess({").slice(1);
  assert.ok(calls.length >= 4, `only ${calls.length} call sites`);
  for (const call of calls) {
    assert.ok(call.slice(0, 1400).includes(".catch(() => undefined)"), "a call site can throw into the request path");
  }
});

check("the log says what it cannot see, rather than implying it sees everything", () => {
  // NivaDesk's own clients read orders straight from Firestore, so those reads
  // never reach a server that could record them. Claiming completeness would
  // turn the control into a liability.
  assert.ok(Array.isArray(log.CANNOT_OBSERVE) && log.CANNOT_OBSERVE.length > 0);
  assert.ok(log.CANNOT_OBSERVE.join(" ").includes("directly to Firestore"));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 240)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ PII ACCESS LOG GEÇTİ");
})();
