"use strict";

// When has NivaDesk actually started working for somebody.
//
// The measurement that matters and the one nobody was making. Thirty-seven
// workspaces outside this studio have signed up; none has ever created a
// customer record. "Signed up" and "using it" were the only two states the
// product could tell apart, and they are the two least useful.
//
// Two rules shape this file:
//
//   Activation is not one event (§6). A jeweller connecting Etsy and a studio
//   typing its first bespoke commission are both activated, by completely
//   different evidence, and holding them to one definition would mark most of
//   them as failures for ever.
//
//   Activation is not connecting something (§7). Connecting a shop and
//   importing its product list proves the plumbing works, not that the product
//   does. The bar is the first piece of real operational value: an order that
//   arrived, a payment matched to a job, stock consumed by a piece of work.
//
// Pure: no Firestore, no clock, no network — the caller supplies the events and
// the moment. Spec: §4-§11, §63, §64, §87.

const { describeEvent } = require("./events");

const PATHS = Object.freeze(["commerce", "bespoke_studio", "finance", "inventory", "ai", "accounting", "general"]);

/**
 * What each path needs before a workspace has been served.
 *
 * `all` means every step; `any` means one is enough. The commerce path takes
 * `first_external_order_imported` alone deliberately — a shop's first real
 * order arriving IS the value, and demanding more would keep a working
 * workspace marked as failed.
 */
const REQUIREMENTS = Object.freeze({
  commerce: { all: ["external_order_imported"] },
  bespoke_studio: { all: ["customer_created", "order_created"] },
  finance: { all: ["bank_match_completed"] },
  inventory: { all: ["inventory_item_created", "inventory_consumed_by_order"] },
  ai: { all: ["grounded_ai_answer"] },
  accounting: { all: ["accounting_connected"] },
  // For a workspace that told us nothing: anything that is real work counts.
  general: { any: ["external_order_imported", "order_created", "bank_match_completed", "inventory_consumed_by_order", "grounded_ai_answer"] }
});

/**
 * The wizard's ten goals, mapped onto the paths.
 *
 * "Something else" deliberately stays general: they told us their goal was not
 * on our list, and picking one for them is the opposite of listening.
 */
const GOAL_PATHS = Object.freeze({
  connect_store: "commerce",
  finance: "finance",
  inventory: "inventory",
  orders_customers: "bespoke_studio",
  production_deadlines: "bespoke_studio",
  repairs_service: "bespoke_studio",
  estimates: "bespoke_studio",
  files_notes: "bespoke_studio",
  team: "bespoke_studio",
  other: "general"
});

/** The setup actions that move a workspace off NEW without activating it (§5). */
const SETUP_EVENTS = Object.freeze([
  "integration_connect_started", "integration_connected",
  "bank_connect_started", "bank_connected",
  "accounting_connect_started", "accounting_connected",
  "customer_created", "order_created",
  "inventory_item_created", "ai_business_data_connected"
]);

const STATES = Object.freeze(["new", "onboarding", "setup_started", "activated", "engaged", "at_risk", "dormant", "churned", "reactivated"]);

