// Day entries on the Work Time card (docs/working-day-entry-contract-2026-10-14.md, section 7 for 15 Oct).
//
// An order's `workDays` sit beside the timer's `workSessions`: one entry says one
// member worked a full day (1) or a half day (0.5) on this order on one calendar
// date. At most one entry per member per date (id `${memberUid}_${date}`); saving
// again replaces it. Writes go through updateWebOrder's `workDay` patch only — the
// server checks who may write; this file only reads, sums and formats.
//
// Days are DAYS: never turned into hours or money, never added to the timer's hours.
// Who may change or delete an entry: its own member, and the workspace OWNER for anyone's.
// `workDayHistory` (server-written, newest first) records every change since 15 Oct 2026.

export type WorkDayKind = "full_day" | "half_day";

export type WorkDayDetail = {
  id: string;
  date: string;
  kind: WorkDayKind;
  memberUid: string;
  memberEmail: string;
  note: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  source: string;
  /** Who made the last change — only on entries changed since 15 Oct 2026. */
  updatedByUid?: string;
  updatedByEmail?: string;
};

export type WorkDayHistoryAction = "logged" | "changed" | "deleted";

export type WorkDayHistoryDetail = {
  id: string;
  at: Date | null;
  action: WorkDayHistoryAction;
  date: string;
  memberUid: string;
  memberEmail: string;
  byUid: string;
  byEmail: string;
  before: { kind: WorkDayKind; note: string } | null;
  after: { kind: WorkDayKind; note: string } | null;
  source: string;
};

export type WorkDayPatch = {
  action: "set" | "delete";
  date: string;
  kind?: WorkDayKind;
  note?: string;
  memberUid?: string;
  source?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function workDayValue(kind: string) {
  if (kind === "full_day") return 1;
  if (kind === "half_day") return 0.5;
  return 0;
}

export function totalWorkDays(entries: Array<{ kind: string }>) {
  return entries.reduce((sum, entry) => sum + workDayValue(entry.kind), 0);
}

/** 1.5 → "1.5", 2 → "2" — never a long float. */
export function formatWorkDays(value: number, locale = "en-GB") {
  const rounded = Math.round(value * 2) / 2;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(rounded);
}

/** Today on this device, as the "YYYY-MM-DD" the entry stores (no workspace time zone exists). */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The stored date read as a local calendar day (no UTC shift). */
export function workDayDate(date: string) {
  if (!DATE_PATTERN.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function workDayId(memberUid: string, date: string) {
  return `${memberUid}_${date}`;
}

type Unknown = Record<string, unknown>;

function asText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const maybe = value as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  return null;
}

/** Stored rows as the server keeps them; a malformed or repeated row is skipped. Newest date first. */
export function mapWorkDays(value: unknown): WorkDayDetail[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: WorkDayDetail[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Unknown;
    const memberUid = asText(row.memberUid, 160);
    const date = asText(row.date, 10);
    const kind = asText(row.kind, 20).toLowerCase();
    if (!memberUid || !DATE_PATTERN.test(date) || (kind !== "full_day" && kind !== "half_day")) continue;
    const id = workDayId(memberUid, date);
    if (seen.has(id)) continue;
    seen.add(id);
    const entry: WorkDayDetail = {
      id,
      date,
      kind,
      memberUid,
      memberEmail: asText(row.memberEmail, 220),
      note: asText(row.note, 280),
      createdAt: asDate(row.createdAt),
      updatedAt: asDate(row.updatedAt) ?? asDate(row.createdAt),
      source: asText(row.source, 40)
    };
    const updatedByUid = asText(row.updatedByUid, 160);
    if (updatedByUid) {
      entry.updatedByUid = updatedByUid;
      entry.updatedByEmail = asText(row.updatedByEmail, 220);
    }
    output.push(entry);
  }
  return sortWorkDays(output);
}

function historySide(value: unknown): { kind: WorkDayKind; note: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Unknown;
  const kind = asText(row.kind, 20).toLowerCase();
  if (kind !== "full_day" && kind !== "half_day") return null;
  return { kind, note: asText(row.note, 280) };
}

/** The server's change log for day entries, newest first; a malformed row is skipped. Nothing is made up for older entries. */
export function mapWorkDayHistory(value: unknown): WorkDayHistoryDetail[] {
  if (!Array.isArray(value)) return [];
  const output: WorkDayHistoryDetail[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Unknown;
    const action = asText(row.action, 20).toLowerCase();
    const memberUid = asText(row.memberUid, 160);
    const date = asText(row.date, 10);
    const byUid = asText(row.byUid, 160);
    if ((action !== "logged" && action !== "changed" && action !== "deleted") || !memberUid || !DATE_PATTERN.test(date) || !byUid) continue;
    output.push({
      id: asText(row.id, 80) || `${action}_${memberUid}_${date}_${output.length}`,
      at: asDate(row.at),
      action,
      date,
      memberUid,
      memberEmail: asText(row.memberEmail, 220),
      byUid,
      byEmail: asText(row.byEmail, 220),
      before: historySide(row.before),
      after: historySide(row.after),
      source: asText(row.source, 40)
    });
  }
  return output;
}

/** Change or delete an entry: its own member, or the workspace owner (any entry). Same gate as the timer first. */
export function canManageWorkDay(entry: { memberUid: string }, myUid: string, isOwner: boolean, canEditWorkTime: boolean) {
  if (!canEditWorkTime) return false;
  return (Boolean(myUid) && entry.memberUid === myUid) || isOwner;
}

/**
 * The timer's seconds the same member ran on the same calendar day (device-local), shown beside a day entry
 * for information only. It is never added to the day count, and the day count is never added to it.
 */
export function timerSecondsOnDay<T extends { createdByUid: string; startedAt: Date | null }>(
  sessions: T[],
  memberUid: string,
  date: string,
  durationOf: (session: T) => number
) {
  return sessions
    .filter(session => session.createdByUid === memberUid && session.startedAt && localDateKey(session.startedAt) === date)
    .reduce((sum, session) => sum + Math.max(0, durationOf(session)), 0);
}

export function sortWorkDays<T extends { date: string; memberUid: string }>(entries: T[]) {
  return [...entries].sort((first, second) => {
    if (first.date !== second.date) return first.date < second.date ? 1 : -1;
    return first.memberUid.localeCompare(second.memberUid);
  });
}

/** What the card shows right after a tap, before the server's copy arrives. */
export function applyWorkDayPatchLocally(entries: WorkDayDetail[], patch: WorkDayPatch, uid: string, email: string): WorkDayDetail[] {
  const member = patch.memberUid || uid;
  const id = workDayId(member, patch.date);
  if (patch.action === "delete") return entries.filter(entry => entry.id !== id);
  const now = new Date();
  const existing = entries.find(entry => entry.id === id);
  const next: WorkDayDetail = {
    id,
    date: patch.date,
    kind: patch.kind ?? "full_day",
    memberUid: member,
    memberEmail: existing?.memberEmail || email,
    note: (patch.note ?? "").trim().slice(0, 280),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    source: patch.source ?? "web",
    ...(existing ? { updatedByUid: uid, updatedByEmail: email } : {})
  };
  return sortWorkDays([...entries.filter(entry => entry.id !== id), next]);
}
