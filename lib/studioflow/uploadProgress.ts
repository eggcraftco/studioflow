// Per-file upload progress, as pure state. No Firebase, no React: the queue
// reducer and its helpers are what the UI renders and what the unit test
// drives (scripts/check-upload-progress.mjs).
//
// Two rules carry the design:
//  - A percentage is shown only when it is measured. `bytesTransferred` and
//    `totalBytes` come from the storage task's own snapshot; while nothing can
//    be measured (preparing, the server's safety scan) the row shows a stage
//    label instead of a number.
//  - A retry keeps the file's identity. The slot (`UploadSlot`) is created once
//    per queued file and reused on every attempt, so the storage path and the
//    record id never change — a retry can never create a second file.

export type UploadStage = "queued" | "preparing" | "uploading" | "processing" | "done" | "error" | "cancelled";

/** What the server's safety scan has said about the stored object so far. */
export type UploadScanState = "none" | "pending" | "clean" | "blocked" | "unknown";

/**
 * The identity a queued file keeps across retries. `id` becomes the client
 * file id (and the stored file name); `createdAtMs` is the timestamp the
 * library path is built from. Both are fixed at the first attempt.
 */
export type UploadSlot = {
  id: string;
  createdAtMs: number;
  attempt: number;
};

export type UploadQueueItem = {
  id: string;
  fileName: string;
  totalBytes: number;
  bytesTransferred: number;
  stage: UploadStage;
  /** True while the transfer is held for the network to come back. */
  paused: boolean;
  error: string;
  retryable: boolean;
  attempt: number;
  scan: UploadScanState;
};

export type UploadQueueAction =
  | { type: "enqueue"; items: { id: string; fileName: string; totalBytes: number }[] }
  | { type: "start"; id: string }
  | { type: "stage"; id: string; stage: "preparing" | "uploading" | "processing" }
  | { type: "progress"; id: string; bytesTransferred: number; totalBytes: number }
  | { type: "paused"; id: string; paused: boolean }
  | { type: "scan"; id: string; scan: UploadScanState }
  | { type: "done"; id: string }
  | { type: "error"; id: string; message: string; retryable: boolean }
  | { type: "cancelled"; id: string }
  | { type: "retry"; id: string }
  | { type: "remove"; id: string }
  | { type: "clearFinished" };

export function newUploadSlot(now = Date.now()): UploadSlot {
  return { id: newUploadId(), createdAtMs: now, attempt: 1 };
}

