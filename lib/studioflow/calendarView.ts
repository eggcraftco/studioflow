// Calendar V1 — what the /calendar screen shows, as pure functions (scripts/check-calendar-view.mts).
//
// Three sources, one list of items:
//   - calendar entries (lib/studioflow/calendarData.ts) expanded into occurrences for the range;
//   - order due dates, read from the orders this person can already open (loadScheduleOrders follows
//     Workflow Only / assigned-only scope). Nothing is copied into the calendar: the card is the order's
//     own date (paymentDate + deliveryTime days; deliveryTime 0 means the order has no due date);
//   - the person's OWN notes that carry a reminder date (their personal_notes; nobody else's).
// Filters only hide items; they never decide who may read anything (the rules do).
import * as core from "./calendarCore";
import type { CalendarEntry, CalendarEntryType, CalendarOccurrence, CalendarTaskState } from "./calendarCore";

export type CalendarItemKind = CalendarEntryType | "orderDue" | "noteReminder";
export type CalendarScope = "mine" | "shared" | "team";

export type CalendarItem = {
  id: string;
  kind: CalendarItemKind;
  title: string;
  subtitle: string;
  days: string[];
  allDay: boolean;
  startMs: number | null;
  endMs: number | null;
  occurrence: CalendarOccurrence | null;
  entry: CalendarEntry | null;
  orderId: string | null;
  noteId: string | null;
  taskState: CalendarTaskState | null;
  scope: CalendarScope;
  personUid: string | null;
  personLabel: string | null;
  /** Viewer-local day a task was ticked done, when it differs from the planned day. */
  completedDay: string | null;
  readOnly: boolean;
};

export type CalendarOrderLike = {
  id: string;
  title: string;
  customerName: string;
  paymentDate: Date | null;
  deliveryTime: number;
  isDelivered: boolean;
};

export type CalendarNoteLike = { id: string; title: string; text: string; reminderMs: number | null; isDeleted?: boolean; isArchived?: boolean };

export function localDayKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** An order's due day: the local day it was started plus deliveryTime calendar days. 0 = no due date. */
export function orderDueDayKey(order: Pick<CalendarOrderLike, "paymentDate" | "deliveryTime">): string | null {
  if (!order.paymentDate || !(order.deliveryTime > 0)) return null;
  return core.addDays(localDayKey(order.paymentDate), Math.floor(order.deliveryTime));
}

function scopeOf(entry: CalendarEntry, uid: string): CalendarScope {
  if (entry.ownerUid === uid) return "mine";
  if (entry.accessUids.includes(uid)) return "shared";
  return "team";
}

export type BuildInput = {
  entries: CalendarEntry[];
  orders: CalendarOrderLike[];
  notes: CalendarNoteLike[];
  uid: string;
  fromKey: string;
  toKey: string;
  viewerTimeZone: string;
  todayKey: string;
};

