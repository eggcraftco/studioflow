"use strict";

// Whether a message may be sent, and why not.
//
// This file exists because the most damaging thing a lifecycle system does is
// not failing to send — it is sending the wrong thing. "Connect your first
// store" arriving the morning after somebody connected their store tells them,
// unmistakably, that the product is not paying attention. §24 makes cancelling
// that message mandatory, and it is mandatory for a reason: one message like
// that undoes every good one before it.
//
// So every decision here is a refusal with a name. A caller that wants to know
// whether to send asks, and gets back either a yes or the specific reason it is
// a no — which is also what an admin screen needs to explain itself, and what a
// test can hold.
//
// Pure: no Firestore, no clock, no network, no sending. Spec: §21-§24, §62,
// §69, §70.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The caps, as configuration rather than as constants in a sender (§69).
 * Transactional and support messages are outside all of this: a password reset
 * or a reply to a support ticket is not marketing and is never suppressed.
 */
const DEFAULT_CAPS = Object.freeze({
  onboardingInAppMaxPerDay: 2,
  onboardingEmailMaxPer48h: 1,
  feedbackPromptMaxPer7d: 1,
  founderMessageMaxInitial: 1,
  // A prompt somebody closed does not come back the same day.
  dismissalCooldownDays: 30
});

const TRANSACTIONAL_KINDS = Object.freeze(["transactional", "support", "security", "billing"]);

/**
 * What each campaign is trying to get somebody to do.
 *
 * The heart of §24: a message is not just text on a schedule, it is a request
 * for an action, and once the action has happened the request is noise. This
 * table is what lets the system know that, and a campaign with no entry is
 * never cancelled by behaviour — so adding one here is how a new message gets
 * that protection, and forgetting is visible rather than silent.
 */
const CAMPAIGN_GOALS = Object.freeze({
  connect_first_store: ["integration_connected"],
  connect_bank: ["bank_connected"],
  connect_accounting: ["accounting_connected"],
  add_first_customer: ["customer_created"],
  create_first_order: ["order_created", "external_order_imported"],
  add_first_inventory_item: ["inventory_item_created"],
  try_the_assistant: ["grounded_ai_answer"],
  finish_onboarding: ["onboarding_completed"],
  first_bank_match: ["bank_match_completed"],
  // The v2.1 handoff: a shell order becoming real is the same goal as a first order.
  complete_first_order: ["order_created", "external_order_imported"]
});

function isTransactional(kind) {
  return TRANSACTIONAL_KINDS.includes(String(kind || "").trim().toLowerCase());
}

/**
 * Has the workspace already done what this message was going to ask for?
 *
 * Unknown campaigns answer false — a message nobody has described cannot be
 * cancelled by behaviour, and guessing from its name would cancel the wrong
 * ones.
 */
function goalAlreadyMet(campaign, doneEventNames) {
  const key = String(campaign || "").trim();
  if (!Object.prototype.hasOwnProperty.call(CAMPAIGN_GOALS, key)) return false;
  const done = doneEventNames instanceof Set ? doneEventNames : new Set(Array.isArray(doneEventNames) ? doneEventNames : []);
  return CAMPAIGN_GOALS[key].some((name) => done.has(name));
}

function sentWithin(history, windowMs, nowMs, predicate) {
  const since = nowMs - windowMs;
  return (Array.isArray(history) ? history : []).filter((entry) => {
    const atMs = Number(entry && entry.atMs);
    if (!Number.isFinite(atMs) || atMs <= 0 || atMs < since || atMs > nowMs) return false;
    return predicate ? predicate(entry) : true;
  }).length;
}

/**
 * May this message be sent right now?
 *
 * @param {object} request  { campaign, channel: "in_app"|"email", kind, nowMs }
 * @param {object} context  { doneEventNames, history, dismissals, caps, unsubscribed }
 * @returns {{send: boolean, reason: string}} reason is "" when it may be sent
 */
