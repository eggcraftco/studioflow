"use client";

// Calendar V1 — the side panel (full screen on a phone) for one item: what it is, when, who it is shared
// with, the linked order (only if this person may open it), who made and changed it, and — when allowed —
// edit, delete and the task's status. Each person's reminder is their own.
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as core from "@/lib/studioflow/calendarCore";
import type { CalendarItem } from "@/lib/studioflow/calendarView";
import type { CalendarReminderRow } from "@/lib/studioflow/calendarData";
import type { NoteWorkspaceMember } from "@/lib/studioflow/noteSharing";
import { TYPE_META, TASK_STATE_META, dayLabel, dateTimeLabel, timeLabel } from "./calendarUi";
import { weekdayShort } from "./CalendarEntryForm";

type Props = {
  item: CalendarItem;
  uid: string;
  access: core.CalendarAccess;
  members: NoteWorkspaceMember[];
  orderTitles: Map<string, string>;
  reminder: CalendarReminderRow | null;
  locale: string;
  timeZone: string;
  t: (text: string) => string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (scope: "single" | "only" | "following") => Promise<void>;
  onStatus: (status: core.CalendarTaskStatus) => Promise<void>;
  onReminder: (offsetMinutes: number | null, allDayTime: string) => Promise<void>;
};

const OFFSETS: [string, string][] = [["", "Off"], ["0", "At the time"], ["15", "15 minutes before"], ["60", "1 hour before"], ["1440", "1 day before"]];

