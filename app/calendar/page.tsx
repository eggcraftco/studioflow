"use client";

// Calendar V1 (28 Oct 2026; contract docs/calendar-v1-contract-2026-10-28.md in the app repo).
// One screen answers "what am I doing today", "who works which day", "what is due when" and "what did we do
// that day": the person's own and shared entries (meetings, tasks, daily notes, work days, unavailable
// days), the due dates of orders they can already open, and their own note reminders.
// Day / Week / Month / Agenda, the last choice remembered per person on this browser. Only the range on
// screen is read. Filters hide; they never grant (the rules decide who reads what).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { dispatchStudioToast } from "@/components/StudioToastHost";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { loadScheduleOrders, loadWorkspaceContext, normalizeWorkspaceRole, workspaceAccessAllows, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { listenToKeepNotes, loadNoteWorkspaceMembers } from "@/lib/studioflow/notes";
import type { NoteWorkspaceMember } from "@/lib/studioflow/noteSharing";
import * as core from "@/lib/studioflow/calendarCore";
import {
  createCalendarEntry,
  deleteCalendarEntry,
  deleteOnlyThisOccurrence,
  deleteThisAndFollowing,
  listenToCalendarRange,
  listenToMyCalendarReminders,
  saveCalendarEntryEdits,
  saveMyCalendarReminder,
  saveOnlyThisOccurrence,
  saveThisAndFollowing,
  setCalendarTaskStatus,
  type CalendarDraft,
  type CalendarReminderRow,
} from "@/lib/studioflow/calendarData";
import {
  DEFAULT_CALENDAR_FILTERS,
  applyCalendarFilters,
  buildCalendarItems,
  filtersActive,
  itemsByDay,
  localDayKey,
  personOptions,
  rangeFor,
  searchCalendarItems,
  shiftAnchor,
  type CalendarFilters,
  type CalendarItem,
  type CalendarItemKind,
  type CalendarNoteLike,
  type CalendarOrderLike,
  type CalendarViewMode,
} from "@/lib/studioflow/calendarView";
import { CalendarEntryForm, type CalendarFormMode, type CalendarSeriesScope } from "./CalendarEntryForm";
import { CalendarDetailPanel } from "./CalendarDetailPanel";
import { TASK_STATE_META, TYPE_META, dayLabel, iconFor, timeLabel } from "./calendarUi";

const VIEW_KEY = (uid: string) => `nivadesk.calendar.view.v1.${uid}`;
const SEARCH_SPAN_DAYS = 180;
const KINDS: CalendarItemKind[] = ["event", "task", "note", "workday", "unavailable", "orderDue", "noteReminder"];

function readView(uid: string): CalendarViewMode | null {
  try {
    const value = window.localStorage.getItem(VIEW_KEY(uid));
    return value === "day" || value === "week" || value === "month" || value === "agenda" ? value : null;
  } catch {
    return null;
  }
}

function writeView(uid: string, view: CalendarViewMode) {
  try {
    window.localStorage.setItem(VIEW_KEY(uid), view);
  } catch {
    /* private window: the choice is simply not remembered */
  }
}

function emptyDraft(dateKey: string, timeZone: string, type: core.CalendarEntryType = "event", startTime: string | null = null): CalendarDraft {
  const endTime = startTime ? `${String(Math.min(23, Number(startTime.slice(0, 2)) + 1)).padStart(2, "0")}:${startTime.slice(3, 5)}` : null;
  return {
    type,
    title: "",
    description: "",
    allDay: !startTime,
    dateKey,
    endDateKey: dateKey,
    startTime,
    endTime: startTime && endTime === startTime ? "23:59" : endTime,
    timeZone,
    location: "",
    meetingUrl: "",
    visibility: "private",
    viewerUids: [],
    editorUids: [],
    workspaceRole: "view",
    personUid: null,
    personLabel: type === "workday" || type === "unavailable" ? "" : null,
    orderId: null,
    recurrence: null,
  };
}