function messageDecision(request = {}, context = {}) {
  const caps = { ...DEFAULT_CAPS, ...(context.caps || {}) };
  const nowMs = Number(request.nowMs);
  const channel = String(request.channel || "in_app").trim().toLowerCase();
  const campaign = String(request.campaign || "").trim();
  const history = Array.isArray(context.history) ? context.history : [];

  if (!campaign) return { send: false, reason: "no_campaign" };
  if (!Number.isFinite(nowMs) || nowMs <= 0) return { send: false, reason: "no_clock" };

  // Transactional first, and before every other rule: a password reset must not
  // be held back because somebody has already had two onboarding tips today.
  if (isTransactional(request.kind)) return { send: true, reason: "" };

  if (context.unsubscribed === true || context.optOut === true) return { send: false, reason: "unsubscribed" };

  // A person who wrote back is talking to a person now; every automated
  // sequence stops (status document §9.6: `user_replied` suppresses recovery).
  if (context.userReplied === true) return { send: false, reason: "user_replied" };
  // Nothing product-shaped to a workspace that cancelled, or one that has a
  // support case open — the conversation is happening somewhere else (§9.4).
  if (context.workspaceCancelled === true) return { send: false, reason: "workspace_cancelled" };
  if (context.supportCaseOpen === true) return { send: false, reason: "support_case_open" };
  // A setup nudge to a workspace that is already activated is noise (§9.4).
  if (context.activated === true && String(request.kind || "").trim().toLowerCase() === "onboarding") {
    return { send: false, reason: "activated" };
  }

  // §24, and the whole point of the file.
  if (goalAlreadyMet(campaign, context.doneEventNames)) {
    return { send: false, reason: "goal_already_met" };
  }

  // A prompt somebody closed stays closed for the cooldown (§70).
  const dismissal = (Array.isArray(context.dismissals) ? context.dismissals : [])
    .filter((entry) => String(entry && entry.campaign || "") === campaign)
    .map((entry) => Number(entry.atMs))
    .filter((atMs) => Number.isFinite(atMs) && atMs > 0)
    .sort((a, b) => b - a)[0];
  if (dismissal !== undefined && nowMs - dismissal < caps.dismissalCooldownDays * DAY_MS) {
    return { send: false, reason: "dismissed_recently" };
  }

  // The same message is not sent twice for the same goal.
  if (history.some((entry) => String(entry && entry.campaign || "") === campaign && String(entry.channel || "") === channel)) {
    return { send: false, reason: "already_sent" };
  }

  if (campaign === "founder_intro") {
    if (sentWithin(history, Number.MAX_SAFE_INTEGER, nowMs, (e) => e.campaign === "founder_intro") >= caps.founderMessageMaxInitial) {
      return { send: false, reason: "founder_cap" };
    }
  }

  if (String(request.kind || "").trim().toLowerCase() === "feedback_prompt") {
    if (sentWithin(history, 7 * DAY_MS, nowMs, (e) => String(e.kind || "").toLowerCase() === "feedback_prompt") >= caps.feedbackPromptMaxPer7d) {
      return { send: false, reason: "feedback_prompt_cap" };
    }
  }

  if (channel === "in_app") {
    if (sentWithin(history, DAY_MS, nowMs, (e) => String(e.channel || "") === "in_app") >= caps.onboardingInAppMaxPerDay) {
      return { send: false, reason: "in_app_daily_cap" };
    }
  } else if (channel === "email") {
    if (sentWithin(history, 48 * HOUR_MS, nowMs, (e) => String(e.channel || "") === "email") >= caps.onboardingEmailMaxPer48h) {
      return { send: false, reason: "email_48h_cap" };
    }
  }

  return { send: true, reason: "" };
}

module.exports = {
  DEFAULT_MESSAGE_CAPS: DEFAULT_CAPS, CAMPAIGN_GOALS, TRANSACTIONAL_KINDS,
  isTransactional, goalAlreadyMet, messageDecision
};
