"use strict";

// The three or four steps between signing up and NivaDesk being useful, for
// THIS workspace.
//
// A checklist that shows the same steps to everybody is a checklist that shows
// most people something irrelevant: a jeweller who came to manage bespoke
// commissions has no sales channel to connect, and telling them to connect one
// is the product failing to listen to the answer it just asked for.
//
// So the list is built from the path the workspace chose, from the activation
// requirements it will actually be measured against, and from what it has
// already done. Which also means it cannot drift from the measurement — the
// steps ARE the requirements, read from the same table.
//
// And it finishes. §115 is explicit: once the workspace has been served, the
// list collapses to a single line and does not sit on the dashboard for ever,
// because a completed checklist that will not go away stops reading as progress
// and starts reading as clutter.
//
// Pure: no Firestore, no clock, no network. Spec: §17, §111, §112, §114, §115.

const { ACTIVATION_REQUIREMENTS, activationProgress, activationPathFor } = require("./activation");

/**
 * What each step asks somebody to do, in their words rather than the event's.
 *
 * A step with no entry here is skipped rather than shown as a raw event name —
 * "inventory_consumed_by_order" is not an instruction, and showing it would be
 * worse than showing one step fewer.
 */
const STEP_COPY = Object.freeze({
  external_order_imported: { title: "Import your first order", detail: "Once a sale arrives, everything else follows it.", action: "integrations" },
  order_created: { title: "Create your first project", detail: "One real job, so the board has something to hold.", action: "new_order" },
  customer_created: { title: "Add your first customer", detail: "The person the work is for.", action: "new_customer" },
  bank_match_completed: { title: "Match your first transaction", detail: "Link a payment to the job it paid for.", action: "bank" },
  inventory_item_created: { title: "Add your first item", detail: "One material or product to count.", action: "inventory" },
  inventory_consumed_by_order: { title: "Use stock on a job", detail: "The moment the shelf and the work meet.", action: "inventory" },
  grounded_ai_answer: { title: "Ask the assistant something", detail: "It answers from your own orders and figures.", action: "assistant" },
  accounting_connected: { title: "Connect your accounting", detail: "QuickBooks or Xero, so the books stay in step.", action: "integrations" }
});

/**
 * The words for the first-order step when the workspace has STARTED an order
 * that is still a shell (docs/onboarding/substantive-order-wiring.md §3.3).
 *
 * Same key as the ordinary step, so `doneCount`, `complete` and the activation
 * table do not move; only the words and the destination change. The
 * destination is the shell itself: the way back to the order the person
 * abandoned, not a new one.
 */
const SHELL_STEP_COPY = Object.freeze({
  title: "Complete your first project",
  detail: "You started one — add the customer, what it is worth or what it contains, and it counts.",
  action: "open_order"
});

/** The step that comes before the path's own, where one is worth showing. */
const PRELUDE = Object.freeze({
  commerce: ["integration_connected"],
  finance: ["bank_connected"],
  accounting: [],
  inventory: [],
  bespoke_studio: [],
  ai: ["ai_business_data_connected"],
  general: []
});

const PRELUDE_COPY = Object.freeze({
  integration_connected: { title: "Connect your first sales channel", detail: "Shopify, Etsy, WooCommerce or Square.", action: "integrations" },
  bank_connected: { title: "Connect your bank", detail: "Read-only. NivaDesk can never move money.", action: "bank" },
  ai_business_data_connected: { title: "Give the assistant your data", detail: "It cannot answer about work it cannot see.", action: "assistant" }
});

/**
 * The checklist for one workspace.
 *
 * @param {object} input { profile, events, path }
 * @returns {{
 *   path: string, complete: boolean, steps: {key,title,detail,action,done}[],
 *   doneCount: number, headline: string
 * }}
 */
function setupChecklist(input = {}) {
  const path = input.path || activationPathFor(input.profile || {});
  const requirement = ACTIVATION_REQUIREMENTS[path] || ACTIVATION_REQUIREMENTS.general;
  const required = requirement.all || requirement.any || [];
  const progress = activationProgress(input.events || [], path);

  const doneNames = new Set();
  for (const [name, done] of Object.entries(progress.steps)) if (done) doneNames.add(name);
  // The prelude is not part of activation, so its doneness is read separately.
  const seen = new Set((Array.isArray(input.events) ? input.events : []).map((event) => String(event && event.name || "")));

  const steps = [];
  // The first line is always the answer they already gave, ticked — the
  // checklist opens by acknowledging what they did rather than by asking.
  steps.push({
    key: "onboarding",
    title: "Tell us what you'd like help with",
    detail: "",
    action: "",
    done: seen.has("onboarding_completed") || seen.has("onboarding_started") || Boolean(input.profile && input.profile.onboardingMainGoal)
  });

  for (const name of PRELUDE[path] || []) {
    const copy = PRELUDE_COPY[name];
    if (!copy) continue;
    steps.push({ key: name, ...copy, done: seen.has(name) });
  }

  // What the workspace's orders say about its first real job, when the caller
  // read them: { state: "none" | "shell" | "substantive", shellId? }. Absent
  // means today's behaviour — the step reads only from the events.
  const firstOrder = input.firstOrder && typeof input.firstOrder === "object" ? input.firstOrder : null;

  for (const name of required) {
    const copy = STEP_COPY[name];
    // A requirement with no words is left out rather than shown as an event
    // name: one step fewer beats an instruction nobody can follow.
    if (!copy) continue;
    const done = doneNames.has(name);
    // A started-but-empty order is named as such and pointed back at, instead
    // of the person being asked to create another one. Only when the step is
    // not done: a substantive order makes the words irrelevant.
    if (name === "order_created" && !done && firstOrder && firstOrder.state === "shell" && firstOrder.shellId) {
      steps.push({ key: name, ...SHELL_STEP_COPY, target: { orderId: String(firstOrder.shellId) }, done: false });
      continue;
    }
    steps.push({ key: name, ...copy, done });
  }

  const doneCount = steps.filter((step) => step.done).length;
  return {
    path,
    complete: progress.activated,
    steps,
    doneCount,
    // §115: once they have been served, the list says so in one line and stops
    // being a list. It does not live on the dashboard for ever.
    headline: progress.activated ? "You're set up" : "Your NivaDesk setup"
  };
}

module.exports = { setupChecklist, SETUP_STEP_COPY: STEP_COPY, SETUP_PRELUDE: PRELUDE, SETUP_SHELL_COPY: SHELL_STEP_COPY };
