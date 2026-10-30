// Calendar V1 core — the web port of functions/calendar/calendarCore.js (contract:
// docs/calendar-v1-contract-2026-10-28.md in the app repo, 28 Oct 2026). Keep the two in step:
// scripts/check-calendar-core.mts runs the shared calendar-vectors.json against this file, and the
// Swift (EGGcraft/CalendarCore.swift) and Kotlin (features/calendar/CalendarCore.kt) ports run
// the same vectors.
//
// Pure: no Firestore, no clock unless one is passed in. Dates are "YYYY-MM-DD" keys. An all-day
// entry is a date and never moves with a time zone. A timed entry keeps its wall-clock time
// ("HH:mm") plus the IANA zone it was made in; the instant is worked out from those, so 09:00
// London stays 09:00 London across a clock change. Occurrences of a series are never written down
// ahead: they are produced for the range somebody looks at.

export type CalendarEntryType = "event" | "task" | "note" | "workday" | "unavailable";
export type CalendarVisibility = "private" | "selected" | "workspace";
export type CalendarWorkspaceRole = "view" | "edit";
export type CalendarTaskStatus = "open" | "done" | "cancelled";

export const ENTRY_TYPES: readonly CalendarEntryType[] = ["event", "task", "note", "workday", "unavailable"];
export const VISIBILITIES: readonly CalendarVisibility[] = ["private", "selected", "workspace"];
export const WORKSPACE_ROLES: readonly CalendarWorkspaceRole[] = ["view", "edit"];
export const TASK_STATUSES: readonly CalendarTaskStatus[] = ["open", "done", "cancelled"];
export const REMINDER_OFFSETS: readonly number[] = [0, 15, 60, 1440];
export const DEFAULT_ALL_DAY_REMINDER_TIME = "09:00";
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 8000;
export const LABEL_MAX = 80;
export const SHARE_MAX = 50;
export const MAX_SPAN_DAYS = 62;
const MAX_OCCURRENCES = 1000;
const MAX_GENERATION_DAYS = 20000;
// Content an occurrence may carry of its own ("only this one").
export const EXCEPTION_FIELDS = ["dateKey", "endDateKey", "startTime", "endTime", "allDay", "title", "description", "location", "meetingUrl"] as const;
export type CalendarExceptionField = (typeof EXCEPTION_FIELDS)[number];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86400000;

export type CalendarRecurrence = {
  freq: "daily" | "weekly";
  interval: number;
  byWeekday: number[];
  untilKey: string | null;
  count: number | null;
};

export type CalendarException = {
  cancelled?: boolean;
  dateKey?: string;
  endDateKey?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  title?: string;
  description?: string;
  location?: string;
  meetingUrl?: string;
};

export type CalendarOccurrenceStatus = { status: CalendarTaskStatus; completedAtMs: number | null; completedByUid: string | null };

export type CalendarEntry = {
  id: string;
  rowType: "entry" | "series";
  type: CalendarEntryType;
  title: string;
  description: string;
  allDay: boolean;
  dateKey: string;
  endDateKey: string;
  startTime: string | null;
  endTime: string | null;
  timeZone: string;
  location: string;
  meetingUrl: string;
  status: CalendarTaskStatus;
  completedAtMs: number | null;
  completedByUid: string | null;
  ownerUid: string;
  visibility: CalendarVisibility;
  accessUids: string[];
  editorUids: string[];
  workspaceRole: CalendarWorkspaceRole;
  personUid: string | null;
  personLabel: string | null;
  orderId: string | null;
  recurrence: CalendarRecurrence | null;
  exceptions: Record<string, CalendarException>;
  occurrenceStatus: Record<string, CalendarOccurrenceStatus>;
  splitFromId: string | null;
  version: number;
  createdAtMs: number | null;
  createdByUid: string;
  updatedAtMs: number | null;
  updatedByUid: string | null;
};

export type CalendarOccurrence = {
  occurrenceId: string;
  entryId: string;
  occurrenceKey: string;
  isSeries: boolean;
  isException: boolean;
  moved: boolean;
  type: CalendarEntryType;
  title: string;
  description: string;
  location: string;
  meetingUrl: string;
  allDay: boolean;
  dateKey: string;
  endDateKey: string;
  startTime: string | null;
  endTime: string | null;
  timeZone: string;
  startMs: number | null;
  endMs: number | null;
  status: CalendarTaskStatus | null;
  completedAtMs: number | null;
  completedByUid: string | null;
  ownerUid: string;
  visibility: CalendarVisibility;
  personUid: string | null;
  personLabel: string | null;
  orderId: string | null;
};

type Raw = Record<string, unknown>;

// ---------------------------------------------------------------- date keys

