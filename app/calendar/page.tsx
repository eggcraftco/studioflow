"use client";

// Calendar V1 (28 Oct 2026; contract docs/calendar-v1-contract-2026-10-28.md in the app repo).
// One screen answers "what am I doing today", "who works which day", "what is due when" and "what did we do
// that day": the person's own and shared entries (meetings, tasks, daily notes, work days, unavailable
// days), the due dates of orders they can already open, and their own note reminders.
// Day / Week / Month / Agenda, the last choice remembered per person on this browser. Only the range on
// screen is read. Filters hide; they never grant (the rules decide who reads what).
// Run 3 (29 Oct): a write without a connection never leaves the form on "Saving…" (calendarOutbox), tasks done in
// the range show however long ago they were planned, and the business owner can archive or hand over a workspace
// entry whose maker has left (checked by the server).
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
  manageFormerMemberEntry,
  newCalendarEntryId,
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
  type CalendarEntryMeta,
  type CalendarRangeState,
  type CalendarReminderRow,
} from "@/lib/studioflow/calendarData";
import {
  calendarOutboxItems,
  dropCalendarOutboxItem,
  onCalendarOutbox,
  outboxKey,
  settleEarlierCalendarWrites,
  trackCalendarWrite,
  type CalendarOutboxItem,
  type CalendarOutboxKind,
} from "@/lib/studioflow/calendarOutbox";
import {
  DEFAULT_CALENDAR_FILTERS,
  OVERDUE_WINDOW_DAYS,
  applyCalendarFilters,
  buildCalendarItems,
  filtersActive,
  itemsByDay,
  overdueTasks,
  parseCalendarFilters,
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
import { CalendarConnectionsPanel, CalendarExternalDetail } from "./CalendarExternalPanels";
import { calendarConnectorsAvailable, listenToCalendarConnections, listenToExternalEvents, type CalendarConnection } from "@/lib/studioflow/calendarExternal";
import type { CalendarExternalLike, CalendarProvider } from "@/lib/studioflow/calendarView";
import { PROVIDER_META, TASK_STATE_META, TYPE_META, dayLabel, iconFor, timeLabel } from "./calendarUi";

const VIEW_KEY = (uid: string) => `nivadesk.calendar.view.v1.${uid}`;
const SEARCH_SPAN_DAYS = 180;
const KINDS: CalendarItemKind[] = ["event", "task", "note", "workday", "unavailable", "orderDue", "noteReminder", "external"];

/** QA only: an emulator build on this computer (localhost + NEXT_PUBLIC_FIREBASE_EMULATOR=1) may show the calendar in
 *  another zone (`localStorage["nivadesk.qa.timeZone"]`) so a screen check needs no change to the computer's settings.
 *  A production build has no emulator flag: the branch is compiled out and the device zone is always used. */
function qaTimeZone(): string | null {
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR !== "1" || typeof window === "undefined") return null;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return null;
  try {
    const zone = window.localStorage.getItem("nivadesk.qa.timeZone");
    return zone && core.isTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

const FILTERS_KEY = (uid: string) => `nivadesk.calendar.filters.v1.${uid}`;

/** The last filter choice on this device (V1.1): read back defensively, never shared. */
function readFilters(uid: string): CalendarFilters {
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY(uid));
    return parseCalendarFilters(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_CALENDAR_FILTERS;
  }
}

function writeFilters(uid: string, filters: CalendarFilters) {
  try {
    window.localStorage.setItem(FILTERS_KEY(uid), JSON.stringify(filters));
  } catch {
    /* private window: the choice is simply not remembered */
  }
}

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

/** What a write that did not go through says (the form, the toasts and the list of drafts use the same words). */
function failedText(code: string | null, t: (text: string) => string): string {
  if (code === "conflict") return t("Someone else changed this entry while you were editing. Your changes were not saved; reopen it and try again.");
  if (code === "gone" || code === "permission-denied") return t("Not saved: you no longer have access to this. Your text is kept.");
  if (code === "unavailable" || code === "failed-precondition" || code === "deadline-exceeded") return t("Not saved: there was no connection. Your text is kept — try again.");
  return t("Not saved. Nothing was changed — try again.");
}

type CalendarFormState = { open: boolean; mode: CalendarFormMode; initial: CalendarDraft; entryId: string | null; notice: string };

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
  const viewerTz = useMemo(() => qaTimeZone() || core.deviceTimeZone(), []);
  const [todayKey, setTodayKey] = useState(() => localDayKey(new Date()));

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [workspaceError, setWorkspaceError] = useState(false);
  // V1.1: the person's own Google / Outlook calendars (read only; only they see them).
  const [connections, setConnections] = useState<Partial<Record<CalendarProvider, CalendarConnection>>>({});
  const [connectorsOn, setConnectorsOn] = useState<Record<CalendarProvider, boolean> | null>(null);
  const [externals, setExternals] = useState<CalendarExternalLike[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [members, setMembers] = useState<NoteWorkspaceMember[]>([]);
  const [orders, setOrders] = useState<CalendarOrderLike[]>([]);
  const [notes, setNotes] = useState<CalendarNoteLike[]>([]);
  const [reminders, setReminders] = useState<Map<string, CalendarReminderRow>>(new Map());

  const [view, setView] = useState<CalendarViewMode>("month");
  const [anchor, setAnchor] = useState(todayKey);
  const [searchText, setSearchText] = useState("");
  const [searchFrom, setSearchFrom] = useState(() => core.addDays(localDayKey(new Date()), -SEARCH_SPAN_DAYS));
  const [searchTo, setSearchTo] = useState(() => core.addDays(localDayKey(new Date()), SEARCH_SPAN_DAYS));
  const [filters, setFiltersState] = useState<CalendarFilters>(DEFAULT_CALENDAR_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const setFilters = (next: CalendarFilters) => {
    setFiltersState(next);
    if (user) writeFilters(user.uid, next);
  };
  useEffect(() => {
    if (user) setFiltersState(readFilters(user.uid));
  }, [user]);

  const [rangeState, setRangeState] = useState<CalendarRangeState>({ entries: [], loading: true, error: null, meta: new Map() });
  const [reloadTick, setReloadTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CalendarFormState>({ open: false, mode: { kind: "create" }, initial: emptyDraft(todayKey, viewerTz), entryId: null, notice: "" });
  // The open form's write while it waits for the server (its outbox key), and what came back after the wait.
  const formKey = useRef<string | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [formRemoteError, setFormRemoteError] = useState("");
  const [outbox, setOutbox] = useState<CalendarOutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const pendingOpen = useRef<{ entryId: string; dateKey: string } | null>(null);
  // Keyboard: whatever opened the form or the detail panel gets the focus back when it closes.
  const formOpener = useRef<HTMLElement | null>(null);
  const detailOpener = useRef<HTMLElement | null>(null);
  // The day view's hour list was last scrolled for this list element, day and first hour (once, then left to the person;
  // a list mounted again, e.g. back from the week view, is scrolled again).
  const hoursScrolledFor = useRef<{ el: HTMLOListElement | null; key: string }>({ el: null, key: "" });

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

  useEffect(() => {
    const update = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Writes not confirmed yet (this page or an earlier one): their answer is announced when it comes; a refused one
  // keeps its text in the list above the calendar.
  useEffect(() => {
    if (!workspace || !user) return;
    const companyId = workspace.id;
    const me = user.uid;
    const refresh = () => setOutbox(calendarOutboxItems(companyId, me));
    refresh();
    const stopSettle = settleEarlierCalendarWrites(companyId, me);
    const stop = onCalendarOutbox((event) => {
      refresh();
      const item = event.item;
      if (!item || item.companyId !== companyId || item.uid !== me || event.type === "changed") return;
      const title = item.title || t("Untitled entry");
      if (item.key === formKey.current) {
        setFormPending(false);
        if (event.type === "saved") setForm((f) => ({ ...f, open: false }));
        else setFormRemoteError(failedText(item.errorCode, t));
      }
      dispatchStudioToast({ message: event.type === "saved"
        ? t("Saved after the connection came back: {title}").replace("{title}", title)
        : item.draft ? t("Not saved: {title}. Your text is kept — open it from the list above the calendar.").replace("{title}", title) : failedText(item.errorCode, t) });
    });
    return () => {
      stop();
      stopSettle();
    };
  }, [workspace, user, t]);

  const searching = searchText.trim().length > 0;
  const range = useMemo(() => (searching ? { fromKey: searchFrom <= searchTo ? searchFrom : searchTo, toKey: searchFrom <= searchTo ? searchTo : searchFrom } : rangeFor(view, anchor)), [searching, searchFrom, searchTo, view, anchor]);

  useEffect(() => {
    if (!workspace || !user) return;
    setRangeState((s) => ({ ...s, loading: true, error: null }));
    return listenToCalendarRange(workspace.id, user.uid, range.fromKey, range.toKey, setRangeState);
  }, [workspace, user, range.fromKey, range.toKey, reloadTick]);

  useEffect(() => {
    if (!workspace || !user) return;
    return listenToCalendarConnections(workspace.id, user.uid, setConnections);
  }, [workspace, user]);
  useEffect(() => {
    if (!workspace || !user) return;
    let live = true;
    calendarConnectorsAvailable(workspace.id).then((a) => { if (live) setConnectorsOn(a); }, () => { if (live) setConnectorsOn({ google: false, microsoft: false }); });
    return () => { live = false; };
  }, [workspace, user]);
  const connectedProviders = (Object.keys(connections) as CalendarProvider[]).sort().join(",");
  useEffect(() => {
    if (!workspace || !user || !connectedProviders) { setExternals([]); return; }
    return listenToExternalEvents(workspace.id, user.uid, connectedProviders.split(",") as CalendarProvider[], range.fromKey, range.toKey, setExternals);
  }, [workspace, user, connectedProviders, range.fromKey, range.toKey]);

  const items = useMemo(() => {
    if (!user) return [];
    // An archived entry (a former member's, archived by the business owner) shows only when asked for.
    const entries = rangeState.entries.filter((e) => showArchived || !rangeState.meta.get(e.id)?.archived);
    return buildCalendarItems({ entries, orders, notes, uid: user.uid, fromKey: range.fromKey, toKey: range.toKey, viewerTimeZone: viewerTz, todayKey, externals });
  }, [rangeState.entries, rangeState.meta, showArchived, orders, notes, user, range.fromKey, range.toKey, viewerTz, todayKey, externals]);
  const shown = useMemo(() => searchCalendarItems(applyCalendarFilters(items, filters), searchText), [items, filters, searchText]);
  // The Today view (V1.1): open tasks planned in the last OVERDUE_WINDOW_DAYS days, from the entries already loaded for the
  // day (the range read covers the 64 days before it) — no extra read.
  const overdue = useMemo(() => {
    if (!user || view !== "day" || anchor !== todayKey || searching) return [];
    const entries = rangeState.entries.filter((e) => showArchived || !rangeState.meta.get(e.id)?.archived);
    const past = buildCalendarItems({ entries, orders: [], notes: [], uid: user.uid, fromKey: core.addDays(todayKey, -OVERDUE_WINDOW_DAYS), toKey: core.addDays(todayKey, -1), viewerTimeZone: viewerTz, todayKey });
    return overdueTasks(applyCalendarFilters(past, filters), todayKey);
  }, [user, view, anchor, todayKey, searching, rangeState.entries, rangeState.meta, showArchived, viewerTz, filters]);
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
  const isBusinessOwner = Boolean(memberCtx?.isWorkspaceOwner);
  // A maker who is neither the business owner nor in the member list has left (shown only once the list is loaded;
  // the server checks it again before anything changes).
  const formerMember = (ownerUid: string) => members.length > 0 && ownerUid !== workspace?.ownerUid && ownerUid !== workspace?.id && !members.some((m) => m.uid === ownerUid);
  const transferTargets = members.filter((m) => !m.suspended && (m.isOwner || ["owner", "admin", "member"].includes(normalizeWorkspaceRole(m.role))))
    .map((m) => ({ uid: m.uid, label: m.name || m.email || m.uid }));
  const hasArchived = [...rangeState.meta.values()].some((m) => m.archived);
  const pendingCount = outbox.filter((i) => i.state === "pending").length;
  const failedDrafts = outbox.filter((i) => i.state === "failed" && i.draft);
  const accessOf = (item: CalendarItem) => (item.entry ? core.entryAccess(item.entry, uid, memberCtx) : { read: true, edit: false, remove: false, share: false, setStatus: false });

  function changeView(next: CalendarViewMode) {
    setView(next);
    writeView(uid, next);
  }

  function focusedElement(): HTMLElement | null {
    const active = typeof document === "undefined" ? null : document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  }

  function restoreFocus(opener: React.MutableRefObject<HTMLElement | null>) {
    const el = opener.current;
    opener.current = null;
    window.setTimeout(() => { if (el && el.isConnected) el.focus(); }, 0);
  }

  function closeForm() {
    setForm((f) => ({ ...f, open: false }));
    formKey.current = null;
    setFormPending(false);
    restoreFocus(formOpener);
  }

  function showForm(next: CalendarFormState) {
    setFormPending(false);
    setFormRemoteError("");
    formKey.current = next.mode.kind === "create" ? outboxKey("create", next.entryId as string) : outboxKey("edit", next.mode.entry.id, next.mode.occurrenceKey);
    setForm(next);
  }

  function openCreate(dateKey: string, type: core.CalendarEntryType = "event", startTime: string | null = null) {
    if (!workspace) return;
    formOpener.current = focusedElement();
    // The id is chosen now: saving twice or reopening this draft can only ever write this one entry.
    showForm({ open: true, mode: { kind: "create" }, initial: emptyDraft(dateKey, viewerTz, type, startTime), entryId: newCalendarEntryId(workspace.id), notice: "" });
  }

  /** A draft whose write was refused (kept in the outbox): back into a form, the same entry id when it was new. */
  function openDraft(item: CalendarOutboxItem) {
    if (!workspace || !item.draft) return;
    formOpener.current = focusedElement();
    if (item.kind === "create") {
      showForm({ open: true, mode: { kind: "create" }, initial: item.draft, entryId: item.entryId, notice: "" });
      return;
    }
    const entry = rangeState.entries.find((e) => e.id === item.entryId);
    if (entry) {
      const access = core.entryAccess(entry, uid, memberCtx);
      if (access.edit) {
        dropCalendarOutboxItem(item.key);
        showForm({ open: true, mode: { kind: "edit", entry, occurrenceKey: item.occurrenceKey, canShare: access.share }, initial: item.draft, entryId: null, notice: "" });
        return;
      }
    }
    // The entry is gone or no longer editable: the text becomes a new entry of the person's own.
    dropCalendarOutboxItem(item.key);
    showForm({ open: true, mode: { kind: "create" }, initial: { ...item.draft, visibility: "private", viewerUids: [], editorUids: [], workspaceRole: "view", recurrence: null },
      entryId: newCalendarEntryId(workspace.id), notice: t("The original entry is no longer available to you. Saving makes a new entry of your own.") });
  }

  function openEdit(item: CalendarItem) {
    if (!item.entry || !item.occurrence) return;
    const access = accessOf(item);
    const occurrenceKey = item.entry.rowType === "series" ? item.occurrence.occurrenceKey : null;
    formOpener.current = focusedElement();
    showForm({ open: true, mode: { kind: "edit", entry: item.entry, occurrenceKey, canShare: access.share }, initial: draftFromOccurrence(item.entry, item.occurrence), entryId: null, notice: "" });
  }

  async function save(draft: CalendarDraft, scope: CalendarSeriesScope | null): Promise<"done" | "pending"> {
    if (!workspace) return "done";
    const companyId = workspace.id;
    const mode = form.mode;
    let write: Promise<unknown>;
    let kind: CalendarOutboxKind = "edit";
    let entryId: string;
    let occurrenceKey: string | null = null;
    if (mode.kind === "create") {
      kind = "create";
      entryId = form.entryId || newCalendarEntryId(companyId);
      write = createCalendarEntry(companyId, uid, draft, entryId);
    } else {
      entryId = mode.entry.id;
      occurrenceKey = mode.occurrenceKey;
      if (mode.entry.rowType === "series" && mode.occurrenceKey && scope === "only") write = saveOnlyThisOccurrence(companyId, uid, mode.entry, mode.occurrenceKey, draft);
      else if (mode.entry.rowType === "series" && mode.occurrenceKey && scope === "following") write = saveThisAndFollowing(companyId, uid, mode.entry, mode.occurrenceKey, draft);
      else write = saveCalendarEntryEdits(companyId, uid, mode.entry, draft, mode.canShare);
    }
    const title = draft.title.trim() || core.autoNoteTitle(draft.description);
    const result = await trackCalendarWrite({ companyId, uid, kind, entryId, title, draft, occurrenceKey }, write);
    if (result === "done") {
      closeForm();
      dispatchStudioToast({ message: t("Entry saved") });
    } else {
      setFormPending(true);
    }
    return result;
  }

  // Any other write from the detail panel: it never hangs there either; the answer is announced if it is late.
  async function tracked(kind: CalendarOutboxKind, entry: core.CalendarEntry, occurrenceKey: string | null, write: Promise<unknown>, doneMessage: string) {
    if (!workspace) return;
    const result = await trackCalendarWrite({ companyId: workspace.id, uid, kind, entryId: entry.id, title: entry.title, draft: null, occurrenceKey }, write);
    dispatchStudioToast({ message: result === "done" ? doneMessage : t("Not confirmed yet — no connection. You'll be told when it is.") });
  }

  async function removeSelected(scope: "single" | "only" | "following") {
    if (!workspace || !selected?.entry || !selected.occurrence) return;
    const entry = selected.entry;
    const key = selected.occurrence.occurrenceKey;
    const write = scope === "only" ? deleteOnlyThisOccurrence(workspace.id, uid, entry, key)
      : scope === "following" ? deleteThisAndFollowing(workspace.id, uid, entry, key)
        : deleteCalendarEntry(workspace.id, entry.id);
    await tracked(scope === "single" ? "delete" : "edit", entry, scope === "single" ? null : key, write, t("Entry deleted"));
    setSelectedId(null);
  }

  async function manageFormer(entry: core.CalendarEntry, action: "archive" | "transfer", toUid: string | null) {
    if (!workspace) return;
    await manageFormerMemberEntry(workspace.id, entry.id, action, toUid);
    dispatchStudioToast({ message: action === "archive" ? t("Entry archived") : t("Entry handed over") });
    if (action === "archive" && !showArchived) setSelectedId(null);
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

  // The planned day of a task shown on the day it was done: with the year when that was another year.
  function plannedLabel(item: CalendarItem): string {
    const planned = item.occurrence?.dateKey || "";
    const withYear = planned.slice(0, 4) !== (item.completedDay || todayKey).slice(0, 4);
    return dayLabel(planned, locale, withYear ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : undefined);
  }

  function chip(row: { item: CalendarItem; asCompletion: boolean }, compact = false, spokenCompletion = true) {
    const { item, asCompletion } = row;
    const meta = TYPE_META[item.kind];
    const time = !item.allDay && item.startMs !== null ? timeLabel(item.startMs, locale, viewerTz) : "";
    const state = item.taskState;
    const stateText = state && state !== "open" ? t(TASK_STATE_META[state].label) : "";
    const label = [time, item.title || t(meta.label)].filter(Boolean).join(" ");
    const completionNote = asCompletion && item.occurrence ? ` · ${t("Done on this day · planned for {date}").replace("{date}", plannedLabel(item))}` : "";
    const rowMeta = item.entry ? rangeState.meta.get(item.entry.id) : undefined;
    const marks = `${rowMeta?.pending ? " ⏳" : ""}${rowMeta?.archived ? " 🗄" : ""}`;
    // Who can see it, on every entry card (V1.1): a lock for "only me", a link for selected people, a building for the workspace.
    const vis = item.entry?.visibility;
    const visMark = vis === "private" ? "🔒" : vis === "selected" ? "🔗" : vis === "workspace" ? "🏢" : "";
    const visNote = vis === "private" ? t("Only you can see this.") : vis === "workspace" ? t(item.entry?.workspaceRole === "edit" ? "Everyone in the workspace can edit this." : "Everyone in the workspace can see this.") : vis === "selected" ? t("Selected people") : "";
    const metaNote = `${rowMeta?.pending ? ` · ${t("Not synced yet — only on this device until the connection is back.")}` : ""}${rowMeta?.archived ? ` · ${t("Archived: made by someone who has left the workspace.")}` : ""}`;
    // A meeting from Google / Outlook says where it came from, and that it has a join link, on the card itself (V1.1).
    const source = item.external ? t(PROVIDER_META[item.external.provider].label) : "";
    const sourceNote = item.external ? ` · ${source}${item.external.joinUrl ? ` · ${t("Join meeting")}` : ""}` : "";
    return (
      <button
        key={`${item.id}${asCompletion ? ":done" : ""}`}
        type="button"
        className={`cal-chip cal-tone-${meta.tone}${state ? ` cal-state-${state}` : ""}${asCompletion ? " is-completion" : ""}${selectedId === item.id ? " is-selected" : ""}`}
        onClick={(e) => { e.stopPropagation(); detailOpener.current = e.currentTarget; setSelectedId(item.id); }}
        title={`${t(meta.label)}${stateText ? ` · ${stateText}` : ""} · ${label}${completionNote}${metaNote}${visNote ? ` · ${visNote}` : ""}${sourceNote}`}
      >
        <span className="cal-chip-icon" aria-hidden="true">{iconFor(item.kind, state)}</span>
        <span className="cal-chip-text">{label}{marks ? <span aria-hidden="true">{marks}</span> : null}</span>
        {!compact && stateText ? <span className="cal-chip-state">{stateText}</span> : null}
        {visMark && !compact ? <span className="cal-chip-vis" aria-hidden="true">{visMark}</span> : null}
        {item.external && !compact && item.external.joinUrl ? <span className="cal-chip-vis" aria-hidden="true">🎥</span> : null}
        {/* The brand only, and it gives way first: the title keeps the room (hidden in the 7-column week, see globals.css). */}
        {item.external && !compact ? <span className="cal-chip-src" aria-hidden="true">{PROVIDER_META[item.external.provider].short}</span> : null}
        <span className="visually-hidden-file">{t(meta.label)}{spokenCompletion ? completionNote : ""}{metaNote}{visNote ? ` · ${visNote}` : ""}{sourceNote}</span>
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
    // Opens an hour before the first timed entry (08:00 on an empty day), not at midnight: on 30 Oct nine empty hours
    // sat above the 09:00 meetings.
    const firstHour = timed.length ? Math.min(...timed.map((r) => hourOf(r.item.startMs))) : 9;
    const scrollKey = `${anchor}|${firstHour}`;
    const scrollHours = (el: HTMLOListElement | null) => {
      if (!el || (hoursScrolledFor.current.el === el && hoursScrolledFor.current.key === scrollKey)) return;
      hoursScrolledFor.current = { el, key: scrollKey };
      const row = el.children[Math.max(0, firstHour - 1)] as HTMLElement | undefined;
      el.scrollTop = row ? row.offsetTop : 0;
    };
    return (
      <div className="cal-day">
        <div className="cal-quick-add" role="group" aria-label={`${t("New entry")} · ${dayLabel(anchor, locale)}`}>
          {(["event", "task", "note", "workday"] as const).map((type) => (
            <button key={type} type="button" className="button secondary" onClick={() => openCreate(type === "note" && anchor > todayKey ? todayKey : anchor, type)}>
              ＋ {t(TYPE_META[type].label)}
            </button>
          ))}
        </div>
        {overdue.length ? (
          <section className="cal-overdue" aria-label={t("Overdue")}>
            <h3>{t("Overdue")} <span className="muted-copy">· {t("Open tasks planned in the last 14 days")}</span></h3>
            <div className="cal-chips">
              {overdue.map((row) => (
                <div key={row.item.id} className="cal-overdue-row">
                  {chip({ item: row.item, asCompletion: false })}
                  <span className="muted-copy">{t("Late since {date}").replace("{date}", dayLabel(row.sinceKey, locale))}{row.count > 1 ? ` · ${t("{count} times").replace("{count}", String(row.count))}` : ""}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <div className="cal-day-allday">
          <span className="cal-hour-label">{t("All day")}</span>
          <div className="cal-chips">{allDayRows.length ? allDayRows.map((r) => chip(r)) : <span className="muted-copy">—</span>}</div>
        </div>
        <ol className="cal-hours" ref={scrollHours}>
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
        {daysWithItems.length === 0 && searching && rangeState.loading ? <p className="muted-copy" role="status">{t("Searching…")}</p> : null}
        {daysWithItems.length === 0 && !(searching && rangeState.loading) ? (
          <p className="muted-copy">{searching
            ? t("Nothing found between {from} and {to}. Change the dates to search further back or ahead.")
              .replace("{from}", dayLabel(range.fromKey, locale, { day: "numeric", month: "short", year: "numeric" }))
              .replace("{to}", dayLabel(range.toKey, locale, { day: "numeric", month: "short", year: "numeric" }))
            : t("Nothing on this day.")}</p>
        ) : null}
        {daysWithItems.map(([d, rows]) => (
          <section key={d} className={`cal-agenda-day${d === todayKey ? " is-today" : ""}`}>
            <h3>{dayLabel(d, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
            <ul>
              {rows.map((r) => (
                <li key={`${r.item.id}${r.asCompletion ? ":done" : ""}`} className="cal-agenda-row">
                  {chip(r, false, false)}
                  {r.item.subtitle ? <span className="muted-copy">{r.item.subtitle}</span> : null}
                  {r.asCompletion && r.item.occurrence ? <span className="muted-copy">{t("Done on this day · planned for {date}").replace("{date}", plannedLabel(r.item))}</span> : null}
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
            <span className="muted-copy cal-zone">{t("Times in {zone}").replace("{zone}", viewerTz)}</span>
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
                <label className="cal-inline-field"><span>{t("Search from")}</span><input type="date" className="input" aria-label={t("Search from")} value={searchFrom} onChange={(e) => { if (core.isDateKey(e.target.value)) setSearchFrom(e.target.value); }} /></label>
                <label className="cal-inline-field"><span>{t("Search until")}</span><input type="date" className="input" aria-label={t("Search until")} value={searchTo} onChange={(e) => { if (core.isDateKey(e.target.value)) setSearchTo(e.target.value); }} /></label>
              </>
            ) : null}
            {/* Only for people the server has opened Google / Outlook for, or who already have a connection to see or remove:
                during the pilot everyone else sees no sign of it. */}
            {connectorsOn?.google || connectorsOn?.microsoft || Object.keys(connections).length ? (
              <button type="button" className="button secondary" aria-expanded={connectionsOpen} onClick={() => setConnectionsOpen((v) => !v)}>
                🌐 {t("Your other calendars")}{Object.values(connections).some((c) => c && c.status !== "active") ? " ⚠" : ""}
              </button>
            ) : null}
            <button type="button" className={`button secondary${filtersActive(filters) ? " is-active" : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
              {t("Filters")}{filtersActive(filters) ? " •" : ""}
            </button>
          </div>
          {connectionsOpen && workspace && (connectorsOn?.google || connectorsOn?.microsoft || Object.keys(connections).length) ? (
            <CalendarConnectionsPanel companyId={workspace.id} connections={connections} available={connectorsOn} locale={locale} timeZone={viewerTz} t={t} onNotice={(message) => dispatchStudioToast({ message })} />
          ) : null}
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
              {isBusinessOwner && (hasArchived || showArchived) ? (
                <label className="cal-check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> <span>{t("Show archived entries of people who left")}</span></label>
              ) : null}
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
                {!online ? <p className="muted-copy cal-loading" role="status">{t("You're offline. Changes stay on this device until the connection is back.")}</p> : null}
                {pendingCount ? <p className="muted-copy cal-loading" role="status">⏳ {t("Waiting to be confirmed: {count}").replace("{count}", String(pendingCount))}</p> : null}
                {failedDrafts.map((item) => (
                  <div key={item.key} className="layout-error" role="alert">
                    <strong>{item.title || t("Untitled entry")}</strong> — {failedText(item.errorCode, t)}{" "}
                    <button type="button" className="button secondary" onClick={() => openDraft(item)}>{t("Open")}</button>{" "}
                    <button type="button" className="cal-link-button" onClick={() => dropCalendarOutboxItem(item.key)}>{t("Discard")}</button>
                  </div>
                ))}
                {rangeState.loading ? <p className="muted-copy cal-loading" role="status">{t("Loading calendar…")}</p> : null}
                {(Object.values(connections) as CalendarConnection[]).map((c) => {
                  // What is not loaded is said, never shown as "nothing there" (V1.1). In the month view only the month's
                  // own days count: on 30 Oct the grid's 28-29 Sep made both notes show on the current month.
                  const label = t(PROVIDER_META[c.provider].label);
                  const monthStart = `${anchor.slice(0, 7)}-01`;
                  const asMonth = view === "month" && !searching;
                  const shownFrom = asMonth ? monthStart : range.fromKey;
                  const shownTo = asMonth ? core.addDays(`${core.addDays(monthStart, 31).slice(0, 7)}-01`, -1) : range.toKey;
                  const before = c.windowStartKey && shownFrom < c.windowStartKey;
                  const after = c.windowEndKey && shownTo > c.windowEndKey;
                  const stale = c.status !== "active";
                  if (!before && !after && !stale) return null;
                  return (
                    <p key={c.provider} className="muted-copy cal-loading" role="status">
                      🌐 {stale ? `${label}: ${t(c.status === "reconnect" ? "Connect again to keep this calendar up to date. The meetings shown may be out of date." : "Could not sync just now. NivaDesk will try again; the meetings shown may be out of date.")} ` : ""}
                      {before ? `${label}: ${t("meetings before {date} are not loaded.").replace("{date}", dayLabel(c.windowStartKey || "", locale, { day: "numeric", month: "short", year: "numeric" }))} ` : ""}
                      {after ? `${label}: ${t("meetings after {date} are not loaded.").replace("{date}", dayLabel(c.windowEndKey || "", locale, { day: "numeric", month: "short", year: "numeric" }))}` : ""}
                    </p>
                  );
                })}
                {rangeState.error ? (
                  <div className="layout-error" role="alert">{t("The calendar could not be loaded.")} <button type="button" className="button secondary" onClick={() => setReloadTick((n) => n + 1)}>{t("Try again")}</button></div>
                ) : null}
                {/* Not in the day view: its quick-add row already offers the same (30 Oct: the two showed together). */}
                {noEntries && !searching && !filtersActive(filters) && view !== "day" ? emptyStarters(todayKey) : null}
                {searching ? renderAgenda() : view === "month" ? renderMonth() : view === "week" ? renderWeek() : view === "day" ? renderDay() : renderAgenda()}
              </>
            )}
          </main>
          {selected && workspace && selected.kind === "external" ? (
            <CalendarExternalDetail item={selected} locale={locale} timeZone={viewerTz} t={t} onClose={() => setSelectedId(null)} />
          ) : selected && workspace ? (
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
              onClose={() => { setSelectedId(null); restoreFocus(detailOpener); }}
              onEdit={() => openEdit(selected)}
              onDelete={removeSelected}
              onStatus={async (status) => {
                if (!selected.entry || !selected.occurrence) return;
                const key = selected.occurrence.occurrenceKey;
                await tracked("status", selected.entry, key, setCalendarTaskStatus(workspace.id, uid, selected.entry, key, status), t("Entry saved"));
              }}
              onReminder={async (offset, allDayTime) => {
                if (!selected.entry) return;
                await tracked("reminder", selected.entry, null, saveMyCalendarReminder(workspace.id, uid, selected.entry.id, offset, allDayTime, viewerTz, reminders.has(selected.entry.id)), t("Reminder saved"));
              }}
              meta={selected.entry ? rangeState.meta.get(selected.entry.id) || null : null}
              formerOwner={Boolean(selected.entry && selected.entry.visibility === "workspace" && formerMember(selected.entry.ownerUid))}
              canManageFormer={isBusinessOwner}
              transferTargets={transferTargets}
              onManageFormer={(action, toUid) => (selected.entry ? manageFormer(selected.entry, action, toUid) : Promise.resolve())}
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
        notice={form.notice}
        pending={formPending}
        remoteError={formRemoteError}
        onCancel={closeForm}
        onSave={save}
      />
    </AppShell>
  );
}

