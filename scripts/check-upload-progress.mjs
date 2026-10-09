// Per-file upload progress: the queue reducer, the tracked runner against a
// fake storage task, and the rule that a retry never makes a second file.
// No Firebase, no network — the two modules under test are pure and the
// runner's dependencies are injected.
//
//   node scripts/check-upload-progress.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "upload-progress-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};
compile("lib/studioflow/uploadProgress.ts", "uploadProgress");
compile("lib/studioflow/uploadRunner.ts", "uploadRunner");
const progress = await import(pathToFileURL(path.join(tmp, "uploadProgress.mjs")).href);
const runner = await import(pathToFileURL(path.join(tmp, "uploadRunner.mjs")).href);
const {
  uploadQueueReducer: reduce, uploadPercent, uploadStageLabel, uploadBytesLabel, nextUploadsToStart,
  summarizeUploadQueue, newUploadSlot, isUploadActive, uploadFileKey, uploadDedupeDecision
} = progress;
const {
  transferTracked, awaitScanVerdict, UploadCancelledError, UploadBlockedError,
  scanStateFromMetadata, scanStateFromReadError, isUploadCancelled
} = runner;

// ---------------------------------------------------------------------------
// 1. The reducer, stage by stage.
// ---------------------------------------------------------------------------
let items = reduce([], { type: "enqueue", items: [{ id: "a", fileName: "a.pdf", totalBytes: 2048 }, { id: "b", fileName: "b.zip", totalBytes: 4096 }] });
expect("enqueue: two queued rows", items.map((item) => [item.id, item.stage, item.bytesTransferred]), [["a", "queued", 0], ["b", "queued", 0]]);
expect("enqueue: same id twice is one row", reduce(items, { type: "enqueue", items: [{ id: "a", fileName: "a.pdf", totalBytes: 1 }] }).length, 2);
expect("queued: no percentage is shown", uploadPercent(items[0]), null);
expect("queued: label", uploadStageLabel(items[0]), "Queued");

items = reduce(items, { type: "start", id: "a" });
expect("start: preparing", items[0].stage, "preparing");
expect("preparing: no percentage is shown", uploadPercent(items[0]), null);
expect("preparing: label", uploadStageLabel(items[0]), "Preparing");

items = reduce(items, { type: "progress", id: "a", bytesTransferred: 512, totalBytes: 2048 });
expect("progress: measured bytes move the row to uploading", [items[0].stage, items[0].bytesTransferred, items[0].totalBytes], ["uploading", 512, 2048]);
expect("progress: 512 of 2048 is 25", uploadPercent(items[0]), 25);
expect("progress: bytes label shows both numbers", uploadBytesLabel(items[0]), "512 B / 2 KB");
expect("uploading: label", uploadStageLabel(items[0]), "Uploading");
expect("progress: bytes never exceed the total", uploadPercent(reduce(items, { type: "progress", id: "a", bytesTransferred: 99999, totalBytes: 2048 })[0]), 100);
expect("progress: the task's own total wins over the queued size", reduce(items, { type: "progress", id: "a", bytesTransferred: 10, totalBytes: 4000 })[0].totalBytes, 4000);
expect("progress: a zero total gives no percentage", uploadPercent({ stage: "uploading", bytesTransferred: 10, totalBytes: 0 }), null);

items = reduce(items, { type: "paused", id: "a", paused: true });
expect("paused: the row says it is waiting for the network", uploadStageLabel(items[0]), "Waiting for network");
expect("paused: the measured bytes stay", uploadPercent(items[0]), 25);
items = reduce(items, { type: "paused", id: "a", paused: false });
expect("resumed: back to uploading", uploadStageLabel(items[0]), "Uploading");

