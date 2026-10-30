// Calendar V1 — calendar writes that have not been confirmed by the server yet (run 3, 29 Oct 2026).
//
// Firestore keeps a write made without a connection on this device and sends it when the connection is back; the
// promise only settles then. A form must not sit on "Saving…" for that long, and closing it must not lose the text.
// So every calendar write is tracked here, outside the form: after a few seconds without an answer the form says the
// change is not confirmed yet and may be closed; the answer, whenever it comes, is announced; a refused change keeps
// its text as a draft the person can reopen. A new entry carries the id chosen when its form opened, so saving it
// again, reopening it or reloading the page can never make a second entry (a second create of the same id is an
// update, which the rules refuse at version 1). Nothing here says "cancelled": a write already handed to Firestore
// cannot be taken back, so it is reported as sent or not sent.
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { CalendarDraft } from "./calendarData";

export const CALENDAR_PENDING_AFTER_MS = 4000;
const STORAGE_KEY = "nivadesk.calendar.outbox.v1";
const EVENT = "nivadesk-calendar-outbox";

export type CalendarOutboxKind = "create" | "edit" | "status" | "delete" | "reminder";
export type CalendarOutboxItem = {
  key: string;
  companyId: string;
  uid: string;
  kind: CalendarOutboxKind;
  entryId: string;
  title: string;
  draft: CalendarDraft | null;
  occurrenceKey: string | null;
  startedAtMs: number;
  state: "pending" | "failed";
  errorCode: string | null;
  pageSession: string;
};
export type CalendarOutboxEvent = { type: "saved" | "failed" | "changed"; item: CalendarOutboxItem | null };

// One id per page load: a pending item from an earlier load has lost its promise and is settled by watching the row.
const SESSION = Math.random().toString(36).slice(2);

function read(): CalendarOutboxItem[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((i) => i && typeof i.key === "string") : [];
  } catch {
    return [];
  }
}

function write(list: CalendarOutboxItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // Storage full or blocked: the write itself still goes through Firestore.
  }
}

function emit(event: CalendarOutboxEvent) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<CalendarOutboxEvent>(EVENT, { detail: event }));
}

function upsert(item: CalendarOutboxItem) {
  write([...read().filter((i) => i.key !== item.key), item]);
  emit({ type: "changed", item });
}

export function dropCalendarOutboxItem(key: string) {
  write(read().filter((i) => i.key !== key));
  emit({ type: "changed", item: null });
}

export function calendarOutboxItems(companyId: string, uid: string): CalendarOutboxItem[] {
  return read().filter((i) => i.companyId === companyId && i.uid === uid);
}

export function onCalendarOutbox(listener: (event: CalendarOutboxEvent) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<CalendarOutboxEvent>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function outboxKey(kind: CalendarOutboxKind, entryId: string, occurrenceKey: string | null = null): string {
  return `${kind}:${entryId}${occurrenceKey ? `:${occurrenceKey}` : ""}`;
}

function errorCodeOf(error: unknown): string {
  const e = error as { name?: string; code?: string } | null;
  if (e?.name === "CalendarConflictError") return "conflict";
  if (e?.name === "CalendarGoneError") return "gone";
  return String(e?.code || "failed");
}

/** Track one write. Resolves "done" when the server answered within the wait, "pending" otherwise; the write's
 *  later answer is announced with an event (and a refused one keeps its draft). Rejects only with an answer that
 *  came within the wait, so the form can show it in place. */
export async function trackCalendarWrite(
  base: Omit<CalendarOutboxItem, "key" | "startedAtMs" | "state" | "errorCode" | "pageSession">,
  write: Promise<unknown>,
  waitMs = CALENDAR_PENDING_AFTER_MS,
): Promise<"done" | "pending"> {
  const item: CalendarOutboxItem = { ...base, key: outboxKey(base.kind, base.entryId, base.occurrenceKey), startedAtMs: Date.now(), state: "pending", errorCode: null, pageSession: SESSION };
  upsert(item);
  let settled = false;
  let waited = false;
  const outcome = write.then(
    () => {
      settled = true;
      dropCalendarOutboxItem(item.key);
      if (waited) emit({ type: "saved", item });
    },
    (error) => {
      settled = true;
      const failed = { ...item, state: "failed" as const, errorCode: errorCodeOf(error) };
      if (waited && base.draft) upsert(failed);
      else dropCalendarOutboxItem(item.key);
      if (waited) emit({ type: "failed", item: failed });
      if (!waited) throw error;
    },
  );
  const timer = new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), waitMs));
  const first = await Promise.race([outcome.then(() => "done" as const), timer]);
  if (first === "pending" && !settled) {
    waited = true;
    return "pending";
  }
  await outcome;
  return "done";
}

/** Items left "pending" by an earlier page load (reload, closed tab) lost their promise: watch the row until the
 *  server — not the local cache — has answered, then say whether the change arrived. */
export function settleEarlierCalendarWrites(companyId: string, uid: string): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  for (const item of calendarOutboxItems(companyId, uid)) {
    if (item.state !== "pending" || item.pageSession === SESSION) continue;
    if (item.kind !== "create" && item.kind !== "delete") {
      // An edit/status change is a version-checked transaction: it never waits in the local queue across a reload.
      upsert({ ...item, state: "failed", errorCode: "unavailable" });
      emit({ type: "failed", item: { ...item, state: "failed", errorCode: "unavailable" } });
      continue;
    }
    const unsub = onSnapshot(
      doc(db, "companies", companyId, "calendarEntries", item.entryId),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
        unsub();
        const arrived = item.kind === "create" ? snap.exists() : !snap.exists();
        if (arrived) {
          dropCalendarOutboxItem(item.key);
          emit({ type: "saved", item });
        } else {
          const failed = { ...item, state: "failed" as const, errorCode: "permission-denied" };
          upsert(failed);
          emit({ type: "failed", item: failed });
        }
      },
      () => {
        // Refused read: a create that never arrived (or no longer ours to see) — keep the text.
        unsub();
        const failed = { ...item, state: "failed" as const, errorCode: "permission-denied" };
        upsert(failed);
        emit({ type: "failed", item: failed });
      },
    );
    unsubs.push(unsub);
  }
  return () => unsubs.forEach((u) => u());
}
