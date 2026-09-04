"use strict";

// What counts as a workspace doing something, and how much it counts for.
//
// A product-event system that treats every click as a signal tells you only
// that somebody is clicking. The distinction this file draws — meaningful or
// not — is the one everything downstream rests on: activation, engagement,
// dormancy and every message the system decides to send. Opening the Settings
// page is not evidence that NivaDesk is working for somebody; importing their
// first real order is.
//
// So the registry is a declared table rather than a rule applied to a name,
// and an event nobody has declared is NOT meaningful. That default is
// deliberate: a new event added elsewhere in the codebase must be a conscious
// addition here before it can move a workspace's lifecycle, otherwise a
// telemetry line added for debugging quietly starts counting as engagement.
//
// Spec: NivaDesk_Native_Onboarding_Feedback_Retention_AI_Spec.md §25-§33, §64,
// §90-§92. Pure: no Firestore, no clock, no network.

/**
 * activationWeight  how much this event says "NivaDesk has started working"
 * engagementWeight  how much it says "and it is still working"
 *
 * Weights, not booleans, because the two questions have different answers:
 * connecting a shop is a big activation signal and almost no engagement one
 * (it happens once), while shipping an order is the reverse.
 */
const REGISTRY = Object.freeze({
  // ---- onboarding (§26) — meaningful, but never activation on their own
  onboarding_started: { meaningful: true, activationWeight: 1, engagementWeight: 0 },
  onboarding_completed: { meaningful: true, activationWeight: 2, engagementWeight: 0 },
  onboarding_skipped: { meaningful: true, activationWeight: 0, engagementWeight: 0 },
  welcome_screen_seen: { meaningful: false, activationWeight: 0, engagementWeight: 0 },

  // ---- integrations (§27)
  integration_connect_started: { meaningful: true, activationWeight: 2, engagementWeight: 0 },
  integration_connected: { meaningful: true, activationWeight: 4, engagementWeight: 1 },
  integration_disconnected: { meaningful: true, activationWeight: 0, engagementWeight: 0 },
  products_imported: { meaningful: true, activationWeight: 2, engagementWeight: 1 },
  // The one that actually proves a shop is feeding the workshop (§7).
  external_order_imported: { meaningful: true, activationWeight: 5, engagementWeight: 3 },

  // ---- orders and projects (§28)
  customer_created: { meaningful: true, activationWeight: 3, engagementWeight: 2 },
  order_created: { meaningful: true, activationWeight: 4, engagementWeight: 3 },
  order_status_changed: { meaningful: true, activationWeight: 0, engagementWeight: 2 },
  order_delivered: { meaningful: true, activationWeight: 0, engagementWeight: 3 },
  invoice_sent: { meaningful: true, activationWeight: 2, engagementWeight: 3 },
  estimate_approved: { meaningful: true, activationWeight: 2, engagementWeight: 3 },

  // ---- banking (§29)
  bank_connect_started: { meaningful: true, activationWeight: 2, engagementWeight: 0 },
  bank_connected: { meaningful: true, activationWeight: 3, engagementWeight: 1 },
  bank_transactions_imported: { meaningful: true, activationWeight: 2, engagementWeight: 2 },
  // Matching a transaction to an order is the moment the money and the work
  // meet, which is what a finance user came for (§9).
  bank_match_completed: { meaningful: true, activationWeight: 5, engagementWeight: 3 },

  // ---- inventory (§30)
  inventory_item_created: { meaningful: true, activationWeight: 3, engagementWeight: 2 },
  inventory_quantity_set: { meaningful: true, activationWeight: 2, engagementWeight: 2 },
  inventory_consumed_by_order: { meaningful: true, activationWeight: 5, engagementWeight: 3 },

  // ---- accounting
  accounting_connect_started: { meaningful: true, activationWeight: 2, engagementWeight: 0 },
  accounting_connected: { meaningful: true, activationWeight: 4, engagementWeight: 1 },

  // ---- AI (§31) — opening the screen is not activation (§11)
  ai_screen_opened: { meaningful: false, activationWeight: 0, engagementWeight: 0 },
  ai_business_data_connected: { meaningful: true, activationWeight: 3, engagementWeight: 1 },
  grounded_ai_answer: { meaningful: true, activationWeight: 5, engagementWeight: 3 },

  // ---- feedback and retention (§32, §33)
  feedback_submitted: { meaningful: true, activationWeight: 0, engagementWeight: 2 },
  feedback_prompt_dismissed: { meaningful: false, activationWeight: 0, engagementWeight: 0 },
  help_opened: { meaningful: false, activationWeight: 0, engagementWeight: 0 },
  session_started: { meaningful: false, activationWeight: 0, engagementWeight: 0 },
  page_viewed: { meaningful: false, activationWeight: 0, engagementWeight: 0 }
});

const UNKNOWN = Object.freeze({ meaningful: false, activationWeight: 0, engagementWeight: 0, declared: false });

/**
 * What an event is worth. An undeclared event is worth nothing and says so, so
 * a caller can tell "declared as not meaningful" from "nobody has declared it".
 */
function describeEvent(name) {
  const key = String(name || "").trim();
  if (!Object.prototype.hasOwnProperty.call(REGISTRY, key)) return { ...UNKNOWN };
  return { ...REGISTRY[key], declared: true };
}

function isMeaningful(name) {
  return describeEvent(name).meaningful === true;
}

function meaningfulEventNames() {
  return Object.keys(REGISTRY).filter((name) => REGISTRY[name].meaningful).sort();
}

/**
 * The key that makes an event idempotent (§90).
 *
 * The same real-world happening reaches this system more than once — a webhook
 * retried, a screen re-rendered, a sweep re-running — and counting it twice
 * inflates engagement and can activate a workspace that has done nothing. The
 * key is the workspace, the event and the SUBJECT it happened to, so importing
 * order 1042 twice is one event while importing 1042 and 1043 is two.
 */
function eventKey(workspaceId, name, subjectId) {
  const parts = [String(workspaceId || ""), String(name || ""), String(subjectId || "")];
  return parts.join("|");
}

module.exports = { EVENT_REGISTRY: REGISTRY, describeEvent, isMeaningful, meaningfulEventNames, eventKey };
