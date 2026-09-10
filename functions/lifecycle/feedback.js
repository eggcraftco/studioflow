"use strict";

// Feedback v1 — what the product asks a person, when it may ask, and what an
// answer has to look like before it is written down. Pure: no Firestore, no
// clock, no network (the callables in ../feedback.js hand the clock in).
//
// Spec: NivaDesk_Native_Onboarding_Feedback_Retention_AI_Spec.md §3.3, §32,
// §34, §35, §40–§44. The one prompt this release ships is §34's "first success"
// question, asked after the workspace's first SUBSTANTIVE order (the same
// predicate the checklist uses — an empty order opened by mistake is not a
// success, and a brand-new workspace has had none). Everything else the spec
// lists (§36 missing-expectation, §37 non-activation) waits for activation
// data that can be trusted; those triggers are recorded as not built, not
// approximated.
//
// The caps come from messaging.js so this prompt obeys the same rules as
// every other in-app message: one feedback prompt per seven days (counted from
// showings the client confirmed on screen, never from the question alone), a
// closed prompt stays closed for the dismissal cooldown, and an answered
// campaign is never asked again. The manual "Send feedback" entry is not a prompt and is
// not subject to any of that — only to the abuse limits below.

const crypto = require("crypto");
const messaging = require("./messaging");
const substantiveOrder = require("./substantiveOrder");

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const CAMPAIGN_FIRST_SUCCESS = "first_success_feedback";
const CAMPAIGNS = Object.freeze([CAMPAIGN_FIRST_SUCCESS]);
const TRIGGERS = Object.freeze(["first_success", "manual"]);
/** What the form lets a person say the note is about. */
const KINDS = Object.freeze(["problem", "missing_feature", "suggestion"]);
/** §34's effort rating, used as the one required answer. */
const EXPERIENCES = Object.freeze(["easy", "okay", "difficult"]);
/** §41. */
const FEEDBACK_TYPES = Object.freeze([
  "onboarding_effort", "activation_blocker", "missing_expectation", "feature_request", "bug_report",
  "confusion", "general_feedback", "cancellation_reason", "interview_note"
]);
/** §42. */
const CATEGORIES = Object.freeze([
  "integration", "orders", "projects", "customers", "inventory", "banking", "receipts", "invoicing", "payments",
  "accounting", "shipping", "ai_chatgpt", "mobile", "performance", "ux", "terminology", "pricing", "other"
]);
/** §43. */
const IMPACTS = Object.freeze(["minor", "annoyance", "slows_work", "blocked", "churn_risk"]);
/** §44. */
const STATUSES = Object.freeze(["new", "reviewing", "planned", "in_progress", "shipped", "closed", "not_planned"]);

const LIMITS = Object.freeze({
  textMax: 2000,
  pageMax: 200,
  clientKeyMax: 80,
  adminNoteMax: 2000,
  languageMax: 40,
  // Abuse limits per person per workspace. Five in an hour is a person who is
  // upset; the sixth is a script.
  perHour: 5,
  perDay: 20,
  // The same note twice inside ten minutes is a double click, not two notes.
  duplicateWindowMs: 10 * 60 * 1000,
  // A client key is the form's own idempotency handle: a retry after a lost
  // response finds the note it already wrote.
  clientKeyWindowMs: DAY_MS,
  // A prompt that was shown and neither answered nor closed may be shown again
  // after this long — messaging.js's feedbackPromptMaxPer7d, read as a window.
  showWindowMs: 7 * DAY_MS,
  historyKeep: 50
});

const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value : []);
const millis = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };

function isKnownCampaign(campaign) { return CAMPAIGNS.includes(text(campaign)); }

/** §41's type from what the person chose; the first-success prompt with no kind is §34's effort rating. */
function feedbackTypeFor(trigger, kind) {
  const k = text(kind);
  if (k === "problem") return "bug_report";
  if (k === "missing_feature") return "feature_request";
  if (k === "suggestion") return "general_feedback";
  return text(trigger) === "first_success" ? "onboarding_effort" : "general_feedback";
}

function stageFor(trigger) { return text(trigger) === "first_success" ? "onboarding" : "active"; }

/**
 * Which workspaces the feature is open to. The raw value is the env line
 * NIVADESK_FEEDBACK_WORKSPACES: empty means nobody (the pilot is opt-in, not
 * opt-out), "*" means every workspace, otherwise a comma-separated list of
 * workspace ids matched exactly. The flag NIVADESK_FEEDBACK is a separate,
 * global switch; both have to say yes.
 */
