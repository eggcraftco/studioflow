/**
 * Why a team / member / role / join-request write was refused, in the three reasons a person can act on, plus the
 * rest (web-reject-reasons). Same reasons, signals and English sentences (translation keys) as the native apps:
 * Android TeamWriteRefusal.kt, iOS/macOS TeamWriteRefusal.swift.
 *  - permission: callable `permission-denied` (no named reason) or a Firestore rule refusal;
 *  - seat limit: `failed-precondition` whose details say `reason: plan_limit_reached` with
 *    `limitKey: teamMemberLimit` / `action: add_team_member`, or carry `seatLimit` (restoring a suspended member) —
 *    the server's own sentence for these has the seat numbers in it, so it cannot be translated;
 *  - connection: `unavailable` / `deadline-exceeded`, or the browser is offline (the JS SDK reports a failed fetch as
 *    `functions/internal`).
 * A reason the server names for a role change keeps its own sentence.
 */
export type TeamRefusalKind = "permission" | "seat_limit" | "connection" | "other";

export const TEAM_REFUSAL_PERMISSION = "You don't have permission to make this change. Only the workspace owner can do this.";
export const TEAM_REFUSAL_SEAT_LIMIT = "No free seats left on this plan. Remove someone's access or add a seat, then try again.";
export const TEAM_REFUSAL_CONNECTION = "No connection, so nothing was changed. Check your internet and try again.";

const NAMED_REASONS: Record<string, string> = {
  restriction_would_lift:
    "This role would remove this member's \"Assigned projects only\" limit, so their role was not changed. Keep their current role, or choose a role that also has Assigned projects only.",
  restriction_set_by_role:
    "This member's \"Assigned projects only\" setting comes from their custom role. Change it on the role, or give the member another role."
};

/** "functions/permission-denied", "permission-denied", "PERMISSION_DENIED" -> "permission-denied". */
export function canonicalRefusalCode(code: unknown): string {
  const raw = typeof code === "string" ? code.trim() : "";
  return (raw.split("/").pop() || "").toLowerCase().replace(/_/g, "-");
}

function isSeatLimit(code: string, details: Record<string, unknown> | null): boolean {
  if (!details || (code !== "failed-precondition" && code !== "resource-exhausted")) return false;
  if (typeof details.seatLimit === "number") return true;
  if (String(details.reason || "").trim() !== "plan_limit_reached") return false;
  return String(details.limitKey || "").trim() === "teamMemberLimit" || String(details.action || "").trim() === "add_team_member";
}

export function classifyTeamRefusal(code: unknown, details: unknown, offline: boolean): TeamRefusalKind {
  const clean = canonicalRefusalCode(code);
  const map = details && typeof details === "object" ? (details as Record<string, unknown>) : null;
  if (isSeatLimit(clean, map)) return "seat_limit";
  if (clean === "permission-denied") return "permission";
  if (offline || clean === "unavailable" || clean === "deadline-exceeded") return "connection";
  return "other";
}

export function teamRefusalSentence(kind: TeamRefusalKind): string | null {
  if (kind === "permission") return TEAM_REFUSAL_PERMISSION;
  if (kind === "seat_limit") return TEAM_REFUSAL_SEAT_LIMIT;
  if (kind === "connection") return TEAM_REFUSAL_CONNECTION;
  return null;
}

/**
 * The English sentence (a translation key; the page renders it through t()) for a refused team write. An error with
 * no code (already mapped, or the app's own check) keeps its message unless the browser is offline.
 */
export function teamRefusalMessage(error: unknown, fallback: string): string {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const record = error && typeof error === "object" ? (error as { code?: unknown; details?: unknown; message?: unknown }) : {};
  const details = record.details && typeof record.details === "object" ? (record.details as Record<string, unknown>) : null;
  const named = details ? NAMED_REASONS[String(details.reason || "").trim()] : undefined;
  if (named) return named;
  const hasCode = typeof record.code === "string" && record.code.length > 0;
  const kind = classifyTeamRefusal(record.code, details, offline);
  const sentence = teamRefusalSentence(kind);
  if (sentence) return sentence;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!hasCode) return message || fallback;
  const code = canonicalRefusalCode(record.code);
  // The server writes these for the person (plan, missing member, own workspace); SDK codes ("internal") are not.
  if (["failed-precondition", "not-found", "invalid-argument", "already-exists"].includes(code) && message && message.toUpperCase() !== message) {
    return message;
  }
  return fallback;
}
