// The order screen's file service client, DRIVEN as shipped.
//
//   npm run test:order-files
//
// What this exists to catch:
//
//   1. THE DESTINATION MUST NOT COME FROM THE CLIENT. `attachOrderFile` reads
//      the workspace's own storage connection and decides where a file goes. If
//      this module ever started sending a provider, a connection id, a bucket or
//      a path — helpfully, to "avoid a lookup" — a caller could name somebody
//      else's storage. The payload is inspected for exactly that.
//   2. THE WORDING MUST MATCH WHAT HAPPENS. Drive does not destroy a file: the
//      adapter sets `trashed: true` and the owner can restore it. A screen that
//      says "this cannot be undone" over that is making a false statement about
//      somebody else's storage, so the sentence is asserted per provider.
//   3. A CONTROL THAT CANNOT WORK MUST NOT BE OFFERED. The Preview card stores
//      its image on the order and reads it back for the order's whole life; an
//      authorised file's link expires in ten minutes. `canUseFileAsPreview` is
//      the one place that decides it, and it is run rather than read.
//
// The module is COMPILED AND CALLED, not pattern-matched. An earlier habit in
// this repo was to assert a call site by regex, which proves a line EXISTS and
// not that it runs — the call could move below an early return and the check
// would stay green. The two source-level checks that remain are LABELLED as
// such, and they exist only because their runtime half would need the real
// firebase/storage module in a temp directory.
//
// COMMONJS ON PURPOSE. An ES2022 emit keeps `./stub-functions` verbatim and
// Node's ESM resolver then refuses it for want of an extension — the module is
// never loaded and every check after the import silently never runs. `require`
// resolves extensionless, which is why check-file-proxy-guards.mjs reaches for
// createRequire too.
//
// Compiled with the project's own TypeScript, following check-finance-vectors.mjs
// and check-file-proxy-guards.mjs, because studioflow-web has no test runner.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");

const servicePath = path.join(webRoot, "lib", "studioflow", "orderFileService.ts");
const clientFilesPath = path.join(webRoot, "lib", "studioflow", "clientFiles.ts");

// Every check is counted and the total is pinned. A runner that exits 0 having
// quietly skipped half its checks has happened in this repo before — and the
// first version of THIS file exited 1 with four of its checks run, because the
// module failed to load. The count is compared, not just printed.
const EXPECTED_CHECKS = 53;

let failures = 0;
let checks = 0;
function check(name, condition, detail) {
  checks += 1;
  if (condition) {
    console.log("PASS  ", name);
  } else {
    failures += 1;
    console.log("FAIL  ", name, detail ? `\n        ${detail}` : "");
  }
}

