// Does creating an order tell the owner what just happened?
//
// Two moments, one message. The first order starts the fourteen days, and the
// owner has to hear it from us rather than notice their plan changed. When no
// trial starts — because this workspace already had one — the first success
// still gets said out loud, and gets NO sales message.
//
// Run: node test/qa/first-order-notice.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const web = fs.readFileSync(path.join(root, "studioflow-web", "lib", "studioflow", "orders.ts"), "utf8");

function pass(name) { console.log("PASS ", name); }

// 1. Both create paths report it, or the natives cannot say anything.
{
  assert(
    /firstOrder,\s*\n\s*trialStarted: trial\.started/.test(server),
    "createWebOrder returns firstOrder beside trialStarted"
  );
  assert(
    /firstOrder: swiftFirstOrder,/.test(server),
    "createSwiftOrder returns it too — Mac and iPhone use that path"
  );
  pass("both create paths report the first order");
}

// 2. The count has to survive a deleted order: someone who created one, deleted
// it and created another has already had this moment.
{
  const helper = server.slice(server.indexOf("async function workspaceHasOnlyThisOrder"));
  assert(/\.limit\(2\)/.test(helper), "two docs is enough to answer no");
  assert(
    !/isDeleted/.test(helper.slice(0, helper.indexOf("\n}"))),
    "deleted orders still count, so the line cannot fire twice"
  );
  pass("a deleted first order does not earn a second first-order line");
}

// 3. Never both messages at once.
{
  assert(
    /trialStarted\)\s*\{[\s\S]{0,200}?announceTrialStart[\s\S]{0,120}?\}\s*else if[\s\S]{0,200}?firstOrder\)/.test(web),
    "the plain line is an ELSE of the trial line, never a second toast"
  );
  pass("one message at that moment, never two");
}

// 4. And it stays a confirmation, not a pitch.
{
  // Anchor on the else-if, not on the first "firstOrder" in the file — that
  // one is the type declaration at the top.
  const start = web.indexOf("else if (response.data?.firstOrder)");
  assert(start > 0, "the plain-line branch is there to read");
  const toast = web.slice(start, start + 500);
  assert(/Your first order is organised/.test(toast), "it says the thing that happened");
  assert(
    !/(upgrade|plan|trial|pro\b)/i.test(toast.replace(/\/\/[^\n]*/g, "")),
    "and sells nothing"
  );
  pass("the first-order line is a confirmation, not a sales message");
}

console.log("\n✅ FIRST ORDER NOTICE GEÇTİ");