function draftFromOccurrence(entry: core.CalendarEntry, occ: core.CalendarOccurrence | null): CalendarDraft {
  const source = occ || core.occurrenceAt(entry, entry.dateKey);
  return {
    type: entry.type,
    title: source ? source.title : entry.title,
    description: source ? source.description : entry.description,
    allDay: source ? source.allDay : entry.allDay,
    dateKey: source ? source.dateKey : entry.dateKey,
    endDateKey: source ? source.endDateKey : entry.endDateKey,
    startTime: source ? source.startTime : entry.startTime,
    endTime: source ? source.endTime : entry.endTime,
    timeZone: entry.timeZone,
    location: source ? source.location : entry.location,
    meetingUrl: source ? source.meetingUrl : entry.meetingUrl,
    visibility: entry.visibility,
    viewerUids: entry.accessUids.filter((x) => x !== entry.ownerUid && !entry.editorUids.includes(x)),
    editorUids: entry.editorUids,
    workspaceRole: entry.workspaceRole,
    personUid: entry.personUid,
    personLabel: entry.personUid ? null : entry.personLabel,
    orderId: entry.orderId,
    recurrence: entry.recurrence,
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const locale = studioLocaleTag(language);
  const viewerTz = useMemo(() => core.deviceTimeZone(), []);
  const [todayKey, setTodayKey] = useState(() => localDayKey(new Date()));

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [workspaceError, setWorkspaceError] = useState(false);
  const [members, setMembers] = useState<NoteWorkspaceMember[]>([]);
  const [orders, setOrders] = useState<CalendarOrderLike[]>([]);
  const [notes, setNotes] = useState<CalendarNoteLike[]>([]);
  const [reminders, setReminders] = useState<Map<string, CalendarReminderRow>>(new Map());

  const [view, setView] = useState<CalendarViewMode>("month");
  const [anchor, setAnchor] = useState(todayKey);
  const [searchText, setSearchText] = useState("");
  const [searchFrom, setSearchFrom] = useState(() => core.addDays(localDayKey(new Date()), -SEARCH_SPAN_DAYS));
  const [searchTo, setSearchTo] = useState(() => core.addDays(localDayKey(new Date()), SEARCH_SPAN_DAYS));
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_CALENDAR_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [rangeState, setRangeState] = useState<{ entries: core.CalendarEntry[]; loading: boolean; error: string | null }>({ entries: [], loading: true, error: null });
  const [reloadTick, setReloadTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; mode: CalendarFormMode; initial: CalendarDraft }>({ open: false, mode: { kind: "create" }, initial: emptyDraft(todayKey, viewerTz) });
  const pendingOpen = useRef<{ entryId: string; dateKey: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Midnight: "today" moves on without a reload.
  useEffect(() => {
    const id = window.setInterval(() => setTodayKey(localDayKey(new Date())), 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const remembered = readView(uid);
    setView(remembered || (window.matchMedia("(max-width: 760px)").matches ? "agenda" : "month"));
    const params = new URLSearchParams(window.location.search);
    const entryId = params.get("entry");
    const dateKey = params.get("date");
    if (entryId && dateKey && core.isDateKey(dateKey)) {
      pendingOpen.current = { entryId, dateKey };
      setAnchor(dateKey);
    }
    let cancelled = false;
    (async () => {
      try {
        const ws = await loadWorkspaceContext(uid);
        if (cancelled) return;
        setWorkspace(ws);
        loadNoteWorkspaceMembers(ws.id).then((m) => { if (!cancelled) setMembers(m); }).catch(() => {});
        // Order dates only for people who can already open orders, from the same scoped query the
        // Schedule uses (Workflow Only → their view, assigned-only → their own orders).
        if (workspaceAccessAllows(ws.memberAccess, "orders")) loadOrders(ws);
      } catch {
        if (!cancelled) setWorkspaceError(true);
      }
    })();
    // The due date is the order's own: it is read again when the tab comes back and when an order
    // is created or removed, so a date changed on the order shows here as the same single card.
    function loadOrders(ws: WorkspaceContext) {
      loadScheduleOrders(ws.id, ws, uid).then((rows) => {
        if (cancelled) return;
        setOrders(rows.map((o) => ({
          id: o.id,
          title: o.designName && o.designName !== "Untitled design" ? o.designName : o.customerName,
          customerName: o.customerName,
          paymentDate: o.paymentDate,
          deliveryTime: o.deliveryTime,
          isDelivered: o.isDelivered,
        })));
      }).catch(() => { if (!cancelled) setOrders([]); });
    }
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      loadWorkspaceContext(uid).then((ws) => { if (!cancelled && workspaceAccessAllows(ws.memberAccess, "orders")) loadOrders(ws); }).catch(() => {});
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("studioflow-order-created", refresh);
    window.addEventListener("studioflow-order-removed", refresh);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("studioflow-order-created", refresh);
      window.removeEventListener("studioflow-order-removed", refresh);
    };
  }, [user]);

  // The person's own notes with a reminder date (their collection only).
  useEffect(() => {
    if (!workspace || !user || !workspaceAccessAllows(workspace.memberAccess, "notes")) return;
    return listenToKeepNotes(workspace.id, user.uid, (rows) => {
      setNotes(rows.map((n) => ({ id: n.id, title: n.title, text: n.text, reminderMs: n.reminderDateMillis || null, isDeleted: n.isDeleted, isArchived: n.isArchived })));
    }, () => setNotes([]));
  }, [workspace, user]);

  useEffect(() => {
    if (!workspace || !user) return;
    return listenToMyCalendarReminders(workspace.id, user.uid, setReminders);
  }, [workspace, user]);

  const searching = searchText.trim().length > 0;
  const range = useMemo(() => (searching ? { fromKey: searchFrom <= searchTo ? searchFrom : searchTo, toKey: searchFrom <= searchTo ? searchTo : searchFrom } : rangeFor(view, anchor)), [searching, searchFrom, searchTo, view, anchor]);

  useEffect(() => {
    if (!workspace || !user) return;
    setRangeState((s) => ({ ...s, loading: true, error: null }));
    return listenToCalendarRange(workspace.id, user.uid, range.fromKey, range.toKey, setRangeState);
  }, [workspace, user, range.fromKey, range.toKey, reloadTick]);

  const items = useMemo(() => {
    if (!user) return [];
    return buildCalendarItems({ entries: rangeState.entries, orders, notes, uid: user.uid, fromKey: range.fromKey, toKey: range.toKey, viewerTimeZone: viewerTz, todayKey });
  }, [rangeState.entries, orders, notes, user, range.fromKey, range.toKey, viewerTz, todayKey]);
  const shown = useMemo(() => searchCalendarItems(applyCalendarFilters(items, filters), searchText), [items, filters, searchText]);
  const byDay = useMemo(() => itemsByDay(shown, range.fromKey, range.toKey), [shown, range.fromKey, range.toKey]);
  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);
  const orderTitles = useMemo(() => new Map(orders.map((o) => [o.id, o.title])), [orders]);
  const persons = useMemo(() => personOptions(items), [items]);

  // A bell click (/calendar?entry=…&date=…) opens that occurrence once the range has loaded.
  useEffect(() => {
    const pending = pendingOpen.current;
    if (!pending || rangeState.loading) return;
    pendingOpen.current = null;
    const hit = items.find((i) => i.entry?.id === pending.entryId && (i.occurrence?.occurrenceKey === pending.dateKey || i.days.includes(pending.dateKey)));
    if (hit) setSelectedId(hit.id);
    else dispatchStudioToast({ message: t("This entry is no longer available to you.") });
  }, [items, rangeState.loading, t]);

  // A selected entry that is no longer readable (share removed, deleted elsewhere) closes.
  useEffect(() => {
    if (selectedId && !rangeState.loading && !selected) setSelectedId(null);
  }, [selectedId, selected, rangeState.loading]);

  if (authLoading || !user) return <LoadingScreen />;
  const uid = user.uid;
  const memberCtx: core.CalendarMember | null = workspace ? { role: normalizeWorkspaceRole(workspace.role), isWorkspaceOwner: workspace.ownerUid === uid || workspace.id === uid } : null;
  const canPublishWorkspace = Boolean(memberCtx && (memberCtx.isWorkspaceOwner || ["owner", "admin", "member"].includes(memberCtx.role)));
  const accessOf = (item: CalendarItem) => (item.entry ? core.entryAccess(item.entry, uid, memberCtx) : { read: true, edit: false, remove: false, share: false, setStatus: false });

  function changeView(next: CalendarViewMode) {
    setView(next);
    writeView(uid, next);
  }

  function openCreate(dateKey: string, type: core.CalendarEntryType = "event", startTime: string | null = null) {
    setForm({ open: true, mode: { kind: "create" }, initial: emptyDraft(dateKey, viewerTz, type, startTime) });
  }

  function openEdit(item: CalendarItem) {
    if (!item.entry || !item.occurrence) return;
    const access = accessOf(item);
    const occurrenceKey = item.entry.rowType === "series" ? item.occurrence.occurrenceKey : null;
    setForm({ open: true, mode: { kind: "edit", entry: item.entry, occurrenceKey, canShare: access.share }, initial: draftFromOccurrence(item.entry, item.occurrence) });
  }

  async function save(draft: CalendarDraft, scope: CalendarSeriesScope | null) {
    if (!workspace) return;
    const mode = form.mode;
    if (mode.kind === "create") {
      await createCalendarEntry(workspace.id, uid, draft);
    } else if (mode.entry.rowType === "series" && mode.occurrenceKey && scope === "only") {
      await saveOnlyThisOccurrence(workspace.id, uid, mode.entry, mode.occurrenceKey, draft);
    } else if (mode.entry.rowType === "series" && mode.occurrenceKey && scope === "following") {
      await saveThisAndFollowing(workspace.id, uid, mode.entry, mode.occurrenceKey, draft);
    } else {
      await saveCalendarEntryEdits(workspace.id, uid, mode.entry, draft, mode.canShare);
    }
    setForm((f) => ({ ...f, open: false }));
    dispatchStudioToast({ message: t("Entry saved") });
  }

  async function removeSelected(scope: "single" | "only" | "following") {
    if (!workspace || !selected?.entry || !selected.occurrence) return;
    const entry = selected.entry;
    const key = selected.occurrence.occurrenceKey;
    if (scope === "only") await deleteOnlyThisOccurrence(workspace.id, uid, entry, key);
    else if (scope === "following") await deleteThisAndFollowing(workspace.id, uid, entry, key);
    else await deleteCalendarEntry(workspace.id, entry.id);
    setSelectedId(null);
    dispatchStudioToast({ message: t("Entry deleted") });
  }

  const periodLabel = (() => {
    if (searching) return `${dayLabel(range.fromKey, locale, { day: "numeric", month: "short", year: "numeric" })} – ${dayLabel(range.toKey, locale, { day: "numeric", month: "short", year: "numeric" })}`;
    if (view === "day") return dayLabel(anchor, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (view === "month") return dayLabel(`${anchor.slice(0, 7)}-15`, locale, { month: "long", year: "numeric" });
    return `${dayLabel(range.fromKey, locale, { day: "numeric", month: "short" })} – ${dayLabel(range.toKey, locale, { day: "numeric", month: "short", year: "numeric" })}`;
  })();

  const loadFailed = Boolean(rangeState.error) && !rangeState.entries.length;
  // No calendar entry of any kind in this range (order dates and note reminders do not count): the
  // three starters show. Nothing is ever written for the person.
  const noEntries = !rangeState.loading && !loadFailed && !items.some((i) => i.entry);

  function chip(row: { item: CalendarItem; asCompletion: boolean }, compact = false, spokenCompletion = true) {
    const { item, asCompletion } = row;
    const meta = TYPE_META[item.kind];
    const time = !item.allDay && item.startMs !== null ? timeLabel(item.startMs, locale) : "";
    const state = item.taskState;
    const stateText = state && state !== "open" ? t(TASK_STATE_META[state].label) : "";
    const label = [time, item.title || t(meta.label)].filter(Boolean).join(" ");
    const completionNote = asCompletion && item.occurrence ? ` · ${t("Done on this day · planned for {date}").replace("{date}", dayLabel(item.occurrence.dateKey, locale))}` : "";
    return (
      <button
        key={`${item.id}${asCompletion ? ":done" : ""}`}
        type="button"
        className={`cal-chip cal-tone-${meta.tone}${state ? ` cal-state-${state}` : ""}${asCompletion ? " is-completion" : ""}${selectedId === item.id ? " is-selected" : ""}`}
        onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}
        title={`${t(meta.label)}${stateText ? ` · ${stateText}` : ""} · ${label}${completionNote}`}
      >
        <span className="cal-chip-icon" aria-hidden="true">{iconFor(item.kind, state)}</span>
        <span className="cal-chip-text">{label}</span>
        {!compact && stateText ? <span className="cal-chip-state">{stateText}</span> : null}
        <span className="visually-hidden-file">{t(meta.label)}{spokenCompletion ? completionNote : ""}</span>
      </button>
    );
  }

  function emptyStarters(dateKey: string) {
    return (
      <div className="cal-empty">
        <h3>{t("Nothing in your calendar here yet")}</h3>
        <div className="cal-actions">
          <button type="button" className="button secondary" onClick={() => openCreate(dateKey, "task")}>☐ {t("Add a task")}</button>
          <button type="button" className="button secondary" onClick={() => openCreate(todayKey, "note")}>📝 {t("Write a note for today")}</button>
          <button type="button" className="button secondary" onClick={() => openCreate(dateKey, "workday")}>🛠 {t("Mark a work day")}</button>
        </div>
      </div>
    );
  }

  function renderMonth() {
    const days = [...byDay.keys()];
    const month = anchor.slice(0, 7);
    return (
      <div className="cal-month" role="grid" aria-label={periodLabel}>
        <div className="cal-month-head" role="row">
          {days.slice(0, 7).map((d) => <div key={d} role="columnheader" className="cal-weekday-head">{dayLabel(d, locale, { weekday: "short" })}</div>)}
        </div>
        <div className="cal-month-body">
          {days.map((d) => {
            const rows = byDay.get(d) || [];
            const extra = rows.length - 3;
            return (
              <div
                key={d}
                role="gridcell"
                tabIndex={0}
                aria-label={dayLabel(d, locale, { weekday: "long", day: "numeric", month: "long" })}
                className={`cal-month-cell${d.slice(0, 7) !== month ? " is-other-month" : ""}${d === todayKey ? " is-today" : ""}`}
                onClick={() => openCreate(d)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) openCreate(d); }}
              >
                <span className="cal-day-number">{Number(d.slice(8, 10))}</span>
                <div className="cal-chips">
                  {rows.slice(0, 3).map((r) => chip(r, true))}
                  {extra > 0 ? (
                    <button type="button" className="cal-more-chip" onClick={(e) => { e.stopPropagation(); setAnchor(d); changeView("day"); }}>{t("+{count} more").replace("{count}", String(extra))}</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderWeek() {
    const days = [...byDay.keys()];
    return (
      <div className="cal-week">
        {days.map((d) => {
          const rows = byDay.get(d) || [];
          return (
            <section key={d} className={`cal-week-col${d === todayKey ? " is-today" : ""}`} aria-label={dayLabel(d, locale, { weekday: "long", day: "numeric", month: "long" })}>
              <button type="button" className="cal-week-head" onClick={() => { setAnchor(d); changeView("day"); }}>{dayLabel(d, locale)}</button>
              <div className="cal-chips">{rows.map((r) => chip(r))}</div>
              <button type="button" className="cal-add-here" onClick={() => openCreate(d)} aria-label={`${t("New entry")} · ${dayLabel(d, locale)}`}>＋</button>
            </section>
          );
        })}
      </div>
    );
  }

  function renderDay() {
    const rows = byDay.get(anchor) || [];
    const allDayRows = rows.filter((r) => r.item.allDay || r.asCompletion);
    const timed = rows.filter((r) => !r.item.allDay && !r.asCompletion);
    const hourOf = (ms: number | null) => (ms === null ? 0 : Number(core.localParts(ms, viewerTz).time.slice(0, 2)));
    return (
      <div className="cal-day">
        <div className="cal-day-allday">
          <span className="cal-hour-label">{t("All day")}</span>
          <div className="cal-chips">{allDayRows.length ? allDayRows.map((r) => chip(r)) : <span className="muted-copy">—</span>}</div>
        </div>
        <ol className="cal-hours">
          {Array.from({ length: 24 }, (_, h) => h).map((h) => {
            const inHour = timed.filter((r) => hourOf(r.item.startMs) === h);
            const hh = `${String(h).padStart(2, "0")}:00`;
            return (
              <li key={h} className="cal-hour-row">
                <button type="button" className="cal-hour-label" onClick={() => openCreate(anchor, "event", hh)} aria-label={`${t("New entry")} · ${hh}`}>{hh}</button>
                <div className="cal-chips" onClick={() => openCreate(anchor, "event", hh)}>{inHour.map((r) => chip(r))}</div>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  function renderAgenda() {
    const daysWithItems = [...byDay.entries()].filter(([, rows]) => rows.length > 0);
    return (
      <div className="cal-agenda">
        {!searching ? <button type="button" className="cal-link-button" onClick={() => setAnchor(shiftAnchor("agenda", anchor, -1))}>{t("Show earlier")}</button> : null}
        {daysWithItems.length === 0 ? <p className="muted-copy">{searching ? t("No entries match your search in these dates.") : t("Nothing on this day.")}</p> : null}
        {daysWithItems.map(([d, rows]) => (
          <section key={d} className={`cal-agenda-day${d === todayKey ? " is-today" : ""}`}>
            <h3>{dayLabel(d, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
            <ul>
              {rows.map((r) => (
                <li key={`${r.item.id}${r.asCompletion ? ":done" : ""}`} className="cal-agenda-row">
                  {chip(r, false, false)}
                  {r.item.subtitle ? <span className="muted-copy">{r.item.subtitle}</span> : null}
                  {r.asCompletion && r.item.occurrence ? <span className="muted-copy">{t("Done on this day · planned for {date}").replace("{date}", dayLabel(r.item.occurrence.dateKey, locale))}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!searching ? <button type="button" className="cal-link-button" onClick={() => setAnchor(shiftAnchor("agenda", anchor, 1))}>{t("Show later")}</button> : null}
      </div>
    );
  }

  return (
    <AppShell>
      <div className="cal-page">
        <header className="cal-toolbar">
          <h1 className="cal-title">📅 {t("Calendar")}</h1>
          <div className="cal-toolbar-row">
            <button type="button" className="button secondary" onClick={() => { setAnchor(todayKey); setSearchText(""); }}>{t("Today")}</button>
            <button type="button" className="cal-icon-button" aria-label={t("Previous period")} onClick={() => setAnchor(shiftAnchor(view, anchor, -1))} disabled={searching}>‹</button>
            <button type="button" className="cal-icon-button" aria-label={t("Next period")} onClick={() => setAnchor(shiftAnchor(view, anchor, 1))} disabled={searching}>›</button>
            <strong className="cal-period" aria-live="polite">{periodLabel}</strong>
            <input type="date" className="input cal-goto" aria-label={t("Go to date")} value={anchor} onChange={(e) => { if (core.isDateKey(e.target.value)) setAnchor(e.target.value); }} />
            <div className="segmented-control cal-views" role="tablist" aria-label={t("Calendar")}>
              {(["day", "week", "month", "agenda"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "active" : ""} onClick={() => changeView(v)}>
                  {t(v === "day" ? "Day" : v === "week" ? "Week" : v === "month" ? "Month" : "Agenda")}
                </button>
              ))}
            </div>
            <button type="button" className="button" onClick={() => openCreate(view === "day" ? anchor : todayKey)}>＋ {t("New entry")}</button>
          </div>
          <div className="cal-toolbar-row">
            <input type="search" className="input cal-search" placeholder={t("Search entries")} aria-label={t("Search entries")} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            {searching ? (
              <>
                <label className="cal-inline-field"><span>{t("Search from")}</span><input type="date" className="input" value={searchFrom} onChange={(e) => { if (core.isDateKey(e.target.value)) setSearchFrom(e.target.value); }} /></label>
                <label className="cal-inline-field"><span>{t("Search until")}</span><input type="date" className="input" value={searchTo} onChange={(e) => { if (core.isDateKey(e.target.value)) setSearchTo(e.target.value); }} /></label>
              </>
            ) : null}
            <button type="button" className={`button secondary${filtersActive(filters) ? " is-active" : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
              {t("Filters")}{filtersActive(filters) ? " •" : ""}
            </button>
          </div>
          {filtersOpen ? (
            <div className="cal-filters" role="group" aria-label={t("Filters")}>
              <label className="cal-check"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} /> <span>{t("My entries")}</span></label>
              <label className="cal-check"><input type="checkbox" checked={filters.shared} onChange={(e) => setFilters({ ...filters, shared: e.target.checked })} /> <span>{t("Shared with me")}</span></label>
              <label className="cal-check"><input type="checkbox" checked={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.checked })} /> <span>{t("Team entries")}</span></label>
              <select className="input" aria-label={t("Who it is about")} value={filters.person} onChange={(e) => setFilters({ ...filters, person: e.target.value })}>
                <option value="">{t("Anyone")}</option>
                {persons.uids.map((p) => <option key={p} value={`uid:${p}`}>{members.find((m) => m.uid === p)?.name || members.find((m) => m.uid === p)?.email || p}</option>)}
                {persons.labels.map((l) => <option key={l} value={`label:${l}`}>{l} {t("(name label)")}</option>)}
              </select>
              <select className="input" aria-label={t("Type")} value={filters.types[0] || ""} onChange={(e) => setFilters({ ...filters, types: e.target.value ? [e.target.value as CalendarItemKind] : [] })}>
                <option value="">{t("All types")}</option>
                {KINDS.map((k) => <option key={k} value={k}>{t(TYPE_META[k].label)}</option>)}
              </select>
              <select className="input" aria-label={t("Status")} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as CalendarFilters["status"] })}>
                <option value="all">{t("Any status")}</option>
                {(["open", "late", "done", "cancelled"] as const).map((s) => <option key={s} value={s}>{t(TASK_STATE_META[s].label)}</option>)}
              </select>
              <select className="input" aria-label={t("Linked order")} value={filters.orderLink} onChange={(e) => setFilters({ ...filters, orderLink: e.target.value as CalendarFilters["orderLink"] })}>
                <option value="all">{t("Any order link")}</option>
                <option value="linked">{t("Linked to an order")}</option>
                <option value="unlinked">{t("Not linked to an order")}</option>
              </select>
              <button type="button" className="cal-link-button" onClick={() => setFilters(DEFAULT_CALENDAR_FILTERS)}>{t("Reset filters")}</button>
              <p className="muted-copy cal-filter-note">{t("Filters only change what you see here. They never change who can see an entry.")}</p>
              {orders.length ? <p className="muted-copy cal-filter-note">{t("Order dates come from your orders and follow your order access.")}</p> : null}
            </div>
          ) : null}
        </header>

        <div className={`cal-body${selected ? " has-detail" : ""}`}>
          <main className="cal-main" aria-busy={rangeState.loading}>
            {workspaceError ? (
              <div className="layout-error" role="alert">{t("You don't have access to this workspace's calendar.")}</div>
            ) : loadFailed ? (
              <div className="layout-error" role="alert">
                {rangeState.error === "permission-denied" ? t("You don't have access to this workspace's calendar.") : t("The calendar could not be loaded.")}{" "}
                <button type="button" className="button secondary" onClick={() => setReloadTick((n) => n + 1)}>{t("Try again")}</button>
              </div>
            ) : (
              <>
                {rangeState.loading ? <p className="muted-copy cal-loading" role="status">{t("Loading calendar…")}</p> : null}
                {rangeState.error ? (
                  <div className="layout-error" role="alert">{t("The calendar could not be loaded.")} <button type="button" className="button secondary" onClick={() => setReloadTick((n) => n + 1)}>{t("Try again")}</button></div>
                ) : null}
                {noEntries && !searching && !filtersActive(filters) ? emptyStarters(view === "day" ? anchor : todayKey) : null}
                {searching ? renderAgenda() : view === "month" ? renderMonth() : view === "week" ? renderWeek() : view === "day" ? renderDay() : renderAgenda()}
              </>
            )}
          </main>
          {selected && workspace ? (
            <CalendarDetailPanel
              item={selected}
              uid={uid}
              access={accessOf(selected)}
              members={members}
              orderTitles={orderTitles}
              reminder={selected.entry ? reminders.get(selected.entry.id) || null : null}
              locale={locale}
              timeZone={viewerTz}
              t={t}
              onClose={() => setSelectedId(null)}
              onEdit={() => openEdit(selected)}
              onDelete={removeSelected}
              onStatus={async (status) => {
                if (!selected.entry || !selected.occurrence) return;
                await setCalendarTaskStatus(workspace.id, uid, selected.entry, selected.occurrence.occurrenceKey, status);
              }}
              onReminder={async (offset, allDayTime) => {
                if (!selected.entry) return;
                await saveMyCalendarReminder(workspace.id, uid, selected.entry.id, offset, allDayTime, viewerTz, reminders.has(selected.entry.id));
                dispatchStudioToast({ message: t("Reminder saved") });
              }}
            />
          ) : null}
        </div>
      </div>
      <CalendarEntryForm
        open={form.open}
        mode={form.mode}
        initial={form.initial}
        uid={uid}
        members={members}
        orders={orders.map((o) => ({ id: o.id, title: o.title }))}
        canPublishWorkspace={canPublishWorkspace}
        t={t}
        onCancel={() => setForm((f) => ({ ...f, open: false }))}
        onSave={save}
      />
    </AppShell>
  );
}

