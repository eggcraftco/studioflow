// The one rule the whole Production board rests on: which column an order is
// in. It is DERIVED, not stored, so every platform must be able to reach the
// same answer from the same order document — and it must never contradict the
// steps shown inside the order.
//
// Run: node test/qa/production-stage.test.js
const assert = require("assert");
const {
  DEFAULT_PRODUCTION_STAGES,
  productionStagesFromSettings,
  resolveProductionStage
} = require("../../production");

const STAGES = DEFAULT_PRODUCTION_STAGES;
const STEPS = [
  { id: "intake", title: "Intake" },
  { id: "parts", title: "Parts reserved" },
  { id: "polish", title: "Case polishing" },
  { id: "qc", title: "Quality check" },
  { id: "ship", title: "Ready to ship" }
];

function pass(name) { console.log("PASS ", name); }
function stageOf(order, steps = STEPS, stages = STAGES) {
  return resolveProductionStage(order, stages, steps).stageId;
}

// Step answers live in three places for historical reasons: step 0 in
// designStatus, step 1 in status, the rest in extraStatuses.
function order(values, extra = {}) {
  const [design, status, ...rest] = values;
  const extraStatuses = {};
  rest.forEach((value, index) => {
    extraStatuses[`statusStep::${STEPS[index + 2].id}`] = value;
  });
  return { designStatus: design, status, extraStatuses, ...extra };
}

// 1. Nothing started is Ready; something started is In Production; everything
// done is Ready to Ship. The three answers a board must never get wrong.
{
  assert.strictEqual(stageOf(order(["Not Yet", "Not Yet", "Not Yet", "Not Yet", "Not Yet"])), "ready");
  assert.strictEqual(stageOf(order(["Done", "In Progress", "Not Yet", "Not Yet", "Not Yet"])), "in_production");
  assert.strictEqual(stageOf(order(["Done", "Done", "Done", "Done", "Done"])), "ready_to_ship");
  pass("untouched / underway / finished land in the right lanes");
}

// 2. An empty order (no answers at all) is Ready, not In Production — a job
// nobody has touched must not look like work in flight.
{
  assert.strictEqual(stageOf({}), "ready");
  assert.strictEqual(stageOf({ designStatus: "", status: "", extraStatuses: {} }), "ready");
  pass("a blank order reads as Ready");
}

// 3. Name binding: when the step being worked shares a name with a column,
// that column wins. This is what puts a watch in Quality Check by itself.
{
  const inQc = order(["Done", "Done", "Done", "In Progress", "Not Yet"]);
  assert.strictEqual(stageOf(inQc), "quality_check");
  pass("the current step's name picks its column");
}

// 4. A blocker outranks everything, including a manual override, and carries
// its reason through. A stuck job that looks busy is the failure to avoid.
{
  const stuck = order(["Done", "In Progress", "Not Yet", "Not Yet", "Not Yet"], {
    productionBlocker: { reason: "material_unavailable", note: "Movement part on order" },
    productionStageOverride: "quality_check"
  });
  const resolved = resolveProductionStage(stuck, STAGES, STEPS);
  assert.strictEqual(resolved.stageId, "blocked");
  assert.strictEqual(resolved.source, "blocker");
  assert.strictEqual(resolved.blocker.reason, "material_unavailable");
  pass("a blocker beats the steps and the override");
}

// 5. A blocker with no valid reason is not a blocker. The Blocked lane exists
// to say why; a reasonless card there would be indistinguishable from silence.
{
  const bogus = order(["Done", "In Progress", "Not Yet", "Not Yet", "Not Yet"], {
    productionBlocker: { reason: "because", note: "hmm" }
  });
  assert.strictEqual(stageOf(bogus), "in_production");
  pass("an unreasoned blocker is ignored");
}

// 6. A human override holds against the steps — that is the point of dragging
// a card — but a delivered order overrules it, since nothing already with the
// customer is still on the bench.
{
  const dragged = order(["Not Yet", "Not Yet", "Not Yet", "Not Yet", "Not Yet"], {
    productionStageOverride: "quality_check"
  });
  assert.strictEqual(stageOf(dragged), "quality_check");
  assert.strictEqual(resolveProductionStage(dragged, STAGES, STEPS).source, "manual");

  const delivered = { ...dragged, isDelivered: true };
  assert.strictEqual(stageOf(delivered), "done");
  pass("an override holds, delivery overrules it");
}

