// Every notification type the server writes must be recognisable on the Home
// activity card.
//
// The card mapped its icon and colour with a chain of substring guesses ending
// in a grey disc, and ten real types fell off the end: estimate_decision, both
// bank_ types, shared_note, support_ticket_reply, workspace_ticket_assigned,
// team, direct, delivery, deleted. In a real workspace that produced three
// blank grey circles — two estimate approvals and a bank connection — for
// things this product does every day.
//
// Nothing tied the client's table to the server's vocabulary, so nobody noticed
// when the server grew a type. This does: it reads the types out of the server
// source and asserts the web table has a look for each. A guess that silently
// degrades to grey is worse than a missing case a test can point at.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failed = 0;
const check = (name, fn) => { try { fn(); console.log("PASS ", name); } catch (e) { failed++; console.log("FAIL ", name, "-", e.message); } };

const SERVER = ["index.js", "bankFeed.js", "etsySync.js", "inventory.js", "production.js", "filesLibrary.js"]
  .map((f) => path.join(__dirname, "..", "..", f))
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");

const CARD = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "studioflow-web", "components", "home", "HomeCardBodies.tsx"),
  "utf8"
);

// The types the server stamps on a NOTIFICATION, and only those.
//
// Two narrower attempts failed in instructive ways. Scraping every `type:` in
// the server is too wide: it catches JSON schema fragments ("string",
// "object", "group"), MCP OAuth scope descriptors ("oauth2") and Etsy syncLog
// events like "reconcile_failed" that go to a connection's own log and never
// near the activity feed. Filtering those by payload shape — "has a title and
// a message nearby" — is too narrow AND still leaky: not every notification
// spells its body `message`, and a settings schema can have a title too.
//
// So it is tied to the machinery instead. A workspace notification is written
// through one of these, and a type that never appears near one of them is not
// a notification whatever else it may be.
// Two anchors, because there are two ways in. Some notifications are handed to
// a helper; others are written straight onto the collection — notifyEstimateDecision
// does that, which is why an estimate_decision was in a real workspace's feed
// and missing from the first version of this list.
const NOTIFY_CALLS = /\b(notificationCollectionRef|sendPushNotificationToCompany|notifyCompany|writeSupportTicketNotification|notifyWorkspaceTicketRecipients)\s*\(/g;
const types = (() => {
  const found = new Set();
  let call;
  while ((call = NOTIFY_CALLS.exec(SERVER)) !== null) {
    const window = SERVER.slice(call.index, call.index + 900);
    for (const m of window.matchAll(/\btype:\s*"([a-z][a-z0-9_]{2,})"/g)) found.add(m[1]);
  }
  return [...found].sort();
})();

check("the server's notification vocabulary was found", () => {
  // A floor, not a count: it catches the extractor silently breaking, which is
  // how this file spent three attempts reporting "1 type" and "9 types" and
  // passing everything else.
  assert(types.length >= 14, `only found ${types.length}: ${types.join(", ")}`);
});

// Lift the table out of the card so this tests the shipping rules, not a copy.
const start = CARD.indexOf("const ACTIVITY_LOOKS");
assert(start > 0, "ACTIVITY_LOOKS not found in HomeCardBodies.tsx");
const table = CARD.slice(start, CARD.indexOf("];", start));
const rules = [...table.matchAll(/match:\s*\/([^/]+)\/\s*,\s*tone:\s*"(\w+)"\s*,\s*glyph:\s*"(\w+)"/g)]
  .map((m) => ({ re: new RegExp(m[1]), tone: m[2], glyph: m[3] }));

check("the table was read from the card", () => {
  assert(rules.length >= 10, `only ${rules.length} rules parsed`);
});

const look = (type) => rules.find((r) => r.re.test(type)) || null;

check("every server notification type has a look of its own", () => {
  const orphans = types.filter((t) => !look(t));
  assert.deepStrictEqual(orphans, [], `no icon or colour for: ${orphans.join(", ")}`);
});

check("the types that were grey before are recognisable now", () => {
  // The exact ones from the screenshot and its neighbours.
  for (const [type, glyph] of [
    ["estimate_decision", "estimate"],
    ["bank_connection_attention", "bank"],
    ["bank_receipt_matched", "bank"],
    ["shared_note", "note"],
    ["support_ticket_reply", "message"],
    ["workspace_ticket_assigned", "message"],
    ["team", "team"]
  ]) {
    const hit = look(type);
    assert(hit, `${type} still has no look`);
    assert.strictEqual(hit.glyph, glyph, `${type} drew ${hit.glyph}, expected ${glyph}`);
    // Not "never grey" — a support reply genuinely is a low-key, neutral event
    // and slate suits it. What was wrong before was a grey disc with the
    // GENERIC clock in it, which said nothing at all. A grey disc with a speech
    // bubble says "somebody wrote to you".
    assert.notStrictEqual(hit.glyph, "update", `${type} still draws the generic glyph`);
  }
});

check("money is read as money, not as an order", () => {
  // woocommerce_payment contains neither "order" nor a leading "payment", and
  // an order-coloured disc on a payment row is the kind of wrong that looks
  // right.
  const hit = look("woocommerce_payment");
  assert(hit && hit.glyph === "payment", JSON.stringify(hit));
  assert.strictEqual(hit.tone, "green", JSON.stringify(hit));
});

check("a deletion request is not dressed as a new order", () => {
  const hit = look("order_deletion_request");
  assert(hit && hit.glyph !== "order", `deletion request drew ${hit && hit.glyph}`);
});

check("every glyph the table names actually exists", () => {
  const icons = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "studioflow-web", "components", "home", "HomeActionIcons.tsx"),
    "utf8"
  );
  const declared = new Set([...icons.matchAll(/case\s+"(\w+)":/g)].map((m) => m[1]));
  // "payment" is a sentinel rather than a drawing: the card renders the
  // workspace's own currency character there, so a euro shop is never shown a
  // pound sign. It is the one look with no SVG behind it, by design.
  declared.add("payment");
  const missing = [...new Set(rules.map((r) => r.glyph))].filter((g) => !declared.has(g));
  assert.deepStrictEqual(missing, [], `table names glyphs the icon set does not draw: ${missing.join(", ")}`);
});

console.log(`\n${types.length} server types checked`);
console.log(failed ? `${failed} FAILED` : "✅ HOME ACTIVITY LOOKS GEÇTİ");
process.exit(failed ? 1 : 0);
