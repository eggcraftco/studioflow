// What a client is allowed to know about Sales before it draws anything.
//
// Three separate facts, kept apart on purpose (plan §4.1):
//   1. eligibility — the pilot flag for this workspace;
//   2. menu preference — what the workspace chose to see;
//   3. permission — whether this member may open the area at all.
//
// Hiding a menu is not authorisation. Every server path checks (3) again, and
// this module never decides money visibility on its own: it reports what the
// existing access flags already say.
const VISIBILITY = Object.freeze({ ON: "on", OFF: "off", UNSET: "unset" });

function normalizeVisibility(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "on" || raw === "true" || raw === "1") return VISIBILITY.ON;
  if (raw === "off" || raw === "false" || raw === "0") return VISIBILITY.OFF;
  return VISIBILITY.UNSET;
}

/**
 * Would Sales help this workspace? Read only from answers onboarding already
 * collected — no new question, and never by scanning orders, which the plan
 * forbids as a menu decision. Advisory: it changes nothing on its own.
 */
function salesSuggested(onboarding = {}) {
  const words = []
    .concat(Array.isArray(onboarding.workKinds) ? onboarding.workKinds : [])
    .concat(Array.isArray(onboarding.goals) ? onboarding.goals : [])
    .concat([onboarding.mainGoal, onboarding.startChoice, onboarding.workflow])
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
  const signal = /(product|stock|inventory|retail|sell|sale|shop|store|shopify|woocommerce|etsy|square|ebay|amazon)/;
  return words.some((word) => signal.test(word));
}

/**
 * @param {object} input
 * @param {boolean} input.pilotEnabled   the flag says this workspace is in the pilot
 * @param {string}  input.visibility     the workspace's menu preference
 * @param {boolean} input.canOpenOrders  memberAccess.orders — Sales rides the orders permission
 * @param {boolean} input.canSeeFinance  memberAccess.financialInfo
 * @param {string}  input.role           normalised workspace role
 * @param {boolean} input.assignedOnly   the member only sees their assigned orders
 */
function salesCapability({
  pilotEnabled = false, visibility = VISIBILITY.UNSET, canOpenOrders = false,
  canSeeFinance = false, role = "unknown", assignedOnly = false, onboarding = {}
} = {}) {
  const preference = normalizeVisibility(visibility);
  const workflowOnly = role === "workflowOnly";
  const canManageVisibility = role === "owner" || role === "admin";
  const permitted = canOpenOrders === true && !workflowOnly && assignedOnly !== true;

  let reason = "ok";
  if (pilotEnabled !== true) reason = "flag_off";
  else if (workflowOnly || canOpenOrders !== true) reason = "no_access";
  else if (assignedOnly === true) reason = "assigned_scope_unsupported";
  else if (preference !== VISIBILITY.ON) reason = "workspace_off";

  const canOpenSales = pilotEnabled === true && permitted;
  return {
    pilotEnabled: pilotEnabled === true,
    visibility: preference,
    canOpenSales,
    showInMenu: canOpenSales && preference === VISIBILITY.ON,
    canManageVisibility,
    canSeeMoney: canOpenSales && canSeeFinance === true,
    suggested: pilotEnabled === true && salesSuggested(onboarding),
    reason
  };
}

module.exports = { salesCapability, salesSuggested, normalizeVisibility, SALES_VISIBILITY: VISIBILITY };
