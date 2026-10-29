// Calendar V1 — labels and marks shared by the calendar screen pieces. Colour is never the only signal:
// every card carries its type's mark and name, and a task its state in words.
import type { CalendarItemKind } from "@/lib/studioflow/calendarView";
import type { CalendarTaskState } from "@/lib/studioflow/calendarCore";

export const TYPE_META: Record<CalendarItemKind, { label: string; icon: string; tone: string }> = {
  event: { label: "Meeting", icon: "👥", tone: "event" },
  task: { label: "Task", icon: "☐", tone: "task" },
  note: { label: "Daily note", icon: "📝", tone: "note" },
  workday: { label: "Work day", icon: "🛠", tone: "workday" },
  unavailable: { label: "Unavailable", icon: "⛔", tone: "unavailable" },
  orderDue: { label: "Order due", icon: "📦", tone: "order" },
  noteReminder: { label: "Note reminder", icon: "🔔", tone: "noteReminder" },
  external: { label: "From your calendar", icon: "🌐", tone: "external" },
};

/** The source an external meeting came from (V1.1). */
export const PROVIDER_META: Record<"google" | "microsoft", { label: string; open: string }> = {
  google: { label: "Google Calendar", open: "Open in Google Calendar" },
  microsoft: { label: "Outlook", open: "Open in Outlook" },
};

export const TASK_STATE_META: Record<CalendarTaskState, { label: string; icon: string }> = {
  open: { label: "Open", icon: "☐" },
  late: { label: "Late", icon: "⚠" },
  done: { label: "Done", icon: "☑" },
  cancelled: { label: "Cancelled", icon: "⊘" },
};

export function iconFor(kind: CalendarItemKind, state: CalendarTaskState | null): string {
  if (kind === "task" && state) return TASK_STATE_META[state].icon;
  return TYPE_META[kind].icon;
}

export function timeLabel(ms: number | null, locale: string, timeZone?: string): string {
  if (ms === null || !Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(ms));
}

export function dayLabel(key: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function dateTimeLabel(ms: number | null, locale: string, timeZone?: string): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(ms));
}
