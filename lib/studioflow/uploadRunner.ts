// Drives one tracked upload: the transfer with measured progress, the hold
// for a lost network, cancellation, and the wait for the server's safety scan.
// Everything that touches the browser or Firebase is injected (`deps`), so the
// unit test runs this file against fakes and the screens run it against
// `firebase/storage` (see storageUploadDeps.ts).
//
// What the client can learn about the scan: scanUploadedFile writes its
// verdict onto the object's custom metadata (nvScanStatus / nvScanVerdict —
// functions/security/malwareScan.js). "pending" while it holds the download
// token, "clean" when it hands it back. A settled non-clean object is
// unreadable through the SDK (storage.rules notQuarantined), and an infected
// one is deleted — so a read that is refused or finds nothing, after an upload
// that succeeded, is the "blocked" verdict. The fileScans collection itself is
// server-only; metadata is the one place a client may look.

import type { UploadScanState } from "./uploadProgress";

export type UploadTaskSnapshotLike = {
  bytesTransferred: number;
  totalBytes: number;
  state: string;
};

export type UploadTaskLike = {
  on(
    event: "state_changed",
    next?: ((snapshot: UploadTaskSnapshotLike) => unknown) | null,
    error?: ((error: unknown) => unknown) | null,
    complete?: (() => unknown) | null
  ): unknown;
  pause(): boolean;
  resume(): boolean;
  cancel(): boolean;
  readonly snapshot: UploadTaskSnapshotLike;
};

export type TrackedUploadDeps = {
  /** True when an object already sits at the path (a retry after the bytes landed). */
  objectExists(path: string): Promise<boolean>;
  /** Starts the resumable transfer of the caller's file and metadata to the path. */
  startUpload(path: string): UploadTaskLike;
  /** What the scanner has said about the object at the path so far. */
  readScan(path: string): Promise<UploadScanState>;
  isOnline?(): boolean;
  subscribeConnectivity?(onChange: (online: boolean) => void): () => void;
  subscribeVisible?(onVisible: () => void): () => void;
  sleep?(ms: number): Promise<void>;
  now?(): number;
  /** Timers for the stall word (injectable so the check drives them); default setTimeout/clearTimeout. */
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
};

export type TrackedUploadHooks = {
  onStage?(stage: "preparing" | "uploading" | "processing"): void;
  onProgress?(bytesTransferred: number, totalBytes: number): void;
  onPaused?(paused: boolean): void;
  /** No progress for longer than stallThresholdMs while online and not paused (true), progress again (false). */
  onStalled?(stalled: boolean): void;
  onScan?(scan: UploadScanState): void;
  signal?: AbortSignal;
  /** How long to wait for the scan verdict before giving the row up as "unknown". */
  scanWaitMs?: number;
  scanPollMs?: number;
};

export class UploadCancelledError extends Error {
  constructor(message = "Upload cancelled.") {
    super(message);
    this.name = "UploadCancelledError";
  }
}

/** The safety scan refused the file. Not retryable: the same bytes would be refused again. */
export class UploadBlockedError extends Error {
  constructor(message = "This file was blocked by the safety scan and removed.") {
    super(message);
    this.name = "UploadBlockedError";
  }
}

export function isUploadCancelled(error: unknown) {
  if (error instanceof UploadCancelledError) return true;
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : "";
  return code === "storage/canceled";
}

