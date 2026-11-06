"use client";

// "Calendar" in Settings ▸ Integrations: how the person's own Google Calendar or Outlook reaches the Calendar screen,
// and where this person's two connections stand. Connecting itself happens on the Calendar screen (app/calendar), where
// the consent return, the choice of calendars and Sync now already live; nothing here connects, so nothing here can
// disagree with it.
//
// Rules this card keeps, learned on the Cloud storage and Stripe cards:
//
//   the state is what the person's own connection documents say, read afresh when the card opens — never a
//   remembered "I pressed Connect". It does not call the availability callable (that one also syncs at the provider);
//   a switched-off server is told on the Calendar screen;
//
//   a read that failed says it could not check; it never says "Not connected";
//
//   an answer never crosses a workspace switch: a late answer for the previous workspace is dropped;
//
//   the connection is the PERSON's: nobody else, the owner included, can read it, so this card never speaks for the team.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import { CALENDAR_PROVIDERS, loadCalendarTileSignal, type CalendarTileSignal } from "@/lib/studioflow/calendarExternal";

const PROVIDER_LABEL = { google: "Google Calendar", microsoft: "Outlook" } as const;

const ROW_STYLE: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
  gap: 10, padding: "12px 0", borderTop: "1px solid rgba(127, 127, 127, 0.18)"
};

export function CalendarIntegrationSection({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  const t = (text: string) => studioT(text, language);
  const companyId = workspace.id.trim();
  // undefined = not read yet; null = the read failed.
  const [answer, setAnswer] = useState<CalendarTileSignal | null | undefined>(undefined);

  useEffect(() => {
    setAnswer(undefined);
    const uid = auth.currentUser?.uid;
    if (!companyId || !uid) { setAnswer(null); return undefined; }
    let active = true;
    loadCalendarTileSignal(companyId, uid)
      .then((next) => { if (active) setAnswer(next); })
      .catch(() => { if (active) setAnswer(null); });
    return () => { active = false; };
  }, [companyId]);

  return (
    <section className="settings-card" data-calendar-card>
      <CardTitle icon="calendar" title={t("Calendar")} />
      <p className="muted-copy">{t("Show your own Google Calendar or Outlook meetings in NivaDesk's Calendar, beside your orders and tasks.")}</p>

      <h3 className="settings-subtitle">{t("How it works")}</h3>
      <ol className="muted-copy" data-calendar-steps>
        <li>{t("Open Calendar and press Your other calendars, then Connect Google Calendar or Connect Outlook.")}</li>
        <li>{t("Approve read-only access on Google's or Microsoft's page. You come back to Calendar.")}</li>
        <li>{t("Choose which of your calendars to show, then press Save.")}</li>
        <li>{t("Your meetings appear as read-only cards. They refresh when you open Calendar and about every 30 minutes; Sync now refreshes straight away.")}</li>
      </ol>

      {answer === undefined ? <p className="muted-copy">{t("Loading…")}</p> : null}
      {answer === null ? <p className="layout-error" role="status" data-calendar-check="unverified">{t("Could not check your calendar connections just now. Try again in a moment.")}</p> : null}
      <ul style={{ listStyle: "none", margin: "4px 0 12px", padding: 0 }}>
        {CALENDAR_PROVIDERS.map((provider) => {
          const row = answer ? answer.connections[provider] : undefined;
          const state = answer === undefined || answer === null
            ? "unknown"
            : row ? (row.status === "active" ? "connected" : "reconnect") : "none";
          return (
            <li key={provider} data-calendar-row={provider} style={ROW_STYLE}>
              <span>
                <strong>{t(PROVIDER_LABEL[provider])}</strong>
                {row?.accountEmail ? <><br /><span className="muted-copy">{row.accountEmail}</span></> : null}
                {state === "reconnect" ? <><br /><span className="layout-error">{t("The connection has ended. Open Calendar and connect again.")}</span></> : null}
              </span>
              {state === "unknown" ? null : (
                <span className={`studio-pill${state === "connected" ? " success" : ""}`} data-calendar-state={state}>
                  {state === "connected" ? t("Connected") : state === "reconnect" ? t("Reconnect required") : t("Not connected")}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="settings-action-row">
        <Link className="button" href="/calendar" data-calendar-open>{t("Open Calendar")}</Link>
      </div>

      <p className="muted-copy">{t("Every person connects their own calendar. Nobody else in the workspace, the owner included, sees your meetings.")}</p>
      <p className="muted-copy">{t("NivaDesk only reads. It never writes to your calendar, never reads your email, and a meeting never becomes a task or an order.")}</p>
      <p className="muted-copy">{t("Disconnect any time from Calendar. NivaDesk deletes its copies of your meetings; your calendar itself is not changed.")}</p>
      <p className="muted-copy" data-calendar-outlook-note>{t("Microsoft has verified NivaDesk as a publisher. Some organisations still ask an administrator to approve new apps on work or school Outlook accounts.")}</p>
    </section>
  );
}