const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-order-files-"));
try {
  const srcDir = path.join(outDir, "src");
  const jsDir = path.join(outDir, "js");
  mkdirSync(srcDir, { recursive: true });

  const shipped = readFileSync(servicePath, "utf8");
  const clientFilesSource = readFileSync(clientFilesPath, "utf8");

  // ---- the two source-level checks, named as such ---------------------------
  //
  // The extension allow-list and the content-type map live in clientFiles.ts and
  // are IMPORTED here rather than restated. Proving that at runtime would mean
  // compiling clientFiles.ts too, which reaches firebase/storage and the app's
  // Firebase singleton. So this pair is read, and labelled read.
  check(
    "SOURCE-LEVEL: clientFiles.ts exports extensionForFile for reuse",
    /export function extensionForFile\b/.test(clientFilesSource)
  );
  check(
    "SOURCE-LEVEL: clientFiles.ts exports contentTypeForFile for reuse",
    /export function contentTypeForFile\b/.test(clientFilesSource)
  );

  // ---- prepare the shipped module so it can be compiled in isolation --------
  //
  // Only the module specifiers are rewritten; not one line of behaviour. Both
  // rewrites are asserted to have applied, because a silent no-op would compile
  // something that is not the shipped file and every check below would be
  // testing nothing.
  const prepared = shipped
    .replace(/from "firebase\/functions"/g, 'from "./stub-functions"')
    .replace(/from "@\/lib\/firebase\/client"/g, 'from "./stub-client"')
    .replace(/from "@\/lib\/studioflow\/planActions"/g, 'from "./stub-plan"')
    .replace(/from "@\/lib\/studioflow\/firestore"/g, 'from "./stub-firestore"')
    .replace(/from "@\/lib\/studioflow\/syncStatus"/g, 'from "./stub-sync"')
    .replace(/from "@\/lib\/studioflow\/clientFiles"/g, 'from "./stub-client-files"')
    .replace(/from "@\/lib\/studioflow\/storage"/g, 'from "./stub-storage"')
    .replace(/from "@\/lib\/studioflow\/uploadRunner"/g, 'from "./stub-runner"');

  check("the alias rewrite applied: no @/ specifier survives", !prepared.includes('from "@/'));
  check("the transport rewrite applied: firebase/functions is stubbed", !prepared.includes('from "firebase/functions"'));

  writeFileSync(path.join(srcDir, "orderFileService.ts"), prepared);

  // The recorder every callable goes through. One array, in call order.
  writeFileSync(path.join(srcDir, "stub-functions.ts"), `
export type HttpsCallableResult<T> = { data: T };
export const CALLS: { name: string; payload: Record<string, unknown> }[] = [];
// A reply may be a value or a FUNCTION of the payload. The resumable flow needs
// the second: a chunk call has to answer with the offset it has reached, which
// depends on what it was just sent, and a static reply would let a broken client
// loop for ever against an answer that never moves.
export const REPLIES: Record<string, unknown> = {};
export function httpsCallable<Req, Res>(_functions: unknown, name: string) {
  return async (payload: Req): Promise<{ data: Res }> => {
    const record = payload as Record<string, unknown>;
    CALLS.push({ name, payload: record });
    const reply = REPLIES[name];
    const data = typeof reply === "function"
      ? (reply as (p: Record<string, unknown>) => unknown)(record)
      : reply;
    return { data: (data ?? {}) as Res };
  };
}
`);
  // `auth` is imported for the authorised-view fetch; no check below signs in,
  // so a null currentUser is the truthful stub.
  writeFileSync(path.join(srcDir, "stub-client.ts"), "export const functions = {};\nexport const auth = { currentUser: null as null | { getIdToken: () => Promise<string> } };\n");
  writeFileSync(path.join(srcDir, "stub-plan.ts"), `
export const PLAN_CALLS: unknown[] = [];
export async function requireWorkspacePlanAction(companyId: string, action: string, payload: unknown) {
  PLAN_CALLS.push({ companyId, action, payload });
  return { allowed: true };
}
`);
  writeFileSync(path.join(srcDir, "stub-firestore.ts"), "export type WorkspaceContext = any;\n");
  writeFileSync(path.join(srcDir, "stub-sync.ts"), `
export async function withWebSyncStatus<T>(run: () => Promise<T>, _label: string): Promise<T> {
  return run();
}
`);
  // Mirrors the real helpers' contract for the two file types used below. The
  // real ones are asserted above; this pair only has to let the module run.
  // THE LIST HERE MIRRORS THE REAL ONE, deliberately. A stub that is NARROWER
  // than the module it stands in for does not fail safe: this one allowed five
  // extensions where clientFiles.ts allows ten, so a check that uploaded a .psd
  // threw "bad extension" from the stub — an exception that escaped the try
  // block and took eleven later checks with it, while looking like a product
  // fault. The two source-level checks above assert that the real helpers are
  // exported; this asserts nothing, so it must at least not lie.
  writeFileSync(path.join(srcDir, "stub-client-files.ts"), `
const ALLOWED = ["pdf", "jpg", "jpeg", "png", "heic", "heif", "webp", "psd", "psb", "zip"];
export function extensionForFile(file: File) {
  const name = file.name.trim();
  const extension = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  if (!ALLOWED.includes(extension)) throw new Error("Choose a PDF, JPG, JPEG, PNG, HEIC, HEIF, WEBP, PSD, PSB or ZIP file.");
  return extension;
}
export function contentTypeForFile(file: File, extension: string) {
  if (extension === "pdf") return "application/pdf";
  if (extension === "zip") return "application/zip";
  if (extension === "psd") return "image/vnd.adobe.photoshop";
  if (extension === "psb") return "application/octet-stream";
  if (file.type) return file.type;
  return "application/octet-stream";
}
`);

  // The provider names the badge and the bin sentence use; the real table is
  // lib/studioflow/storage.ts and is driven on its own further down.
  writeFileSync(path.join(srcDir, "stub-storage.ts"), `
const LABELS: Record<string, string> = { gdrive: "Google Drive", onedrive: "OneDrive", dropbox: "Dropbox", box: "Box", managed: "NivaDesk Cloud" };
export function storageProviderLabel(id: string) { return LABELS[id] || id; }
`);
  writeFileSync(path.join(srcDir, "stub-runner.ts"), `
export class UploadCancelledError extends Error { constructor() { super("Upload cancelled."); this.name = "UploadCancelledError"; } }
export function throwIfCancelled(signal?: AbortSignal) { if (signal?.aborted) throw new UploadCancelledError(); }
`);

  const tsc = path.join(webRoot, "node_modules", ".bin", "tsc");
  execFileSync(tsc, [
    "--outDir", jsDir,
    "--module", "commonjs",
    "--target", "es2022",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--lib", "es2022,dom",
    path.join(srcDir, "orderFileService.ts")
  ], { stdio: "pipe" });
  writeFileSync(path.join(jsDir, "package.json"), JSON.stringify({ type: "commonjs" }));

  const load = createRequire(path.join(jsDir, "loader.cjs"));
  const service = load(path.join(jsDir, "orderFileService.js"));
  const transport = load(path.join(jsDir, "stub-functions.js"));

  const workspace = { id: "ws-1", entitlements: { features: { client_files: true } } };
  const lastCall = () => transport.CALLS[transport.CALLS.length - 1];

  // ---- the callables are the ones the server exports ------------------------
  transport.REPLIES.listOrderFiles = { files: [], counts: { total: 0, records: 0, legacy: 0 } };
  await service.listOrderFilesViaService({ workspace, orderId: "o-1" });
  check("listing calls listOrderFiles", lastCall()?.name === "listOrderFiles", `called ${lastCall()?.name}`);

  const BYTES = new Uint8Array([0, 1, 2, 250, 251, 252, 13, 10, 0, 255]);
  const file = new File([BYTES], "brief.pdf", { type: "application/pdf" });
  transport.REPLIES.attachOrderFile = {
    ref: "gdrive:abc", fileId: "f1", fileName: "brief.pdf", sizeBytes: BYTES.length, alreadyAttached: true
  };
  const attached = await service.attachOrderFileViaService({ workspace, orderId: "o-1", file });
  const attachCall = lastCall();
  check("attaching calls attachOrderFile", attachCall?.name === "attachOrderFile", `called ${attachCall?.name}`);

  // THE security property: nothing in the payload names a destination.
  const payloadKeys = Object.keys(attachCall?.payload ?? {});
  const destinationKeys = payloadKeys.filter(key =>
    /provider|connection|bucket|storagePath|path|folder|parent|driveId/i.test(key));
  check(
    "the attach payload names NO destination — the server decides where a file goes",
    destinationKeys.length === 0,
    `payload carried ${destinationKeys.join(", ")}`
  );

  const sent = Buffer.from(String(attachCall?.payload?.dataBase64 ?? ""), "base64");
  check(
    "the bytes survive the base64 encoding exactly",
    Buffer.compare(sent, Buffer.from(BYTES)) === 0,
    `sent ${sent.length} bytes, expected ${BYTES.length}`
  );
  check("a retry is reported rather than hidden (alreadyAttached)", attached.alreadyAttached === true);

  transport.REPLIES.openOrderFile = {
    url: "https://example.invalid/signed", expiresAtMs: 1,
    access: "authorized", origin: "fileMetadata", fileName: "brief.pdf"
  };
  await service.openOrderFileViaService({ workspace, orderId: "o-1", ref: "gdrive:abc" });
  check("opening calls openOrderFile", lastCall()?.name === "openOrderFile", `called ${lastCall()?.name}`);

  transport.REPLIES.detachOrderFile = { removed: true, reason: "" };
  await service.detachOrderFileViaService({ workspace, orderId: "o-1", ref: "gdrive:abc" });
  check("detaching calls detachOrderFile", lastCall()?.name === "detachOrderFile", `called ${lastCall()?.name}`);

  // ---- provider awareness ---------------------------------------------------
  check("the managed bucket is not 'provider hosted'", service.isProviderHosted({ provider: "nivadesk" }) === false);
  check("a workspace's own Drive is", service.isProviderHosted({ provider: "gdrive" }) === true);

  // ---- the wording matches what deleting actually does ----------------------
  check("a Drive file's control says Move to bin", service.deleteActionLabel({ provider: "gdrive" }) === "Move to bin");
  check("a managed file's control still says Delete", service.deleteActionLabel({ provider: "nivadesk" }) === "Delete");

  const driveSentence = service.deleteConfirmSentence({ provider: "gdrive", fileName: "brief.pdf" });
  const managedSentence = service.deleteConfirmSentence({ provider: "nivadesk", fileName: "brief.pdf" });
  check(
    "a Drive file is NEVER described as permanently deleted",
    !/cannot be undone/i.test(driveSentence) && !/permanent/i.test(driveSentence),
    driveSentence
  );
  check(
    "a Drive file is described as recoverable",
    /bin/i.test(driveSentence) && /recoverable/i.test(driveSentence),
    driveSentence
  );
  check("a managed file keeps the sentence that was already true", /cannot be undone/i.test(managedSentence), managedSentence);

  // ---- a control that cannot work is not offered ----------------------------
  check(
    "an authorised file cannot be used as the Preview image",
    service.canUseFileAsPreview({ legacyTokenUrl: "" }) === false
  );
  check(
    "a legacy file with a permanent URL still can",
    service.canUseFileAsPreview({ legacyTokenUrl: "https://example.invalid/token" }) === true
  );
  check("an authorised file reports no permanent URL", service.permanentUrlFor({ legacyTokenUrl: "" }) === "");

  // ---- refusals are read from details.reason, not from the sentence ---------
  check(
    "a legacy-row refusal is recognised by its reason code",
    service.isLegacyClientFileRefusal({ details: { reason: "legacy_client_file" } }) === true
  );
  check(
    "an unrelated refusal is not mistaken for it",
    service.isLegacyClientFileRefusal({ details: { reason: "not_found" } }) === false
  );
  check(
    "a missing signer is recognised by its reason code",
    service.isNoSignerRefusal({ details: { reason: "no_signer" } }) === true
  );
  check(
    "a refusal with no details is not mistaken for either",
    service.isLegacyClientFileRefusal(new Error("boom")) === false
      && service.isNoSignerRefusal(new Error("boom")) === false
  );

  // ---- the CHUNK LOOP, which is the whole reason the client has one ---------
  //
  // The server's own suite proves the three callables. What only this side can
  // prove is that the browser drives them: in the right order, from the offset
  // the SERVER reported rather than one it remembered, with the bytes intact,
  // and without spinning on an answer that never advances.

  /** Wire the transport to behave like an open session, and record the bytes. */
  function armResumable({ startOffset = 0, adopted = false, chunkBytes = 262144, stall = false } = {}) {
    const received = { value: startOffset };
    const parts = [];
    transport.REPLIES.beginOrderFileUpload = () => ({
      ok: true, sessionId: "sess-1", uploadKey: "u-server-derived",
      offset: startOffset, sizeBytes: 0, resumed: adopted, adopted,
      chunkBytes, chunkAlignBytes: 262144, maxChunkBytes: 8 * 1024 * 1024
    });
    transport.REPLIES.uploadOrderFileChunk = (payload) => {
      const bytes = Buffer.from(String(payload.dataBase64 ?? ""), "base64");
      parts.push({ offset: Number(payload.offset), bytes });
      if (stall) return { ok: true, receivedBytes: received.value, complete: false };
      received.value = Number(payload.offset) + bytes.length;
      return { ok: true, receivedBytes: received.value, complete: received.value >= Number(payload.sizeBytes) };
    };
    transport.REPLIES.completeOrderFileUpload = () => ({
      ok: true, ref: "gdrive:done", fileId: "f-done", fileName: "big.psd",
      sizeBytes: received.value, alreadyAttached: false
    });
    return parts;
  }

  // A file whose bytes are checkable, small enough to keep this script quick.
  // The chunk loop is driven through `attachOrderFileResumable` DIRECTLY, so
  // that the mechanics are exercised without allocating a file big enough to
  // cross the dispatcher's threshold — the dispatcher's own routing is a
  // separate pair of checks below, where the size is the point.
  const BODY = new Uint8Array(700_000);
  for (let i = 0; i < BODY.length; i += 1) BODY[i] = (i * 7) % 251;
  const chunkedFile = () => new File([BODY], "big.psd", {
    type: "image/vnd.adobe.photoshop", lastModified: 1_757_000_000_000
  });

  transport.CALLS.length = 0;
  let parts = armResumable({ chunkBytes: 262144 });
  const seen = [];
  const finished = await service.attachOrderFileResumable({
    workspace, orderId: "o-1", file: chunkedFile(),
    onProgress: (p) => seen.push(p)
  });

  const names = transport.CALLS.map(entry => entry.name);
  check(
    "the client drives begin -> chunk -> complete, in that order",
    names[0] === "beginOrderFileUpload"
      && names[names.length - 1] === "completeOrderFileUpload"
      && names.slice(1, -1).every(name => name === "uploadOrderFileChunk")
      && names.filter(name => name === "uploadOrderFileChunk").length > 1,
    names.join(" > ")
  );

  const rebuilt = Buffer.concat(parts.slice().sort((a, b) => a.offset - b.offset).map(part => part.bytes));
  check(
    "the chunks reassemble to exactly the original file",
    Buffer.compare(rebuilt, Buffer.from(BODY)) === 0,
    `rebuilt ${rebuilt.length} of ${BODY.length}`
  );
  check(
    "every chunk but the last is the size the server advertised",
    parts.length > 1 && parts.slice(0, -1).every(part => part.bytes.length === 262144),
    parts.map(part => part.bytes.length).join(",")
  );
  check(
    "the offsets are contiguous — nothing was sent twice or skipped",
    parts.every((part, index) => part.offset === parts.slice(0, index).reduce((sum, p) => sum + p.bytes.length, 0)),
    parts.map(part => part.offset).join(",")
  );
  check(
    "progress is reported, rises, and ends at the whole file",
    seen.length > 1
      && seen.every((p, i) => i === 0 || p.sentBytes >= seen[i - 1].sentBytes)
      && seen[seen.length - 1].sentBytes === BODY.length,
    seen.map(p => p.sentBytes).join(",")
  );
  check("the completed upload comes back with its provider ref", finished.ref === "gdrive:done");

  // THE restart property at the client layer: the server says the upload is
  // already part done, and the browser continues from THERE rather than
  // re-sending bytes the provider already holds.
  transport.CALLS.length = 0;
  parts = armResumable({ startOffset: 262144, adopted: true, chunkBytes: 262144 });
  const resumedSeen = [];
  await service.attachOrderFileResumable({
    workspace, orderId: "o-1", file: chunkedFile(), onProgress: (p) => resumedSeen.push(p)
  });
  check(
    "a resumed upload starts at the server's offset and re-sends nothing",
    parts.length > 0 && parts[0].offset === 262144 && resumedSeen[0]?.resumed === true,
    `first chunk at ${parts[0]?.offset}, resumed=${resumedSeen[0]?.resumed}`
  );

  // An answer that does not move is an infinite loop wearing a retry's clothes.
  transport.CALLS.length = 0;
  armResumable({ stall: true });
  let stalled = "";
  try {
    await service.attachOrderFileResumable({ workspace, orderId: "o-1", file: chunkedFile() });
  } catch (error) {
    stalled = error instanceof Error ? error.message : String(error);
  }
  check("an upload that stops advancing is refused, not looped on", /progress/i.test(stalled), stalled);

  // ---- the dispatcher's routing, where the SIZE is the point ----------------
  const SMALL = new File([new Uint8Array(1024)], "small.png", { type: "image/png", lastModified: 1 });
  // One byte past the single-request hint, allocated sparsely.
  const HUGE = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "huge.zip", { type: "application/zip", lastModified: 2 });

  transport.CALLS.length = 0;
  transport.REPLIES.attachOrderFile = {
    ref: "nivadesk:p", fileId: "f", fileName: "small.png", sizeBytes: 1024, alreadyAttached: false
  };
  await service.uploadOrderFile({ workspace, orderId: "o-1", file: SMALL });
  check(
    "a small file still goes in ONE request",
    transport.CALLS.some(entry => entry.name === "attachOrderFile")
      && !transport.CALLS.some(entry => entry.name === "beginOrderFileUpload"),
    transport.CALLS.map(entry => entry.name).join(" > ")
  );

  transport.CALLS.length = 0;
  armResumable({ chunkBytes: 4 * 1024 * 1024 });
  await service.uploadOrderFile({ workspace, orderId: "o-1", file: HUGE });
  check(
    "a file past the one-request limit is chunked instead",
    transport.CALLS[0]?.name === "beginOrderFileUpload"
      && !transport.CALLS.some(entry => entry.name === "attachOrderFile"),
    transport.CALLS.map(entry => entry.name).join(" > ")
  );

  // Storage that cannot chunk, for a file too big for one request: said in a
  // sentence rather than handed back as a reason code.
  transport.CALLS.length = 0;
  transport.REPLIES.beginOrderFileUpload = () => {
    const error = new Error("This workspace's storage cannot continue an interrupted upload.");
    error.details = { reason: "resumable_unsupported" };
    throw error;
  };
  let refused = "";
  try {
    await service.uploadOrderFile({ workspace, orderId: "o-1", file: HUGE });
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error);
  }
  check(
    "no route for a large file is explained, and never silently redirected",
    /too large/i.test(refused) && /cannot continue an interrupted upload/i.test(refused)
      && !transport.CALLS.some(entry => entry.name === "attachOrderFile"),
    refused
  );

  // ---- own cloud storage (30 Oct 2026): four providers, one sentence each ----
  for (const [provider, label] of [["gdrive", "Google Drive"], ["onedrive", "OneDrive"], ["dropbox", "Dropbox"], ["box", "Box"]]) {
    const sentence = service.deleteConfirmSentence({ provider, fileName: "brief.pdf" });
    check(
      `${label}: the bin sentence names the provider and never says permanent`,
      sentence.includes("{provider}") && /bin/i.test(sentence) && !/cannot be undone/i.test(sentence)
        && service.providerBadgeLabel(provider) === label,
      `${sentence} / ${service.providerBadgeLabel(provider)}`
    );
  }
  check("a NivaDesk Cloud row is badged as NivaDesk Cloud", service.providerBadgeLabel("nivadesk") === "NivaDesk Cloud");

  // Only what the order's own array does NOT already show is drawn beside it.
  const listed = service.serviceOnlyRows([
    { ref: "gdrive:a", origin: "fileMetadata", provider: "gdrive" },
    { ref: "nivadesk:companies%2Fc%2Fx", origin: "order.clientFiles", provider: "nivadesk" },
    { ref: "nivadesk:companies%2Fc%2Fy", origin: "fileMetadata", provider: "nivadesk", alsoInLegacyArray: true },
    { ref: "", origin: "fileMetadata", provider: "box" }
  ]);
  check(
    "service rows: a recorded provider file is kept, legacy and doubled rows are not",
    listed.length === 1 && listed[0].ref === "gdrive:a",
    JSON.stringify(listed)
  );

  // The chunk size is the SERVER's, whatever it is: 8 MiB Box parts, and a Box
  // file under 20 MB as ONE chunk of the whole file. A client cap would split it.
  const BOX_SINGLE = 9_000_000;
  const boxFile = new File([new Uint8Array(BOX_SINGLE)], "box.zip", { type: "application/zip", lastModified: 3 });
  transport.CALLS.length = 0;
  parts = armResumable({ chunkBytes: BOX_SINGLE });
  await service.attachOrderFileResumable({ workspace, orderId: "o-1", file: boxFile });
  check(
    "a server chunk size above 8 MiB is sent as advertised (Box single part)",
    parts.length === 1 && parts[0].bytes.length === BOX_SINGLE,
    parts.map(part => part.bytes.length).join(",")
  );

  // Cancel stops between chunks: nothing after the abort, no completion.
  transport.CALLS.length = 0;
  parts = armResumable({ chunkBytes: 262144 });
  const controller = new AbortController();
  let cancelled = "";
  try {
    await service.attachOrderFileResumable({
      workspace, orderId: "o-1", file: chunkedFile(), signal: controller.signal,
      onProgress: (p) => { if (p.sentBytes > 0) controller.abort(); }
    });
  } catch (error) {
    cancelled = error instanceof Error ? error.name : String(error);
  }
  check(
    "a cancelled upload stops between chunks and never completes",
    cancelled === "UploadCancelledError" && parts.length === 1
      && !transport.CALLS.some(entry => entry.name === "completeOrderFileUpload"),
    `${cancelled}; ${parts.length} chunk(s); ${transport.CALLS.map(entry => entry.name).join(" > ")}`
  );

  // ---- storage.ts: the ROUTING RULE, compiled and called --------------------
  const storageSrc = readFileSync(path.join(webRoot, "lib", "studioflow", "storage.ts"), "utf8")
    .replace(/from "firebase\/functions"/g, 'from "./stub-functions"')
    .replace(/from "@\/lib\/firebase\/client"/g, 'from "./stub-client"');
  check("storage.ts: the rewrite applied", !storageSrc.includes('from "@/') && !storageSrc.includes('from "firebase/'));
  writeFileSync(path.join(srcDir, "storage.ts"), storageSrc);
  execFileSync(tsc, [
    "--outDir", path.join(outDir, "js-storage"), "--module", "commonjs", "--target", "es2022",
    "--moduleResolution", "node", "--skipLibCheck", "--lib", "es2022,dom", path.join(srcDir, "storage.ts")
  ], { stdio: "pipe" });
  writeFileSync(path.join(outDir, "js-storage", "package.json"), JSON.stringify({ type: "commonjs" }));
  const loadStorage = createRequire(path.join(outDir, "js-storage", "loader.cjs"));
  const storage = loadStorage(path.join(outDir, "js-storage", "storage.js"));
  // storage.ts compiled on its own carries its own copy of the recorder.
  const storageTransport = loadStorage(path.join(outDir, "js-storage", "stub-functions.js"));

  check("a failed status read routes to NivaDesk Cloud", storage.storageRoute(null) === "managed");
  const older = storage.normalizeStorageStatus({ provider: "gdrive", available: true, connections: [{ connectionId: "c", status: "connected" }] });
  check(
    "a drive-night-era answer (no primary) routes to NivaDesk Cloud, keeps Drive offered",
    storage.storageRoute(older) === "managed" && older.providers.length === 1 && older.providers[0].available === true,
    JSON.stringify(older.primary)
  );
  const onDrive = storage.normalizeStorageStatus({
    providers: [{ id: "gdrive", available: true }, { id: "onedrive", available: false }, { id: "ftp", available: true }],
    primary: { provider: "gdrive", connectionId: "c1" },
    connections: [{ connectionId: "c1", provider: "gdrive", status: "connected", primary: true, refreshTokenBox: "x" }]
  });
  check(
    "a server-named provider primary routes there; an unknown provider id is dropped",
    storage.storageRoute(onDrive) === "gdrive" && onDrive.providers.map(row => row.id).join(",") === "gdrive,onedrive",
    JSON.stringify(onDrive.providers)
  );
  check(
    "a connection row carries no field the client did not name (no credential pointer)",
    !("refreshTokenBox" in onDrive.connections[0]) && !("tokenSecretRef" in onDrive.connections[0])
  );
  check(
    "an unknown primary is NivaDesk Cloud, never a guess",
    storage.storageRoute(storage.normalizeStorageStatus({ primary: { provider: "s3" } })) === "managed"
  );
  check(
    "listOrderFiles is asked only when a connection exists",
    storage.storageHasServiceFiles(onDrive) === true
      && storage.storageHasServiceFiles(storage.normalizeStorageStatus({})) === false
      && storage.storageHasServiceFiles(null) === false
  );
  check(
    "a revoked row is not live and not a reconnect; a reauth row is a reconnect",
    storage.liveStorageConnection([{ provider: "box", status: "revoked" }], "box") === null
      && storage.storageConnectionNeedingReconnect([{ provider: "box", status: "revoked" }], "box") === null
      && storage.storageConnectionNeedingReconnect([{ provider: "box", status: "reauth_required" }], "box")?.status === "reauth_required"
  );

  // The consent start leaves the web-flow mark for its own callback page.
  const marks = new Map();
  globalThis.window = { sessionStorage: { setItem: (k, v) => marks.set(k, v), getItem: (k) => marks.get(k) ?? null, removeItem: (k) => marks.delete(k) } };
  storageTransport.REPLIES.storageConnectStart = { stage: "consent_required", provider: "dropbox", consentUrl: "http://127.0.0.1/consent", state: "st-1", expiresAtMs: 1 };
  const consent = await storage.beginStorageConnect("ws-1", "dropbox");
  const started = storageTransport.CALLS[storageTransport.CALLS.length - 1];
  check(
    "connect start sends the provider and leaves the sessionStorage mark for the callback",
    started?.name === "storageConnectStart" && started?.payload.provider === "dropbox"
      && consent.state === "st-1" && marks.has("nvStorageConnect:st-1"),
    JSON.stringify(started?.payload)
  );
  delete globalThis.window;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

// Counted OUTSIDE check(), so the number being compared is the number of checks
// that actually ran rather than one that includes itself.
if (checks === EXPECTED_CHECKS) {
  console.log("PASS   every check ran", `(${checks})`);
} else {
  failures += 1;
  console.log("FAIL   not every check ran:", checks, "of", EXPECTED_CHECKS,
    "\n        a module that fails to load takes the rest with it — adjust EXPECTED_CHECKS only deliberately");
}

console.log(failures
  ? `\n❌ ${failures} failing`
  : "\nThe order screen's file-service client was compiled and CALLED: the server"
    + " chooses the destination, the delete wording matches what happens, and a"
    + " control that cannot work is not offered.");
process.exit(failures ? 1 : 0);
