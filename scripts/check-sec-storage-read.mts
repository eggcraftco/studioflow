// Security audit #19, stage A1, web (28 Oct 2026; DESIGN-19-storage-control.md): order files and message attachments
// are opened with an address asked of Storage at that moment, so the Storage rules decide.
//
// 1. lib/studioflow/storageFileUrl.ts, compiled with the tree's own TypeScript against stubs — the decision table:
//      storagePath + Storage allows  → the address Storage gives (not the stored one)
//      storagePath + Storage refuses → no file ("denied" / "failed"), the stored token URL is NOT used
//      no storagePath (older record) → the stored URL; neither → "missing"
//    plus the ten-minute per-user memory, path hygiene, and the message-attachment path derived from this app's
//    own bucket + companies/<id>/message_files/.
// 2. Every place that drew, opened or downloaded these files with the stored URL now goes through the helper
//    (Files page, order detail, message bubbles + image viewer); uploads still write downloadURL (no A2).
//
//   npx tsx scripts/check-sec-storage-read.mts [--root <dir>]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sec-storage-"));
fs.writeFileSync(path.join(tmp, "stub.mjs"), `
export const auth = { currentUser: { uid: "u-stub" } };
export const storage = { app: { options: { storageBucket: "eggcraft-studio.appspot.com" } } };
export function ref(_s, p) { return p; }
export async function getDownloadURL() { throw new Error("stub"); }
export async function createSharedFileLink(u) { return u; }
export async function downloadSharedFile() {}
export function maskFileUrl(u) { return u; }
export function useEffect() {}
export function useState(v) { return [typeof v === "function" ? v() : v, () => {}]; }
`);
let m: Record<string, any> | null = null;
const source = read("lib/studioflow/storageFileUrl.ts");
if (!source) {
  ok("lib/studioflow/storageFileUrl.ts exists", false);
} else {
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/(["'])(react|firebase\/storage|@\/lib\/firebase\/client|@\/lib\/studioflow\/fileMask)\1/g, '"./stub.mjs"');
  const file = path.join(tmp, "storageFileUrl.mjs");
  fs.writeFileSync(file, js);
  m = await import(pathToFileURL(file).href);
}

const STORED = "https://firebasestorage.googleapis.com/v0/b/eggcraft-studio.appspot.com/o/companies%2Fc1%2Fclient_files%2Fo1%2Fa.pdf?alt=media&token=OLD";
const FRESH = "https://firebasestorage.googleapis.com/v0/b/eggcraft-studio.appspot.com/o/companies%2Fc1%2Fclient_files%2Fo1%2Fa.pdf?alt=media&token=FRESH";
const PATH = "companies/c1/client_files/o1/a.pdf";

if (m) {
  let calls = 0;
  let uid = "u1";
  let now = 1_000_000;
  const allow = { fetchUrl: async (p: string) => { calls += 1; return p === PATH ? FRESH : ""; }, uid: () => uid, now: () => now };
  const refuse = (code: string) => ({ fetchUrl: async () => { calls += 1; throw Object.assign(new Error(code), { code }); }, uid: () => uid, now: () => now });

  // ---- the decision table
  m.clearStorageUrlCache();
  const granted = await m.resolveStorageUrl(PATH, STORED, allow);
  ok("path + Storage allows → Storage's address, not the stored one", granted.status === "ready" && granted.url === FRESH && granted.source === "storage");
  for (const code of ["storage/unauthorized", "storage/unauthenticated", "storage/object-not-found"]) {
    m.clearStorageUrlCache();
    const r = await m.resolveStorageUrl(PATH, STORED, refuse(code));
    ok(`path + Storage refuses (${code}) → denied, no stored fallback`, r.status === "denied" && !("url" in r));
  }
  m.clearStorageUrlCache();
  const broken = await m.resolveStorageUrl(PATH, STORED, refuse("storage/retry-limit-exceeded"));
  ok("path + other Storage failure → failed, no stored fallback", broken.status === "failed" && !("url" in broken));
  const legacy = await m.resolveStorageUrl("", STORED, refuse("storage/unauthorized"));
  ok("no path (older record) → the stored URL, Storage not asked", legacy.status === "ready" && legacy.url === STORED && legacy.source === "stored");
  ok("neither → missing", (await m.resolveStorageUrl("", "", allow)).status === "missing");
  ok("an unusable path is treated as none (stored URL)", (await m.resolveStorageUrl("../companies/c1/x", STORED, allow)).source === "stored");

  // ---- memory
  m.clearStorageUrlCache(); calls = 0; uid = "u1"; now = 1_000_000;
  await m.resolveStorageUrl(PATH, STORED, allow);
  await m.resolveStorageUrl(PATH, STORED, allow);
  ok("second ask within ten minutes is answered from memory", calls === 1);
  uid = "u2";
  await m.resolveStorageUrl(PATH, STORED, allow);
  ok("another signed-in user is asked afresh (memory is per user)", calls === 2);
  uid = "u1"; now += m.STORAGE_URL_CACHE_MS + 1;
  await m.resolveStorageUrl(PATH, STORED, allow);
  ok("after ten minutes Storage is asked again", calls === 3);
  m.clearStorageUrlCache(); calls = 0;
  await m.resolveStorageUrl(PATH, STORED, refuse("storage/unauthorized"));
  await m.resolveStorageUrl(PATH, STORED, refuse("storage/unauthorized"));
  ok("a refusal is never remembered as an address", calls === 2);

  // ---- path hygiene
  for (const bad of ["", "/companies/c1/a", "companies//a", "companies/../a", "companies/./a", "companies\\c1\\a", "companies/c1/a\u0000"]) {
    ok(`refused path ${JSON.stringify(bad)}`, m.cleanStoragePath(bad) === "");
  }
  ok("a normal path is kept", m.cleanStoragePath(` ${PATH} `) === PATH);

  // ---- message attachments
  const BUCKET = "eggcraft-studio.appspot.com";
  const msg = "https://firebasestorage.googleapis.com/v0/b/eggcraft-studio.appspot.com/o/companies%2Fc1%2Fmessage_files%2Ft1%2Fuuid_photo.jpg?alt=media&token=T";
  ok("message attachment URL → its message_files path", m.messageAttachmentStoragePath(msg, BUCKET) === "companies/c1/message_files/t1/uuid_photo.jpg");
  ok("with the workspace id given and matching", m.messageAttachmentStoragePath(msg, BUCKET, "c1") === "companies/c1/message_files/t1/uuid_photo.jpg");
  ok("with another workspace id → none (stored URL)", m.messageAttachmentStoragePath(msg, BUCKET, "c2") === "");
  ok("another bucket → none", m.messageAttachmentStoragePath(msg, "someone-else.appspot.com") === "");
  ok("a client_files URL is not a message attachment", m.messageAttachmentStoragePath(STORED, BUCKET) === "");
  ok("another host → none", m.messageAttachmentStoragePath(msg.replace("firebasestorage.googleapis.com", "evil.example"), BUCKET) === "");
  ok("a path-traversal object name → none", m.messageAttachmentStoragePath("https://firebasestorage.googleapis.com/v0/b/eggcraft-studio.appspot.com/o/companies%2Fc1%2Fmessage_files%2F..%2F..%2Fx?alt=media", BUCKET) === "");
  ok("the emulator's loopback URL is read the same way", m.messageAttachmentStoragePath("http://127.0.0.1:9199/v0/b/eggcraft-studio.appspot.com/o/companies%2Fc1%2Fmessage_files%2Ft1%2Fa.png?alt=media", BUCKET) === "companies/c1/message_files/t1/a.png");
  ok("garbage → none", m.messageAttachmentStoragePath("not a url", BUCKET) === "" && m.messageAttachmentStoragePath(null, BUCKET) === "");
  ok("the app bucket comes from the Storage instance", m.appStorageBucket() === BUCKET);

  // ---- sentences
  ok("denied → the existing 'not accessible' sentence", m.openOutcomeProblem("denied") === "This file's storage area is not accessible to your account." && m.resolvedFileProblem({ status: "denied" }) === m.STORAGE_FILE_DENIED_TEXT);
  ok("failed → the existing 'could not be opened' sentence", m.openOutcomeProblem("failed") === "The file could not be opened.");
  ok("ready / loading → no sentence", m.openOutcomeProblem("ready") === "" && m.resolvedFileProblem({ status: "loading" }) === "");
}

// ---------------------------------------------------------------- 2. wiring
const files = read("app/files/page.tsx");
const order = read("app/orders/OrderDetailContent.tsx");
const messages = read("app/messages/page.tsx");
const clientFiles = read("lib/studioflow/clientFiles.ts");
for (const [rel, text] of [["app/files/page.tsx", files], ["app/orders/OrderDetailContent.tsx", order]] as const) {
  ok(`${rel}: no <img> draws a stored downloadURL`, !/<img src=\{(file|activeFile|photo)\.downloadURL\}/.test(text));
  ok(`${rel}: nothing opens / downloads a stored downloadURL directly`, !/(openSharedFile|downloadSharedFile)\((file|activeFile)\.downloadURL/.test(text));
  ok(`${rel}: the preview asks Storage (useResolvedFileUrl) and frames only that address`, /useResolvedFileUrl\(activeFile\.storagePath, activeFile\.downloadURL\)/.test(text) && /safePreviewFrameUrl\(activeUrl,/.test(text));
  ok(`${rel}: thumbnails are StoredFileImage, opening is openStoredFile`, /<StoredFileImage/.test(text) && /openStoredFile\(/.test(text));
  ok(`${rel}: a refusal is said (resolvedFileProblem / openOutcomeProblem)`, /resolvedFileProblem\(resolved\)/.test(text) && /openOutcomeProblem\(status\)/.test(text));
  ok(`${rel}: a file with only a storagePath is still offered`, /Boolean\(file\.downloadURL \|\| file\.storagePath\)/.test(text));
}
ok("order detail: Download goes through downloadStoredFile", /downloadStoredFile\(activeFile, activeFile\.fileName, brandedHost\)/.test(order));
ok("messages: bubble and viewer never draw or link item.fileURL directly", !/src=\{item\.fileURL\}/.test(messages) && !/href=\{item\.fileURL\}/.test(messages) && !/writeText\(item\.fileURL\)/.test(messages));
ok("messages: the attachment path is derived from the app's own bucket", (messages.match(/messageAttachmentStoragePath\(item\.fileURL, appStorageBucket\(\)\)/g) || []).length === 2);
ok("uploads still write downloadURL and storagePath (A1, not A2)", /storagePath: storageRef\.fullPath/.test(clientFiles) && /^\s*downloadURL,\s*$/m.test(clientFiles));

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-storage-read ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-storage-read ${checks}/${checks} pass; reds: none`);
