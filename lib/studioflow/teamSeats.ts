// The seat allowance the server enforces (17 Oct 2026), worked out the way
// functions/index.js works it out: `effectiveTeamSeatLimit` +
// `activeAdditionalTeamSeats` — the number every seat check there binds on
// (addWorkspaceTeamMember, approveWorkspaceJoinRequest, invitations, restoring
// a suspended member). iOS TeamSeatLimit.swift and Android TeamSeatLimit.kt
// carry the same rule.
//
// Not the stored `billingTeamMemberLimit`: the Stripe seat webhook writes it as
// 5 + seats, but every plan webhook writes the plan's 5 back while the bought
// seats stay active, and the server never reads it. A Team workspace with three
// bought seats and eight people showed "8 / 5" and "0 seats available".
//
// Three numbers, kept apart on screen: seats in use (people who hold one — a
// suspended member holds none, teamMemberCountFromCompanyData), seats included
// in the plan, and the total (included + extra).

/** TEAM_INCLUDED_SEATS: the seats NivaDesk Team includes. */
export const TEAM_INCLUDED_SEATS = 5;
/** TEAM_SELF_SERVICE_MAX_SEATS: included + bought, never more. */
export const TEAM_SELF_SERVICE_MAX_SEATS = 10;
const TEAM_PLAN_ID = "team_monthly";
const COUNTING_STATUSES = new Set(["active", "trialing", "past_due"]);

/** activeAdditionalTeamSeats: bought seats while the add-on is active / trialing / past_due, whole seats, at most 5. */
export function activeAdditionalTeamSeats(quantity: unknown, status: unknown): number {
  const state = String(status ?? "").trim().toLowerCase();
  if (!COUNTING_STATUSES.has(state)) return 0;
  const raw = Number(quantity ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(TEAM_SELF_SERVICE_MAX_SEATS - TEAM_INCLUDED_SEATS, Math.floor(raw));
}

export type TeamSeatAllowance = {
  /** Seats the plan itself includes (Team: 5; any other plan: its own limit). */
  included: number;
  /** Bought seats that count (Team only). */
  extra: number;
  /** included + extra, capped at 10 on Team — the server's effectiveTeamSeatLimit. */
  total: number;
};

/** effectiveTeamSeatLimit with its two parts. `plan` is the plan the server honours (a lapsed trial is Free). */
export function teamSeatAllowance(plan: string, planTeamMemberLimit: number, activeAdditional: number): TeamSeatAllowance {
  if (plan !== TEAM_PLAN_ID) {
    const limit = Number.isFinite(planTeamMemberLimit) && planTeamMemberLimit > 0 ? Math.floor(planTeamMemberLimit) : 1;
    return { included: limit, extra: 0, total: limit };
  }
  const extra = Math.max(0, Math.min(TEAM_SELF_SERVICE_MAX_SEATS - TEAM_INCLUDED_SEATS, Math.floor(activeAdditional) || 0));
  return { included: TEAM_INCLUDED_SEATS, extra, total: Math.min(TEAM_SELF_SERVICE_MAX_SEATS, TEAM_INCLUDED_SEATS + extra) };
}

/** Seats still free: never negative (a workspace can be over after a downgrade). */
export function teamSeatsAvailable(used: number, total: number): number {
  return Math.max(0, total - used);
}
