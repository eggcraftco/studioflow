// SUBSTANTIVE_ORDER v2.1: a shell is not work, and the list that decides which
// names are placeholders cannot be allowed to drift behind the clients.
//
// Two halves. The first pins the predicate itself — each clause fires on the
// one field it names, the empty document every creation path produces fires
// none, and a deleted order is evidence of nothing. The second is the guard
// docs/onboarding/activation-definition-v2.md §A.10 asks for: every value in
// the `New Project` / `New Order` rows of the four translation tables must be
// in PLACEHOLDER_NAMES, and the Swift row must cover every shipped language —
// so adding a thirteenth language fails the build instead of quietly widening
// activation.
//
// Run: node test/qa/lifecycle-substantive-order.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const so = require("../../lifecycle/substantiveOrder");

let failures = 0;
function check(name, run) {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
}

const ROOT = path.join(__dirname, "..", "..", "..");

/* ------------------------------------------------------------------ *
 * 1. The empty document, as each creation path writes it (§A.7).
 * ------------------------------------------------------------------ */

// createWebOrder (web, Android, Swift Quick Create) with an empty request.
const WEB_SHELL = {
  id: "w1", companyId: "c1", customerName: "New Project", designName: "", status: "Not Yet", designStatus: "",
  emailAddress: "", whatsappNumber: "", instagramUsername: "", watchPurchasePrice: 0, paidAmount: 0, remainingAmount: 0,
  isDispatched: false, trackingNumber: "", isDelivered: false, deliveryTime: 45, taxRate: 20, notes: "", source: "web",
  historyLog: [{ title: "Created" }], finance: { engineVersion: 4 }, createdAt: "2026-09-01T10:00:00Z"
};
// createSwiftOrder: Siparis() init — zeros and a localised placeholder.
const SWIFT_SHELL = { id: "s1", companyId: "c1", customerName: "Yeni Proje", orderValue: 0, paidAmount: 0, remainingAmount: 0, watchPurchasePrice: 0, isDispatched: false, isDelivered: false, trackingNumber: "", deliveryTime: 30, createdAt: "2026-09-02T10:00:00Z" };
// nvOrderDefaults (MCP) with no arguments.
const MCP_SHELL = { id: "m1", companyId: "c1", customerName: "New Project", status: "Not Yet", emailAddress: "", whatsappNumber: "", instagramUsername: "", paidAmount: 0, remainingAmount: 0, watchPurchasePrice: 0, isDispatched: false, isDelivered: false, trackingNumber: "", createdFrom: "chatgpt", createdAt: "2026-09-03T10:00:00Z" };
// The explorer's shell: a status changed, history grown, a note typed. Still nothing that clause 1–6 reads.
const EXPLORED_SHELL = { ...WEB_SHELL, id: "x1", status: "In Progress", designStatus: "Done", historyLog: [{}, {}, {}], notes: "trying it out", customFields: { Source: "" }, clientFiles: [{ name: "a.pdf" }] };

check("the empty document from every creation path is a shell", () => {
  for (const shell of [WEB_SHELL, SWIFT_SHELL, MCP_SHELL, EXPLORED_SHELL]) {
    assert.deepStrictEqual(so.substantiveClauses(shell), {}, `${shell.id} should hold no clause`);
    assert.strictEqual(so.isSubstantiveOrder(shell), false, `${shell.id} should not be substantive`);
    assert.strictEqual(so.isShellOrder(shell), true, `${shell.id} should be a shell`);
  }
});

check("each clause fires on exactly the field it names, and only that clause", () => {
  const cases = [
    ["money", { paidAmount: 50 }],
    ["money", { orderValue: "120" }],
    ["money", { remainingAmount: 1 }],
    ["money", { watchPurchasePrice: 900 }],
    ["named_customer", { customerName: "Olivia Grant" }],
    ["line_items", { lineItems: [{ title: "Dial" }] }],
    ["fulfilment", { isDispatched: true }],
    ["fulfilment", { isDelivered: true }],
    ["fulfilment", { trackingNumber: "RM123456789GB" }],
    ["contact_channel", { emailAddress: "a@b.co" }],
    ["contact_channel", { whatsappNumber: "+447700900000" }],
    ["contact_channel", { instagramUsername: "@studio" }],
    ["payment_recorded", { payments: [{ amount: 10 }] }]
  ];
  for (const [clause, patch] of cases) {
    const order = { ...WEB_SHELL, ...patch };
    assert.deepStrictEqual(Object.keys(so.substantiveClauses(order)), [clause], `${JSON.stringify(patch)} should hold only ${clause}`);
    assert.strictEqual(so.isSubstantiveOrder(order), true);
  }
  assert.deepStrictEqual(so.CLAUSES, ["money", "named_customer", "line_items", "fulfilment", "contact_channel", "payment_recorded"]);
});