items = reduce(items, { type: "stage", id: "a", stage: "processing" });
expect("processing: no percentage (nothing is measured)", uploadPercent(items[0]), null);
expect("processing: label", uploadStageLabel(items[0]), "Processing");
expect("processing: a late byte event cannot reopen the transfer", reduce(items, { type: "progress", id: "a", bytesTransferred: 1, totalBytes: 2048 })[0].stage, "processing");

items = reduce(items, { type: "scan", id: "a", scan: "clean" });
items = reduce(items, { type: "done", id: "a" });
expect("done: 100 and bytes equal the total", [uploadPercent(items[0]), items[0].bytesTransferred], [100, 2048]);
expect("done: label", uploadStageLabel(items[0]), "Uploaded");
expect("done with the scan unknown: label says so", uploadStageLabel({ stage: "done", paused: false, scan: "unknown" }), "Uploaded — safety scan still running");
expect("done: a late error cannot undo it", reduce(items, { type: "error", id: "a", message: "x", retryable: true })[0].stage, "done");
expect("done: a late progress event is ignored", reduce(items, { type: "progress", id: "a", bytesTransferred: 1, totalBytes: 2048 })[0].bytesTransferred, 2048);

items = reduce(items, { type: "start", id: "b" });
items = reduce(items, { type: "progress", id: "b", bytesTransferred: 1024, totalBytes: 4096 });
items = reduce(items, { type: "error", id: "b", message: "Network gone.", retryable: true });
expect("error: stage, message, retryable", [items[1].stage, items[1].error, items[1].retryable], ["error", "Network gone.", true]);
expect("error: label", uploadStageLabel(items[1]), "Failed");
expect("error: no percentage is shown", uploadPercent(items[1]), null);
const retried = reduce(items, { type: "retry", id: "b" });
expect("retry: same row id, queued again, attempt 2, bytes reset", [retried[1].id, retried[1].stage, retried[1].attempt, retried[1].bytesTransferred, retried[1].error], ["b", "queued", 2, 0, ""]);
expect("retry: the queue did not grow", retried.length, 2);
const blocked = reduce(items, { type: "error", id: "b", message: "Blocked.", retryable: false });
expect("retry: a non-retryable failure stays put", reduce(blocked, { type: "retry", id: "b" })[1].stage, "error");
expect("retry: a done row is not retried", reduce(items, { type: "retry", id: "a" })[0].stage, "done");

let cancelled = reduce(retried, { type: "cancelled", id: "b" });
expect("cancelled: stage and label", [cancelled[1].stage, uploadStageLabel(cancelled[1])], ["cancelled", "Cancelled"]);
expect("cancelled: can be retried", reduce(cancelled, { type: "retry", id: "b" })[1].stage, "queued");
cancelled = reduce(cancelled, { type: "enqueue", items: [{ id: "c", fileName: "c.png", totalBytes: 10 }] });
cancelled = reduce(cancelled, { type: "start", id: "c" });
cancelled = reduce(cancelled, { type: "error", id: "c", message: "boom", retryable: true });
const cleared = reduce(cancelled, { type: "clearFinished" });
expect("clearFinished: removes done and cancelled, keeps the failure", cleared.map((item) => item.id), ["c"]);
expect("remove: drops the row", reduce(cleared, { type: "remove", id: "c" }).length, 0);
expect("summary counts", summarizeUploadQueue(cancelled), { total: 3, active: 0, done: 1, failed: 1, cancelled: 1 });

// The scheduler: queue order, limited concurrency, nothing already running.
const queue = reduce([], { type: "enqueue", items: ["q1", "q2", "q3", "q4"].map((id) => ({ id, fileName: id, totalBytes: 1 })) });
expect("scheduler: two free slots start the first two", nextUploadsToStart(queue, new Set(), 2), ["q1", "q2"]);
expect("scheduler: one running leaves one slot", nextUploadsToStart(queue, new Set(["q1"]), 2), ["q2"]);
expect("scheduler: full", nextUploadsToStart(queue, new Set(["q1", "q2"]), 2), []);
expect("scheduler: limit 0 means one at a time", nextUploadsToStart(queue, new Set(), 0), ["q1"]);
expect("scheduler: a started row is not started twice", nextUploadsToStart(reduce(queue, { type: "start", id: "q1" }), new Set(), 2), ["q2", "q3"]);
expect("isUploadActive covers the four live stages", ["queued", "preparing", "uploading", "processing", "done", "error", "cancelled"].map((stage) => isUploadActive({ stage })), [true, true, true, true, false, false, false]);

