// One reminder list for Notes, Calendar, Schedule, Home and the order card (7 Nov 2026, owner: "hepsi birbiriyle
// bağlantılı olmalı"). Pure functions, no Firebase: scripts/check-reminder-core.mts runs them against
// scripts/reminders/reminder-vectors.json, and the Swift / Kotlin copies are pinned by the same file.
//
// Nothing is copied or moved. Each reminder keeps its one home:
//   - a note's reminder lives on the note (personal_notes/{uid}/notes/{id}.reminderDate, + reminderAllDay);
//   - an order's Schedule & Alerts item lives on the order (customFields.__scheduleAlertItemsV1, a JSON string);
//   - a calendar reminder is the person's calendarReminders row on a calendar entry.
// Every screen builds the SAME list from those homes, and every row opens the home to edit it, so a change made
// anywhere shows everywhere.
//
// Time rules (reminderAllDay comes from the note document's `reminderMode: {atMs, allDay}`, see
// resolveReminderAllDay: it counts only while atMs is the stored reminder, so an older app that moves the reminder and
// leaves reminderMode behind can never turn its new time into an all-day one):
//   - reminderAllDay === true  → the day of the stored instant in the viewer's zone, no time (new writes store local noon);
//   - reminderAllDay === false → the stored instant;
//   - no flag (written before 7 Nov 2026) → an instant at exactly UTC midnight is a date-only reminder from the Android
//     app or the older web (they stored the picked day as UTC midnight): that UTC day, no time. Anything else is the
//     instant (the iPhone/Mac always stored a real time).
import * as core from "./calendarCore";

export type ReminderKind = "note" | "order" | "calendar";

export type ReminderNoteInput = {
  id: string;
  title: string;
  text: string;
  reminderMs: number | null;
  reminderAllDay?: boolean | null;
  isDeleted?: boolean;
  isArchived?: boolean;
  linkedOrderId?: string | null;
  linkedOrderLabel?: string | null;
};

export type ReminderOrderInput = {
  id: string;
  /** "Customer · Design" as the order list shows it. */
  label: string;
  customFields?: Record<string, string> | null;
};

/** A calendar entry the person set a reminder on, at its next occurrence (calendarReminders.nextOccurrenceKey). */
export type ReminderCalendarInput = {
  entryId: string;
  title: string;
  type: string;
  allDay: boolean;
  /** The day the occurrence happens, YYYY-MM-DD (for a moved occurrence of a series: the day it was moved to). */
  occurrenceKey: string;
  startTime: string | null;
  /** The entry's own zone (a timed entry's wall clock is in it). */
  timeZone: string;
  orderId: string | null;
};

export type ReminderItem = {
  /** Stable across platforms: note:<id> · order:<orderId>:<itemId> · calendar:<entryId>:<occurrenceKey>. */
  key: string;
  kind: ReminderKind;
  title: string;
  /** The order label for order items and linked notes, "" otherwise. */
  orderLabel: string;
  dueMs: number;
  allDay: boolean;
  /** YYYY-MM-DD in the viewer's zone (all-day: the reminder's own day). */
  dayKey: string;
  /** HH:mm in the viewer's zone, null when all-day. */
  time: string | null;
  overdue: boolean;
  noteId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  entryId: string | null;
  occurrenceKey: string | null;
  priority: string | null;
};

export const ORDER_SCHEDULE_KEY = "__scheduleAlertItemsV1";
const SWIFT_REFERENCE_SECONDS = 978307200;
const DAY_MS = 86400000;

/** An order item's dueAt as stored by every writer: Swift seconds since 2001 (Apple + server), Unix ms, or a date
 *  string. Same reading as the server's parseSwiftDate. */
export function parseOrderDue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const unixSeconds = raw > 2000000000 ? raw / 1000 : raw + SWIFT_REFERENCE_SECONDS;
    return Math.round(unixSeconds * 1000);
  }
  if (typeof raw === "string" && raw.trim()) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(raw.trim())) return parseOrderDue(numeric);
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** The note document's `reminderMode` read against its reminder: true/false only while `atMs` is that reminder
 *  (to the millisecond, rounded: the Apple apps store finer than ms), null otherwise (= the legacy reading). */
export function resolveReminderAllDay(reminderMs: number | null, mode: unknown): boolean | null {
  if (reminderMs == null || !Number.isFinite(reminderMs) || !mode || typeof mode !== "object") return null;
  const m = mode as { atMs?: unknown; allDay?: unknown };
  if (typeof m.atMs !== "number" || typeof m.allDay !== "boolean") return null;
  return Math.round(m.atMs) === Math.round(reminderMs) ? m.allDay : null;
}

/** What a client writes next to reminderDate. `timeZone` (stage B) tells the server where 09:00 of an all-day reminder is;
 *  reading ignores it. */
