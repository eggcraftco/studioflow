// Owner/admin corrections to the Work Time card's timer sessions (worktime-edit, 23 Oct 2026).
//
// The server (updateWebOrder's workTime "edit" / "delete", functions/workSessionEdits.js) decides; this file
// only mirrors its gates so the card offers what the server will accept, and reads the server-only
// `workSessionAudit` array the order carries:
//   correct (start/end, or close a running timer)  — workspace owner and admins only;
//   delete any session                              — owner and admins;
//   delete an own session no owner/admin corrected   — the member who timed it.
// Nothing here is a permission: the rules refuse any client write of workSessionAudit and the server refuses
// every other role.

export type WorkSessionAuditAction = "edited" | "closed" | "deleted";

export type WorkSessionAuditValues = {
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number;
};

export type WorkSessionAuditDetail = {
  id: string;
  sessionId: string;
  action: WorkSessionAuditAction;
  at: Date | null;
  byUid: string;
  byEmail: string;
  memberUid: string;
  memberEmail: string;
  title: string;
  before: WorkSessionAuditValues | null;
  after: WorkSessionAuditValues | null;
};

/** Mirrors functions/workSessionEdits.js: longest correctable session and the "are you sure?" threshold. */
export const WORK_SESSION_MAX_SECONDS = 7 * 24 * 3600;
export const WORK_SESSION_LONG_SECONDS = 12 * 3600;
const FUTURE_SLACK_MS = 2 * 60 * 1000;

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === "object" && value !== null) {
    const raw = value as { seconds?: unknown; _seconds?: unknown };
    const seconds = Number(raw.seconds ?? raw._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function mapValues(value: unknown): WorkSessionAuditValues | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    startedAt: asDate(raw.startedAt),
    endedAt: asDate(raw.endedAt),
    durationSeconds: Math.max(0, Math.round(Number(raw.durationSeconds || 0)))
  };
}

const ACTIONS: WorkSessionAuditAction[] = ["edited", "closed", "deleted"];

/** Oldest first, as stored. Unknown or malformed rows are skipped. */
export function mapWorkSessionAudit(value: unknown): WorkSessionAuditDetail[] {
  if (!Array.isArray(value)) return [];
  const out: WorkSessionAuditDetail[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const raw = item as Record<string, unknown>;
    const action = String(raw.action || "") as WorkSessionAuditAction;
    const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : "";
    if (!sessionId || !ACTIONS.includes(action)) return;
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : `audit-${index}`,
      sessionId,
      action,
      at: asDate(raw.at),
      byUid: String(raw.byUid || ""),
      byEmail: String(raw.byEmail || ""),
      memberUid: String(raw.memberUid || ""),
      memberEmail: String(raw.memberEmail || ""),
      title: String(raw.title || ""),
      before: mapValues(raw.before),
      after: mapValues(raw.after)
    });
  });
  return out;
}

export function canCorrectWorkTimeForRole(role: string): boolean {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

/** The latest correction (not a deletion) of one session, or null. */
export function latestCorrection(audit: WorkSessionAuditDetail[], sessionId: string): WorkSessionAuditDetail | null {
  let found: WorkSessionAuditDetail | null = null;
  for (const row of audit) {
    if (row.sessionId === sessionId && row.action !== "deleted") found = row;
  }
  return found;
}

/** The first recorded values of a corrected session (what it looked like before anyone corrected it). */
export function originalValues(audit: WorkSessionAuditDetail[], sessionId: string): WorkSessionAuditValues | null {
  for (const row of audit) {
    if (row.sessionId === sessionId && row.action !== "deleted") return row.before;
  }
  return null;
}

export function canDeleteWorkSession(
  session: { id: string; createdByUid: string },
  myUid: string,
  canCorrect: boolean,
  audit: WorkSessionAuditDetail[]
): boolean {
  if (canCorrect) return true;
  return Boolean(session.createdByUid) && session.createdByUid === myUid && !latestCorrection(audit, session.id);
}

export type CorrectionCheck =
  | { ok: true; durationSeconds: number; long: boolean }
  | { ok: false; error: string };

/** The server's checks, run before sending so the person sees the reason at once. */
export function checkCorrection(start: Date | null, end: Date | null, wasRunning: boolean, now = new Date()): CorrectionCheck {
  if (!start) return { ok: false, error: "Enter a valid start time." };
  if (!wasRunning && !end) return { ok: false, error: "A finished work session needs an end time." };
  const latest = now.getTime() + FUTURE_SLACK_MS;
  if (start.getTime() > latest) return { ok: false, error: "The start time cannot be in the future." };
  if (end && end.getTime() > latest) return { ok: false, error: "The end time cannot be in the future." };
  if (end && end.getTime() <= start.getTime()) return { ok: false, error: "The end time must be after the start time." };
  const durationSeconds = end ? Math.round((end.getTime() - start.getTime()) / 1000) : Math.round((now.getTime() - start.getTime()) / 1000);
  if (end && durationSeconds > WORK_SESSION_MAX_SECONDS) return { ok: false, error: "A work session cannot be longer than 7 days." };
  return { ok: true, durationSeconds, long: durationSeconds > WORK_SESSION_LONG_SECONDS };
}

/** `<input type="datetime-local">` value in the browser's own time zone, to the minute. */
export function dateTimeLocalValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a datetime-local value as local time; "" is null. Keeps the seconds of `keep` when the minute did not move. */
export function parseDateTimeLocal(value: string, keep?: Date | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  if (!Number.isFinite(date.getTime())) return null;
  if (keep && dateTimeLocalValue(keep) === value) return keep;
  return date;
}