check("the rejected signals do not count: status, history, notes, files, custom fields, design name, delivery window, tax", () => {
  // §A.8: each of these re-admits a dead workspace; §2's guarded designName was
  // the one clause already caught counting a generated label as work.
  const decoys = { status: "Ready", designStatus: "Done", historyLog: [{}, {}, {}, {}], notes: "call back", communication: "emailed",
    customFields: { Source: "walk-in" }, clientFiles: [{}], designName: "Custom dial · Project #12", deliveryTime: 14, taxRate: 20,
    finance: { grandTotal: 0 }, designLink: "https://x", invoiceNumber: "" };
  assert.strictEqual(so.isSubstantiveOrder({ ...WEB_SHELL, ...decoys }), false);
});

check("negative and non-numeric money is not money", () => {
  assert.strictEqual(so.isSubstantiveOrder({ ...WEB_SHELL, paidAmount: -5 }), false);
  assert.strictEqual(so.isSubstantiveOrder({ ...WEB_SHELL, orderValue: "abc" }), false);
  assert.strictEqual(so.isSubstantiveOrder({ ...WEB_SHELL, remainingAmount: NaN }), false);
  assert.strictEqual(so.isSubstantiveOrder({ ...WEB_SHELL, orderValue: 0.01 }), true);
});

check("a deleted order is evidence of nothing, whatever it carries", () => {
  const rich = { ...WEB_SHELL, isDeleted: true, paidAmount: 500, customerName: "Olivia Grant", payments: [{}], isDelivered: true };
  assert.deepStrictEqual(so.substantiveClauses(rich), {});
  assert.strictEqual(so.isSubstantiveOrder(rich), false);
  // and not a shell either: it is out of the population altogether
  assert.strictEqual(so.isShellOrder(rich), false);
});

check("every placeholder name fails the customer clause, in any case or spacing; a typed name passes", () => {
  assert.strictEqual(so.PLACEHOLDER_NAMES.length, 26, "the set is the 26 entries of §A.3.2");
  for (const name of so.PLACEHOLDER_NAMES) {
    for (const variant of [name, name.toUpperCase(), `  ${name}  `, name.replace(" ", "   ")]) {
      assert.strictEqual(so.isPlaceholderName(variant), true, `"${variant}" should read as a placeholder`);
      assert.strictEqual(so.isSubstantiveOrder({ ...WEB_SHELL, customerName: variant }), false, `"${variant}" should not activate`);
    }
  }
  assert.strictEqual(so.isPlaceholderName(""), true);
  assert.strictEqual(so.isPlaceholderName("   "), true);
  assert.strictEqual(so.isPlaceholderName(null), true);
  for (const real of ["Olivia Grant", "New Projections Ltd", "Neue Bestellung GmbH", "Yeni Proje Mimarlık"]) {
    assert.strictEqual(so.isPlaceholderName(real), false, `"${real}" is a name somebody typed`);
  }
});

check("firstOrderProgress names the state the checklist has to render, and the shell to link to", () => {
  assert.deepStrictEqual(so.firstOrderProgress([]), { state: "none" });
  assert.deepStrictEqual(so.firstOrderProgress(null), { state: "none" });
  assert.deepStrictEqual(so.firstOrderProgress([{ ...WEB_SHELL, isDeleted: true }]), { state: "none" }, "a deleted shell is not a shell to complete");

  const older = { ...WEB_SHELL, id: "old", createdAt: "2026-09-01T10:00:00Z" };
  const newer = { ...MCP_SHELL, id: "new", createdAt: "2026-09-03T10:00:00Z" };
  assert.deepStrictEqual(so.firstOrderProgress([older, newer]), { state: "shell", shellId: "new", shellCount: 2 }, "links to the newest shell");
  assert.deepStrictEqual(so.firstOrderProgress([newer, older]), { state: "shell", shellId: "new", shellCount: 2 }, "…in either list order");
  const stamped = { ...WEB_SHELL, id: "ts", createdAt: { toMillis: () => Date.UTC(2026, 8, 5) } };
  assert.deepStrictEqual(so.firstOrderProgress([older, stamped]), { state: "shell", shellId: "ts", shellCount: 2 }, "Firestore timestamps are read too");

  const real = { ...SWIFT_SHELL, id: "real", customerName: "Olivia Grant" };
  assert.deepStrictEqual(so.firstOrderProgress([older, real, newer]), { state: "substantive", orderId: "real" });
  assert.strictEqual(so.firstSubstantiveOrder([older, newer]), null);
  assert.strictEqual(so.firstSubstantiveOrder([older, real]).id, "real");
});

/* ------------------------------------------------------------------ *
 * 2. The guard: the four translation tables versus PLACEHOLDER_NAMES (§A.10).
 * ------------------------------------------------------------------ */

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stringValues = (fragment) => [...fragment.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);

/** `"Key": ["Lang": "Value", …]` on one line (Swift). */
function swiftRow(source, key) {
  const line = source.split("\n").find((l) => l.trim().startsWith(`"${key}": [`));
  assert.ok(line, `DilMotoru.swift has no "${key}" row`);
  const inner = line.slice(line.indexOf("[") + 1, line.lastIndexOf("]"));
  const pairs = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
  return Object.fromEntries(pairs.map((m) => [m[1], m[2]]));
}

