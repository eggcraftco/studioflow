"use client";

// The upload queue a screen holds: many files, a few in flight at once, each
// row driven by the pure reducer in uploadProgress.ts. The screen supplies
// `run`, which performs one upload with the hooks this queue hands it; the
// queue owns the File objects, the slots that keep a retry on the same path,
// and the AbortControllers behind "Cancel".

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  isUploadActive,
  newUploadId,
  newUploadSlot,
  nextUploadsToStart,
  summarizeUploadQueue,
  uploadDedupeDecision,
  uploadFileKey,
  uploadQueueReducer,
  type UploadQueueItem,
  type UploadSlot
} from "./uploadProgress";
import { UploadBlockedError, isUploadCancelled, type TrackedUploadHooks } from "./uploadRunner";

export type UploadQueueRun<TContext> = (
  file: File,
  slot: UploadSlot,
  hooks: TrackedUploadHooks,
  context: TContext
) => Promise<void>;

type QueueEntry<TContext> = {
  file: File;
  /** uploadFileKey(file, context): the double-selection identity. */
  key: string;
  slot: UploadSlot;
  context: TContext;
  controller: AbortController | null;
};

export function useUploadQueue<TContext = undefined>(
  run: UploadQueueRun<TContext>,
  options: { concurrency?: number; fallbackError?: string } = {}
) {
  const concurrency = options.concurrency ?? 2;
  const fallbackError = options.fallbackError ?? "Upload failed. Please try again.";
  const [items, dispatch] = useReducer(uploadQueueReducer, []);
  const entries = useRef(new Map<string, QueueEntry<TContext>>());
  const running = useRef(new Set<string>());
  const runRef = useRef(run);
  runRef.current = run;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Double selection (9 Oct 2026): picking a file that is already queued,
  // moving or being checked for the same target adds nothing; picking one whose
  // row failed retries that row (same slot, same Storage path). One file, one
  // task, one object, one record — the natives' in-flight rule.
  const enqueue = useCallback((files: File[], context: TContext) => {
    const added: { id: string; fileName: string; totalBytes: number }[] = [];
    const retried: string[] = [];
    const scope = JSON.stringify(context ?? null);
    for (const file of files) {
      if (!file) continue;
      const key = uploadFileKey(file, scope);
      const rows = Array.from(entries.current.entries()).map(([id, entry]) => ({
        id,
        key: entry.key,
        item: itemsRef.current.find(item => item.id === id)
      }));
      const decision = uploadDedupeDecision(key, rows);
      if (decision.action === "skip") continue;
      if (decision.action === "retry") {
        if (!retried.includes(decision.id)) retried.push(decision.id);
        continue;
      }
      const id = newUploadId();
      entries.current.set(id, { file, key, slot: newUploadSlot(), context, controller: null });
      added.push({ id, fileName: file.name, totalBytes: file.size });
    }
    if (added.length) dispatch({ type: "enqueue", items: added });
    for (const id of retried) {
      const entry = entries.current.get(id);
      if (!entry) continue;
      entry.slot = { ...entry.slot, attempt: entry.slot.attempt + 1 };
      dispatch({ type: "retry", id });
    }
    return added.map(entry => entry.id);
  }, []);

  const startOne = useCallback(async (id: string) => {
    const entry = entries.current.get(id);
    if (!entry) return;
    const controller = new AbortController();
    entry.controller = controller;
    running.current.add(id);
    dispatch({ type: "start", id });
    const hooks: TrackedUploadHooks = {
      signal: controller.signal,
      onStage: stage => dispatch({ type: "stage", id, stage }),
      onProgress: (bytesTransferred, totalBytes) => dispatch({ type: "progress", id, bytesTransferred, totalBytes }),
      onPaused: paused => dispatch({ type: "paused", id, paused }),
      onStalled: stalled => dispatch({ type: "stalled", id, stalled }),
      onScan: scan => dispatch({ type: "scan", id, scan })
    };
    let outcome: Parameters<typeof dispatch>[0];
    try {
      await runRef.current(entry.file, entry.slot, hooks, entry.context);
      outcome = { type: "done", id };
    } catch (failure) {
      if (controller.signal.aborted || isUploadCancelled(failure)) {
        outcome = { type: "cancelled", id };
      } else {
        const message = failure instanceof Error && failure.message ? failure.message : fallbackError;
        outcome = { type: "error", id, message, retryable: !(failure instanceof UploadBlockedError) };
      }
    }
    // The slot is freed before the row settles, so the scheduler effect that
    // this dispatch wakes sees the free slot and starts the next queued file.
    entry.controller = null;
    running.current.delete(id);
    dispatch(outcome);
  }, [fallbackError]);

  // The scheduler: whenever the queue changes, fill the free slots in order.
  useEffect(() => {
    const ids = nextUploadsToStart(items, running.current, concurrency);
    for (const id of ids) {
      running.current.add(id);
      void startOne(id);
    }
  }, [items, concurrency, startOne]);

  const cancel = useCallback((id: string) => {
    const entry = entries.current.get(id);
    if (!entry) return;
    if (entry.controller) {
      entry.controller.abort();
    } else {
      // Not started yet: it leaves the queue before any byte moves.
      dispatch({ type: "cancelled", id });
    }
  }, []);

  const retry = useCallback((id: string) => {
    const entry = entries.current.get(id);
    if (!entry) return;
    entry.slot = { ...entry.slot, attempt: entry.slot.attempt + 1 };
    dispatch({ type: "retry", id });
  }, []);

  const remove = useCallback((id: string) => {
    const entry = entries.current.get(id);
    if (entry?.controller) entry.controller.abort();
    entries.current.delete(id);
    dispatch({ type: "remove", id });
  }, []);

  const clearFinished = useCallback(() => {
    for (const item of items) {
      if (item.stage === "done" || item.stage === "cancelled") entries.current.delete(item.id);
    }
    dispatch({ type: "clearFinished" });
  }, [items]);

  const summary = useMemo(() => summarizeUploadQueue(items), [items]);
  const isActive = items.some(isUploadActive);

  return { items, enqueue, cancel, retry, remove, clearFinished, summary, isActive };
}

export type UploadQueue = ReturnType<typeof useUploadQueue>;
export type { UploadQueueItem };