// ---------------------------------------------------------------------------
// 2. The runner against a fake storage task.
// ---------------------------------------------------------------------------
function fakeTask(totalBytes, plan) {
  // plan: list of { bytes } progress steps, then "complete" | { error }.
  const calls = { pause: 0, resume: 0, cancel: 0 };
  const task = {
    snapshot: { bytesTransferred: 0, totalBytes, state: "running" },
    calls,
    pause() { calls.pause += 1; task.snapshot.state = "paused"; return true; },
    resume() { calls.resume += 1; task.snapshot.state = "running"; return true; },
    cancel() { calls.cancel += 1; task.snapshot.state = "canceled"; return true; },
    on(_event, next, error, complete) {
      task.drive = async () => {
        for (const step of plan) {
          await Promise.resolve();
          if (task.snapshot.state === "canceled") { error({ code: "storage/canceled" }); return; }
          if (step === "complete") { complete(); return; }
          if (step.error) { error(step.error); return; }
          task.snapshot.bytesTransferred = step.bytes;
          next({ ...task.snapshot });
        }
      };
      queueMicrotask(() => { void task.drive(); });
    }
  };
  return task;
}

function recorder() {
  const log = { stages: [], progress: [], paused: [], scans: [] };
  const hooks = {
    onStage: (stage) => log.stages.push(stage),
    onProgress: (bytes, total) => log.progress.push([bytes, total]),
    onPaused: (paused) => log.paused.push(paused),
    onScan: (scan) => log.scans.push(scan)
  };
  return { log, hooks };
}

{
  const task = fakeTask(1000, [{ bytes: 250 }, { bytes: 1000 }, "complete"]);
  const started = [];
  const { log, hooks } = recorder();
  const result = await transferTracked({
    objectExists: async () => { throw new Error("must not be asked on a first attempt"); },
    startUpload: (p) => { started.push(p); return task; },
    readScan: async () => "none"
  }, "companies/w/client_files/o/f.pdf", hooks);
  expect("transfer: uploaded to the path", [result.transferred, started], [true, ["companies/w/client_files/o/f.pdf"]]);
  expect("transfer: stage went to uploading", log.stages, ["uploading"]);
  expect("transfer: progress is the task's own bytes, first the starting snapshot", log.progress, [[0, 1000], [250, 1000], [1000, 1000]]);
  expect("transfer: nothing paused", [task.calls.pause, task.calls.resume, log.paused], [0, 0, []]);
}

{
  // Offline at the start: held before a byte moves, released when the network returns.
  let listener = null;
  const task = fakeTask(100, [{ bytes: 100 }, "complete"]);
  const { log, hooks } = recorder();
  let online = false;
  const run = transferTracked({
    objectExists: async () => false,
    startUpload: () => task,
    readScan: async () => "none",
    isOnline: () => online,
    subscribeConnectivity: (onChange) => { listener = onChange; return () => { listener = null; }; }
  }, "p", hooks);
  expect("offline: the task is paused and the row told", [task.calls.pause, log.paused], [1, [true]]);
  online = true;
  listener(true);
  expect("online again: resumed and the row told", [task.calls.resume, log.paused], [1, [true, false]]);
  await run;
  expect("offline→online: the subscription is released", listener, null);
  // A second "online" while running must not resume twice.
  const idle = fakeTask(10, [{ bytes: 10 }, "complete"]);
  let l2 = null;
  await transferTracked({ objectExists: async () => false, startUpload: () => idle, readScan: async () => "none",
    isOnline: () => true, subscribeConnectivity: (fn) => { l2 = fn; l2(true); l2(false); l2(false); l2(true); return () => {}; } }, "p", recorder().hooks);
  expect("connectivity flaps: one pause, one resume", [idle.calls.pause, idle.calls.resume], [1, 1]);
}

