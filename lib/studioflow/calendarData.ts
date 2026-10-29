// Calendar V1 — Firestore reads and writes for the web (contract: docs/calendar-v1-contract-2026-10-28.md
// in the app repo). The rules decide who reads and changes what (firestore.rules, calendarEntries /
// calendarReminders / calendarInbox); this file only asks for what the rules allow:
//   - lists always say which half they want: `accessUids array-contains <me>` or `visibility == workspace`
//     (a list without one of those is refused as a whole);
//   - only the visible date range is read, never a workspace's whole history (tasks done inside the range are
//     found by the day they were done — `completedAt` — however long ago they were planned);
//   - every change moves `version` on by one inside a transaction that first checks the copy on screen is
//     still the latest, so two people editing at once get a "someone else changed it" message instead of a
//     silent overwrite.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  orderBy,
  limit,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import * as core from "./calendarCore";
import type { CalendarEntry, CalendarEntryType, CalendarRecurrence, CalendarTaskStatus, CalendarVisibility } from "./calendarCore";

export class CalendarConflictError extends Error {
  constructor() {
    super("calendar-conflict");
    this.name = "CalendarConflictError";
  }
}

export class CalendarGoneError extends Error {
  constructor() {
    super("calendar-gone");
    this.name = "CalendarGoneError";
  }
}

const entriesCol = (companyId: string) => collection(db, "companies", companyId, "calendarEntries");
const entryDoc = (companyId: string, entryId: string) => doc(db, "companies", companyId, "calendarEntries", entryId);

// ---------------------------------------------------------------- reading a range

/** What a row says beyond the shared entry shape: written by the server (archive / hand-over of a former member's
 *  entry), or only on this device so far (`pending`: not confirmed by the server yet). */
export type CalendarEntryMeta = {
  pending: boolean;
  archived: boolean;
  archivedAtMs: number | null;
  transferredFromUid: string | null;
  transferredAtMs: number | null;
  transferredByUid: string | null;
};
export type CalendarRangeState = { entries: CalendarEntry[]; loading: boolean; error: string | null; meta: Map<string, CalendarEntryMeta> };

function metaOf(data: DocumentData, pending: boolean): CalendarEntryMeta {
  return {
    pending,
    archived: Boolean(data.archivedAt),
    archivedAtMs: core.millis(data.archivedAt),
    transferredFromUid: typeof data.transferredFromUid === "string" ? data.transferredFromUid : null,
    transferredAtMs: core.millis(data.transferredAt),
    transferredByUid: typeof data.transferredByUid === "string" ? data.transferredByUid : null,
  };
}

/** Live entries that can show in [fromKey, toKey] for this person. Six listeners: mine/shared × single/series/
 *  done-in-range, workspace × the same; a series is read when it started before the range ends, a task by the day
 *  it was done (padded a day and a half each side for time zones) so one planned 400 days ago shows on that day. */
