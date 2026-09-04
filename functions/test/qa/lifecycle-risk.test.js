// Which workspaces are about to be lost, and which feedback is worth building.
//
// Both scores are rule-based on purpose. The specification says no machine
// learning is needed for a first version, and there is a better reason than
// effort: a score nobody can argue with is a score nobody acts on. So every
// point carries the reason it was added — an at-risk workspace arrives with the
// sentence a human would use, and a feedback cluster with the case for it.
const assert = require("assert");
const { riskScore, feedbackPriority, riskLevelFor, DEFAULT_RISK_WEIGHTS } = require("../../lifecycle/risk");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const daysAgo = (n) => NOW - n * DAY;

// ---- risk ---------------------------------------------------------------------

check("a workspace that signed up an hour ago is not at risk", () => {
  const r = riskScore({ nowMs: NOW, signedUpAtMs: NOW - 3600000, activated: false });
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.level, "low");
  assert.deepStrictEqual(r.reasons, [], "a brand new account was scored as failing");
});

check("signed up, never got value: the largest signal this product has", () => {
  const twoDays = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(3), activated: false });
  assert.ok(twoDays.score >= 25, `only ${twoDays.score}`);
  assert.ok(twoDays.reasons.includes("not_activated_after_48h"));

  const threeWeeks = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(21), activated: false });
  assert.ok(threeWeeks.score > twoDays.score, "three weeks without value is worse than three days, and scored the same");
  assert.ok(threeWeeks.reasons.includes("not_activated_after_two_weeks"));
  // And the two reasons are never both given, because they are the same fact.
  assert.strictEqual(threeWeeks.reasons.filter((r) => r.startsWith("not_activated")).length, 1);
});

check("an activated workspace that went quiet is at risk, and then worse", () => {
  const quiet = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(60), activated: true, activatedAtMs: daysAgo(50), lastMeaningfulAtMs: daysAgo(20) });
  assert.ok(quiet.reasons.includes("no_meaningful_activity_recently"));
  const gone = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(60), activated: true, activatedAtMs: daysAgo(50), lastMeaningfulAtMs: daysAgo(40) });
  assert.ok(gone.score > quiet.score);
  assert.ok(gone.reasons.includes("dormant"));
});

check("a rhythm that has halved is in trouble before it goes quiet", () => {
  const slowing = riskScore({
    nowMs: NOW, signedUpAtMs: daysAgo(120), activated: true,
    lastMeaningfulAtMs: daysAgo(2), meaningfulLast30: 3, meaningfulPrevious30: 20
  });
  assert.ok(slowing.reasons.includes("usage_halved"), "a workspace doing a sixth of what it did is not low risk");
  // Somebody who was never busy has not slowed down.
  const steady = riskScore({
    nowMs: NOW, signedUpAtMs: daysAgo(120), activated: true,
    lastMeaningfulAtMs: daysAgo(2), meaningfulLast30: 1, meaningfulPrevious30: 2
  });
  assert.ok(!steady.reasons.includes("usage_halved"));
});

check("somebody still trying and blocked is a different risk from somebody gone quiet", () => {
  const blocked = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(5), activated: false, openBlockerFeedback: true, failedIntegrationAttempts: 4 });
  assert.ok(blocked.reasons.includes("blocked_feedback_open"));
  assert.ok(blocked.reasons.includes("integration_failed_repeatedly"));
  assert.ok(blocked.score >= 50, `only ${blocked.score}`);
});

check("looking at the cancellation page is the loudest single signal", () => {
  const base = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(60), activated: true, lastMeaningfulAtMs: daysAgo(1) });
  const leaving = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(60), activated: true, lastMeaningfulAtMs: daysAgo(1), visitedCancellation: true });
  assert.strictEqual(base.score, 0);
  assert.ok(leaving.score >= 25);
  assert.ok(leaving.reasons.includes("cancellation_signal"));
});