{
  // Cancel while the bytes are moving.
  const task = fakeTask(1000, [{ bytes: 100 }, { bytes: 200 }, { bytes: 300 }, "complete"]);
  const controller = new AbortController();
  const { log, hooks } = recorder();
  hooks.signal = controller.signal;
  const original = hooks.onProgress;
  hooks.onProgress = (bytes, total) => { original(bytes, total); if (bytes === 200) controller.abort(); };
  let thrown = null;
  try { await transferTracked({ objectExists: async () => false, startUpload: () => task, readScan: async () => "none" }, "p", hooks); }
  catch (error) { thrown = error; }
  expect("cancel: the task was cancelled", task.calls.cancel, 1);
  expect("cancel: the runner throws the cancel error", thrown instanceof UploadCancelledError, true);
  expect("cancel: no bytes reported after the cancel", log.progress.at(-1), [200, 1000]);
  expect("cancel: an already-aborted signal never starts the task", await transferTracked({ objectExists: async () => false, startUpload: () => { throw new Error("started"); }, readScan: async () => "none" }, "p", { signal: AbortSignal.abort() }).then(() => "ran", (e) => e.name), "UploadCancelledError");
  expect("isUploadCancelled recognises the SDK's code", [isUploadCancelled({ code: "storage/canceled" }), isUploadCancelled(new Error("x"))], [true, false]);
}

{
  // The SDK's own failure surfaces as the error it was.
  const task = fakeTask(10, [{ bytes: 5 }, { error: { code: "storage/retry-limit-exceeded", message: "Max retry time exceeded." } }]);
  const outcome = await transferTracked({ objectExists: async () => false, startUpload: () => task, readScan: async () => "none" }, "p", recorder().hooks).then(() => "ok", (e) => e.code);
  expect("task error: passed through, not swallowed", outcome, "storage/retry-limit-exceeded");
}

{
  // The scan wait.
  const clock = { t: 0 };
  const deps = (verdicts) => ({
    objectExists: async () => false, startUpload: () => { throw new Error("no"); },
    readScan: async () => verdicts.length > 1 ? verdicts.shift() : verdicts[0],
    now: () => clock.t, sleep: async (ms) => { clock.t += ms; }
  });
  const a = recorder();
  const clean = await awaitScanVerdict(deps(["none", "pending", "pending", "clean"]), "p", { ...a.hooks, scanWaitMs: 45000, scanPollMs: 2500 });
  expect("scan: pending until the verdict, then clean", [clean, a.log.stages, a.log.scans], ["clean", ["processing"], ["pending", "clean"]]);
  const b = recorder();
  const blocked = await awaitScanVerdict(deps(["pending", "blocked"]), "p", b.hooks).then(() => "clean", (e) => e);
  expect("scan: blocked throws the non-retryable error", [blocked instanceof UploadBlockedError, b.log.scans], [true, ["pending", "blocked"]]);
  const c = recorder();
  clock.t = 0;
  const unknown = await awaitScanVerdict(deps(["pending"]), "p", { ...c.hooks, scanWaitMs: 10000, scanPollMs: 2500 });
  expect("scan: still pending at the deadline is unknown, not a failure", [unknown, c.log.scans.at(-1), clock.t >= 10000], ["unknown", "unknown", true]);
  expect("scan: cancelled during the wait stops watching, the file stays", await awaitScanVerdict(deps(["pending"]), "p", { signal: AbortSignal.abort(), scanWaitMs: 1 }), "unknown");
  expect("metadata → state", [
    scanStateFromMetadata(undefined), scanStateFromMetadata({}), scanStateFromMetadata({ nvScanStatus: "clean", nvScanVerdict: "clean" }),
    scanStateFromMetadata({ nvScanStatus: "unverified", nvScanVerdict: "pending" }), scanStateFromMetadata({ nvScanStatus: "unverified", nvScanVerdict: "error" }),
    scanStateFromMetadata({ nvScanStatus: "infected", nvScanVerdict: "infected" })
  ], ["none", "none", "clean", "pending", "blocked", "blocked"]);
  expect("read error → state", [scanStateFromReadError({ code: "storage/object-not-found" }), scanStateFromReadError({ code: "storage/unauthorized" }), scanStateFromReadError({ code: "storage/unknown" }), scanStateFromReadError(new Error("x"))], ["blocked", "blocked", "unknown", "unknown"]);
}

