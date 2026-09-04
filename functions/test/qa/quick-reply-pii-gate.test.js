// Who tells the AI the customer's name.
//
// Quick Reply used to take the name from the client: the workshop typed it, the
// browser sent it, the server pasted it into a prompt bound for OpenAI. That is
// fine for a workshop's own customer and wrong for a marketplace's buyer — and
// the server had no way to tell the two apart, because a name arriving as a
// string carries no provider with it.
//
// So the contract changed. The client sends an order id; the server reads the
// order, asks the outbound policy, and uses only what the policy releases.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const outbound = require("../../privacy/outbound");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const root = path.join(__dirname, "..", "..");
const indexSource = fs.readFileSync(path.join(root, "index.js"), "utf8");
const webRoot = path.join(root, "..", "studioflow-web");
const pageSource = fs.readFileSync(path.join(webRoot, "app", "quick-reply", "page.tsx"), "utf8");
const contractSource = fs.readFileSync(path.join(webRoot, "lib", "studioflow", "quickReply.ts"), "utf8");

// The gate, as a region of index.js — every assertion below reads this slice
// rather than the whole file, so an unrelated `orderId` elsewhere cannot make a
// missing gate look present.
const gateStart = indexSource.indexOf("const quickReplyOrderId");
const gateEnd = indexSource.indexOf("const response = await fetch(\"https://api.openai.com/v1/chat/completions\"", gateStart);
const gate = gateStart >= 0 && gateEnd > gateStart ? indexSource.slice(gateStart, gateEnd) : "";

check("the server reads the order rather than believing the caller", () => {
  assert.ok(gate, "generateQuickReply has no order-id gate at all");
  assert.ok(/orderDocRef\(quickReplyOrderId\)\.get\(\)/.test(gate),
    "the order id is accepted but never used to read the order");
  assert.ok(/redactForChannel\(orderData, "ai_reply"\)/.test(gate),
    "the order is read but the outbound policy is never asked");
});

check("a name from the caller is refused once an order is named", () => {
  // Both at once would be the smuggling route: send a marketplace order id for
  // the context, and a name of your own choosing for the prompt.
  assert.ok(/}\s*else if \(request\.data\?\.customerName\)/.test(gate),
    "the client name is read outside the else branch, so it can be sent alongside an order id");
});

check("an order from another workspace is not a source of names", () => {
  assert.ok(/\n\s*if \(orderCompanyId\(orderData\) !== companyId\) \{/.test(gate) && /permission-denied/.test(gate),
    "any signed-in user could name any order id and read a name back");
});

check("a denied provider stops the request before OpenAI is called", () => {
  // Refusing is the only honest answer here. The message the workshop pastes in
  // is itself the marketplace's data, so there is no redaction that helps: the
  // text is the payload.
  // Anchored at the start of the statement: a condition somebody has quietly
  // disarmed — `if (false && quickReplyProvider && ...)` — still contains the
  // words, and a test that only looks for the words would call that a pass.
  assert.ok(/\n\s*if \(quickReplyProvider && !quickReplyAiAllowed\) \{/.test(gate),
    "a denied order still reaches the OpenAI request");
  assert.ok(/failed-precondition/.test(gate), "the refusal is not a stated refusal");
  // `gate` ends at the fetch call itself, so finding the check inside it is
  // what proves the check runs first.
});

check("a minimal release is not treated as permission for an AI prompt", () => {
  // eBay releases a name for a parcel notice. That is not the same as releasing
  // it to a model that keeps nothing but sees everything.
  assert.ok(/verdict\.allow && !verdict\.minimal/.test(gate),
    "a minimal release would be handed to OpenAI as if it were an allowance");
  assert.strictEqual(outbound.mayReleasePii({ commerce: { provider: "ebay" } }, "ai_reply").allow, false);
  assert.strictEqual(outbound.mayReleasePii({ commerce: { provider: "amazon" } }, "ai_reply").allow, false);
});

check("a block is written down", () => {
  assert.ok(/recordPiiAccess\(/.test(gate) && /ai_reply blocked:/.test(gate),
    "a refusal leaves no trace, so nobody can show it happened");
});

check("the web client sends the order, not the person", () => {
  assert.ok(/orderId\?: string/.test(contractSource), "the contract has no order id");
  assert.ok(/orderId: selectedOrderId/.test(pageSource), "the page never sends an order id");
  assert.ok(/loadWorkspaceOrderOptions\(/.test(pageSource), "the page has no orders to pick from");
  // With an order chosen the typed name is not sent at all — otherwise the old
  // route survives beside the new one.
  assert.ok(/customerName: selectedOrderId \? "" : customerName/.test(pageSource)
    || /selectedOrderId \? null : \(/.test(pageSource),
    "the name box is still live while an order is selected");
});

check("a workshop with no marketplace notices nothing", () => {
  // The whole layer must be invisible to the workspace that never connected
  // anything, or it is a regression dressed as a safeguard.
  const own = outbound.mayReleasePii({ customerName: "Ada" }, "ai_reply");
  assert.strictEqual(own.allow, true);
  assert.strictEqual(own.reason, "workspace_own_record");
  assert.strictEqual(outbound.redactForChannel({ customerName: "Ada" }, "ai_reply").record.customerName, "Ada");
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ QUICK REPLY PII GATE GEÇTİ");