export function listenToCalendarRange(
  companyId: string,
  uid: string,
  fromKey: string,
  toKey: string,
  onChange: (state: CalendarRangeState) => void,
): Unsubscribe {
  const queryFrom = core.addDays(fromKey, -(core.MAX_SPAN_DAYS + 2));
  const queryTo = core.addDays(toKey, 2);
  const doneFrom = Timestamp.fromMillis(Date.parse(`${fromKey}T00:00:00Z`) - 36 * 3600_000);
  const doneTo = Timestamp.fromMillis(Date.parse(`${toKey}T00:00:00Z`) + 60 * 3600_000);
  const parts = new Map<string, Map<string, CalendarEntry>>();
  const metas = new Map<string, Map<string, CalendarEntryMeta>>();
  const reported = new Set<string>();
  let error: string | null = null;
  const queries: [string, ReturnType<typeof query>][] = [
    ["named-entry", query(entriesCol(companyId), where("accessUids", "array-contains", uid), where("rowType", "==", "entry"), where("dateKey", ">=", queryFrom), where("dateKey", "<=", queryTo))],
    ["named-series", query(entriesCol(companyId), where("accessUids", "array-contains", uid), where("rowType", "==", "series"), where("dateKey", "<=", queryTo))],
    ["workspace-entry", query(entriesCol(companyId), where("visibility", "==", "workspace"), where("rowType", "==", "entry"), where("dateKey", ">=", queryFrom), where("dateKey", "<=", queryTo))],
    ["workspace-series", query(entriesCol(companyId), where("visibility", "==", "workspace"), where("rowType", "==", "series"), where("dateKey", "<=", queryTo))],
    ["named-done", query(entriesCol(companyId), where("accessUids", "array-contains", uid), where("completedAt", ">=", doneFrom), where("completedAt", "<", doneTo))],
    ["workspace-done", query(entriesCol(companyId), where("visibility", "==", "workspace"), where("completedAt", ">=", doneFrom), where("completedAt", "<", doneTo))],
  ];
  const emit = () => {
    const merged = new Map<string, CalendarEntry>();
    const meta = new Map<string, CalendarEntryMeta>();
    for (const [name, part] of parts) {
      for (const [id, entry] of part) merged.set(id, entry);
      for (const [id, m] of metas.get(name) || []) meta.set(id, { ...m, pending: m.pending || Boolean(meta.get(id)?.pending) });
    }
    onChange({ entries: [...merged.values()], loading: reported.size < queries.length && !error, error, meta });
  };
  const unsubs = queries.map(([name, q]) =>
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const part = new Map<string, CalendarEntry>();
        const partMeta = new Map<string, CalendarEntryMeta>();
        for (const d of snap.docs) {
          const entry = core.normalizeEntry(d.id, d.data());
          if (!entry) continue;
          part.set(d.id, entry);
          partMeta.set(d.id, metaOf(d.data() as DocumentData, d.metadata.hasPendingWrites));
        }
        parts.set(name, part);
        metas.set(name, partMeta);
        reported.add(name);
        emit();
      },
      (err) => {
        error = String(err?.code || err?.message || "error");
        parts.delete(name);
        metas.delete(name);
        reported.add(name);
        emit();
      },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

export async function loadCalendarEntry(companyId: string, entryId: string): Promise<CalendarEntry | null> {
  try {
    const snap = await getDoc(entryDoc(companyId, entryId));
    return snap.exists() ? core.normalizeEntry(snap.id, snap.data()) : null;
  } catch {
    // Refused and missing look the same on purpose (no hint that a private entry exists).
    return null;
  }
}

// ---------------------------------------------------------------- writing

export type CalendarDraft = {
  type: CalendarEntryType;
  title: string;
  description: string;
  allDay: boolean;
  dateKey: string;
  endDateKey: string;
  startTime: string | null;
  endTime: string | null;
  timeZone: string;
  location: string;
  meetingUrl: string;
  visibility: CalendarVisibility;
  viewerUids: string[];
  editorUids: string[];
  workspaceRole: "view" | "edit";
  personUid: string | null;
  personLabel: string | null;
  orderId: string | null;
  recurrence: CalendarRecurrence | null;
};

function timeFields(draft: Pick<CalendarDraft, "allDay" | "dateKey" | "endDateKey" | "startTime" | "endTime" | "timeZone">) {
  if (draft.allDay) return { startTime: null, endTime: null, startAt: null, endAt: null };
  const startMs = core.zonedTimeToUtcMs(draft.dateKey, draft.startTime as string, draft.timeZone);
  const endMs = core.zonedTimeToUtcMs(draft.endDateKey || draft.dateKey, draft.endTime as string, draft.timeZone);
  return {
    startTime: draft.startTime,
    endTime: draft.endTime,
    startAt: Number.isFinite(startMs) ? Timestamp.fromMillis(startMs) : null,
    endAt: Number.isFinite(endMs) ? Timestamp.fromMillis(endMs) : null,
  };
}

/** The stored content fields of a draft (everything a content edit may change). */
export function contentFields(draft: CalendarDraft): Record<string, unknown> {
  const title = draft.type === "note" && !draft.title.trim() ? core.autoNoteTitle(draft.description) : draft.title.trim();
  return {
    type: draft.type,
    title: title.slice(0, core.TITLE_MAX),
    description: draft.description.slice(0, core.DESCRIPTION_MAX),
    allDay: draft.allDay,
    dateKey: draft.dateKey,
    endDateKey: draft.endDateKey || draft.dateKey,
    timeZone: draft.timeZone,
    location: draft.location.trim(),
    meetingUrl: draft.meetingUrl.trim(),
    personUid: draft.personUid || null,
    personLabel: draft.personUid ? null : (draft.personLabel || "").trim() || null,
    orderId: draft.orderId || null,
    ...timeFields(draft),
  };
}

export function sharingFields(ownerUid: string, draft: CalendarDraft) {
  const s = core.sharingFor({
    ownerUid,
    visibility: draft.visibility,
    viewerUids: draft.viewerUids,
    editorUids: draft.editorUids,
    workspaceRole: draft.workspaceRole,
    personUid: draft.personUid,
    type: draft.type,
  });
  return { visibility: s.visibility, accessUids: s.accessUids, editorUids: s.editorUids, workspaceRole: s.workspaceRole };
}

/** The id a new entry will have, chosen when its form opens: saving it twice, reopening the form or reloading the
 *  page writes the same row again (refused as an update at version 1), never a second entry. */
export function newCalendarEntryId(companyId: string): string {
  return doc(entriesCol(companyId)).id;
}

export async function createCalendarEntry(companyId: string, uid: string, draft: CalendarDraft, entryId: string): Promise<string> {
  const ref = doc(entriesCol(companyId), entryId);
  const recurrence = draft.recurrence ? core.normalizeRecurrence(draft.recurrence) : null;
  await setDoc(ref, {
    companyId,
    schemaVersion: 1,
    rowType: recurrence ? "series" : "entry",
    ...contentFields(draft),
    status: "open",
    completedAt: null,
    completedByUid: null,
    ownerUid: uid,
    ...sharingFields(uid, draft),
    recurrence,
    exceptions: {},
    occurrenceStatus: {},
    splitFromId: null,
    source: "web",
    version: 1,
    createdAt: serverTimestamp(),
    createdByUid: uid,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
  return ref.id;
}

/** One change, checked against the version the screen showed. */
export async function updateCalendarEntry(companyId: string, uid: string, entry: CalendarEntry, patch: Record<string, unknown>): Promise<void> {
  const ref = entryDoc(companyId, entry.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new CalendarGoneError();
    const current = Number((snap.data() as DocumentData).version || 0);
    if (current !== entry.version) throw new CalendarConflictError();
    tx.update(ref, { ...patch, version: current + 1, updatedAt: serverTimestamp(), updatedByUid: uid });
  });
}

/** Owner or editor: content (and, for the owner, sharing) of a single entry or a whole series. */
export async function saveCalendarEntryEdits(companyId: string, uid: string, entry: CalendarEntry, draft: CalendarDraft, canShare: boolean): Promise<void> {
  const patch: Record<string, unknown> = { ...contentFields(draft) };
  const recurrence = draft.recurrence ? core.normalizeRecurrence(draft.recurrence) : null;
  patch.recurrence = recurrence;
  patch.rowType = recurrence ? "series" : "entry";
  if (!recurrence) {
    patch.exceptions = {};
    patch.occurrenceStatus = {};
  }
  if (canShare) {
    const sharing = sharingFields(entry.ownerUid, draft);
    const changed = sharing.visibility !== entry.visibility
      || JSON.stringify(sharing.accessUids) !== JSON.stringify(entry.accessUids)
      || JSON.stringify(sharing.editorUids) !== JSON.stringify(entry.editorUids)
      || sharing.workspaceRole !== entry.workspaceRole;
    Object.assign(patch, sharing);
    if (changed) {
      patch.sharingUpdatedAt = serverTimestamp();
      patch.sharingUpdatedByUid = uid;
    }
  }
  await updateCalendarEntry(companyId, uid, entry, patch);
}

export async function deleteCalendarEntry(companyId: string, entryId: string): Promise<void> {
  await deleteDoc(entryDoc(companyId, entryId));
}

/** Tick a task done / reopen / cancel — for a series, that one occurrence only. */
export async function setCalendarTaskStatus(companyId: string, uid: string, entry: CalendarEntry, occurrenceKey: string, status: CalendarTaskStatus): Promise<void> {
  const done = status === "done";
  const value = { status, completedAt: done ? serverTimestamp() : null, completedByUid: done ? uid : null };
  if (entry.rowType === "series") {
    await updateCalendarEntry(companyId, uid, entry, { [`occurrenceStatus.${occurrenceKey}`]: value });
  } else {
    await updateCalendarEntry(companyId, uid, entry, value);
  }
}

/** "Only this one" for a series occurrence. */
export async function saveOnlyThisOccurrence(companyId: string, uid: string, entry: CalendarEntry, occurrenceKey: string, draft: CalendarDraft): Promise<void> {
  const content = contentFields(draft);
  const changes: core.CalendarChanges = {};
  for (const field of core.EXCEPTION_FIELDS) {
    const value = content[field];
    const base = (entry as unknown as Record<string, unknown>)[field];
    if (field === "dateKey" || field === "endDateKey") {
      if (value !== occurrenceDefault(entry, occurrenceKey, field)) changes[field] = value as string;
      continue;
    }
    if (value !== base) changes[field] = value as string | boolean | null;
  }
  const patch = core.onlyThisPatch(entry, occurrenceKey, changes);
  await updateCalendarEntry(companyId, uid, entry, { [`exceptions.${occurrenceKey}`]: patch });
}

function occurrenceDefault(entry: CalendarEntry, key: string, field: "dateKey" | "endDateKey"): string {
  const span = core.dayNumber(entry.endDateKey) - core.dayNumber(entry.dateKey);
  return field === "dateKey" ? key : core.addDays(key, span);
}

export async function deleteOnlyThisOccurrence(companyId: string, uid: string, entry: CalendarEntry, occurrenceKey: string): Promise<void> {
  await updateCalendarEntry(companyId, uid, entry, { [`exceptions.${occurrenceKey}`]: { cancelled: true } });
}

/** "This and following": the old series ends the day before; a new series (same owner and sharing,
 *  id fixed by the split day) carries the change. One transaction: both or neither. */
export async function saveThisAndFollowing(companyId: string, uid: string, entry: CalendarEntry, occurrenceKey: string, draft: CalendarDraft): Promise<void> {
  const content = contentFields(draft);
  const changes: core.CalendarChanges = {};
  for (const field of core.EXCEPTION_FIELDS) {
    const value = content[field];
    const base = (entry as unknown as Record<string, unknown>)[field];
    if (field === "dateKey" || field === "endDateKey") {
      if (value !== occurrenceDefault(entry, occurrenceKey, field)) changes[field] = value as string;
      continue;
    }
    if (value !== base) changes[field] = value as string | boolean | null;
  }
  const recurrence = draft.recurrence ? core.normalizeRecurrence(draft.recurrence) : null;
  if (recurrence && JSON.stringify(recurrence) !== JSON.stringify(entry.recurrence)) changes.recurrence = recurrence;
  const split = core.splitSeries(entry, occurrenceKey, changes);
  if (split.mode === "whole") {
    await saveCalendarEntryEdits(companyId, uid, entry, draft, entry.ownerUid === uid);
    return;
  }
  const oldRef = entryDoc(companyId, entry.id);
  const newRef = entryDoc(companyId, split.newId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(oldRef);
    if (!snap.exists()) throw new CalendarGoneError();
    const data = snap.data() as DocumentData;
    if (Number(data.version || 0) !== entry.version) throw new CalendarConflictError();
    // No read of newRef: a calendar row nobody may read yet (it does not exist) is refused like any
    // other, so the transaction would fail. A second split on the same day cannot create a copy
    // anyway: writing an existing row is an update and the rules refuse version 1 there.
    tx.update(oldRef, {
      recurrence: split.old.recurrence,
      exceptions: split.old.exceptions,
      occurrenceStatus: occurrenceStatusForWrite(split.old.occurrenceStatus),
      version: entry.version + 1,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
    const span = core.dayNumber(content.endDateKey as string) - core.dayNumber(content.dateKey as string);
    const dateKey = split.next.dateKey;
    tx.set(newRef, {
      companyId,
      schemaVersion: 1,
      rowType: "series",
      ...content,
      ...timeFields({ ...draft, dateKey, endDateKey: core.addDays(dateKey, span) }),
      dateKey,
      endDateKey: core.addDays(dateKey, span),
      status: "open",
      completedAt: null,
      completedByUid: null,
      ownerUid: entry.ownerUid,
      visibility: entry.visibility,
      accessUids: entry.accessUids,
      editorUids: entry.editorUids,
      workspaceRole: entry.workspaceRole,
      recurrence: split.next.recurrence,
      exceptions: split.next.exceptions,
      occurrenceStatus: occurrenceStatusForWrite(split.next.occurrenceStatus),
      splitFromId: entry.id,
      source: "web",
      version: 1,
      createdAt: serverTimestamp(),
      createdByUid: uid,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
  });
}

export async function deleteThisAndFollowing(companyId: string, uid: string, entry: CalendarEntry, occurrenceKey: string): Promise<void> {
  const end = core.endSeriesBefore(entry, occurrenceKey);
  if (end.mode === "deleteAll") {
    await deleteCalendarEntry(companyId, entry.id);
    return;
  }
  await updateCalendarEntry(companyId, uid, entry, {
    recurrence: end.recurrence,
    exceptions: end.exceptions,
    occurrenceStatus: occurrenceStatusForWrite(end.occurrenceStatus),
  });
}

function occurrenceStatusForWrite(map: Record<string, core.CalendarOccurrenceStatus>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(map)) {
    out[key] = { status: s.status, completedAt: s.completedAtMs ? Timestamp.fromMillis(s.completedAtMs) : null, completedByUid: s.completedByUid };
  }
  return out;
}

// ---------------------------------------------------------------- reminders (each person's own)

export type CalendarReminderRow = { entryId: string; offsetMinutes: number; allDayTime: string; timeZone: string };

export function listenToMyCalendarReminders(companyId: string, uid: string, onChange: (rows: Map<string, CalendarReminderRow>) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "companies", companyId, "calendarReminders"), where("uid", "==", uid)),
    (snap) => {
      const rows = new Map<string, CalendarReminderRow>();
      for (const d of snap.docs) {
        const data = d.data();
        rows.set(String(data.entryId || ""), {
          entryId: String(data.entryId || ""),
          offsetMinutes: Number(data.offsetMinutes),
          allDayTime: String(data.allDayTime || core.DEFAULT_ALL_DAY_REMINDER_TIME),
          timeZone: String(data.timeZone || ""),
        });
      }
      onChange(rows);
    },
    () => onChange(new Map()),
  );
}

/** offsetMinutes null = no reminder. `exists` comes from listenToMyCalendarReminders: the server adds its
 *  own fields to an existing row, so it is updated (never replaced), and a missing row cannot be read to
 *  find out (refused like any calendar row nobody may read). */
export async function saveMyCalendarReminder(companyId: string, uid: string, entryId: string, offsetMinutes: number | null, allDayTime: string, timeZone: string, exists: boolean): Promise<void> {
  const ref = doc(db, "companies", companyId, "calendarReminders", `${uid}_${entryId}`);
  if (offsetMinutes === null) {
    if (exists) await deleteDoc(ref);
    return;
  }
  if (exists) {
    await updateDoc(ref, { offsetMinutes, allDayTime, timeZone, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, { uid, entryId, companyId, offsetMinutes, allDayTime, timeZone, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

// ---------------------------------------------------------------- the calendar inbox (reminders that went off)

export type CalendarInboxRow = {
  id: string;
  entryId: string;
  occurrenceKey: string;
  entryType: string;
  title: string;
  dateKey: string;
  allDay: boolean;
  startTime: string | null;
  timeZone: string;
  fireAtMs: number;
  read: boolean;
};

export function listenToCalendarInbox(companyId: string, uid: string, onChange: (rows: CalendarInboxRow[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "companies", companyId, "calendarInbox"), where("recipientUid", "==", uid), orderBy("createdAt", "desc"), limit(50)),
    (snap) => {
      onChange(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          entryId: String(data.entryId || ""),
          occurrenceKey: String(data.occurrenceKey || ""),
          entryType: String(data.entryType || "event"),
          title: String(data.title || ""),
          dateKey: String(data.dateKey || ""),
          allDay: data.allDay !== false,
          startTime: data.startTime ? String(data.startTime) : null,
          timeZone: String(data.timeZone || "Europe/London"),
          fireAtMs: core.millis(data.fireAt) || 0,
          read: Boolean(data.readAt),
        };
      }));
    },
    () => onChange([]),
  );
}

export async function markCalendarInboxRead(companyId: string, rowId: string): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "calendarInbox", rowId), { readAt: serverTimestamp() });
}

export async function removeCalendarInboxRow(companyId: string, rowId: string): Promise<void> {
  await deleteDoc(doc(db, "companies", companyId, "calendarInbox", rowId));
}

// ---------------------------------------------------------------- a former member's workspace entries (owner only)

/** Archive, or hand to an active member, an entry shared with the whole workspace whose owner has left. The server
 *  (calendarFormerMemberEntry) checks everything: business owner, workspace visibility, the owner gone, the target. */
export async function manageFormerMemberEntry(companyId: string, entryId: string, action: "archive" | "transfer", toUid: string | null = null): Promise<void> {
  await httpsCallable(functions, "calendarFormerMemberEntry")({ companyId, entryId, action, toUid });
}