export function reminderModeFor(reminderMs: number | null, allDay: boolean, timeZone?: string): { atMs: number; allDay: boolean; timeZone?: string } | null {
  if (reminderMs == null || !Number.isFinite(reminderMs)) return null;
  return timeZone && core.isTimeZone(timeZone) ? { atMs: Math.round(reminderMs), allDay, timeZone } : { atMs: Math.round(reminderMs), allDay };
}

/** Is the stored reminder date-only? See the time rules at the top. */
export function noteReminderIsAllDay(ms: number, flag: boolean | null | undefined): boolean {
  if (flag === true) return true;
  if (flag === false) return false;
  return Number.isFinite(ms) && ms % DAY_MS === 0;
}

/** The day a date-only reminder belongs to. One stored at exactly UTC midnight (the Android app and the older web,
 *  also once a newer screen has saved such a note with its all-day mode) is that UTC day, as its writer picked it;
 *  any other (new writes: local noon, which never crosses a day) is the stored instant's day where the viewer is. */
export function noteReminderDayKey(ms: number, _flag: boolean | null | undefined, viewerTimeZone: string): string {
  if (ms % DAY_MS === 0) return new Date(ms).toISOString().slice(0, 10);
  return core.localParts(ms, viewerTimeZone).dateKey;
}

/** Where a date-only reminder sorts: the start of its day in the viewer's zone. */
function dayStartMs(dayKey: string, viewerTimeZone: string): number {
  return core.zonedTimeToUtcMs(dayKey, "00:00", viewerTimeZone);
}

/** The instant to store for a date-only reminder picked as YYYY-MM-DD: local noon in the writer's zone, so that older
 *  apps (which show the stored instant's date) show the same day in every zone from UTC−11 to UTC+11. */
export function allDayStorageMs(dayKey: string, timeZone: string): number {
  return core.zonedTimeToUtcMs(dayKey, "12:00", timeZone);
}

export function noteReminderItem(note: ReminderNoteInput, nowMs: number, viewerTimeZone: string): ReminderItem | null {
  const ms = note.reminderMs;
  if (ms == null || !Number.isFinite(ms) || note.isDeleted || note.isArchived) return null;
  const allDay = noteReminderIsAllDay(ms, note.reminderAllDay);
  const todayKey = core.localParts(nowMs, viewerTimeZone).dateKey;
  const dayKey = allDay ? noteReminderDayKey(ms, note.reminderAllDay, viewerTimeZone) : core.localParts(ms, viewerTimeZone).dateKey;
  const title = (note.title || "").trim() || core.autoNoteTitle(note.text || "") || "Note";
  return {
    key: `note:${note.id}`,
    kind: "note",
    title,
    orderLabel: note.linkedOrderId ? String(note.linkedOrderLabel || "") : "",
    dueMs: allDay ? dayStartMs(dayKey, viewerTimeZone) : ms,
    allDay,
    dayKey,
    time: allDay ? null : core.localParts(ms, viewerTimeZone).time,
    overdue: allDay ? dayKey < todayKey : ms < nowMs,
    noteId: note.id,
    orderId: note.linkedOrderId ? String(note.linkedOrderId) : null,
    orderItemId: null,
    entryId: null,
    occurrenceKey: null,
    priority: null,
  };
}

type RawOrderItem = { id?: unknown; title?: unknown; dueAt?: unknown; status?: unknown; completedAt?: unknown; priority?: unknown };

/** The open Schedule & Alerts items of one order (done ones and ones without a usable date are left out). Each item is
 *  read on its own, so one bad item never hides the others. */
export function orderReminderItems(order: ReminderOrderInput, nowMs: number, viewerTimeZone: string): ReminderItem[] {
  const raw = order.customFields?.[ORDER_SCHEDULE_KEY];
  if (!raw) return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(decoded)) return [];
  const out: ReminderItem[] = [];
  decoded.forEach((value, index) => {
    if (!value || typeof value !== "object") return;
    const item = value as RawOrderItem;
    if (String(item.status || "Pending") === "Done") return;
    if (item.completedAt !== undefined && item.completedAt !== null && item.completedAt !== "") return;
    const dueMs = parseOrderDue(item.dueAt);
    if (dueMs == null) return;
    const itemId = typeof item.id === "string" && item.id ? item.id : `index-${index}`;
    const parts = core.localParts(dueMs, viewerTimeZone);
    out.push({
      key: `order:${order.id}:${itemId}`,
      kind: "order",
      title: String(item.title || "").trim() || "Reminder",
      orderLabel: order.label,
      dueMs,
      allDay: false,
      dayKey: parts.dateKey,
      time: parts.time,
      overdue: dueMs < nowMs,
      noteId: null,
      orderId: order.id,
      orderItemId: itemId,
      entryId: null,
      occurrenceKey: null,
      priority: typeof item.priority === "string" && item.priority ? item.priority : "Normal",
    });
  });
  return out;
}