// ---------------------------------------------------------------------------
// 3. A retry never makes a second file.
//    The slot fixes the id and path; the transfer skips bytes already there;
//    the record step is keyed by the same id.
// ---------------------------------------------------------------------------
{
  const slot = newUploadSlot(1700000000000);
  expect("slot: first attempt", slot.attempt, 1);
  const bucket = new Map();     // storage path → bytes
  const records = new Map();    // record id → record
  let uploads = 0;
  let recordAttempts = 0;
  const pathFor = (s) => `companies/w/client_files/o/${s.id}.pdf`;
  const deps = {
    objectExists: async (p) => bucket.has(p),
    startUpload: (p) => { uploads += 1; const task = fakeTask(10, [{ bytes: 10 }, "complete"]); const done = task.on; task.on = (e, n, er, c) => done.call(task, e, n, er, () => { bucket.set(p, 10); c(); }); return task; },
    readScan: async () => "clean"
  };
  async function attempt(current, failRecord) {
    const p = pathFor(current);
    await transferTracked(deps, p, {}, { skipIfExists: current.attempt > 1 });
    recordAttempts += 1;
    if (failRecord) throw new Error("callable timed out");
    if (!records.has(current.id)) records.set(current.id, { id: current.id, path: p });
  }
  const first = await attempt(slot, true).then(() => "ok", (e) => e.message);
  expect("attempt 1: bytes landed, the record step failed", [first, uploads, bucket.size, records.size], ["callable timed out", 1, 1, 0]);
  const again = { ...slot, attempt: 2 };
  await attempt(again, false);
  expect("attempt 2: same path, bytes not sent again, exactly one record", [uploads, bucket.size, records.size, [...records.values()][0].path === pathFor(slot)], [1, 1, 1, true]);
  // Without the slot, a retry would be a new id — the duplicate this guards against.
  expect("two fresh slots are two files", newUploadSlot().id === newUploadSlot().id, false);
  expect("library path stamp comes from the slot, not the clock", slot.createdAtMs, 1700000000000);
}

