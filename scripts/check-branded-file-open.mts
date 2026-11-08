// Branded file open, web (8 Nov 2026): the screens that still opened a stored file on its raw firebasestorage
// address — the customer's Files tab, the inventory panel and the order's "From the Files library" — now open it on
// the workspace's file address, as the Files page does (the native apps got the same fix: BrandedFileLink).
//
//   1. lib/studioflow/fileMask.ts, compiled with the tree's own TypeScript against stubs: maskFileUrl and
//      createSharedFileLink give https://<file host>/f/… (the short link when nvCreateFileLink answers, the masked
//      one when it fails), never firebasestorage; a URL that is not Firebase Storage stays as it is. Same vectors as
//      the apps (scripts/branded-file-open/main.swift, BrandedFileLinkRulesTest.kt).
//   2. the three screens, read from source: the customer's files open through openStoredFile (Storage first, audit
//      #19 A1) on workspace.fileLinkHost; library files open through openSharedFile; the inventory panel's bank
//      receipt opens masked only (maskFileUrl, no nvCreateFileLink: a financial document gets no new share record).
//   3. anywhere in app/ and components/: no library file is handed to window.open raw, and no stored file's
//      download URL is an <a href> on its own.
//
//   npm run test:branded-file-open
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
let checks = 0;
let failures = 0;
function expect(name: string, ok: unknown, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}
/** The text from `start` to `end` (exclusive), or "" when either is missing. */
function between(text: string, start: string, end: string) {
  const a = text.indexOf(start);
  const b = a >= 0 ? text.indexOf(end, a + start.length) : -1;
  return a >= 0 && b > a ? text.slice(a, b) : "";
}

