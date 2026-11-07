"use client";

// The order card's Schedule & Alerts: everything else that points at THIS order — the person's own notes linked to it
// that carry a reminder, and the calendar entries linked to it (their next days) — in the same rows Notes ▸ Reminders
// draws (components/ReminderList.tsx). Each row opens its own record. Read with the person's own access only: their
// notes, the calendar entries the calendar rules let them read; nothing is copied onto the order.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReminderList } from "@/components/ReminderList";
import * as calendarCore from "@/lib/studioflow/calendarCore";
import { listenToCalendarRange } from "@/lib/studioflow/calendarData";
import { studioT } from "@/lib/studioflow/language";
import { listenToKeepNotes, type StudioKeepNote } from "@/lib/studioflow/notes";
import { buildReminders, remindersForOrder, type ReminderCalendarInput } from "@/lib/studioflow/reminderCore";

const CALENDAR_DAYS_AHEAD = 180;
const MAX_CALENDAR_ROWS = 6;

export function OrderLinkedReminders({
  companyId,
  uid,
  orderId,
  orderLabel,
  language,
  notesAllowed,
}: {
  companyId: string;
  uid: string;
  orderId: string;
  orderLabel: string;
  language: string | null | undefined;
  /** The member's Notes area is open (their own notes are readable). */
  notesAllowed: boolean;
}) {
  const router = useRouter();
  const t = (text: string) => studioT(text, language);
  const [notes, setNotes] = useState<StudioKeepNote[]>([]);
  const [entries, setEntries] = useState<calendarCore.CalendarEntry[]>([]);
  const zone = useMemo(() => calendarCore.deviceTimeZone(), []);
  const todayKey = calendarCore.localParts(Date.now(), zone).dateKey;

  useEffect(() => {
    if (!companyId || !uid || !notesAllowed) { setNotes([]); return; }
    return listenToKeepNotes(companyId, uid, setNotes, () => setNotes([]));
  }, [companyId, uid, notesAllowed]);
  useEffect(() => {
    if (!companyId || !uid) { setEntries([]); return; }
    return listenToCalendarRange(companyId, uid, calendarCore.addDays(todayKey, -1), calendarCore.addDays(todayKey, CALENDAR_DAYS_AHEAD), (state) => {
      setEntries(state.entries.filter((entry) => entry.orderId === orderId && !state.meta.get(entry.id)?.archived));
    });
  }, [companyId, uid, orderId, todayKey]);

  const items = useMemo(() => {
    const calendar: ReminderCalendarInput[] = [];
    for (const occ of calendarCore.expandEntries(entries, todayKey, calendarCore.addDays(todayKey, CALENDAR_DAYS_AHEAD))) {
      if (occ.orderId !== orderId || (occ.type === "task" && occ.status !== "open")) continue;
      calendar.push({ entryId: occ.entryId, title: occ.title || calendarCore.autoNoteTitle(occ.description), type: occ.type, allDay: occ.allDay,
        occurrenceKey: occ.dateKey, startTime: occ.startTime, timeZone: occ.timeZone, orderId: occ.orderId });
      if (calendar.length >= MAX_CALENDAR_ROWS) break;
    }
    const all = buildReminders({
      notes: notes.filter((n) => n.linkedOrderId === orderId).map((n) => ({ id: n.id, title: n.title, text: n.text, reminderMs: n.reminderDateMillis,
        reminderAllDay: n.reminderAllDay, isDeleted: n.isDeleted, isArchived: n.isArchived, linkedOrderId: n.linkedOrderId, linkedOrderLabel: orderLabel })),
      calendar,
      nowMs: Date.now(),
      viewerTimeZone: zone,
    });
    return remindersForOrder(all, orderId);
  }, [notes, entries, orderId, orderLabel, todayKey, zone]);

  if (items.length === 0) return null;
  return (
    <div className="app-schedule-list-block" data-testid="order-linked-reminders">
      <div className="app-schedule-heading-row">
        <strong>{t("Linked reminders")}</strong>
        <span>{items.length}</span>
      </div>
      <p className="muted-copy" style={{ margin: "0 0 8px" }}>{t("Notes and calendar entries linked to this order.")}</p>
      <ReminderList
        items={items}
        language={language}
        showOrder={false}
        onOpen={(item) => {
          if (item.kind === "note" && item.noteId) router.push(`/notes?note=${encodeURIComponent(item.noteId)}`);
          else if (item.kind === "calendar" && item.entryId) router.push(`/calendar?date=${item.dayKey}&entry=${encodeURIComponent(item.entryId)}`);
        }}
      />
    </div>
  );
}
