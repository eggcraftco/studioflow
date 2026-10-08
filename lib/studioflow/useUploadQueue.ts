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

  const enqueue = useCallback((files: File[], context: TContext) => {
    const added: { id: string; fileName: string; totalBytes: number }[] = [];
    for (const file of files) {
      if (!file) continue;
      const id = newUploadId();
      entries.current.set(id, { file, slot: newUploadSlot(), context, controller: null });
      added.push({ id, fileName: file.name, totalBytes: file.size });
    }
    if (added.length) dispatch({ type: "enqueue", items: added });
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