function pilotAllows(rawList, companyId) {
  const raw = text(rawList);
  if (!raw) return false;
  const id = text(companyId);
  if (!id) return false;
  const entries = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.includes("*")) return true;
  return entries.includes(id);
}

/** A creation stamp an order carries, in ms — or 0 when it has none that can be trusted. `paymentDate` is never used: it is the order's own date and can be typed. */
function creationStampOf(order) {
  const o = order && typeof order === "object" ? order : {};
  for (const candidate of [o.createdAtMs, o.createdAt]) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) return candidate;
    if (candidate && typeof candidate.toMillis === "function") { const ms = Number(candidate.toMillis()); if (Number.isFinite(ms) && ms > 0) return ms; }
    if (candidate && typeof candidate === "object" && Number.isFinite(Number(candidate.seconds)) && Number(candidate.seconds) > 0) return Number(candidate.seconds) * 1000;
    if (candidate instanceof Date && Number.isFinite(candidate.getTime())) return candidate.getTime();
    if (typeof candidate === "string" && candidate) { const ms = Date.parse(candidate); if (Number.isFinite(ms) && ms > 0) return ms; }
  }
  return 0;
}

/**
 * When the workspace's first success happened, as far as the orders can say.
 *
 * Uses the same SUBSTANTIVE_ORDER predicate as the checklist and the funnel
 * (lifecycle/substantiveOrder.js — not a copy). The time is the earliest
 * creation stamp among the substantive orders; if ANY substantive order has no
 * creation stamp the answer is "unknown", because the unstamped one may be the
 * earliest and a guess would put an invitation in front of somebody whose
 * success predates the launch. Unknown means no invitation — never a guess
 * from the signup date.
 *
 *   { state: "none" | "shell" | "substantive", known: boolean, atMs: number, orderId }
 */
function firstSuccess(orders) {
  const progress = substantiveOrder.firstOrderProgress(orders);
  if (progress.state !== "substantive") return { state: progress.state, known: false, atMs: 0, orderId: "" };
  let earliest = null;
  for (const order of list(orders)) {
    if (!order || typeof order !== "object" || order.isDeleted === true || !substantiveOrder.isSubstantiveOrder(order)) continue;
    const stamp = creationStampOf(order);
    if (!stamp) return { state: "substantive", known: false, atMs: 0, orderId: text(order.id || order.orderId) };
    if (!earliest || stamp < earliest.atMs) earliest = { atMs: stamp, orderId: text(order.id || order.orderId) };
  }
  return earliest ? { state: "substantive", known: true, atMs: earliest.atMs, orderId: earliest.orderId } : { state: "substantive", known: false, atMs: 0, orderId: "" };
}

/**
 * May the first-success prompt be shown to this person right now?
 *
 * Order of refusals, each with a name: the global flag, the pilot list, a
 * first success at all, the launch window (NIVADESK_FEEDBACK_INVITE_FROM_MS —
 * unset means no invitation to anyone, so a launch never shows the card to
 * people whose success predates it), a first-success time that is actually
 * known and after the window opened, "already answered", then messaging.js's
 * rules: the dismissal cooldown (30 days) and the feedback-prompt cap (one per
 * seven days, counted from showings the client confirmed on screen).
 *
 * @param {object} input  { nowMs, enabled, pilotAllowed, inviteFromMs, firstSuccess: { state, known, atMs }, state: { shows, dismissals, done } }
 * @returns {{show: boolean, campaign: string, reason: string}}  reason is "" when it may be shown
 */
function promptEligibility(input = {}) {
  const campaign = CAMPAIGN_FIRST_SUCCESS;
  const nowMs = millis(input.nowMs);
  if (input.enabled !== true) return { show: false, campaign, reason: "feature_off" };
  if (input.pilotAllowed !== true) return { show: false, campaign, reason: "not_in_pilot" };
  if (!nowMs) return { show: false, campaign, reason: "no_clock" };
  const first = input.firstSuccess && typeof input.firstSuccess === "object" ? input.firstSuccess : { state: "none", known: false, atMs: 0 };
  if (first.state !== "substantive") {
    return { show: false, campaign, reason: first.state === "shell" ? "first_order_is_shell" : "no_first_success" };
  }
  const inviteFromMs = millis(input.inviteFromMs);
  if (!inviteFromMs) return { show: false, campaign, reason: "invite_window_unset" };
  if (first.known !== true || !millis(first.atMs)) return { show: false, campaign, reason: "first_success_time_unknown" };
  if (millis(first.atMs) < inviteFromMs) return { show: false, campaign, reason: "first_success_before_launch" };
  const state = input.state && typeof input.state === "object" ? input.state : {};
  if (list(state.done).includes(campaign)) return { show: false, campaign, reason: "already_answered" };
  const history = list(state.shows)
    .filter((entry) => entry && text(entry.campaign) === campaign && millis(entry.atMs) > nowMs - LIMITS.showWindowMs && millis(entry.atMs) <= nowMs)
    .map((entry) => ({ campaign, channel: "in_app", kind: "feedback_prompt", atMs: millis(entry.atMs) }));
  const dismissals = list(state.dismissals)
    .filter((entry) => entry && text(entry.campaign) === campaign)
    .map((entry) => ({ campaign, atMs: millis(entry.atMs) }));
  const decision = messaging.messageDecision({ campaign, channel: "in_app", kind: "feedback_prompt", nowMs }, { history, dismissals });
  return decision.send ? { show: true, campaign, reason: "" } : { show: false, campaign, reason: decision.reason };
}