// 7. An override pointing at a column that no longer exists must not strand
// the card off-board; it falls back to what the steps say.
{
  const orphan = order(["Done", "In Progress", "Not Yet", "Not Yet", "Not Yet"], {
    productionStageOverride: "a_column_that_was_deleted"
  });
  assert.strictEqual(stageOf(orphan), "in_production");
  pass("a deleted column does not strand its cards");
}

// 8. Progress counting is what the card's "3 / 5 steps" line shows, so it has
// to agree with the lane.
{
  const resolved = resolveProductionStage(order(["Done", "Done", "In Progress", "Not Yet", "Not Yet"]), STAGES, STEPS);
  assert.strictEqual(resolved.doneCount, 2);
  assert.strictEqual(resolved.total, 5);
  assert.strictEqual(resolved.stageId, "in_production");
  pass("the step counter matches the lane");
}

// 9. Renamed columns: a jeweller's board. The kinds keep the machinery working
// while every visible word is the workshop's own.
{
  const jeweller = productionStagesFromSettings({
    productionStages: [
      { id: "queue", title: "Queue", kind: "ready" },
      { id: "casting", title: "Casting", kind: "active" },
      { id: "setting", title: "Setting", kind: "active" },
      { id: "hold", title: "On Hold", kind: "blocked" },
      { id: "qc", title: "Quality Check", kind: "review" },
      { id: "finished", title: "Finished", kind: "done" }
    ]
  });
  const steps = [{ id: "cast", title: "Casting" }, { id: "set", title: "Setting" }];
  assert.strictEqual(resolveProductionStage({ designStatus: "Not Yet", status: "Not Yet" }, jeweller, steps).stageId, "queue");
  // Step "Setting" is current → the same-named column, not the first active one.
  assert.strictEqual(resolveProductionStage({ designStatus: "Done", status: "In Progress" }, jeweller, steps).stageId, "setting");
  assert.strictEqual(
    resolveProductionStage({ productionBlocker: { reason: "supplier_delay" } }, jeweller, steps).stageId,
    "hold"
  );
  pass("a renamed board still routes correctly");
}

// 10. Repair of a malformed board. The board must always render, so a stage
// list missing its blocked/done lanes is completed rather than rejected.
{
  const repaired = productionStagesFromSettings({
    productionStages: [{ id: "wip", title: "WIP", kind: "active" }]
  });
  for (const kind of ["ready", "blocked", "done"]) {
    assert.strictEqual(repaired.filter((stage) => stage.kind === kind).length, 1, `exactly one ${kind}`);
  }
  assert.strictEqual(repaired[0].kind, "ready", "Ready leads the board");
  assert.strictEqual(repaired[repaired.length - 1].kind, "done", "Done closes it");

  // Junk in, defaults out — never an empty board.
  assert.deepStrictEqual(
    productionStagesFromSettings({ productionStages: [{ title: "" }, null, 7] }).map((s) => s.id),
    DEFAULT_PRODUCTION_STAGES.map((s) => s.id)
  );
  assert.deepStrictEqual(productionStagesFromSettings({}).map((s) => s.id), DEFAULT_PRODUCTION_STAGES.map((s) => s.id));
  pass("a broken board is repaired, never blank");
}

// 11. Duplicate ids would collapse two columns into one on the board.
{
  const stages = productionStagesFromSettings({
    productionStages: [
      { id: "x", title: "Cutting", kind: "ready" },
      { id: "x", title: "Sewing", kind: "active" },
      { id: "x", title: "Stuck", kind: "blocked" },
      { id: "x", title: "Packaged", kind: "done" }
    ]
  });
  assert.strictEqual(new Set(stages.map((s) => s.id)).size, stages.length, "ids stay unique");
  pass("duplicate column ids are separated");
}

// 12. Step answers may be keyed by title rather than id (older clients), and
// "Done" must be recognised whatever case it arrives in.
{
  const byTitle = {
    designStatus: "done",
    status: "DONE",
    extraStatuses: { "Case polishing": "Done", "Quality check": "Done", "Ready to ship": "done" }
  };
  assert.strictEqual(stageOf(byTitle), "ready_to_ship");
  pass("title-keyed and mixed-case answers still count");
}

console.log("\n✅ PRODUCTION STAGE GEÇTİ");