/** `"Key" to mapOf("Lang" to "Value", …)` on one line (Kotlin). */
function kotlinRow(source, key) {
  const line = source.split("\n").find((l) => l.trim().startsWith(`"${key}" to mapOf(`));
  if (!line) return null;
  const inner = line.slice(line.indexOf("mapOf(") + 6, line.lastIndexOf(")"));
  const pairs = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"\s+to\s+"((?:[^"\\]|\\.)*)"/g)];
  return Object.fromEntries(pairs.map((m) => [m[1], m[2]]));
}

/** `"Key": { Lang: "Value", "Lang": "Value", … }` block (the two web tables). */
function tsBlock(source, key) {
  const start = source.indexOf(`"${key}": {`);
  if (start < 0) return null;
  const end = source.indexOf("\n  }", start);
  const inner = source.slice(start + key.length + 5, end);
  const pairs = [...inner.matchAll(/^\s*(?:"([^"]+)"|([^\s:"]+))\s*:\s*"((?:[^"\\]|\\.)*)"/gm)];
  return Object.fromEntries(pairs.map((m) => [m[1] || m[2], m[3]]));
}

const TABLES = [
  { name: "EGGcraft/DilMotoru.swift", rows: (s) => ({ "New Project": swiftRow(s, "New Project"), "New Order": swiftRow(s, "New Order") }) },
  { name: "studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/language/StudioTranslations.kt", rows: (s) => ({ "New Project": kotlinRow(s, "New Project"), "New Order": kotlinRow(s, "New Order") }) },
  { name: "studioflow-web/lib/studioflow/language.ts", rows: (s) => ({ "New Project": tsBlock(s, "New Project"), "New Order": tsBlock(s, "New Order") }) },
  { name: "studioflow-web/lib/studioflow/macTranslations.ts", rows: (s) => ({ "New Project": tsBlock(s, "New Project"), "New Order": tsBlock(s, "New Order") }) }
];

check("every localised 'New Project' / 'New Order' the clients can write is in PLACEHOLDER_NAMES", () => {
  let valuesSeen = 0;
  for (const table of TABLES) {
    const rows = table.rows(read(table.name));
    assert.ok(rows["New Project"], `${table.name}: no New Project row was parsed`);
    for (const [key, row] of Object.entries(rows)) {
      if (!row) continue;
      const values = Object.values(row);
      assert.ok(values.length >= 10, `${table.name} ${key}: parsed only ${values.length} values — the parser has stopped reading the table`);
      for (const value of values) {
        valuesSeen += 1;
        assert.ok(so.isPlaceholderName(value),
          `${table.name} translates "${key}" as "${value}", which is not in PLACEHOLDER_NAMES. ` +
          "A client can write that name into customerName without anybody typing it; add it to lifecycle/substantiveOrder.js.");
      }
      // The English key itself is what the untranslated client writes.
      assert.ok(so.isPlaceholderName(key), `"${key}" itself must be a placeholder`);
    }
  }
  assert.ok(valuesSeen >= 44, `expected at least four tables' worth of values, saw ${valuesSeen}`);
});

check("the Swift 'New Project' row covers every shipped language, so adding a language fails here first", () => {
  const swift = read("EGGcraft/DilMotoru.swift");
  const line = swift.split("\n").find((l) => l.includes("let studioSupportedLanguages = ["));
  assert.ok(line, "studioSupportedLanguages is gone from DilMotoru.swift");
  const languages = stringValues(line.slice(line.indexOf("[")));
  assert.ok(languages.length >= 12, `expected the twelve shipped languages, parsed ${languages.length}`);
  for (const key of ["New Project", "New Order"]) {
    const row = swiftRow(swift, key);
    for (const language of languages) {
      assert.ok(row[language] !== undefined, `DilMotoru.swift "${key}" has no value for ${language}: a new language reached the app without its placeholder reaching the predicate`);
    }
  }
});

check("the guard is not vacuous: a placeholder missing from the set is reported by name", () => {
  // Simulate the drift §A.3.3 records — Android's Chinese spelling differs from
  // the other three tables — by checking the set holds both spellings, then
  // that removing one would be caught.
  assert.ok(so.PLACEHOLDER_NAMES.includes("新项目") && so.PLACEHOLDER_NAMES.includes("新建项目"), "both Chinese spellings must be present");
  const without = new Set(so.PLACEHOLDER_NAMES.filter((n) => n !== "新建项目"));
  const kotlin = kotlinRow(read(TABLES[1].name), "New Project");
  const uncovered = Object.values(kotlin).filter((v) => !without.has(so.normalizeName(v)));
  assert.deepStrictEqual(uncovered, ["新建项目"], "dropping Android's spelling from the set must surface exactly that value");
});

if (failures > 0) {
  console.error(`\n❌ SUBSTANTIVE ORDER: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\n✅ SUBSTANTIVE ORDER GEÇTİ");