export function newUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampBytes(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function patch(items: UploadQueueItem[], id: string, change: (item: UploadQueueItem) => UploadQueueItem) {
  let touched = false;
  const next = items.map(item => {
    if (item.id !== id) return item;
    touched = true;
    return change(item);
  });
  return touched ? next : items;
}

export function uploadQueueReducer(items: UploadQueueItem[], action: UploadQueueAction): UploadQueueItem[] {
  switch (action.type) {
    case "enqueue": {
      const known = new Set(items.map(item => item.id));
      const added = action.items
        .filter(entry => !known.has(entry.id))
        .map(entry => ({
          id: entry.id,
          fileName: entry.fileName,
          totalBytes: clampBytes(entry.totalBytes),
          bytesTransferred: 0,
          stage: "queued" as const,
          paused: false,
          error: "",
          retryable: false,
          attempt: 1,
          scan: "none" as const
        }));
      return added.length ? [...items, ...added] : items;
    }
    case "start":
      return patch(items, action.id, item =>
        item.stage === "queued" ? { ...item, stage: "preparing", paused: false, error: "", bytesTransferred: 0 } : item);
    case "stage":
      return patch(items, action.id, item => {
        if (item.stage === "done" || item.stage === "error" || item.stage === "cancelled") return item;
        return { ...item, stage: action.stage, paused: action.stage === "uploading" ? item.paused : false };
      });
    case "progress":
      return patch(items, action.id, item => {
        // The task reports bytes only while it is transferring; a late event
        // after the row settled must not reopen it.
        if (item.stage !== "preparing" && item.stage !== "uploading") return item;
        const totalBytes = clampBytes(action.totalBytes) || item.totalBytes;
        const bytesTransferred = Math.min(clampBytes(action.bytesTransferred), totalBytes || Number.MAX_SAFE_INTEGER);
        return { ...item, stage: "uploading", totalBytes, bytesTransferred };
      });
    case "paused":
      return patch(items, action.id, item => (item.stage === "uploading" ? { ...item, paused: action.paused } : item));
    case "scan":
      return patch(items, action.id, item => ({ ...item, scan: action.scan }));
    case "done":
      return patch(items, action.id, item => ({
        ...item,
        stage: "done",
        paused: false,
        error: "",
        retryable: false,
        bytesTransferred: item.totalBytes
      }));
    case "error":
      return patch(items, action.id, item =>
        item.stage === "done" || item.stage === "cancelled"
          ? item
          : { ...item, stage: "error", paused: false, error: action.message, retryable: action.retryable });
    case "cancelled":
      return patch(items, action.id, item =>
        item.stage === "done" ? item : { ...item, stage: "cancelled", paused: false, error: "", retryable: true });
    case "retry":
      return patch(items, action.id, item => {
        if (item.stage !== "error" && item.stage !== "cancelled") return item;
        if (!item.retryable) return item;
        return {
          ...item,
          stage: "queued",
          paused: false,
          error: "",
          bytesTransferred: 0,
          attempt: item.attempt + 1,
          scan: "none"
        };
      });
    case "remove":
      return items.filter(item => item.id !== action.id);
    case "clearFinished":
      return items.filter(item => item.stage !== "done" && item.stage !== "cancelled");
    default:
      return items;
  }
}

/**
 * The measured percentage, or null when there is nothing honest to show.
 * Never animated, never estimated: uploading with a known total gives the
 * ratio, done gives 100, everything else gives null.
 */
export function uploadPercent(item: Pick<UploadQueueItem, "stage" | "bytesTransferred" | "totalBytes">): number | null {
  if (item.stage === "done") return 100;
  if (item.stage !== "uploading") return null;
  if (!(item.totalBytes > 0)) return null;
  return Math.max(0, Math.min(100, Math.floor((item.bytesTransferred / item.totalBytes) * 100)));
}

/** The English sentence the row shows for its state; the screen passes it to t(). */
export function uploadStageLabel(item: Pick<UploadQueueItem, "stage" | "paused" | "scan">): string {
  switch (item.stage) {
    case "queued": return "Queued";
    case "preparing": return "Preparing";
    case "uploading": return item.paused ? "Waiting for network" : "Uploading";
    case "processing": return "Processing";
    case "done": return item.scan === "unknown" ? "Uploaded — safety scan still running" : "Uploaded";
    case "error": return "Failed";
    case "cancelled": return "Cancelled";
    default: return "";
  }
}

export function formatUploadBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.floor(bytes)} B`;
}

/** "1.2 MB / 4.5 MB" while the transfer runs; the total alone otherwise. */
export function uploadBytesLabel(item: Pick<UploadQueueItem, "stage" | "bytesTransferred" | "totalBytes">) {
  if (item.stage === "uploading" && item.totalBytes > 0) {
    return `${formatUploadBytes(item.bytesTransferred)} / ${formatUploadBytes(item.totalBytes)}`;
  }
  return formatUploadBytes(item.totalBytes);
}

export function isUploadActive(item: Pick<UploadQueueItem, "stage">) {
  return item.stage === "queued" || item.stage === "preparing" || item.stage === "uploading" || item.stage === "processing";
}

export function summarizeUploadQueue(items: UploadQueueItem[]) {
  let active = 0;
  let done = 0;
  let failed = 0;
  let cancelled = 0;
  for (const item of items) {
    if (isUploadActive(item)) active += 1;
    else if (item.stage === "done") done += 1;
    else if (item.stage === "error") failed += 1;
    else if (item.stage === "cancelled") cancelled += 1;
  }
  return { total: items.length, active, done, failed, cancelled };
}

/**
 * Which queued items may start now, given what is already running and the
 * concurrency limit. Order is queue order; limit <= 0 means one at a time.
 */
export function nextUploadsToStart(items: UploadQueueItem[], running: ReadonlySet<string>, limit: number): string[] {
  const cap = Math.max(1, Math.floor(limit) || 1);
  let free = cap - running.size;
  const ids: string[] = [];
  for (const item of items) {
    if (free <= 0) break;
    if (item.stage !== "queued" || running.has(item.id)) continue;
    ids.push(item.id);
    free -= 1;
  }
  return ids;
}