export function CalendarDetailPanel({ item, uid, access, members, orderTitles, reminder, locale, timeZone, t, onClose, onEdit, onDelete, onStatus, onReminder }: Props) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reminderTime, setReminderTime] = useState(reminder?.allDayTime || core.DEFAULT_ALL_DAY_REMINDER_TIME);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  // Keyboard: the panel takes the focus when an item opens, so Escape closes it from where the person is.
  useEffect(() => { closeButton.current?.focus(); }, [item.id]);
  useEffect(() => {
    setError("");
    setConfirmDelete(false);
    setReminderTime(reminder?.allDayTime || core.DEFAULT_ALL_DAY_REMINDER_TIME);
  }, [item.id, reminder?.allDayTime]);

  const occ = item.occurrence;
  const entry = item.entry;
  const nameOf = (memberUid: string | null) => {
    if (!memberUid) return "";
    const m = members.find((x) => x.uid === memberUid);
    return m ? m.name || m.email || memberUid : memberUid === uid ? "—" : t("Nobody");
  };

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (err) {
      const name = (err as Error)?.name;
      setError(name === "CalendarConflictError"
        ? t("Someone else changed this entry while you were editing. Your changes were not saved; reopen it and try again.")
        : name === "CalendarGoneError" ? t("This entry is no longer available to you.") : t("Not saved. Nothing was changed — try again."));
    } finally {
      setBusy("");
    }
  }

  const meta = TYPE_META[item.kind];
  const when = (() => {
    if (!occ) return item.days[0] ? dayLabel(item.days[0], locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
    const first = dayLabel(occ.dateKey, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const last = occ.endDateKey !== occ.dateKey ? ` – ${dayLabel(occ.endDateKey, locale, { day: "numeric", month: "long", year: "numeric" })}` : "";
    if (occ.allDay) return `${first}${last} · ${t("All day")}`;
    return `${first}${last} · ${timeLabel(occ.startMs, locale, timeZone)}–${timeLabel(occ.endMs, locale, timeZone)}`;
  })();
  const repeat = (() => {
    const r = entry?.recurrence;
    if (!r) return "";
    let text = r.freq === "daily" ? t("Repeats every day") : t("Repeats every week on {days}").replace("{days}", (r.byWeekday.length ? r.byWeekday : [core.isoWeekday(entry!.dateKey)]).map((n) => weekdayShort(n, locale)).join(", "));
    if (r.untilKey) text += ` · ${t("until {date}").replace("{date}", dayLabel(r.untilKey, locale, { day: "numeric", month: "short", year: "numeric" }))}`;
    if (r.count) text += ` · ${t("{count} times").replace("{count}", String(r.count))}`;
    return text;
  })();
  const sharedLine = (() => {
    if (!entry) return "";
    if (entry.visibility === "private") return t("Only you can see this.");
    if (entry.visibility === "workspace") return t(entry.workspaceRole === "edit" ? "Everyone in the workspace can edit this." : "Everyone in the workspace can see this.");
    return `${t("Shared with")}: ${entry.accessUids.filter((x) => x !== entry.ownerUid).map((x) => `${nameOf(x)}${entry.editorUids.includes(x) ? ` (${t("can edit")})` : ""}`).join(", ")}`;
  })();
  const writtenLater = entry && item.kind === "note" && entry.createdAtMs && occ
    && core.localParts(entry.createdAtMs, timeZone).dateKey > occ.dateKey;
  const isSeriesOcc = Boolean(entry && entry.rowType === "series" && occ);

  return (
    <aside className="cal-detail" role="dialog" aria-modal="false" aria-labelledby="cal-detail-title" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <header className="cal-detail-head">
        <span className={`cal-badge cal-tone-${meta.tone}`}><span aria-hidden="true">{meta.icon}</span> {t(meta.label)}</span>
        <button ref={closeButton} type="button" className="cal-icon-button" onClick={onClose} aria-label={t("Close")}>×</button>
      </header>
      <h2 id="cal-detail-title" className="cal-detail-title">{item.title || t(meta.label)}</h2>
      <p className="cal-detail-when">{when}</p>
      {item.taskState ? (
        <p className={`cal-state cal-state-${item.taskState}`}><span aria-hidden="true">{TASK_STATE_META[item.taskState].icon}</span> {t(TASK_STATE_META[item.taskState].label)}</p>
      ) : null}
      {occ?.moved ? <p className="muted-copy">{t("Moved from {date}").replace("{date}", dayLabel(occ.occurrenceKey, locale))}</p> : null}
      {occ?.type === "task" && occ.status === "done" && occ.completedAtMs ? (
        <p className="muted-copy">{t("Completed {date}").replace("{date}", dateTimeLabel(occ.completedAtMs, locale))} · {t("Planned for {date}").replace("{date}", dayLabel(occ.dateKey, locale))}</p>
      ) : null}
      {writtenLater ? <p className="cal-notice">{t("Written later, on {date}").replace("{date}", dateTimeLabel(entry!.createdAtMs, locale))}</p> : null}
      {occ?.description ? <p className="cal-detail-text">{occ.description}</p> : null}
      {occ?.location ? <p><strong>{t("Location")}:</strong> {occ.location}</p> : null}
      {occ?.meetingUrl && /^https?:\/\//i.test(occ.meetingUrl) ? <p><strong>{t("Meeting link")}:</strong> <a href={occ.meetingUrl} target="_blank" rel="noreferrer noopener">{occ.meetingUrl}</a></p> : null}
      {item.personUid || item.personLabel ? (
        <p><strong>{item.kind === "task" ? t("Assigned to") : t("Who it is about")}:</strong> {item.personUid ? nameOf(item.personUid) : `${item.personLabel} ${t("(name label)")}`}</p>
      ) : null}
      {repeat ? <p className="muted-copy">{repeat}</p> : null}
      {sharedLine ? <p className="cal-share-summary">{sharedLine}</p> : null}

      {item.kind === "orderDue" && item.orderId ? (
        <div className="cal-detail-block">
          {item.subtitle ? <p>{item.subtitle}</p> : null}
          <p className="muted-copy">{t("The date comes from the order. Change it on the order.")}</p>
          <Link className="button secondary" href={`/orders?orderId=${encodeURIComponent(item.orderId)}`}>{t("Open order")}</Link>
        </div>
      ) : null}
      {item.kind !== "orderDue" && item.orderId ? (
        <div className="cal-detail-block">
          <strong>{t("Linked order")}:</strong>{" "}
          {orderTitles.has(item.orderId)
            ? <Link href={`/orders?orderId=${encodeURIComponent(item.orderId)}`}>{orderTitles.get(item.orderId)}</Link>
            : <span className="muted-copy">{t("You can't open this order.")}</span>}
        </div>
      ) : null}
      {item.kind === "noteReminder" ? (
        <div className="cal-detail-block">
          <Link className="button secondary" href="/notes">{t("Open in Notes")}</Link>
        </div>
      ) : null}

      {entry && occ ? (
        <>
          {access.setStatus && item.kind === "task" ? (
            <div className="cal-actions">
              {occ.status !== "done" ? <button type="button" className="button" disabled={Boolean(busy)} onClick={() => run("done", () => onStatus("done"))}>☑ {t("Mark done")}</button> : null}
              {occ.status !== "open" ? <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => run("open", () => onStatus("open"))}>{t("Reopen")}</button> : null}
              {occ.status !== "cancelled" ? <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => run("cancel", () => onStatus("cancelled"))}>⊘ {t("Cancel task")}</button> : null}
            </div>
          ) : null}

          <div className="cal-detail-block">
            <label className="cal-field">
              <span>{t("Reminder")}</span>
              <select className="input" value={reminder ? String(reminder.offsetMinutes) : ""} disabled={Boolean(busy)} onChange={(e) => {
                const value = e.target.value;
                run("reminder", () => onReminder(value === "" ? null : Number(value), reminderTime));
              }}>
                {OFFSETS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
              </select>
            </label>
            {occ.allDay && reminder ? (
              <label className="cal-field">
                <span>{t("Reminder time")}</span>
                <input type="time" className="input" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} onBlur={() => {
                  if (core.isTime(reminderTime) && reminderTime !== reminder.allDayTime) run("reminder", () => onReminder(reminder.offsetMinutes, reminderTime));
                }} />
              </label>
            ) : null}
            <small className="muted-copy">{t("Your reminder is only for you. It shows in your notifications inside NivaDesk.")}</small>
          </div>

          <p className="muted-copy cal-audit">
            {t("Created by {name} · {date}").replace("{name}", nameOf(entry.createdByUid)).replace("{date}", dateTimeLabel(entry.createdAtMs, locale))}
            {entry.updatedAtMs && entry.version > 1 && entry.updatedByUid ? <><br />{t("Last changed by {name} · {date}").replace("{name}", nameOf(entry.updatedByUid)).replace("{date}", dateTimeLabel(entry.updatedAtMs, locale))}</> : null}
          </p>

          <div className="cal-actions">
            {access.edit ? <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={onEdit}>{t("Edit")}</button> : null}
            {access.remove && !confirmDelete ? <button type="button" className="button danger secondary" disabled={Boolean(busy)} onClick={() => setConfirmDelete(true)}>{t("Delete")}</button> : null}
          </div>
          {confirmDelete ? (
            <div className="cal-confirm" role="alertdialog" aria-label={t("Delete")}>
              <p>{isSeriesOcc ? t("This is a repeating entry. Delete only this one, or this one and the ones after it?") : t("Delete this entry? This can't be undone.")}</p>
              <div className="cal-actions">
                {isSeriesOcc ? (
                  <>
                    <button type="button" className="button danger" disabled={Boolean(busy)} onClick={() => run("delete", () => onDelete("only"))}>{t("Only this one")}</button>
                    <button type="button" className="button danger secondary" disabled={Boolean(busy)} onClick={() => run("delete", () => onDelete("following"))}>{t("This and following")}</button>
                  </>
                ) : (
                  <button type="button" className="button danger" disabled={Boolean(busy)} onClick={() => run("delete", () => onDelete("single"))}>{t("Delete")}</button>
                )}
                <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setConfirmDelete(false)}>{t("Cancel")}</button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {busy ? <p className="muted-copy" role="status">{t("Saving…")}</p> : null}
      {error ? <p className="cal-errors" role="alert">{error}</p> : null}
    </aside>
  );
}
