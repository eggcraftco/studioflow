"use strict";

// Which workspaces are about to be lost, and which pieces of feedback are worth
// building. Two scores, in one file, because they are the same shape of
// judgement: a number is only useful here if it can say what it is made of.
//
// Both are deliberately rule-based. §60 is explicit that no machine learning is
// needed for the first version, and there is a better reason than effort: a
// score somebody cannot argue with is a score nobody acts on. Every point
// carries the reason it was added, so an at-risk workspace comes with the
// sentence a human would use, and a feedback cluster comes with the case for
// building it.
//
// Pure: no Firestore, no clock, no network. Spec: §49, §58-§60, §89.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Configuration, not constants — §65 says so of every threshold in this system. */
const DEFAULT_RISK_WEIGHTS = Object.freeze({
  notActivatedAfterDays: 2,
  notActivatedPoints: 30,
  stillNotActivatedAfterDays: 14,
  stillNotActivatedPoints: 20,
  quietDaysBeforeConcern: 14,
  quietPoints: 25,
  dormantPoints: 20,
  repeatedErrorThreshold: 3,
  repeatedErrorPoints: 15,
  openBlockerPoints: 20,
  cancellationSignalPoints: 30,
  usageDropPoints: 15
});

const RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);

function levelFor(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

/**
 * How likely this workspace is to be lost, and why.
 *
 * @param {object} input {
 *   nowMs, signedUpAtMs, activated, activatedAtMs, lastMeaningfulAtMs,
 *   failedIntegrationAttempts, openBlockerFeedback, visitedCancellation,
 *   meaningfulLast30, meaningfulPrevious30, weights
 * }
 */
function riskScore(input = {}) {
  const w = { ...DEFAULT_RISK_WEIGHTS, ...(input.weights || {}) };
  const nowMs = Number(input.nowMs);
  const reasons = [];
  let score = 0;

  const add = (points, reason) => { score += points; reasons.push(reason); };
  const daysSince = (ms) => {
    const at = Number(ms);
    if (!Number.isFinite(nowMs) || !Number.isFinite(at) || at <= 0) return null;
    return (nowMs - at) / DAY_MS;
  };

  const ageDays = daysSince(input.signedUpAtMs);

  if (!input.activated) {
    // The single largest signal in this product right now: signed up, did
    // something, never got value.
    if (ageDays !== null && ageDays >= w.stillNotActivatedAfterDays) {
      add(w.notActivatedPoints + w.stillNotActivatedPoints, "not_activated_after_two_weeks");
    } else if (ageDays !== null && ageDays >= w.notActivatedAfterDays) {
      add(w.notActivatedPoints, "not_activated_after_48h");
    }
  } else {
    const quietDays = daysSince(input.lastMeaningfulAtMs);
    if (quietDays !== null && quietDays >= w.quietDaysBeforeConcern) {
      add(w.quietPoints, "no_meaningful_activity_recently");
      if (quietDays >= w.quietDaysBeforeConcern * 2) add(w.dormantPoints, "dormant");
    }
    // A workspace whose rhythm has halved is in trouble before it goes quiet.
    const now30 = Number(input.meaningfulLast30);
    const before30 = Number(input.meaningfulPrevious30);
    if (Number.isFinite(now30) && Number.isFinite(before30) && before30 >= 4 && now30 * 2 <= before30) {
      add(w.usageDropPoints, "usage_halved");
    }
  }

  const failures = Number(input.failedIntegrationAttempts);
  if (Number.isFinite(failures) && failures >= w.repeatedErrorThreshold) {
    add(w.repeatedErrorPoints, "integration_failed_repeatedly");
  }

  // Somebody who told us what is wrong and has not been answered is a different
  // kind of risk from somebody who went quiet: they are still trying.
  if (input.openBlockerFeedback === true) add(w.openBlockerPoints, "blocked_feedback_open");

  if (input.visitedCancellation === true) add(w.cancellationSignalPoints, "cancellation_signal");

  const capped = Math.min(100, score);
  return { score: capped, level: levelFor(capped), reasons };
}

/** Configuration for the other score. */
const DEFAULT_FEEDBACK_WEIGHTS = Object.freeze({
  perWorkspace: 6,
  perWorkspaceCap: 40,
  blockedActivation: 30,
  churnRisk: 20,
  strategicFit: 15,
  recentDays: 14,
  recency: 10
});

/**
 * Whether a piece of feedback is worth building, and why.
 *
 * One person asking for dark mode and seven who cannot activate because Amazon
 * is missing are not the same thing, and a queue sorted by count says they are.
 * Counting is one term of five, and the two that matter most are whether the
 * ask is BLOCKING somebody and whether those people are about to leave.
 *
 * @param {object} cluster {
 *   workspaceCount, blocksActivation, atRiskWorkspaces, strategicFit,
 *   lastReportedAtMs
 * }
 */
function feedbackPriority(cluster = {}, options = {}) {
  const w = { ...DEFAULT_FEEDBACK_WEIGHTS, ...(options.weights || {}) };
  const nowMs = Number(options.nowMs);
  const reasons = [];
  let score = 0;
  const add = (points, reason) => { score += points; reasons.push(reason); };

  const count = Math.max(0, Number(cluster.workspaceCount) || 0);
  if (count > 0) {
    // Capped, so a hundred people asking for something cosmetic cannot outrank
    // seven who cannot use the product at all.
    add(Math.min(count * w.perWorkspace, w.perWorkspaceCap), `${count}_workspaces_asked`);
  }

  if (cluster.blocksActivation === true) add(w.blockedActivation, "blocks_activation");

  const atRisk = Math.max(0, Number(cluster.atRiskWorkspaces) || 0);
  if (atRisk > 0) add(w.churnRisk, `${atRisk}_at_risk_workspaces_affected`);

  if (cluster.strategicFit === true) add(w.strategicFit, "strategic_fit");

  const lastAt = Number(cluster.lastReportedAtMs);
  if (Number.isFinite(nowMs) && Number.isFinite(lastAt) && lastAt > 0 && (nowMs - lastAt) <= w.recentDays * DAY_MS) {
    add(w.recency, "reported_recently");
  }

  const capped = Math.min(100, score);
  return { score: capped, level: levelFor(capped), reasons };
}

module.exports = {
  DEFAULT_RISK_WEIGHTS, DEFAULT_FEEDBACK_WEIGHTS, RISK_LEVELS,
  riskScore, feedbackPriority, riskLevelFor: levelFor
};
