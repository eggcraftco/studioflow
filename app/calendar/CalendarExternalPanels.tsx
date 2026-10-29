"use client";

// Calendar V1.1 — the person's own Google / Outlook calendars: the connections panel and the read-only detail of a
// meeting read from them. Nothing here writes to the provider or turns a meeting into a NivaDesk entry.
import React, { useEffect, useRef, useState } from "react";
import type { CalendarItem, CalendarProvider } from "@/lib/studioflow/calendarView";
import {
  CALENDAR_PROVIDERS, disconnectCalendar, safeLink, startCalendarConnect, syncCalendarNow, updateCalendarSelection,
  type CalendarConnection,
} from "@/lib/studioflow/calendarExternal";
import { PROVIDER_META, dayLabel, dateTimeLabel, timeLabel } from "./calendarUi";

type T = (text: string) => string;

/** One meeting from Google / Outlook: what, when, where, join, open at the source. Read only. */
export function CalendarExternalDetail({ item, locale, timeZone, t, onClose }: { item: CalendarItem; locale: string; timeZone: string; t: T; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { closeButton.current?.focus(); }, [item.id]);
  const ext = item.external;
  if (!ext) return null;
  const source = PROVIDER_META[ext.provider];
  const when = ext.allDay
    ? `${dayLabel(ext.dateKey, locale, { weekday: "long", day: "numeric", month: "long" })}${ext.endDateKey && ext.endDateKey !== ext.dateKey ? ` – ${dayLabel(ext.endDateKey, locale, { weekday: "long", day: "numeric", month: "long" })}` : ""} · ${t("All day")}`
    : `${dateTimeLabel(ext.startMs, locale, timeZone)} – ${timeLabel(ext.endMs, locale, timeZone)}`;
  const join = safeLink(ext.joinUrl);
  const open = safeLink(ext.openUrl, ext.provider);
  return (
    <aside className="cal-detail" aria-label={item.title || t(source.label)}>
      <div className="cal-detail-head">
        <span className="cal-chip-icon" aria-hidden="true">🌐</span>
        <strong>{t(source.label)}</strong>
        <button ref={closeButton} type="button" className="cal-icon-button" aria-label={t("Close")} onClick={onClose}>×</button>
      </div>
      <h2 className="cal-detail-title">{item.title || t("(no title)")}</h2>
      <p className="cal-detail-when">{when}</p>
      {ext.calendarName ? <p className="muted-copy">{ext.calendarName}</p> : null}
      {ext.location ? <p>📍 {ext.location}</p> : null}
      {ext.recurring ? <p className="muted-copy">{t("Part of a repeating meeting.")}</p> : null}
      <div className="cal-actions">
        {join ? <a className="button" href={join} target="_blank" rel="noopener noreferrer">{t("Join meeting")}</a> : null}
        {open ? <a className="button secondary" href={open} target="_blank" rel="noopener noreferrer">{t(source.open)}</a> : null}
      </div>
      <p className="muted-copy cal-filter-note">{t("Read only in NivaDesk: change it in the calendar it came from. Only you see it here.")}</p>
    </aside>
  );
}

function ago(ms: number | null, locale: string, timeZone: string, t: T): string {
  if (!ms) return t("Not synced yet");
  return t("Last synced {time}").replace("{time}", dateTimeLabel(ms, locale, timeZone));
}