export function buildCalendarItems(input: BuildInput): CalendarItem[] {
  const { uid, fromKey, toKey, viewerTimeZone, todayKey } = input;
  const items: CalendarItem[] = [];
  const expandFrom = core.addDays(fromKey, -(core.MAX_SPAN_DAYS + 2));
  const occurrences = core.expandEntries(input.entries, expandFrom, core.addDays(toKey, 2));
  // A task done inside the range whose planned day is older than the expanded window (calendarData finds it by
  // `completedAt`, however long ago it was planned): that one occurrence, shown on the day it was done.
  const expanded = new Set(occurrences.map((o) => o.occurrenceId));
  for (const entry of input.entries) {
    if (entry.type !== "task") continue;
    const keys = entry.rowType === "series"
      ? Object.entries(entry.occurrenceStatus).filter(([key, st]) => key < expandFrom && st.status === "done" && st.completedAtMs).map(([key]) => key)
      : entry.endDateKey < expandFrom && entry.status === "done" && entry.completedAtMs ? [entry.dateKey] : [];
    for (const key of keys) {
      const occ = core.occurrenceAt(entry, key);
      if (occ && !expanded.has(occ.occurrenceId)) {
        occurrences.push(occ);
        expanded.add(occ.occurrenceId);
      }
    }
  }
  // Expand wider than the range: a timed entry in another zone may land a day either side.
  for (const occ of occurrences) {
    const entry = input.entries.find((e) => e.id === occ.entryId) || null;
    if (!entry) continue;
    const days = core.occurrenceDays(occ, viewerTimeZone).filter((d) => d >= fromKey && d <= toKey);
    const completedDay = occ.type === "task" && occ.status === "done" && occ.completedAtMs
      ? core.localParts(occ.completedAtMs, viewerTimeZone).dateKey
      : null;
    const plannedVisible = days.length > 0;
    const completionVisible = Boolean(completedDay && completedDay >= fromKey && completedDay <= toKey && !days.includes(completedDay));
    if (!plannedVisible && !completionVisible) continue;
    items.push({
      id: occ.occurrenceId,
      kind: occ.type,
      title: occ.title || (occ.type === "note" ? core.autoNoteTitle(occ.description) : ""),
      subtitle: occ.personLabel || "",
      days,
      allDay: occ.allDay,
      startMs: occ.startMs,
      endMs: occ.endMs,
      occurrence: occ,
      entry,
      orderId: occ.orderId,
      noteId: null,
      taskState: core.taskState(occ, todayKey),
      scope: scopeOf(entry, uid),
      personUid: occ.personUid,
      personLabel: occ.personLabel,
      completedDay: completedDay && completedDay !== occ.endDateKey && completedDay !== occ.dateKey ? completedDay : null,
      readOnly: false,
    });
  }
  for (const order of input.orders) {
    const due = orderDueDayKey(order);
    if (!due || due < fromKey || due > toKey) continue;
    items.push({
      id: `order:${order.id}`,
      kind: "orderDue",
      title: order.title,
      subtitle: order.customerName,
      days: [due],
      allDay: true,
      startMs: null,
      endMs: null,
      occurrence: null,
      entry: null,
      orderId: order.id,
      noteId: null,
      taskState: null,
      scope: "team",
      personUid: null,
      personLabel: null,
      completedDay: null,
      readOnly: true,
    });
  }
  for (const note of input.notes) {
    if (!note.reminderMs || note.isDeleted || note.isArchived) continue;
    const day = core.localParts(note.reminderMs, viewerTimeZone).dateKey;
    if (day < fromKey || day > toKey) continue;
    items.push({
      id: `note:${note.id}`,
      kind: "noteReminder",
      title: note.title.trim() || core.autoNoteTitle(note.text),
      subtitle: "",
      days: [day],
      allDay: false,
      startMs: note.reminderMs,
      endMs: note.reminderMs,
      occurrence: null,
      entry: null,
      orderId: null,
      noteId: note.id,
      taskState: null,
      scope: "mine",
      personUid: null,
      personLabel: null,
      completedDay: null,
      readOnly: true,
    });
  }
  return items.sort(compareItems);
}

