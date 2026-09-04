// The three or four steps between signing up and NivaDesk being useful, for
// THIS workspace.
//
// A checklist that shows everybody the same steps shows most people something
// irrelevant. A jeweller who came to manage bespoke commissions has no sales
// channel to connect, and telling them to connect one is the product failing to
// listen to the answer it asked for two screens earlier.
const assert = require("assert");
const { setupChecklist } = require("../../lifecycle/checklist");
const { ACTIVATION_PATHS, ACTIVATION_REQUIREMENTS } = require("../../lifecycle/activation");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const T0 = Date.UTC(2026, 7, 1, 9, 0, 0);
const ev = (name) => ({ name, atMs: T0 });
const titles = (result) => result.steps.map((s) => s.title);

check("the specification's own two examples come out verbatim", () => {
  const commerce = setupChecklist({ profile: { onboardingMainGoal: "connect_store" }, events: [] });
  assert.deepStrictEqual(titles(commerce), [
    "Tell us what you'd like help with",
    "Connect your first sales channel",
    "Import your first order"
  ]);
  const finance = setupChecklist({ profile: { onboardingMainGoal: "finance" }, events: [] });
  assert.deepStrictEqual(titles(finance), [
    "Tell us what you'd like help with",
    "Connect your bank",
    "Match your first transaction"
  ]);
});

check("a bespoke studio is never told to connect a shop it does not have", () => {
  const bespoke = setupChecklist({ profile: { onboardingMainGoal: "repairs_service" }, events: [] });
  assert.ok(!titles(bespoke).some((title) => /sales channel|bank/i.test(title)), titles(bespoke).join(" | "));
  assert.deepStrictEqual(titles(bespoke), [
    "Tell us what you'd like help with",
    "Add your first customer",
    "Create your first project"
  ]);
});

check("the first line is the answer they already gave, already ticked", () => {
  // The list opens by acknowledging what somebody did, not by asking.
  const answered = setupChecklist({ profile: { onboardingMainGoal: "inventory" }, events: [] });
  assert.strictEqual(answered.steps[0].done, true);
  const silent = setupChecklist({ profile: {}, events: [] });
  assert.strictEqual(silent.steps[0].done, false, "nobody has answered, so nothing is ticked");
  assert.strictEqual(setupChecklist({ profile: {}, events: [ev("onboarding_started")] }).steps[0].done, true);
});

check("steps tick off as they are done, and the count follows", () => {
  const half = setupChecklist({
    profile: { onboardingMainGoal: "connect_store" },
    events: [ev("integration_connected")]
  });
  assert.deepStrictEqual(half.steps.map((s) => s.done), [true, true, false]);
  assert.strictEqual(half.doneCount, 2);
  assert.strictEqual(half.complete, false, "connecting a channel is not being served");
});

check("and when the workspace has been served, the list stops being a list", () => {
  // It does not sit on the dashboard for ever: a completed checklist that will
  // not go away stops reading as progress and starts reading as clutter.
  const done = setupChecklist({
    profile: { onboardingMainGoal: "connect_store" },
    events: [ev("integration_connected"), ev("external_order_imported")]
  });
  assert.strictEqual(done.complete, true);
  assert.strictEqual(done.headline, "You're set up");
  assert.strictEqual(setupChecklist({ profile: { onboardingMainGoal: "connect_store" }, events: [] }).headline, "Your NivaDesk setup");
});

check("every path produces a usable list, and every step has words somebody can act on", () => {
  for (const path of ACTIVATION_PATHS) {
    const result = setupChecklist({ path, events: [] });
    assert.strictEqual(result.path, path);
    assert.ok(result.steps.length >= 2, `${path} produced ${result.steps.length} steps`);
    for (const step of result.steps) {
      assert.ok(step.title && typeof step.title === "string", `${path} has a step with no title`);
      // An event name is not an instruction. "inventory_consumed_by_order"
      // must never reach a screen.
      assert.ok(!/_/.test(step.title), `${path} shows a raw event name: ${step.title}`);
    }
  }
});

check("the steps are the measurement, not a second list that can drift from it", () => {
  // Whatever a path is activated by, the checklist asks for exactly that — so a
  // change to the activation bar cannot leave the dashboard asking for the old
  // one. Any requirement without copy is deliberately left out, never renamed.
  for (const path of ACTIVATION_PATHS) {
    const requirement = ACTIVATION_REQUIREMENTS[path];
    const required = requirement.all || requirement.any || [];
    const keys = setupChecklist({ path, events: [] }).steps.map((s) => s.key);
    for (const name of required) {
      const described = keys.includes(name);
      assert.ok(
        described || !require("../../lifecycle/checklist").SETUP_STEP_COPY[name],
        `${path} requires ${name} and has copy for it, but the checklist does not ask for it`
      );
    }
  }
});

check("a workspace with no answers still gets something to do", () => {
  const general = setupChecklist({ profile: {}, events: [] });
  assert.strictEqual(general.path, "general");
  assert.ok(general.steps.length >= 2);
  assert.strictEqual(general.complete, false);
  // And any real work completes it, because they never chose a path.
  const worked = setupChecklist({ profile: {}, events: [ev("order_created")] });
  assert.strictEqual(worked.complete, true);
  assert.strictEqual(worked.headline, "You're set up");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SETUP CHECKLIST GEÇTİ");
})();
