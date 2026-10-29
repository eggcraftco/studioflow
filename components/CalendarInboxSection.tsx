"use client";

// Calendar V1 — reminders that went off, at the top of the notification drawer. They come from the
// person's own calendarInbox (never the workspace bell, whose rows the workspace owner can read), so a
// private entry's title reaches nobody else. Opening one marks it read and jumps to that day's entry.
import React from "react";
import { useRouter } from "next/navigation";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { markCalendarInboxRead, removeCalendarInboxRow, type CalendarInboxRow } from "@/lib/studioflow/calendarData";

type Props = {
  rows: CalendarInboxRow[];
  workspaceId: string;
  language: string;
  onClose: () => void;
};

export function CalendarInboxSection({ rows, workspaceId, language, onClose }: Props) {
  const router = useRouter();
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  if (!rows.length || !workspaceId) return null;
  const when = (row: CalendarInboxRow) => {
    const [y, m, d] = row.dateKey.split("-").map(Number);
    const day = Number.isFinite(y) ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d))) : "";
    return row.allDay || !row.startTime ? `${day} · ${t("All day")}` : `${day} · ${t("Starts at {time}").replace("{time}", row.startTime)}`;
  };
  return (
    <div className="notif-card cal-inbox" aria-label={t("Calendar reminders")}>
      <h3 className="cal-inbox-title">📅 {t("Calendar reminders")}</h3>
      <ul className="cal-inbox-list">
        {rows.map((row) => (
          <li key={row.id} className={`cal-inbox-row${row.read ? " is-read" : ""}`}>
            <button
              type="button"
              className="cal-inbox-open"
              onClick={() => {
                if (!row.read) void markCalendarInboxRead(workspaceId, row.id).catch(() => {});
                onClose();
                router.push(`/calendar?entry=${encodeURIComponent(row.entryId)}&date=${encodeURIComponent(row.occurrenceKey || row.dateKey)}`);
              }}
            >
              <strong>{row.title || t("Calendar")}</strong>
              <span className="muted-copy">{when(row)}</span>
            </button>
            {!row.read ? <button type="button" className="notif-pill-button" onClick={() => void markCalendarInboxRead(workspaceId, row.id).catch(() => {})}>{t("Mark read")}</button> : null}
            <button type="button" className="notif-icon-button" aria-label={t("Delete")} onClick={() => void removeCalendarInboxRow(workspaceId, row.id).catch(() => {})}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