export function parseDateKey(key: unknown): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(String(key || ""));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const back = new Date(Date.UTC(y, m - 1, d));
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isDateKey(key: unknown): key is string {
  return parseDateKey(key) !== null;
}

export function dayNumber(key: string): number {
  const p = parseDateKey(key);
  if (!p) return NaN;
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function keyFromDayNumber(n: number): string {
  const date = new Date(n * DAY_MS);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(key: string, days: number): string {
  return keyFromDayNumber(dayNumber(key) + days);
}

// ISO weekday: Monday 1 … Sunday 7.
export function isoWeekday(key: string): number {
  const n = dayNumber(key);
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

// The first day of the week holding `key`, for a week that starts on `weekStart` (1…7).
export function startOfWeek(key: string, weekStart = 1): string {
  const back = (isoWeekday(key) - weekStart + 7) % 7;
  return addDays(key, -back);
}

export function isTime(value: unknown): value is string {
  return TIME_RE.test(String(value || ""));
}

export function minutesOfTime(value: unknown): number {
  const match = TIME_RE.exec(String(value || ""));
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

// ---------------------------------------------------------------- time zones

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isTimeZone(value: unknown): value is string {
  if (!value || typeof value !== "string") return false;
  try {
    formatterFor(value);
    return true;
  } catch {
    return false;
  }
}

export type LocalParts = { y: number; m: number; d: number; hour: number; minute: number; second: number; dateKey: string; time: string };

// Wall clock in `timeZone` at instant `ms`.
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(ms))) parts[part.type] = part.value;
  const hour = Number(parts.hour) % 24;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${pad(hour)}:${parts.minute}`,
  };
}

// Offset of `timeZone` from UTC at instant `ms`, in minutes (London summer = +60).
export function offsetMinutes(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
  const wholeSecond = Math.floor(ms / 1000) * 1000;
  return Math.round((asUtc - wholeSecond) / 60000);
}

// The instant of a wall-clock time in a zone. A time that happens twice (clocks go back) is the
// first of the two; a time that never happens (clocks go forward) is moved on by the gap, so 01:30
// on the London spring-forward day is 02:30 BST. Same answer as java.time ZonedDateTime.of.
export function zonedTimeToUtcMs(dateKey: string, time: string, timeZone: string): number {
  const p = parseDateKey(dateKey);
  const minutes = minutesOfTime(time);
  if (!p || !Number.isFinite(minutes)) return NaN;
  const local = Date.UTC(p.y, p.m - 1, p.d, Math.floor(minutes / 60), minutes % 60);
  const before = offsetMinutes(local - DAY_MS, timeZone);
  const after = offsetMinutes(local + DAY_MS, timeZone);
  const candidates = [...new Set([local - before * 60000, local - after * 60000])]
    .filter((utc) => offsetMinutes(utc, timeZone) === Math.round((local - utc) / 60000))
    .sort((a, b) => a - b);
  if (candidates.length) return candidates[0];
  return local - before * 60000;
}

/** The device's own IANA zone (falls back to London). */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : "Europe/London";
  } catch {
    return "Europe/London";
  }
}

// ---------------------------------------------------------------- normalising stored rows

function str(value: unknown, max: number): string {
  return String(value === undefined || value === null ? "" : value).trim().slice(0, max);
}

function uidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const uid = str(item, 160);
    if (uid && !out.includes(uid)) out.push(uid);
  }
  return out;
}

export function millis(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRecurrence(raw: unknown): CalendarRecurrence | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const freq = r.freq === "daily" || r.freq === "weekly" ? r.freq : null;
  if (!freq) return null;
  const interval = Math.max(1, Math.min(52, Math.floor(Number(r.interval) || 1)));
  const byWeekday = Array.isArray(r.byWeekday)
    ? [...new Set(r.byWeekday.map((d) => Math.floor(Number(d))).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b)
    : [];
  const untilKey = isDateKey(r.untilKey) ? r.untilKey : null;
  const countRaw = Math.floor(Number(r.count));
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.min(countRaw, 5000) : null;
  return { freq, interval, byWeekday, untilKey, count };
}

// A stored row as the apps read it. Anything malformed falls back to a safe value; a row without a
// valid date or owner is not an entry at all (null).
export function normalizeEntry(id: string, raw: unknown): CalendarEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const dateKey = isDateKey(r.dateKey) ? r.dateKey : null;
  const ownerUid = str(r.ownerUid, 160);
  if (!dateKey || !ownerUid) return null;
  let endDateKey = isDateKey(r.endDateKey) ? r.endDateKey : dateKey;
  if (endDateKey < dateKey) endDateKey = dateKey;
  const type = (ENTRY_TYPES as readonly string[]).includes(String(r.type)) ? (r.type as CalendarEntryType) : "event";
  const allDay = r.allDay !== false || !isTime(r.startTime);
  const recurrence = normalizeRecurrence(r.recurrence);
  const rowType = r.rowType === "series" && recurrence ? "series" : "entry";
  const visibility = (VISIBILITIES as readonly string[]).includes(String(r.visibility)) ? (r.visibility as CalendarVisibility) : "private";
  const accessUids = uidList(r.accessUids);
  if (!accessUids.includes(ownerUid)) accessUids.unshift(ownerUid);
  const editorUids = uidList(r.editorUids).filter((uid) => uid !== ownerUid && accessUids.includes(uid));
  const exceptions: Record<string, CalendarException> = {};
  if (r.exceptions && typeof r.exceptions === "object") {
    for (const [key, value] of Object.entries(r.exceptions as Raw)) {
      if (!isDateKey(key) || !value || typeof value !== "object") continue;
      const v = value as Raw;
      const ex: CalendarException = {};
      if (v.cancelled === true) ex.cancelled = true;
      for (const field of EXCEPTION_FIELDS) {
        if (v[field] === undefined || v[field] === null) continue;
        if ((field === "dateKey" || field === "endDateKey") && !isDateKey(v[field])) continue;
        if ((field === "startTime" || field === "endTime") && !isTime(v[field])) continue;
        if (field === "allDay") ex.allDay = v.allDay === true;
        else (ex as Record<string, unknown>)[field] = String(v[field]);
      }
      exceptions[key] = ex;
    }
  }
  const occurrenceStatus: Record<string, CalendarOccurrenceStatus> = {};
  if (r.occurrenceStatus && typeof r.occurrenceStatus === "object") {
    for (const [key, value] of Object.entries(r.occurrenceStatus as Raw)) {
      if (!isDateKey(key) || !value || typeof value !== "object") continue;
      const v = value as Raw;
      const status = (TASK_STATUSES as readonly string[]).includes(String(v.status)) ? (v.status as CalendarTaskStatus) : "open";
      occurrenceStatus[key] = { status, completedAtMs: millis(v.completedAt), completedByUid: str(v.completedByUid, 160) || null };
    }
  }
  return {
    id: String(id),
    rowType,
    type,
    title: str(r.title, TITLE_MAX),
    description: String(r.description || "").slice(0, DESCRIPTION_MAX),
    allDay,
    dateKey,
    endDateKey,
    startTime: allDay ? null : (r.startTime as string),
    endTime: allDay ? null : (isTime(r.endTime) ? r.endTime : (r.startTime as string)),
    timeZone: isTimeZone(r.timeZone) ? r.timeZone : "Europe/London",
    location: str(r.location, 300),
    meetingUrl: str(r.meetingUrl, 500),
    status: (TASK_STATUSES as readonly string[]).includes(String(r.status)) ? (r.status as CalendarTaskStatus) : "open",
    completedAtMs: millis(r.completedAt),
    completedByUid: str(r.completedByUid, 160) || null,
    ownerUid,
    visibility,
    accessUids,
    editorUids,
    workspaceRole: (WORKSPACE_ROLES as readonly string[]).includes(String(r.workspaceRole)) ? (r.workspaceRole as CalendarWorkspaceRole) : "view",
    personUid: str(r.personUid, 160) || null,
    personLabel: str(r.personLabel, LABEL_MAX) || null,
    orderId: str(r.orderId, 200) || null,
    recurrence: rowType === "series" ? recurrence : null,
    exceptions: rowType === "series" ? exceptions : {},
    occurrenceStatus: rowType === "series" ? occurrenceStatus : {},
    splitFromId: str(r.splitFromId, 200) || null,
    version: Math.max(0, Math.floor(Number(r.version) || 0)),
    createdAtMs: millis(r.createdAt),
    createdByUid: str(r.createdByUid, 160) || ownerUid,
    updatedAtMs: millis(r.updatedAt),
    updatedByUid: str(r.updatedByUid, 160) || null,
  };
}

// ---------------------------------------------------------------- recurrence

function weekdaysOf(entry: CalendarEntry): number[] {
  const r = entry.recurrence;
  if (r && r.byWeekday && r.byWeekday.length) return r.byWeekday;
  return [isoWeekday(entry.dateKey)];
}

function patternHits(entry: CalendarEntry, key: string): boolean {
  const r = entry.recurrence as CalendarRecurrence;
  const offset = dayNumber(key) - dayNumber(entry.dateKey);
  if (offset < 0) return false;
  if (r.freq === "daily") return offset % r.interval === 0;
  if (!weekdaysOf(entry).includes(isoWeekday(key))) return false;
  const weeks = Math.round((dayNumber(startOfWeek(key, 1)) - dayNumber(startOfWeek(entry.dateKey, 1))) / 7);
  return weeks % r.interval === 0;
}

// The generated occurrence keys of a series in [fromKey, toKey], in order, honouring until and
// count. Series start (dateKey) need not be a hit itself.
export function seriesKeys(entry: CalendarEntry, fromKey: string, toKey: string, limit = MAX_OCCURRENCES): string[] {
  const r = entry.recurrence;
  if (!r) return [];
  const out: string[] = [];
  const startN = dayNumber(entry.dateKey);
  let lastN = dayNumber(toKey);
  if (r.untilKey) lastN = Math.min(lastN, dayNumber(r.untilKey));
  lastN = Math.min(lastN, startN + MAX_GENERATION_DAYS);
  const fromN = dayNumber(fromKey);
  let produced = 0;
  for (let n = startN; n <= lastN; n += 1) {
    const key = keyFromDayNumber(n);
    if (!patternHits(entry, key)) continue;
    produced += 1;
    if (r.count && produced > r.count) break;
    if (n >= fromN) {
      out.push(key);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function isSeriesKey(entry: CalendarEntry, key: string): boolean {
  if (!entry.recurrence || !isDateKey(key)) return false;
  return seriesKeys(entry, key, key, 1).length === 1;
}

// The last occurrence key of a bounded series (until or count), or null when open-ended.
export function lastSeriesKey(entry: CalendarEntry): string | null {
  const r = entry.recurrence;
  if (!r) return entry.dateKey;
  if (!r.untilKey && !r.count) return null;
  const to = r.untilKey || addDays(entry.dateKey, MAX_GENERATION_DAYS);
  const keys = seriesKeys(entry, entry.dateKey, to, MAX_GENERATION_DAYS + 1);
  return keys.length ? keys[keys.length - 1] : null;
}

// ---------------------------------------------------------------- occurrences

function makeOccurrence(entry: CalendarEntry, key: string, ex: CalendarException | null): CalendarOccurrence {
  const span = dayNumber(entry.endDateKey) - dayNumber(entry.dateKey);
  const series = entry.rowType === "series";
  const o: CalendarException = ex || {};
  const dateKey = o.dateKey || (series ? key : entry.dateKey);
  let endDateKey = o.endDateKey || (o.dateKey ? addDays(o.dateKey, span) : (series ? addDays(key, span) : entry.endDateKey));
  if (endDateKey < dateKey) endDateKey = dateKey;
  const allDay = o.allDay === undefined ? entry.allDay : o.allDay;
  const startTime = allDay ? null : (o.startTime || entry.startTime);
  const endTime = allDay ? null : (o.endTime || entry.endTime || startTime);
  let status: CalendarTaskStatus = entry.status;
  let completedAtMs = entry.completedAtMs;
  let completedByUid = entry.completedByUid;
  if (series) {
    const s = entry.occurrenceStatus[key];
    status = s ? s.status : "open";
    completedAtMs = s ? s.completedAtMs : null;
    completedByUid = s ? s.completedByUid : null;
  }
  const occ: CalendarOccurrence = {
    occurrenceId: series ? `${entry.id}@${key}` : entry.id,
    entryId: entry.id,
    occurrenceKey: series ? key : entry.dateKey,
    isSeries: series,
    isException: Boolean(ex),
    moved: Boolean(o.dateKey && o.dateKey !== key),
    type: entry.type,
    title: o.title !== undefined ? o.title : entry.title,
    description: o.description !== undefined ? o.description : entry.description,
    location: o.location !== undefined ? o.location : entry.location,
    meetingUrl: o.meetingUrl !== undefined ? o.meetingUrl : entry.meetingUrl,
    allDay,
    dateKey,
    endDateKey,
    startTime,
    endTime,
    timeZone: entry.timeZone,
    startMs: null,
    endMs: null,
    status: entry.type === "task" ? status : null,
    completedAtMs: entry.type === "task" ? completedAtMs : null,
    completedByUid: entry.type === "task" ? completedByUid : null,
    ownerUid: entry.ownerUid,
    visibility: entry.visibility,
    personUid: entry.personUid,
    personLabel: entry.personLabel,
    orderId: entry.orderId,
  };
  if (!allDay) {
    occ.startMs = zonedTimeToUtcMs(dateKey, startTime as string, entry.timeZone);
    occ.endMs = zonedTimeToUtcMs(endDateKey, endTime as string, entry.timeZone);
    if (!((occ.endMs as number) > (occ.startMs as number))) occ.endMs = occ.startMs;
  }
  return occ;
}

function overlaps(occ: CalendarOccurrence, fromKey: string, toKey: string): boolean {
  return occ.dateKey <= toKey && occ.endDateKey >= fromKey;
}

export function compareOccurrences(a: CalendarOccurrence, b: CalendarOccurrence): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const at = a.startMs || 0;
  const bt = b.startMs || 0;
  if (at !== bt) return at - bt;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.occurrenceId < b.occurrenceId ? -1 : a.occurrenceId > b.occurrenceId ? 1 : 0;
}

// Every occurrence of one entry whose dates (in the entry's own zone) touch [fromKey, toKey]. A
// moved occurrence shows on its new date only.
export function expandEntry(entry: CalendarEntry | null, fromKey: string, toKey: string): CalendarOccurrence[] {
  if (!entry) return [];
  if (entry.rowType !== "series") {
    const occ = makeOccurrence(entry, entry.dateKey, null);
    return overlaps(occ, fromKey, toKey) ? [occ] : [];
  }
  const span = dayNumber(entry.endDateKey) - dayNumber(entry.dateKey);
  const out: CalendarOccurrence[] = [];
  for (const key of seriesKeys(entry, addDays(fromKey, -span), toKey)) {
    const ex = entry.exceptions[key];
    if (ex && ex.cancelled) continue;
    if (ex && ex.dateKey && ex.dateKey !== key) continue;
    const occ = makeOccurrence(entry, key, ex || null);
    if (overlaps(occ, fromKey, toKey)) out.push(occ);
  }
  for (const [key, ex] of Object.entries(entry.exceptions)) {
    if (ex.cancelled || !ex.dateKey || ex.dateKey === key) continue;
    if (!isSeriesKey(entry, key)) continue;
    const occ = makeOccurrence(entry, key, ex);
    if (overlaps(occ, fromKey, toKey)) out.push(occ);
  }
  return out.sort(compareOccurrences).slice(0, MAX_OCCURRENCES);
}

export function expandEntries(entries: (CalendarEntry | null)[], fromKey: string, toKey: string): CalendarOccurrence[] {
  const out: CalendarOccurrence[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(...expandEntry(entry, fromKey, toKey));
  }
  return out.sort(compareOccurrences);
}

// The single occurrence `key` of an entry (moved or not), or null when it is not (or no longer) one
// of its dates.
export function occurrenceAt(entry: CalendarEntry | null, key: string): CalendarOccurrence | null {
  if (!entry) return null;
  if (entry.rowType !== "series") return key === entry.dateKey ? makeOccurrence(entry, key, null) : null;
  if (!isSeriesKey(entry, key)) return null;
  const ex = entry.exceptions[key];
  if (ex && ex.cancelled) return null;
  return makeOccurrence(entry, key, ex || null);
}

// The local days (viewer's zone) an occurrence covers. All-day ones keep their dates.
export function occurrenceDays(occ: Pick<CalendarOccurrence, "dateKey" | "endDateKey" | "allDay" | "startMs" | "endMs">, viewerTimeZone: string): string[] {
  let first = occ.dateKey;
  let last = occ.endDateKey;
  if (!occ.allDay && Number.isFinite(occ.startMs)) {
    const startMs = occ.startMs as number;
    first = localParts(startMs, viewerTimeZone).dateKey;
    const endMs = (occ.endMs as number) > startMs ? (occ.endMs as number) - 1 : startMs;
    last = localParts(endMs, viewerTimeZone).dateKey;
  }
  const days: string[] = [];
  for (let n = dayNumber(first); n <= dayNumber(last) && days.length <= MAX_SPAN_DAYS; n += 1) days.push(keyFromDayNumber(n));
  return days;
}

export type CalendarTaskState = "open" | "late" | "done" | "cancelled";

// "late" only for an open task whose planned day is over. Done and cancelled never are.
export function taskState(occ: Pick<CalendarOccurrence, "type" | "status" | "endDateKey">, todayKey: string): CalendarTaskState | null {
  if (occ.type !== "task") return null;
  if (occ.status === "done") return "done";
  if (occ.status === "cancelled") return "cancelled";
  return occ.endDateKey < todayKey ? "late" : "open";
}

// ---------------------------------------------------------------- access

export type CalendarMember = { role: string; isWorkspaceOwner: boolean };
export type CalendarAccess = { read: boolean; edit: boolean; remove: boolean; share: boolean; setStatus: boolean };

// The rules (firestore.rules, calendarEntries) are the authority; this mirrors them so a screen
// never offers what the server will refuse.
export function entryAccess(entry: CalendarEntry | null, uid: string, member: CalendarMember | null): CalendarAccess {
  const none = { read: false, edit: false, remove: false, share: false, setStatus: false };
  if (!entry || !uid || !member) return none;
  const isOwner = entry.ownerUid === uid;
  const role = member.isWorkspaceOwner ? "owner" : String(member.role || "");
  const canWriteWorkspace = role === "owner" || role === "admin" || role === "member";
  const read = isOwner || entry.accessUids.includes(uid) || entry.visibility === "workspace";
  if (!read) return none;
  const edit = isOwner
    || (role !== "viewer" && entry.editorUids.includes(uid))
    || (entry.visibility === "workspace" && entry.workspaceRole === "edit" && canWriteWorkspace);
  const setStatus = entry.type === "task" && (edit || (entry.personUid === uid && role !== "viewer"));
  return { read, edit, remove: isOwner, share: isOwner, setStatus };
}

export type CalendarSharingInput = {
  ownerUid: string;
  visibility: CalendarVisibility;
  viewerUids?: string[];
  editorUids?: string[];
  workspaceRole?: string;
  personUid?: string | null;
  type?: CalendarEntryType;
};
export type CalendarSharing = { visibility: CalendarVisibility; accessUids: string[]; editorUids: string[]; workspaceRole: CalendarWorkspaceRole; addedForPerson: boolean };

// Who a new or changed entry is shared with; the form shows exactly this list.
export function sharingFor({ ownerUid, visibility, viewerUids = [], editorUids = [], workspaceRole = "view", personUid = null, type = "event" }: CalendarSharingInput): CalendarSharing {
  const owner = str(ownerUid, 160);
  if (visibility === "private") {
    return { visibility: "private", accessUids: [owner], editorUids: [], workspaceRole: "view", addedForPerson: false };
  }
  const editors = uidList(editorUids).filter((uid) => uid !== owner);
  const viewers = uidList(viewerUids).filter((uid) => uid !== owner && !editors.includes(uid));
  const access = [owner, ...editors, ...viewers];
  let addedForPerson = false;
  // A task's assignee must be able to see it; the form says so before saving.
  if (type === "task" && personUid && visibility === "selected" && !access.includes(personUid)) {
    access.push(personUid);
    addedForPerson = true;
  }
  return {
    visibility: visibility === "workspace" ? "workspace" : "selected",
    accessUids: access.slice(0, SHARE_MAX),
    editorUids: editors.slice(0, SHARE_MAX),
    workspaceRole: visibility === "workspace" && workspaceRole === "edit" ? "edit" : "view",
    addedForPerson,
  };
}

export type CalendarDraftLike = {
  type: string;
  title?: string;
  description?: string;
  dateKey: string;
  endDateKey?: string;
  allDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  timeZone?: string;
  personUid?: string | null;
  personLabel?: string | null;
  recurrence?: unknown;
  visibility?: string;
  ownerUid?: string;
  accessUids?: string[];
};

// A task can be assigned only to somebody who will see it.
export function assigneeCanSee(entryLike: CalendarDraftLike): boolean {
  if (entryLike.type !== "task" || !entryLike.personUid) return true;
  if (entryLike.visibility === "workspace") return true;
  if (entryLike.visibility === "private") return entryLike.personUid === entryLike.ownerUid;
  return (entryLike.accessUids || []).includes(entryLike.personUid);
}

// ---------------------------------------------------------------- validation (form + rules mirror)

export function validateDraft(d: CalendarDraftLike): string[] {
  const errors: string[] = [];
  if (!(ENTRY_TYPES as readonly string[]).includes(d.type)) errors.push("type");
  if (d.type !== "note" && !str(d.title, TITLE_MAX)) errors.push("title");
  if (d.type === "note" && !str(d.description, DESCRIPTION_MAX) && !str(d.title, TITLE_MAX)) errors.push("noteText");
  if (!isDateKey(d.dateKey)) errors.push("date");
  const end = d.endDateKey || d.dateKey;
  if (!isDateKey(end) || end < d.dateKey) errors.push("endDate");
  else if (dayNumber(end) - dayNumber(d.dateKey) > MAX_SPAN_DAYS) errors.push("span");
  if (!d.allDay) {
    if (!isTime(d.startTime)) errors.push("startTime");
    if (!isTime(d.endTime)) errors.push("endTime");
    else if (end === d.dateKey && minutesOfTime(d.endTime) <= minutesOfTime(d.startTime)) errors.push("endTime");
    if (!isTimeZone(d.timeZone)) errors.push("timeZone");
  }
  if ((d.type === "workday" || d.type === "unavailable") && !d.personUid && !str(d.personLabel, LABEL_MAX)) errors.push("person");
  if (d.recurrence) {
    const r = normalizeRecurrence(d.recurrence);
    if (!r) errors.push("recurrence");
    else {
      if (r.untilKey && r.untilKey < d.dateKey) errors.push("until");
      if (r.freq === "weekly" && !r.byWeekday.length) errors.push("weekdays");
    }
  }
  if (!assigneeCanSee(d)) errors.push("assigneeAccess");
  return errors;
}

// A daily note's short title: its first line, at most 60 characters.
export function autoNoteTitle(textValue: unknown): string {
  const first = String(textValue || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  return first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first;
}

// ---------------------------------------------------------------- series edits

export type CalendarChanges = Partial<Record<CalendarExceptionField, string | boolean | null>> & { recurrence?: Partial<CalendarRecurrence> };

// "Only this one": the patch for exceptions.<key>.
export function onlyThisPatch(entry: CalendarEntry, key: string, changes: CalendarChanges): CalendarException {
  const current = entry.exceptions[key] || {};
  const next: Record<string, unknown> = { ...current };
  for (const field of EXCEPTION_FIELDS) {
    if (changes[field] === undefined) continue;
    next[field] = changes[field];
  }
  if (next.dateKey === key && !next.endDateKey) delete next.dateKey;
  return next as CalendarException;
}

export type CalendarSplit =
  | { mode: "whole" }
  | {
      mode: "split";
      newId: string;
      old: { recurrence: CalendarRecurrence; exceptions: Record<string, CalendarException>; occurrenceStatus: Record<string, CalendarOccurrenceStatus> };
      next: {
        dateKey: string;
        endDateKey: string;
        recurrence: CalendarRecurrence;
        exceptions: Record<string, CalendarException>;
        occurrenceStatus: Record<string, CalendarOccurrenceStatus>;
        splitFromId: string;
      };
    };

// "This and following" from `key`. { mode: "whole" } when key is the first occurrence (edit the
// series itself). Past completions and notes stay on the old series. Per-occurrence moves,
// cancellations and completions from `key` on move to the new series, minus the fields this edit
// sets for all of them.
export function splitSeries(entry: CalendarEntry, key: string, changes: CalendarChanges): CalendarSplit {
  const r = entry.recurrence as CalendarRecurrence;
  const first = seriesKeys(entry, entry.dateKey, r.untilKey || addDays(entry.dateKey, MAX_GENERATION_DAYS), 1)[0];
  if (!first || key <= first) return { mode: "whole" };
  const before = seriesKeys(entry, entry.dateKey, addDays(key, -1), MAX_GENERATION_DAYS + 1).length;
  const oldRecurrence: CalendarRecurrence = { ...r, untilKey: addDays(key, -1), count: null };
  const newRecurrence: CalendarRecurrence = { ...r, ...(changes.recurrence || {}) };
  if (!changes.recurrence) {
    newRecurrence.count = r.count ? Math.max(1, r.count - before) : null;
    newRecurrence.untilKey = r.untilKey;
  }
  const changed = new Set(Object.keys(changes));
  const carriedExceptions: Record<string, CalendarException> = {};
  const keptExceptions: Record<string, CalendarException> = {};
  for (const [k, ex] of Object.entries(entry.exceptions)) {
    if (k < key) {
      keptExceptions[k] = ex;
      continue;
    }
    const carried: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(ex)) {
      if (field === "cancelled") carried.cancelled = value;
      else if ((field === "startTime" || field === "endTime" || field === "allDay") && (changed.has("startTime") || changed.has("endTime") || changed.has("allDay"))) continue;
      else if (!changed.has(field)) carried[field] = value;
    }
    if (Object.keys(carried).length) carriedExceptions[k] = carried as CalendarException;
  }
  const carriedStatus: Record<string, CalendarOccurrenceStatus> = {};
  const keptStatus: Record<string, CalendarOccurrenceStatus> = {};
  for (const [k, s] of Object.entries(entry.occurrenceStatus)) {
    if (k < key) keptStatus[k] = s;
    else carriedStatus[k] = s;
  }
  const span = dayNumber(entry.endDateKey) - dayNumber(entry.dateKey);
  const nextDate = (changes.dateKey as string | undefined) || key;
  return {
    mode: "split",
    newId: `${entry.id}_s${key.replace(/-/g, "")}`,
    old: { recurrence: oldRecurrence, exceptions: keptExceptions, occurrenceStatus: keptStatus },
    next: {
      dateKey: nextDate,
      endDateKey: (changes.endDateKey as string | undefined) || addDays(nextDate, span),
      recurrence: newRecurrence,
      exceptions: carriedExceptions,
      occurrenceStatus: carriedStatus,
      splitFromId: entry.id,
    },
  };
}

export type CalendarEndBefore =
  | { mode: "deleteAll" }
  | { mode: "end"; recurrence: CalendarRecurrence; exceptions: Record<string, CalendarException>; occurrenceStatus: Record<string, CalendarOccurrenceStatus> };

// Delete "this and following": the old series ends the day before (whole delete when key is the
// first occurrence).
export function endSeriesBefore(entry: CalendarEntry, key: string): CalendarEndBefore {
  const r = entry.recurrence as CalendarRecurrence;
  const first = seriesKeys(entry, entry.dateKey, r.untilKey || addDays(entry.dateKey, MAX_GENERATION_DAYS), 1)[0];
  if (!first || key <= first) return { mode: "deleteAll" };
  const exceptions: Record<string, CalendarException> = {};
  for (const [k, ex] of Object.entries(entry.exceptions)) if (k < key) exceptions[k] = ex;
  const occurrenceStatus: Record<string, CalendarOccurrenceStatus> = {};
  for (const [k, s] of Object.entries(entry.occurrenceStatus)) if (k < key) occurrenceStatus[k] = s;
  return { mode: "end", recurrence: { ...r, untilKey: addDays(key, -1), count: null }, exceptions, occurrenceStatus };
}

// ---------------------------------------------------------------- reminders

export type CalendarReminder = { offsetMinutes: number; allDayTime: string; timeZone: string | null };

export function normalizeReminder(raw: unknown): CalendarReminder | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const offset = Math.floor(Number(r.offsetMinutes));
  if (!REMINDER_OFFSETS.includes(offset)) return null;
  return {
    offsetMinutes: offset,
    allDayTime: isTime(r.allDayTime) ? r.allDayTime : DEFAULT_ALL_DAY_REMINDER_TIME,
    timeZone: isTimeZone(r.timeZone) ? r.timeZone : null,
  };
}

// When the reminder for one occurrence goes off. A timed occurrence counts back from its start; an
// all-day one from the reminder's own time on its date, in the zone the person set it in.
export function reminderFireMs(occ: CalendarOccurrence | null, reminder: CalendarReminder | null): number {
  if (!occ || !reminder) return NaN;
  const offset = reminder.offsetMinutes * 60000;
  if (!occ.allDay && Number.isFinite(occ.startMs)) return (occ.startMs as number) - offset;
  const zone = reminder.timeZone || occ.timeZone || "Europe/London";
  return zonedTimeToUtcMs(occ.dateKey, reminder.allDayTime || DEFAULT_ALL_DAY_REMINDER_TIME, zone) - offset;
}

export function reminderSuppressed(occ: CalendarOccurrence): boolean {
  return occ.type === "task" && (occ.status === "done" || occ.status === "cancelled");
}

// The first reminder at or after `afterMs` for this entry.
export function nextReminder(entry: CalendarEntry | null, reminder: CalendarReminder | null, afterMs: number, horizonDays = 400): { occurrenceKey: string; fireMs: number } | null {
  if (!entry || !reminder) return null;
  const zone = reminder.timeZone || entry.timeZone || "Europe/London";
  const fromKey = addDays(localParts(afterMs, zone).dateKey, -2);
  const toKey = addDays(fromKey, horizonDays + 4);
  for (const occ of expandEntry(entry, fromKey, toKey)) {
    if (reminderSuppressed(occ)) continue;
    const fireMs = reminderFireMs(occ, reminder);
    if (Number.isFinite(fireMs) && fireMs >= afterMs) return { occurrenceKey: occ.occurrenceKey, fireMs };
  }
  return null;
}

export type CalendarReminderDecision = { action: "send" | "reschedule" | "drop"; next: { occurrenceKey: string; fireMs: number } | null };

// At send time: is the reminder stored for (key, fireMs) still the right one? (Server use; kept
// here so the vectors pin one answer everywhere.)
export function reminderDecision(entry: CalendarEntry, reminder: CalendarReminder, key: string, fireMs: number, nowMs: number): CalendarReminderDecision {
  const occ = occurrenceAt(entry, key);
  const next = () => nextReminder(entry, reminder, Math.max(nowMs, fireMs + 1));
  if (!occ || reminderSuppressed(occ)) return { action: "drop", next: next() };
  const expected = reminderFireMs(occ, reminder);
  if (expected !== fireMs) {
    if (expected > nowMs) return { action: "reschedule", next: { occurrenceKey: key, fireMs: expected } };
    return { action: "drop", next: next() };
  }
  if (fireMs > nowMs) return { action: "reschedule", next: { occurrenceKey: key, fireMs } };
  const zone = reminder.timeZone || occ.timeZone;
  const latest = occ.allDay
    ? zonedTimeToUtcMs(addDays(occ.endDateKey, 1), "00:00", zone)
    : Math.max(occ.endMs || 0, (occ.startMs || 0) + 15 * 60000);
  if (nowMs > latest) return { action: "drop", next: next() };
  return { action: "send", next: next() };
}

export function reminderInboxId(uid: string, entryId: string, key: string, fireMs: number): string {
  return `${uid}_${entryId}_${key.replace(/-/g, "")}_${Math.floor(fireMs / 60000)}`;
}