/** Connect / pick calendars / sync now / disconnect, for each provider the server offers. */
export function CalendarConnectionsPanel({ companyId, connections, available, locale, timeZone, t, onNotice }: {
  companyId: string;
  connections: Partial<Record<CalendarProvider, CalendarConnection>>;
  available: Record<CalendarProvider, boolean> | null;
  locale: string;
  timeZone: string;
  t: T;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [picked, setPicked] = useState<Partial<Record<CalendarProvider, string[]>>>({});
  const [confirm, setConfirm] = useState<CalendarProvider | null>(null);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try { await action(); } catch (error) { onNotice(error instanceof Error && error.message ? error.message : t("That did not work. Try again.")); } finally { setBusy(""); }
  }

  const shown = CALENDAR_PROVIDERS.filter((p) => connections[p] || available?.[p]);
  return (
    <section className="cal-filters cal-connections" aria-label={t("Your other calendars")}>
      <h3 className="cal-connections-title">{t("Your other calendars")}</h3>
      <p className="muted-copy cal-filter-note">{t("Read only: NivaDesk shows your meetings and never changes them. Only you see them — not your team, not the business owner.")}</p>
      {available === null ? <p className="muted-copy">{t("Loading…")}</p> : null}
      {available !== null && !shown.length ? <p className="muted-copy">{t("Connecting Google Calendar or Outlook is not switched on for this workspace yet.")}</p> : null}
      {shown.map((p) => {
        const c = connections[p];
        const meta = PROVIDER_META[p];
        if (!c) {
          return (
            <div key={p} className="cal-connection">
              <strong>{t(meta.label)}</strong>
              <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => run(`connect:${p}`, () => startCalendarConnect(companyId, p))}>
                {busy === `connect:${p}` ? t("Opening…") : t("Connect {provider}").replace("{provider}", t(meta.label))}
              </button>
            </div>
          );
        }
        const selection = picked[p] ?? c.calendars.filter((x) => x.selected).map((x) => x.id);
        const changed = JSON.stringify([...selection].sort()) !== JSON.stringify(c.calendars.filter((x) => x.selected).map((x) => x.id).sort());
        return (
          <div key={p} className="cal-connection">
            <strong>{t(meta.label)}</strong> <span className="muted-copy">{c.accountEmail}</span>
            <p className={c.status === "active" ? "muted-copy" : "layout-error"} role="status">
              {c.status === "reconnect" ? t("Connect again to keep this calendar up to date. The meetings shown may be out of date.")
                : c.status === "error" ? t("Could not sync just now. NivaDesk will try again; the meetings shown may be out of date.")
                : ago(c.lastSyncAtMs, locale, timeZone, t)}
            </p>
            {c.windowStartKey && c.windowEndKey ? (
              <p className="muted-copy cal-filter-note">{t("Meetings from {from} to {to} are shown. Older and later ones are not loaded.").replace("{from}", dayLabel(c.windowStartKey, locale, { day: "numeric", month: "short", year: "numeric" })).replace("{to}", dayLabel(c.windowEndKey, locale, { day: "numeric", month: "short", year: "numeric" }))}</p>
            ) : null}
            <fieldset className="cal-connection-calendars">
              <legend>{t("Calendars to show")}</legend>
              {c.calendars.map((cal) => (
                <label key={cal.id} className="cal-check">
                  <input type="checkbox" checked={selection.includes(cal.id)} onChange={(e) => setPicked({ ...picked, [p]: e.target.checked ? [...selection, cal.id] : selection.filter((x) => x !== cal.id) })} />
                  <span>{cal.name}{cal.primary ? ` · ${t("main")}` : ""}</span>
                </label>
              ))}
            </fieldset>
            <div className="cal-actions">
              {changed ? <button type="button" className="button" disabled={Boolean(busy) || !selection.length} onClick={() => run(`save:${p}`, async () => { await updateCalendarSelection(companyId, p, selection); setPicked({ ...picked, [p]: undefined }); onNotice(t("Saved")); })}>{t("Save")}</button> : null}
              {c.status === "reconnect" ? (
                <button type="button" className="button" disabled={Boolean(busy)} onClick={() => run(`connect:${p}`, () => startCalendarConnect(companyId, p))}>{t("Connect again")}</button>
              ) : (
                <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => run(`sync:${p}`, async () => { const r = await syncCalendarNow(companyId, p); onNotice(r.tooSoon ? t("Synced a moment ago. Try again in a minute.") : t("Synced")); })}>
                  {busy === `sync:${p}` ? t("Syncing…") : t("Sync now")}
                </button>
              )}
              {confirm === p ? (
                <>
                  <button type="button" className="button danger" disabled={Boolean(busy)} onClick={() => run(`off:${p}`, async () => { await disconnectCalendar(companyId, p); setConfirm(null); onNotice(t("Disconnected")); })}>{t("Disconnect")}</button>
                  <button type="button" className="cal-link-button" onClick={() => setConfirm(null)}>{t("Cancel")}</button>
                  <p className="muted-copy cal-filter-note">{t("Your calendar at {provider} is not changed. NivaDesk forgets this connection and its copies of your meetings.").replace("{provider}", t(meta.label))}</p>
                </>
              ) : (
                <button type="button" className="cal-link-button" onClick={() => setConfirm(p)}>{t("Disconnect…")}</button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