export function calendarReminderItem(row: ReminderCalendarInput, nowMs: number, viewerTimeZone: string, orderLabels: Map<string, string> = new Map()): ReminderItem | null {
  if (!core.isDateKey(row.occurrenceKey)) return null;
  const timed = !row.allDay && core.isTime(row.startTime);
  const zone = core.isTimeZone(row.timeZone) ? row.timeZone : viewerTimeZone;
  const todayKey = core.localParts(nowMs, viewerTimeZone).dateKey;
  const dueMs = timed ? core.zonedTimeToUtcMs(row.occurrenceKey, row.startTime as string, zone) : dayStartMs(row.occurrenceKey, viewerTimeZone);
  const parts = core.localParts(dueMs, viewerTimeZone);
  const dayKey = timed ? parts.dateKey : row.occurrenceKey;
  return {
    key: `calendar:${row.entryId}:${row.occurrenceKey}`,
    kind: "calendar",
    title: String(row.title || "").trim() || "Calendar entry",
    orderLabel: row.orderId ? orderLabels.get(row.orderId) || "" : "",
    dueMs,
    allDay: !timed,
    dayKey,
    time: timed ? parts.time : null,
    overdue: timed ? dueMs < nowMs : dayKey < todayKey,
    noteId: null,
    orderId: row.orderId || null,
    orderItemId: null,
    entryId: row.entryId,
    occurrenceKey: row.occurrenceKey,
    priority: null,
  };
}

const KIND_ORDER: Record<ReminderKind, number> = { note: 0, order: 1, calendar: 2 };

export function compareReminders(a: ReminderItem, b: ReminderItem): number {
  if (a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export type ReminderSources = {
  notes?: ReminderNoteInput[];
  orders?: ReminderOrderInput[];
  calendar?: ReminderCalendarInput[];
  nowMs: number;
  viewerTimeZone: string;
};

/** Every open reminder this person can see, soonest first (overdue ones are the earliest, so they lead). */
export function buildReminders(sources: ReminderSources): ReminderItem[] {
  const { nowMs, viewerTimeZone } = sources;
  const labels = new Map((sources.orders || []).map((o) => [o.id, o.label] as const));
  const items: ReminderItem[] = [];
  for (const note of sources.notes || []) {
    const item = noteReminderItem(note, nowMs, viewerTimeZone);
    if (item) {
      if (item.orderId && !item.orderLabel) item.orderLabel = labels.get(item.orderId) || "";
      items.push(item);
    }
  }
  for (const order of sources.orders || []) items.push(...orderReminderItems(order, nowMs, viewerTimeZone));
  for (const row of sources.calendar || []) {
    const item = calendarReminderItem(row, nowMs, viewerTimeZone, labels);
    if (item) items.push(item);
  }
  return items.sort(compareReminders);
}

/** Only the ones linked to one order (the order card's "linked reminders"). */
export function remindersForOrder(items: ReminderItem[], orderId: string): ReminderItem[] {
  return items.filter((item) => item.orderId === orderId);
}

/** The order label every screen uses: "Customer · Design" (a design called "Untitled design" is left out). */
export function orderReminderLabel(customerName: string, designName: string): string {
  const customer = String(customerName || "").trim();
  const design = String(designName || "").trim();
  if (!design || design === "Untitled design") return customer;
  return customer ? `${customer} · ${design}` : design;
}

/**
 * Where a reminder's bell row or push opens (stage B, server type "reminder"; one rule on every platform): a note → that
 * note, an order reminder → the order on its Schedule & Alerts card, a calendar reminder → that day with the entry open.
 * public/firebase-messaging-sw.js builds the same links for a push drawn by the browser.
 */
export function reminderNotificationHref(row: { reminderKind?: string | null; noteId?: string | null; orderId?: string | null; entryId?: string | null; dateKey?: string | null }): string {
  const kind = String(row.reminderKind || "").trim();
  const noteId = String(row.noteId || "").trim();
  const orderId = String(row.orderId || "").trim();
  const entryId = String(row.entryId || "").trim();
  const dateKey = String(row.dateKey || "").trim();
  if (kind === "note" && noteId) return `/notes?note=${encodeURIComponent(noteId)}`;
  if (kind === "calendar") return core.isDateKey(dateKey) ? `/calendar?date=${dateKey}${entryId ? `&entry=${encodeURIComponent(entryId)}` : ""}` : "/calendar";
  if (orderId) return `/orders?${new URLSearchParams({ orderId, focus: "schedule" }).toString()}`;
  return noteId ? `/notes?note=${encodeURIComponent(noteId)}` : "/notes";
}
