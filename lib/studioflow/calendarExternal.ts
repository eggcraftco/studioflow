// Calendar V1.1 — the person's own Google / Outlook calendars on the web (read only; server:
// functions/calendar/externalCalendar.js).
//
// Everything that matters happens on the server: the connect link, the token exchange, the reading. This file asks
// for a link, comes back from the provider (app/oauth/calendar), listens to the person's own connection documents and
// the meetings read through them. The rules let only that person read either; nothing here can write them.
import { doc, onSnapshot, collection, query, where, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import * as core from "./calendarCore";
import type { CalendarExternalLike, CalendarProvider } from "./calendarView";

export const CALENDAR_PROVIDERS: CalendarProvider[] = ["google", "microsoft"];
const STATE_KEY = "nivadesk.calendar.connect.v1";

export type CalendarConnection = {
  provider: CalendarProvider;
  accountEmail: string;
  status: "active" | "error" | "reconnect";
  errorCode: string | null;
  calendars: { id: string; name: string; color: string; primary: boolean; selected: boolean }[];
  lastSyncAtMs: number | null;
  windowStartKey: string | null;
  windowEndKey: string | null;
};

function connectionOf(provider: CalendarProvider, d: Record<string, unknown> | undefined): CalendarConnection | null {
  if (!d) return null;
  const status = d.status === "reconnect" || d.status === "error" ? d.status : "active";
  return {
    provider,
    accountEmail: String(d.accountEmail || ""),
    status,
    errorCode: typeof d.errorCode === "string" ? d.errorCode : null,
    calendars: Array.isArray(d.calendars)
      ? (d.calendars as Record<string, unknown>[]).map((c) => ({ id: String(c.id || ""), name: String(c.name || ""), color: String(c.color || ""), primary: Boolean(c.primary), selected: Boolean(c.selected) }))
      : [],
    lastSyncAtMs: typeof d.lastSyncAtMs === "number" ? d.lastSyncAtMs : null,
    windowStartKey: typeof d.windowStartKey === "string" ? d.windowStartKey : null,
    windowEndKey: typeof d.windowEndKey === "string" ? d.windowEndKey : null,
  };
}

export async function calendarConnectorsAvailable(companyId: string): Promise<Record<CalendarProvider, boolean>> {
  const res = await httpsCallable<{ companyId: string }, Record<CalendarProvider, boolean>>(functions, "calendarConnectorsAvailable")({ companyId });
  return { google: Boolean(res.data?.google), microsoft: Boolean(res.data?.microsoft) };
}

/** Asks for the provider's consent link and goes there. The state is remembered in this tab so the return page
 *  can tell a flow it started from one it did not. */
export async function startCalendarConnect(companyId: string, provider: CalendarProvider): Promise<void> {
  const res = await httpsCallable<{ companyId: string; provider: CalendarProvider; platform: "web" }, { authUrl: string; state: string }>(functions, "calendarConnectStart")({ companyId, provider, platform: "web" });
  try { window.sessionStorage.setItem(STATE_KEY, JSON.stringify({ state: res.data.state, provider, companyId })); } catch { /* private window */ }
  window.location.assign(res.data.authUrl);
}

export function startedHere(state: string): { provider: CalendarProvider; companyId: string } | null {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved && saved.state === state ? { provider: saved.provider, companyId: saved.companyId } : null;
  } catch {
    return null;
  }
}

export async function finishCalendarConnect(state: string, code: string): Promise<{ provider: CalendarProvider; accountEmail: string }> {
  const res = await httpsCallable<{ state: string; code: string }, { provider: CalendarProvider; accountEmail: string }>(functions, "calendarConnectFinish")({ state, code });
  try { window.sessionStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
  return res.data;
}

export async function updateCalendarSelection(companyId: string, provider: CalendarProvider, selectedCalendarIds: string[]): Promise<void> {
  await httpsCallable(functions, "calendarConnectionUpdate")({ companyId, provider, selectedCalendarIds });
}

export async function syncCalendarNow(companyId: string, provider: CalendarProvider): Promise<{ tooSoon?: boolean }> {
  const res = await httpsCallable<{ companyId: string; provider: CalendarProvider }, { tooSoon?: boolean }>(functions, "calendarSyncNow")({ companyId, provider });
  return res.data || {};
}

export async function disconnectCalendar(companyId: string, provider: CalendarProvider): Promise<void> {
  await httpsCallable(functions, "calendarDisconnect")({ companyId, provider });
}

/** The person's own connections (both providers). A missing document = not connected. */
export function listenToCalendarConnections(companyId: string, uid: string, onChange: (c: Partial<Record<CalendarProvider, CalendarConnection>>) => void): Unsubscribe {
  const current: Partial<Record<CalendarProvider, CalendarConnection>> = {};
  const unsubs = CALENDAR_PROVIDERS.map((provider) => onSnapshot(
    doc(db, "companies", companyId, "calendarConnections", `${uid}_${provider}`),
    (snap) => {
      const c = connectionOf(provider, snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
      if (c) current[provider] = c; else delete current[provider];
      onChange({ ...current });
    },
    () => { delete current[provider]; onChange({ ...current }); },
  ));
  return () => unsubs.forEach((u) => u());
}

/** The meetings read through the person's connections, for [fromKey, toKey] (rows by their first UTC day, from 62 days
 *  before the range so a long all-day event that started earlier is not missed). */
export function listenToExternalEvents(companyId: string, uid: string, providers: CalendarProvider[], fromKey: string, toKey: string, onChange: (events: CalendarExternalLike[]) => void): Unsubscribe {
  const parts = new Map<CalendarProvider, CalendarExternalLike[]>();
  const unsubs = providers.map((provider) => onSnapshot(
    query(collection(db, "companies", companyId, "calendarConnections", `${uid}_${provider}`, "externalEvents"),
      where("dateKey", ">=", core.addDays(fromKey, -62)), where("dateKey", "<=", core.addDays(toKey, 1))),
    (snap) => {
      parts.set(provider, snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const ms = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : null);
        return {
          id: d.id, provider, calendarName: String(x.calendarName || ""), title: String(x.title || ""), location: String(x.location || ""),
          joinUrl: String(x.joinUrl || ""), openUrl: String(x.openUrl || ""), allDay: Boolean(x.allDay), dateKey: String(x.dateKey || ""),
          endDateKey: String(x.endDateKey || x.dateKey || ""), startMs: ms(x.startAt), endMs: ms(x.endAt), recurring: Boolean(x.recurring),
        };
      }));
      onChange([...parts.values()].flat());
    },
    () => { parts.set(provider, []); onChange([...parts.values()].flat()); },
  ));
  return () => unsubs.forEach((u) => u());
}

/** Only links that are what they say: https, and for "open" the provider's own sites. */
export function safeLink(url: string, provider: CalendarProvider | null = null): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "";
    if (provider === "google" && !/(^|\.)google\.com$/.test(u.hostname)) return "";
    if (provider === "microsoft" && !/(^|\.)(office365\.com|office\.com|outlook\.com|live\.com|microsoft\.com)$/.test(u.hostname)) return "";
    return u.toString();
  } catch {
    return "";
  }
}