check("the score is capped and its level follows it", () => {
  const worst = riskScore({
    nowMs: NOW, signedUpAtMs: daysAgo(60), activated: false,
    failedIntegrationAttempts: 9, openBlockerFeedback: true, visitedCancellation: true
  });
  assert.strictEqual(worst.score, 100, "a score above 100 is not a score");
  assert.strictEqual(worst.level, "critical");
  assert.strictEqual(riskLevelFor(0), "low");
  assert.strictEqual(riskLevelFor(30), "medium");
  assert.strictEqual(riskLevelFor(60), "high");
  assert.strictEqual(riskLevelFor(100), "critical");
});

check("every point that was added says why, and no point is added silently", () => {
  const r = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(21), activated: false, visitedCancellation: true });
  assert.ok(r.reasons.length >= 2);
  for (const reason of r.reasons) assert.ok(reason && typeof reason === "string");
  // And a score of zero carries no reasons at all, rather than a vague one.
  assert.deepStrictEqual(riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(60), activated: true, lastMeaningfulAtMs: daysAgo(1) }).reasons, []);
});

check("a missing clock or a missing date cannot invent a risk", () => {
  assert.strictEqual(riskScore({ activated: false, signedUpAtMs: daysAgo(60) }).score, 0, "no clock");
  assert.strictEqual(riskScore({ nowMs: NOW, activated: false }).score, 0, "no signup date");
  assert.strictEqual(riskScore({ nowMs: NOW, activated: false, signedUpAtMs: null }).score, 0);
  assert.strictEqual(riskScore({}).score, 0);
});

check("the thresholds are configuration", () => {
  const patient = riskScore({ nowMs: NOW, signedUpAtMs: daysAgo(3), activated: false, weights: { notActivatedAfterDays: 30 } });
  assert.strictEqual(patient.score, 0, "a workshop that sets up over a month was being called at risk on day three");
  assert.ok(DEFAULT_RISK_WEIGHTS.notActivatedAfterDays >= 1);
});

// ---- feedback priority -----------------------------------------------------------

check("one person asking for dark mode does not outrank seven who cannot activate", () => {
  const darkMode = feedbackPriority({ workspaceCount: 1, lastReportedAtMs: daysAgo(1) }, { nowMs: NOW });
  const blocked = feedbackPriority(
    { workspaceCount: 7, blocksActivation: true, atRiskWorkspaces: 4, lastReportedAtMs: daysAgo(1) },
    { nowMs: NOW }
  );
  assert.ok(blocked.score > darkMode.score * 2, `${blocked.score} vs ${darkMode.score}`);
  assert.ok(blocked.reasons.includes("blocks_activation"));
  assert.ok(blocked.reasons.includes("4_at_risk_workspaces_affected"));
});

check("a hundred people asking for something cosmetic cannot outrank a blocker", () => {
  // The count is capped for exactly this: a queue sorted by count is a queue
  // that never builds the thing stopping people from using the product.
  const popular = feedbackPriority({ workspaceCount: 100, lastReportedAtMs: daysAgo(1) }, { nowMs: NOW });
  const blocker = feedbackPriority({ workspaceCount: 3, blocksActivation: true, atRiskWorkspaces: 3, strategicFit: true, lastReportedAtMs: daysAgo(1) }, { nowMs: NOW });
  assert.ok(blocker.score > popular.score, `${blocker.score} vs ${popular.score}`);
});

check("something last mentioned a year ago is not urgent", () => {
  const recent = feedbackPriority({ workspaceCount: 3, lastReportedAtMs: daysAgo(2) }, { nowMs: NOW });
  const stale = feedbackPriority({ workspaceCount: 3, lastReportedAtMs: daysAgo(400) }, { nowMs: NOW });
  assert.ok(recent.score > stale.score);
  assert.ok(recent.reasons.includes("reported_recently"));
  assert.ok(!stale.reasons.includes("reported_recently"));
});

check("an empty cluster scores nothing and claims nothing", () => {
  const empty = feedbackPriority({}, { nowMs: NOW });
  assert.strictEqual(empty.score, 0);
  assert.strictEqual(empty.level, "low");
  assert.deepStrictEqual(empty.reasons, []);
  assert.strictEqual(feedbackPriority({ workspaceCount: -5 }, { nowMs: NOW }).score, 0);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ LIFECYCLE RISK GEÇTİ");
})();