/**
 * The shape a submission must have. Only the experience is required: a
 * one-tap answer is a real answer, and a person who has nothing to add should
 * not be made to type something to be allowed to say "okay".
 */
function submissionShape(input = {}) {
  const problems = [];
  const trigger = text(input.trigger) || "manual";
  if (!TRIGGERS.includes(trigger)) problems.push("trigger");
  const experience = text(input.experience).toLowerCase();
  if (!EXPERIENCES.includes(experience)) problems.push("experience");
  const kind = text(input.kind).toLowerCase();
  if (kind && !KINDS.includes(kind)) problems.push("kind");
  const body = text(input.text);
  if (body.length > LIMITS.textMax) problems.push("text_too_long");
  const page = text(input.page).slice(0, LIMITS.pageMax);
  const clientKey = text(input.clientKey);
  if (clientKey.length > LIMITS.clientKeyMax) problems.push("client_key");
  const language = text(input.language).slice(0, LIMITS.languageMax);
  const campaign = trigger === "first_success" ? CAMPAIGN_FIRST_SUCCESS : "";
  return {
    ok: problems.length === 0,
    problems,
    value: { trigger, campaign, experience, kind, text: body, page, clientKey, language, feedbackType: feedbackTypeFor(trigger, kind), stage: stageFor(trigger) }
  };
}

function textHash(value) {
  return crypto.createHash("sha256").update(text(value).toLowerCase().replace(/\s+/g, " ")).digest("hex");
}

/** The abuse limits, from what this person already sent in this workspace. */
function rateLimitVerdict(submissions, nowMs) {
  const now = millis(nowMs);
  const stamps = list(submissions).map((entry) => millis(entry && entry.atMs)).filter((at) => at > 0 && at <= now);
  if (stamps.filter((at) => at > now - HOUR_MS).length >= LIMITS.perHour) return { allowed: false, reason: "too_many_this_hour" };
  if (stamps.filter((at) => at > now - DAY_MS).length >= LIMITS.perDay) return { allowed: false, reason: "too_many_today" };
  return { allowed: true, reason: "" };
}

/** The id of an earlier note this one repeats, or "": a retry under the same client key, or the same words twice within minutes. */
function duplicateOf(submissions, candidate, nowMs) {
  const now = millis(nowMs);
  const key = text(candidate && candidate.clientKey);
  const hash = textHash(candidate && candidate.text);
  const kind = text(candidate && candidate.kind);
  const experience = text(candidate && candidate.experience);
  for (const entry of list(submissions).slice().reverse()) {
    if (!entry || !text(entry.id)) continue;
    const at = millis(entry.atMs);
    if (key && text(entry.clientKey) === key && at > now - LIMITS.clientKeyWindowMs) return text(entry.id);
    if (at > now - LIMITS.duplicateWindowMs && text(entry.textHash) === hash && text(entry.kind) === kind && text(entry.experience) === experience) return text(entry.id);
  }
  return "";
}

function trimHistory(entries, keep = LIMITS.historyKeep) { return list(entries).slice(-keep); }

module.exports = {
  CAMPAIGN_FIRST_SUCCESS, CAMPAIGNS, TRIGGERS, KINDS, EXPERIENCES, FEEDBACK_TYPES, CATEGORIES, IMPACTS, STATUSES, LIMITS,
  isKnownCampaign, feedbackTypeFor, stageFor, pilotAllows, creationStampOf, firstSuccess, promptEligibility, submissionShape, textHash, rateLimitVerdict, duplicateOf, trimHistory
};
