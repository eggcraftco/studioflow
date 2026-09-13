// PR-P0 — who may do what on the payment rail (plan §9).
//
// This reuses NivaDesk's existing contract rather than inventing a second one:
//   - roles are the five from normalizeWorkspaceRole() in functions/index.js:
//     owner | admin | member | workflowOnly | viewOnly;
//   - money visibility is workspaceMemberAccess().financialInfo;
//   - "assigned-only" is workspaceMemberAccess().assignedProjectsOnly.
//
// Two rules carry the plan's intent and are the reason this is a module rather
// than a handful of ifs at each call site:
//
//   1. Connecting and disconnecting Stripe is OWNER ONLY. It is the same bar
//      the existing billing callables use (ownerOrAdminRole() rejects anyone
//      but the owner), and it is the right bar: a connection decides where a
//      workspace's money lands.
//
//   2. An assigned-only member's authority follows the ORDER, live. The plan is
//      explicit that when an order is reassigned, the previous member loses the
//      link's detail — so every decision here takes the order's CURRENT
//      assignedToUid, and nothing is cached from when the link was made. The
//      customer's link keeps working; that is Stripe's page, and it is not the
//      same question as staff access.
//
// Nothing here reads Firestore or trusts a client-supplied role: the caller
// passes what the server just verified.

const ACTIONS = Object.freeze([
  "connect",          // connect or disconnect the workspace's Stripe account
  "viewConnection",   // see whether the workspace can take payments
  "createRequest",    // create a payment link for an order
  "viewAmounts",      // see the money on a payment request
  "cancelRequest",    // cancel an open link
  "refund"            // start a refund
]);

function role(value) {
  const compact = String(value == null ? "" : value).trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (compact === "owner") return "owner";
  if (compact === "admin") return "admin";
  if (compact === "member") return "member";
  if (compact === "viewer" || compact === "viewonly" || compact === "readonly") return "viewOnly";
  if (compact === "workflow" || compact === "workflowonly") return "workflowOnly";
  return "unknown";
}

/**
 * `actor`  : { uid, role, financialInfo, assignedProjectsOnly, refundApproved }
 * `order`  : { assignedToUid } — the CANONICAL order, read now, not the copy
 *            the client sent and not the one the link was created against.
 *
 * Returns { allowed, reason }. `reason` is a stable code, never a sentence, so
 * the same decision can be reported identically on web, iOS, Android and Mac.
 */
function can(action, actor, order) {
  if (!ACTIONS.includes(action)) return { allowed: false, reason: "unknown_action" };
  const who = actor && typeof actor === "object" ? actor : {};
  const r = role(who.role);
  if (r === "unknown") return { allowed: false, reason: "unknown_role" };

  const finance = who.financialInfo === true;
  const assignedOnly = who.assignedProjectsOnly === true;
  const uid = String(who.uid || "").trim();
  const assignee = String((order && order.assignedToUid) || "").trim();
  const ownsOrder = Boolean(uid) && uid === assignee;

  // An assigned-only member acting on an order that is no longer theirs is
  // refused for every per-order action, whatever their role says. This is the
  // reassignment rule, and it is checked first so nothing below can bypass it.
  const perOrder = action === "createRequest" || action === "cancelRequest" || action === "viewAmounts";
  if (assignedOnly && perOrder && !ownsOrder) return { allowed: false, reason: "not_assigned_to_you" };

  switch (action) {
    case "connect":
      // Owner only. Deliberately narrower than the plan's "finance admin: by
      // policy" column until a workspace-level policy switch exists to widen
      // it — a missing policy must not read as permission.
      return r === "owner" ? { allowed: true, reason: "" } : { allowed: false, reason: "owner_only" };

    case "viewConnection":
      // Everyone who is in the workspace may learn whether payments work; what
      // they get back is the ready/not-ready summary, never the account id.
      return r === "viewOnly" || r === "workflowOnly"
        ? { allowed: true, reason: "limited_summary" }
        : { allowed: true, reason: "" };

    case "createRequest":
      if (r === "viewOnly") return { allowed: false, reason: "read_only_role" };
      if (r === "owner" || r === "admin") return { allowed: true, reason: "" };
      // A member or a Workflow Only member may ask a customer for money only
      // when the workspace has given them money visibility. Asking for a
      // payment is a financial act even when the asker cannot see the total.
      return finance ? { allowed: true, reason: "" } : { allowed: false, reason: "needs_financial_info" };

    case "viewAmounts":
      if (r === "owner" || r === "admin") return { allowed: true, reason: "" };
      return finance ? { allowed: true, reason: "" } : { allowed: false, reason: "needs_financial_info" };

    case "cancelRequest":
      if (r === "viewOnly") return { allowed: false, reason: "read_only_role" };
      if (r === "owner" || r === "admin") return { allowed: true, reason: "" };
      return finance ? { allowed: true, reason: "" } : { allowed: false, reason: "needs_financial_info" };

    case "refund":
      // Sending money back is its own authority. The owner always has it; an
      // admin needs the workspace to have granted it explicitly; nobody else
      // has it at all, regardless of financialInfo or assignment.
      if (r === "owner") return { allowed: true, reason: "" };
      if (r === "admin") {
        return who.refundApproved === true
          ? { allowed: true, reason: "" }
          : { allowed: false, reason: "needs_refund_permission" };
      }
      return { allowed: false, reason: "owner_or_approved_admin_only" };

    default:
      return { allowed: false, reason: "unknown_action" };
  }
}

module.exports = { ACTIONS, can };