// The screens' upload functions honour the same rule — read from the source,
// since they import Firebase and cannot run here.
{
  const clientFiles = read("lib/studioflow/clientFiles.ts");
  expect("clientFiles: the file id is the slot's id", /const fileId = identity\.id;/.test(clientFiles), true);
  expect("clientFiles: no fresh id per attempt", /newFileId\(\)/.test(clientFiles), false);
  expect("clientFiles: bytes already at the path are not sent again on a retry", /transferTracked\(deps, storageRef\.fullPath, hooks, \{ skipIfExists: isRetry \}\)/.test(clientFiles), true);
  expect("clientFiles: the record is looked up before appending on a retry", /isRetry && await clientFileRecordExists\(orderRef, fileId\)/.test(clientFiles), true);
  expect("clientFiles: the plain uploadBytes call is gone", /\buploadBytes\(/.test(clientFiles), false);
  const library = read("lib/studioflow/filesLibrary.ts");
  expect("library: the path's timestamp is the slot's, not Date.now()", [/\$\{slot\.createdAtMs\}-\$\{safeName\}/.test(library), /Date\.now\(\)-\$\{safeName\}/.test(library)], [true, false]);
  expect("library: a retry skips bytes already at the path", /skipIfExists: slot\.attempt > 1/.test(library), true);
  expect("library: a version retry asks before pushing a second version", /slot\.attempt > 1 && await libraryVersionExists\(workspace, fileId, storagePath\)/.test(library), true);
  const depsSource = read("lib/studioflow/storageUploadDeps.ts");
  expect("browser deps: resumable task, metadata read", [/uploadBytesResumable\(/.test(depsSource), /getMetadata\(/.test(depsSource)], [true, true]);
  for (const screen of ["app/files/page.tsx", "app/orders/OrderDetailContent.tsx", "app/files/FilesLibraryView.tsx"]) {
    const source = read(screen);
    expect(`${screen}: renders the queue panel and passes slot + progress`, [/<UploadQueuePanel/.test(source), /useUploadQueue</.test(source), /slot,?\s*\n?\s*progress: hooks|\{ slot, progress: hooks \}/.test(source)], [true, true, true]);
  }
}

// ---------------------------------------------------------------------------
// Double selection (9 Oct 2026): one file, one task, one object, one record.
// ---------------------------------------------------------------------------
{
  const file = { name: "bundle.zip", size: 8_388_608, lastModified: 1_791_507_723_000 };
  const key = uploadFileKey(file, "order-1");
  expect("dedupe: same file, same target -> same key", uploadFileKey({ ...file }, "order-1"), key);
  expect("dedupe: another target -> another key", uploadFileKey(file, "order-2") === key, false);
  expect("dedupe: another size -> another key", uploadFileKey({ ...file, size: 1 }, "order-1") === key, false);
  const row = (stage, retryable = true) => ({ id: "r1", key, item: { stage, retryable } });
  expect("dedupe: nothing yet -> add", uploadDedupeDecision(key, []), { action: "add" });
  expect("dedupe: picked twice before a render -> skip", uploadDedupeDecision(key, [{ id: "r1", key, item: undefined }]), { action: "skip", id: "r1" });
  for (const stage of ["queued", "preparing", "uploading", "processing"]) {
    expect(`dedupe: ${stage} row -> skip`, uploadDedupeDecision(key, [row(stage)]), { action: "skip", id: "r1" });
  }
  expect("dedupe: failed retryable row -> retry that row", uploadDedupeDecision(key, [row("error")]), { action: "retry", id: "r1" });
  expect("dedupe: blocked (not retryable) row -> add", uploadDedupeDecision(key, [row("error", false)]), { action: "add" });
  expect("dedupe: done row -> add (a new upload on purpose)", uploadDedupeDecision(key, [row("done")]), { action: "add" });
  expect("dedupe: cancelled row -> add", uploadDedupeDecision(key, [row("cancelled")]), { action: "add" });
  expect("dedupe: another file's active row -> add", uploadDedupeDecision(key, [{ id: "r2", key: uploadFileKey({ ...file, name: "b.zip" }, "order-1"), item: { stage: "uploading", retryable: true } }]), { action: "add" });
  const hook = read("lib/studioflow/useUploadQueue.ts");
  expect("dedupe: the queue's enqueue asks uploadDedupeDecision", /uploadDedupeDecision\(key, rows\)/.test(hook), true);
  expect("dedupe: a retry decision bumps the slot attempt (same path, skipIfExists)", /attempt: entry\.slot\.attempt \+ 1[\s\S]*dispatch\(\{ type: "retry", id \}\)/.test(hook.slice(hook.indexOf("const enqueue"))), true);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`${failures.length} of ${checks} upload-progress checks failed:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`All ${checks} upload-progress checks passed.`);