export function compareItems(a: CalendarItem, b: CalendarItem): number {
  const ad = a.days[0] || a.completedDay || "";
  const bd = b.days[0] || b.completedDay || "";
  if (ad !== bd) return ad < bd ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const at = a.startMs || 0;
  const bt = b.startMs || 0;
  if (at !== bt) return at - bt;
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------- filters and search

export type CalendarFilters = {
  mine: boolean;
  shared: boolean;
  team: boolean;
  /** "" anyone, "uid:<uid>" a member, "label:<text>" a name label. */
  person: string;
  /** Empty = every type. */
  types: CalendarItemKind[];
  status: "all" | CalendarTaskState;
  orderLink: "all" | "linked" | "unlinked";
};

export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = { mine: true, shared: true, team: true, person: "", types: [], status: "all", orderLink: "all" };

export function filtersActive(f: CalendarFilters): boolean {
  return !f.mine || !f.shared || !f.team || Boolean(f.person) || f.types.length > 0 || f.status !== "all" || f.orderLink !== "all";
}

export function applyCalendarFilters(items: CalendarItem[], f: CalendarFilters): CalendarItem[] {
  return items.filter((item) => {
    if (item.scope === "mine" && !f.mine) return false;
    if (item.scope === "shared" && !f.shared) return false;
    if (item.scope === "team" && !f.team) return false;
    if (f.person) {
      if (f.person.startsWith("uid:") && item.personUid !== f.person.slice(4)) return false;
      if (f.person.startsWith("label:") && (item.personLabel || "").toLowerCase() !== f.person.slice(6).toLowerCase()) return false;
    }
    if (f.types.length && !f.types.includes(item.kind)) return false;
    if (f.status !== "all" && item.taskState !== f.status) return false;
    if (f.orderLink === "linked" && !item.orderId) return false;
    if (f.orderLink === "unlinked" && item.orderId) return false;
    return true;
  });
}

function fold(value: string): string {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function searchCalendarItems(items: CalendarItem[], text: string): CalendarItem[] {
  const needle = fold(text.trim());
  if (!needle) return items;
  return items.filter((item) => {
    const occ = item.occurrence;
    const hay = [item.title, item.subtitle, item.personLabel || "", occ?.description || "", occ?.location || ""].map(fold).join("\n");
    return hay.includes(needle);
  });
}

// ---------------------------------------------------------------- per day

export type CalendarDayRow = { item: CalendarItem; asCompletion: boolean };

/** Items per viewer-local day in [fromKey, toKey]. A task ticked done on another day also shows,
 *  marked as a completion, on that day — the same record, not a second task. */
export function itemsByDay(items: CalendarItem[], fromKey: string, toKey: string): Map<string, CalendarDayRow[]> {
  const out = new Map<string, CalendarDayRow[]>();
  for (let n = core.dayNumber(fromKey); n <= core.dayNumber(toKey); n += 1) out.set(core.keyFromDayNumber(n), []);
  for (const item of items) {
    for (const day of item.days) out.get(day)?.push({ item, asCompletion: false });
    if (item.completedDay && !item.days.includes(item.completedDay)) out.get(item.completedDay)?.push({ item, asCompletion: true });
  }
  return out;
}

/** The person options of the filter: members on entries plus the name labels in use. */
export function personOptions(items: CalendarItem[]): { uids: string[]; labels: string[] } {
  const uids = new Set<string>();
  const labels = new Map<string, string>();
  for (const item of items) {
    if (item.personUid) uids.add(item.personUid);
    if (item.personLabel) labels.set(item.personLabel.toLowerCase(), item.personLabel);
  }
  return { uids: [...uids], labels: [...labels.values()].sort((a, b) => a.localeCompare(b)) };
}

// ---------------------------------------------------------------- ranges per view

export type CalendarViewMode = "day" | "week" | "month" | "agenda";
export const AGENDA_DAYS = 30;

export function rangeFor(view: CalendarViewMode, anchorKey: string, weekStart = 1): { fromKey: string; toKey: string } {
  if (view === "day") return { fromKey: anchorKey, toKey: anchorKey };
  if (view === "week") {
    const fromKey = core.startOfWeek(anchorKey, weekStart);
    return { fromKey, toKey: core.addDays(fromKey, 6) };
  }
  if (view === "month") {
    const first = `${anchorKey.slice(0, 7)}-01`;
    const nextMonth = monthShift(first, 1);
    const last = core.addDays(nextMonth, -1);
    const fromKey = core.startOfWeek(first, weekStart);
    const toKey = core.addDays(core.startOfWeek(last, weekStart), 6);
    return { fromKey, toKey };
  }
  return { fromKey: anchorKey, toKey: core.addDays(anchorKey, AGENDA_DAYS - 1) };
}

export function monthShift(key: string, months: number): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1 + months;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Number(key.slice(8, 10)), lastDay);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftAnchor(view: CalendarViewMode, anchorKey: string, direction: 1 | -1): string {
  if (view === "day") return core.addDays(anchorKey, direction);
  if (view === "week") return core.addDays(anchorKey, 7 * direction);
  if (view === "month") return monthShift(anchorKey, direction);
  return core.addDays(anchorKey, AGENDA_DAYS * direction);
}
