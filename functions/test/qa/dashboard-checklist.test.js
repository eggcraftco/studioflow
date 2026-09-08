// The dashboard's getting-started card, held to what changed about it.
//
// It used to show everybody the same five steps and count opening a page as
// progress — so it congratulated a jeweller for looking at the store-connection
// screen they had no use for, and told them to connect a store they do not
// have. Now the steps come from the goal they chose, and a tick means the thing
// was DONE.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const WEB = path.join(__dirname, "..", "..", "..", "studioflow-web");
const source = fs.readFileSync(path.join(WEB, "app", "dashboard", "page.tsx"), "utf8");
// The server call and the action->href map now live in one module that the dashboard,
// the Home page and HomeCardBodies all import, instead of being copied into each. These
// checks follow the code: grepping the page for a literal that moved is how a correct
// refactor gets reported as a regression.
const shared = fs.readFileSync(path.join(WEB, "lib", "studioflow", "setupChecklist.ts"), "utf8");
const start = source.indexOf("function GettingStartedCard");
const body = start > 0 ? source.slice(start, source.indexOf("\n}\n", start)) : "";

check("the card asks the server what this workspace should do", () => {
  assert.ok(start > 0, "GettingStartedCard is gone");
  assert.ok(shared.includes('"getSetupChecklist"'), "nothing calls getSetupChecklist any more");
  assert.ok(body.includes("loadSetupChecklist"), "the card still shows a hardcoded list to everybody");
  assert.ok(body.includes("server.steps"), "the server's steps are not used");
});

check("a tick means done, never clicked", () => {
  // The old rule: clicking through to a page marked the step complete. That is
  // the product congratulating somebody for looking at it.
  const expression = body.slice(body.indexOf("const steps = server"), body.indexOf("const doneCount"));
  // Only the SERVER branch — the fallback still remembers clicks, deliberately,
  // because it has nothing better to go on. An earlier version of this check
  // spanned both branches and failed on correct code.
  const serverBranch = expression.slice(0, expression.indexOf(": GETTING_STARTED_STEPS"));
  assert.ok(serverBranch.includes("done: step.done"), "the server's own doneness is not what ticks the box");
  assert.ok(!serverBranch.includes("clicked.includes"), "a clicked step counts as done on the personalised list");
  // And the write that remembers a click is skipped when the server answered.
  assert.ok(body.includes("if (!server && !clicked.includes(step.id))"), "a click is still recorded as progress on the real list");
});

check("the fixed five steps survive only as the fallback", () => {
  // A workspace whose checklist will not load still sees something useful
  // rather than an empty card or an error.
  assert.ok(source.includes("const GETTING_STARTED_STEPS"), "the fallback was deleted");
  assert.ok(body.includes(": GETTING_STARTED_STEPS.map("), "there is no fallback when the call fails");
  // The property, not the idiom: a failed load must not reach the user. It is now
  // caught twice — once inside loadSetupChecklist, which returns null, and again
  // around the call — so assert that a catch exists rather than that one spelling of
  // it does. The previous check pinned ".catch(() => undefined)" and went red on a
  // try/catch that is strictly safer.
  assert.ok(/catch\s*(\(|\{)/.test(body), "a failed call would surface as an error on the dashboard");
  assert.ok(shared.includes("catch"), "loadSetupChecklist does not swallow its own failure");
});

check("the card leaves when the workspace has been served", () => {
  // Not when five fixed boxes are ticked — when they actually got value.
  assert.ok(body.includes("server ? server.complete :"), "completion is still counted from a fixed list");
  assert.ok(body.includes("if (dismissed || finished) return null;"));
});

check("a step with nowhere to send anybody does not pretend to be a link", () => {
  assert.ok(body.includes("disabled={!step.href}"), "the first line looks like a button that does nothing");
  assert.ok(body.includes("if (!step.href) return;"));
});

check("every action the server can name has somewhere to go", () => {
  // A step whose action is unmapped renders as a dead row, which is worse than
  // one step fewer.
  const { SETUP_STEP_COPY, SETUP_PRELUDE } = require("../../lifecycle/checklist");
  const hrefs = shared.slice(shared.indexOf("SETUP_STEP_HREFS"), shared.indexOf("};", shared.indexOf("SETUP_STEP_HREFS")));
  assert.ok(hrefs.length > 0, "SETUP_STEP_HREFS was not found in the shared module");
  const actions = new Set();
  for (const copy of Object.values(SETUP_STEP_COPY)) if (copy.action) actions.add(copy.action);
  // The prelude's copy lives in the same module.
  const prelude = require("../../lifecycle/checklist");
  assert.ok(prelude.SETUP_PRELUDE, "the prelude is not exported");
  for (const action of actions) {
    assert.ok(hrefs.includes(`${action}:`), `the step action "${action}" has no destination on the dashboard`);
  }
  assert.ok(Object.keys(SETUP_PRELUDE).length > 0);
});

check("the styles it relies on exist", () => {
  const css = fs.readFileSync(path.join(WEB, "app", "globals.css"), "utf8");
  for (const rule of [".getting-started-card", ".getting-started-steps", ".getting-started-tick", ".getting-started-steps button:disabled"]) {
    assert.ok(css.includes(rule), `${rule} is not styled, so the card renders bare`);
  }
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ DASHBOARD CHECKLIST GEÇTİ");
})();