export function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new UploadCancelledError();
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * How long silence may last before the row says "Still uploading…" (9 Oct 2026, the natives' F1 rule): the
 * SDK reports progress per chunk and the chunks grow, so a fixed 15 s called a slow, healthy upload stalled.
 * Four times the last measured gap between progress reports, never under 15 s and never over 90 s.
 */
export function stallThresholdMs(lastGapMs: number | null | undefined): number {
  const gap = Number(lastGapMs);
  return Math.min(90_000, Math.max(15_000, Number.isFinite(gap) && gap > 0 ? gap * 4 : 0));
}

/**
 * Moves the bytes. Progress is the task's own snapshot, forwarded as it
 * arrives; a lost network pauses the task and says so, and the network coming
 * back resumes it. Cancelling through `signal` cancels the task.
 *
 * `skipIfExists` is the retry rule: when an earlier attempt already put the
 * object there (the failure came later, in the record step), the bytes are not
 * sent again — the library's storage rule would refuse the rewrite anyway.
 */
export async function transferTracked(
  deps: TrackedUploadDeps,
  path: string,
  hooks: TrackedUploadHooks,
  options: { skipIfExists?: boolean } = {}
): Promise<{ transferred: boolean }> {
  throwIfCancelled(hooks.signal);
  if (options.skipIfExists && await deps.objectExists(path)) {
    return { transferred: false };
  }
  throwIfCancelled(hooks.signal);

  const task = deps.startUpload(path);
  hooks.onStage?.("uploading");
  hooks.onProgress?.(task.snapshot.bytesTransferred, task.snapshot.totalBytes);

  let paused = false;
  const hold = () => {
    if (paused) return;
    paused = true;
    task.pause();
    hooks.onPaused?.(true);
  };
  const release = () => {
    if (!paused) return;
    paused = false;
    task.resume();
    hooks.onPaused?.(false);
  };
  if (deps.isOnline && !deps.isOnline()) hold();

  // The stall word: re-armed on every progress report; silent while paused (that row says "Waiting").
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let stallHandle: unknown = null;
  let stalled = false;
  let lastProgressAt = now();
  let lastGap: number | null = null;
  const armStall = () => {
    if (stallHandle !== null) clearTimer(stallHandle);
    stallHandle = setTimer(() => {
      stallHandle = null;
      if (!paused && !stalled) { stalled = true; hooks.onStalled?.(true); }
    }, stallThresholdMs(lastGap));
  };
  const noteProgress = () => {
    const t = now();
    lastGap = t - lastProgressAt;
    lastProgressAt = t;
    if (stalled) { stalled = false; hooks.onStalled?.(false); }
    armStall();
  };
  armStall();

  const unsubscribeConnectivity = deps.subscribeConnectivity?.(online => (online ? release() : hold()));
  // A background tab throttles timers and repaints; when it comes back the row
  // is brought up to the task's real position rather than its last paint.
  const unsubscribeVisible = deps.subscribeVisible?.(() => {
    hooks.onProgress?.(task.snapshot.bytesTransferred, task.snapshot.totalBytes);
  });
  const onAbort = () => { task.cancel(); };
  hooks.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      task.on(
        "state_changed",
        snapshot => { noteProgress(); hooks.onProgress?.(snapshot.bytesTransferred, snapshot.totalBytes); },
        error => { reject(error); },
        () => { resolve(); }
      );
    });
  } catch (error) {
    if (hooks.signal?.aborted || isUploadCancelled(error)) throw new UploadCancelledError();
    throw error;
  } finally {
    if (stallHandle !== null) clearTimer(stallHandle);
    hooks.signal?.removeEventListener("abort", onAbort);
    unsubscribeConnectivity?.();
    unsubscribeVisible?.();
  }
  return { transferred: true };
}

/**
 * Waits for the scanner's word on the stored object. Returns "clean", or
 * "unknown" when the deadline passes with the scan still pending (the file is
 * recorded either way; the server finishes on its own). Throws
 * UploadBlockedError when the verdict is anything but clean. A cancel during
 * this wait stops the watching, not the file: it is already uploaded.
 */
export async function awaitScanVerdict(
  deps: TrackedUploadDeps,
  path: string,
  hooks: TrackedUploadHooks
): Promise<UploadScanState> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const waitMs = hooks.scanWaitMs ?? 45_000;
  const pollMs = hooks.scanPollMs ?? 2_500;
  const deadline = now() + waitMs;

  hooks.onStage?.("processing");
  hooks.onScan?.("pending");
  await sleep(Math.min(pollMs, 1_500));
  for (;;) {
    if (hooks.signal?.aborted) return "unknown";
    const state = await deps.readScan(path);
    if (state === "clean") {
      hooks.onScan?.("clean");
      return "clean";
    }
    if (state === "blocked") {
      hooks.onScan?.("blocked");
      throw new UploadBlockedError();
    }
    if (now() >= deadline) {
      hooks.onScan?.("unknown");
      return "unknown";
    }
    await sleep(pollMs);
  }
}

/** Reads the scanner's verdict out of an object's custom metadata. */
export function scanStateFromMetadata(customMetadata: Record<string, string> | undefined | null): UploadScanState {
  const status = String(customMetadata?.nvScanStatus || "").toLowerCase();
  const verdict = String(customMetadata?.nvScanVerdict || "").toLowerCase();
  if (!status && !verdict) return "none";
  if (status === "clean") return "clean";
  if (verdict === "pending" || status === "pending") return "pending";
  return "blocked";
}

/** What a refused or empty metadata read means after an upload that succeeded. */
export function scanStateFromReadError(error: unknown): UploadScanState {
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : "";
  if (code === "storage/object-not-found" || code === "storage/unauthorized") return "blocked";
  return "unknown";
}