// ---- 1. the helpers
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "branded-file-open-"));
fs.writeFileSync(path.join(tmp, "stub.mjs"), `
export const functions = {};
export function httpsCallable(_f, name) { return async data => globalThis.__callable(name, data); }
`);
const g = globalThis as unknown as { __callable: (name: string, data: unknown) => Promise<unknown>; __asked: string[] };
g.__asked = [];
let fm: Record<string, any> | null = null;
const fileMaskSource = read("lib/studioflow/fileMask.ts");
if (fileMaskSource) {
  let js = ts.transpileModule(fileMaskSource, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/(["'])(firebase\/functions|@\/lib\/firebase\/client)\1/g, '"./stub.mjs"');
  fs.writeFileSync(path.join(tmp, "fileMask.mjs"), js);
  fm = await import(pathToFileURL(path.join(tmp, "fileMask.mjs")).href);
}
expect("lib/studioflow/fileMask.ts compiles and loads", fm);
const RAW = "https://firebasestorage.googleapis.com/v0/b/eggcraft-studio.appspot.com/o/companies%2Fws1%2Fclient_files%2Fo1%2Fring%20photo.png?alt=media&token=abc-123";
const FILES = "files.eggcraft.co.uk";
const MASKED = "https://files.eggcraft.co.uk/f/companies/ws1/client_files/o1/ring%20photo.png?b=eggcraft-studio.appspot.com&t=abc-123";
if (fm) {
  expect("maskFileUrl: the workspace's file address", fm.maskFileUrl(RAW, FILES) === MASKED, fm.maskFileUrl(RAW, FILES));
  expect("maskFileUrl: no host → ours", fm.maskFileUrl(RAW).startsWith("https://nivadesk.app/f/companies/ws1/"));
  for (const other of ["https://drive.google.com/file/d/xyz/view", "https://example.com/files/a.pdf", "https://firebasestorage.googleapis.com.evil.example/v0/b/b/o/p.png?token=t"]) {
    expect(`maskFileUrl: not Firebase Storage stays as it is (${other.slice(8, 40)}…)`, fm.maskFileUrl(other, FILES) === other);
  }
  expect("maskFileUrl: a Storage URL without a token stays as it is",
    fm.maskFileUrl("https://firebasestorage.googleapis.com/v0/b/b/o/p.png?alt=media", FILES) === "https://firebasestorage.googleapis.com/v0/b/b/o/p.png?alt=media");
  g.__callable = async (name, data) => { g.__asked.push(`${name} ${JSON.stringify(data)}`); return { data: { id: "aB9xK2", ext: "png" } }; };
  expect("createSharedFileLink: the short link on the file address", (await fm.createSharedFileLink(RAW, FILES)) === "https://files.eggcraft.co.uk/f/aB9xK2.png");
  expect("createSharedFileLink: it asked nvCreateFileLink with the stored URL", g.__asked.at(-1) === `nvCreateFileLink ${JSON.stringify({ url: RAW })}`);
  g.__callable = async () => { throw new Error("functions/unavailable"); };
  expect("createSharedFileLink: the call failed → the masked link, never the raw one", (await fm.createSharedFileLink(RAW, FILES)) === MASKED);
  g.__callable = async () => ({ data: { id: "", ext: "png" } });
  expect("createSharedFileLink: no id → the masked link", (await fm.createSharedFileLink(RAW, FILES)) === MASKED);
}

// ---- 2. the three screens
const page = read("app/customers/page.tsx");
const filesTab = between(page, 'activeTab === "Files" ?', 'activeTab === "Notes" ?');
expect("customers: the Files tab is found", filesTab.length > 0);
expect("customers: a file opens through openStoredFile on the file host",
  filesTab.includes("openStoredFile({ storagePath: file.storagePath, downloadURL: file.downloadUrl }, fileLinkHost)"));
expect("customers: the link's href is the masked one (or # when Storage decides)",
  filesTab.includes('href={file.storagePath ? "#" : maskFileUrl(file.downloadUrl, fileLinkHost) || undefined}'));
expect("customers: no raw download URL as the link", !/href=\{file\.downloadUrl/.test(filesTab));
expect("customers: a refusal is said, not swallowed", filesTab.includes("setFileProblem(openOutcomeProblem(status))"));
expect("customers: the detail gets workspace.fileLinkHost", page.includes('fileLinkHost={workspace?.fileLinkHost ?? ""}'));
const firestore = read("lib/studioflow/firestore.ts");
expect("customers: the order file keeps its storagePath", between(firestore, "function parseCustomerOrderFiles(", "function parseCustomerOrderActivity(").includes('storagePath: stringValue(item.storagePath, ""),'));

const panel = read("app/inventory/ItemDetailPanel.tsx");
const receipt = between(panel, "async function openReceipt() {", "\n  }\n");
expect("inventory: the receipt opens masked on the file address", receipt.includes('window.open(maskFileUrl(url, workspace.fileLinkHost), "_blank", "noopener,noreferrer")'));
const receiptCode = receipt.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
expect("inventory: the receipt never asks for a share link", receipt.length > 0 && !/openSharedFile|createSharedFileLink|nvCreateFileLink/.test(receiptCode));
expect("inventory: a linked library file opens through openSharedFile",
  panel.includes("void libraryFileUrl(file.storagePath)\n                        .then(url => openSharedFile(url, workspace.fileLinkHost))"));

const order = read("app/orders/OrderDetailContent.tsx");
const library = between(order, "From the Files library", "</ul>");
expect("order: \"From the Files library\" opens through openSharedFile on the file host",
  library.includes(".then(url => openSharedFile(url, workspace.fileLinkHost))"));
expect("order: no library file opened raw", !library.includes("window.open(url"));

// ---- 3. anywhere
function walk(dir: string): string[] {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(e => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return walk(rel);
    return /\.(tsx?|mts)$/.test(e.name) ? [rel] : [];
  });
}
const sources = [...walk("app"), ...walk("components")].map(rel => ({ rel, text: read(rel) }));
const rawLibrary = sources.flatMap(({ rel, text }) =>
  [...text.matchAll(/libraryFileUrl\([^)]*\)[\s\S]{0,160}?(window\.open\(url\b|openSharedFile\()/g)].filter(m => m[1].startsWith("window")).map(() => rel));
expect("no library file is handed to window.open raw", rawLibrary.length === 0, rawLibrary.join(", "));
const rawHref = sources.flatMap(({ rel, text }) => [...text.matchAll(/href=\{(file|item|activeFile)\.(downloadURL|downloadUrl)\b/g)].map(() => rel));
expect("no stored file's download URL is a bare <a href>", rawHref.length === 0, rawHref.join(", "));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nbranded-file-open: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