/** Days, not hardcoded — the spec is explicit that these are configuration (§65). */
const DEFAULT_TIMINGS = Object.freeze({
  newUnactivatedDays: 7,
  activatedLowFrequencyDays: 14,
  engagedHighFrequencyDays: 7,
  dormantDays: 30
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When an event happened, or null.
 *
 * `Number(null)` is 0, which is finite — so a missing timestamp read as the
 * first of January 1970, which is ancient enough to mark a live workspace
 * dormant and recent enough to activate one that had done nothing. A time has
 * to be a real number above zero, and anything else is no time at all.
 */
function eventTimeOf(event) {
  const raw = event && event.atMs;
  if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") return null;
  const atMs = Number(raw);
  return Number.isFinite(atMs) && atMs > 0 ? atMs : null;
}

function normalizePath(raw) {
  const text = String(raw || "").trim().toLowerCase();
  return PATHS.includes(text) ? text : "general";
}

/**
 * The path a workspace is on, from what it told us at onboarding.
 *
 * A workspace that answered nothing gets "general", which is satisfied by any
 * real work — never a specific path it never chose, because holding somebody
 * to a path they did not pick manufactures a failure out of a success.
 */
function activationPathFor(profile = {}) {
  const declared = normalizePath(profile.activationPath || profile.activation_path);
  if (declared !== "general") return declared;

  // What the onboarding wizard already asked, in the wizard's own vocabulary.
  //
  // The workspace has answered this: "what do you mainly want NivaDesk for" is
  // the first question it is asked, and the answer is on companySettings as
  // `onboardingMainGoal`. Measuring activation against a path derived from
  // anything else — a business-type word nothing writes, or a default — would
  // hold a studio to a bar it never chose.
  const goal = String(profile.onboardingMainGoal || profile.mainGoal || "").trim().toLowerCase();
  if (goal && Object.prototype.hasOwnProperty.call(GOAL_PATHS, goal)) return GOAL_PATHS[goal];

  // Somebody who chose to start by connecting a shop came for the shop, whatever
  // else they ticked.
  const start = String(profile.onboardingStartChoice || profile.start || "").trim().toLowerCase();
  if (start === "shopify" || start === "woocommerce") return "commerce";

  const business = String(profile.businessType || profile.business_type || "").trim().toLowerCase();
  if (business === "online_shop" || business === "commerce" || business === "retail") return "commerce";
  if (business === "bespoke" || business === "studio" || business === "workshop" || business === "jeweller") return "bespoke_studio";
  if (business === "wholesale" || business === "manufacturer") return "inventory";
  return "general";
}

/**
 * Which steps a path has taken, and whether it is done.
 *
 * `events` is a list of `{name, atMs}` — the caller's own store, in any order.
 * Only DECLARED events count: an undeclared name cannot activate a workspace,
 * so a telemetry line added elsewhere can never quietly move somebody's
 * lifecycle without being declared in the registry first.
 */
function activationProgress(events = [], path = "general") {
  const chosen = normalizePath(path);
  const requirement = REQUIREMENTS[chosen] || REQUIREMENTS.general;
  const wanted = requirement.all || requirement.any || [];

  const firstAt = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const name = String(event && event.name || "");
    if (!describeEvent(name).declared) continue;
    const atMs = eventTimeOf(event);
    if (atMs === null) continue;
    if (!firstAt.has(name) || atMs < firstAt.get(name)) firstAt.set(name, atMs);
  }

  const steps = {};
  for (const name of wanted) steps[name] = firstAt.has(name);

  const done = wanted.filter((name) => steps[name]);
  const activated = requirement.all ? done.length === wanted.length : done.length > 0;
  // The moment the LAST required step landed — the point at which the
  // workspace was served, not the point at which it first tried.
  const activatedAtMs = activated ? Math.max(...done.map((name) => firstAt.get(name))) : 0;

  return { path: chosen, steps, activated, activatedAtMs, completed: done.length, required: wanted.length };
}

/** Everything the workspace has done that is real work, newest first. */
function meaningfulEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => describeEvent(event && event.name).meaningful && eventTimeOf(event) !== null)
    .sort((a, b) => eventTimeOf(b) - eventTimeOf(a));
}

/**
 * The one state a workspace is in, and the reason for it.
 *
 * The reason is carried because §88 asks for lifecycle HISTORY rather than an
 * overwritten field: "why did this workspace become at_risk" is the question a
 * retention message has to answer, and a bare state cannot.
 */
function lifecycleState(input = {}) {
  const timings = { ...DEFAULT_TIMINGS, ...(input.timings || {}) };
  const nowMs = Number(input.nowMs);
  const events = Array.isArray(input.events) ? input.events : [];
  const progress = activationProgress(events, input.path || activationPathFor(input.profile || {}));
  const meaningful = meaningfulEvents(events);
  const names = new Set(events.map((e) => String(e && e.name || "")));

  if (input.cancelledAtMs) return { state: "churned", reason: "plan_cancelled", progress };

  if (!progress.activated) {
    // Nothing real yet. Which of the three "not yet" states depends on how far
    // they got, not on how long ago they signed up.
    if (SETUP_EVENTS.some((name) => names.has(name))) {
      return { state: "setup_started", reason: "setup_action_without_activation", progress };
    }
    if (names.has("onboarding_started") && !names.has("onboarding_completed")) {
      return { state: "onboarding", reason: "onboarding_in_progress", progress };
    }
    return { state: "new", reason: "no_setup_action", progress };
  }

  const lastAtMs = meaningful.length ? eventTimeOf(meaningful[0]) : progress.activatedAtMs;
  const quietDays = Number.isFinite(nowMs) ? (nowMs - lastAtMs) / DAY_MS : 0;

  if (quietDays >= timings.dormantDays) return { state: "dormant", reason: "no_meaningful_activity", progress, quietDays };
  if (quietDays >= timings.activatedLowFrequencyDays) return { state: "at_risk", reason: "activity_slowed", progress, quietDays };

  // Engaged is not "activated and recent" — it is a RHYTHM (§63): more than one
  // meaningful action inside the window, so a single burst on the day they
  // signed up does not read as a habit.
  const windowStart = Number.isFinite(nowMs) ? nowMs - timings.engagedHighFrequencyDays * DAY_MS : -Infinity;
  const recent = meaningful.filter((event) => eventTimeOf(event) >= windowStart);
  if (recent.length >= 2) return { state: "engaged", reason: "regular_meaningful_activity", progress, quietDays };

  return { state: "activated", reason: "first_value_delivered", progress, quietDays };
}

module.exports = {
  ACTIVATION_PATHS: PATHS, ACTIVATION_REQUIREMENTS: REQUIREMENTS, LIFECYCLE_STATES: STATES, GOAL_PATHS,
  SETUP_EVENTS, DEFAULT_TIMINGS,
  activationPathFor, activationProgress, meaningfulEvents, lifecycleState, eventTimeOf
};
