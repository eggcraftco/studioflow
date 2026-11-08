// Share a stored file, web (8 Nov 2026, the owner: "a Share button on the files in Files; on every device, Share opens
// that device's own share feature"). The apps hand the FILE to the system share sheet; the web does the same where the
// browser can share files (navigator.canShare({ files })) and otherwise shares or copies the workspace's file link —
// never the raw firebasestorage.googleapis.com address.
//
//   1. lib/studioflow/fileShare.ts, compiled with the tree's own TypeScript against stubs, driven with a pretend
//      navigator: the file is shared under its display name; Storage's refusal shares nothing; a browser that refused
//      for lack of a fresh tap gets the same file on the next press without asking Storage again; no file sharing →
//      the short /f/ link is shared, or copied ("link copied"); a link that is still a Storage address is never handed
//      over; a bank receipt's link is the masked one only (no nvCreateFileLink); the name vectors are the apps'.
//   2. the screens, read from source: the Files page row and preview, the order's Client files row and preview and the
//      Files library each draw FileShareButton under their Open gate;
//   3. the four sentences in every language.
//
//   npm run test:file-share
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
function between(text: string, start: string, end: string) {
  const a = text.indexOf(start);
  const b = a >= 0 ? text.indexOf(end, a + start.length) : -1;
  return a >= 0 && b > a ? text.slice(a, b) : "";
}

// ---- 1. the helper
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "file-share-"));
fs.writeFileSync(path.join(tmp, "fileMask.mjs"), `
export async function createSharedFileLink(raw, host) { return globalThis.__createLink(raw, host); }
export function maskFileUrl(raw, host) { globalThis.__masked.push(raw); return "https://" + (host || "nivadesk.app") + "/f/companies/ws1/x.pdf?b=b&t=t"; }
`);
fs.writeFileSync(path.join(tmp, "storageFileUrl.mjs"), `
export const STORAGE_FILE_DENIED_TEXT = "This file's storage area is not accessible to your account.";
export async function resolveStorageUrl(p, u) { return globalThis.__resolve(p, u); }
`);
type G = {
  __createLink: (raw: string, host?: string) => Promise<string>;
  __resolve: (p: unknown, u: unknown) => Promise<unknown>;
  __masked: string[];
};
const g = globalThis as unknown as G;
g.__masked = [];
let fsh: Record<string, any> | null = null;
const source = read("lib/studioflow/fileShare.ts");
if (source) {
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/(["'])@\/lib\/studioflow\/fileMask\1/g, '"./fileMask.mjs"').replace(/(["'])@\/lib\/studioflow\/storageFileUrl\1/g, '"./storageFileUrl.mjs"');
  fs.writeFileSync(path.join(tmp, "fileShare.mjs"), js);
  fsh = await import(pathToFileURL(path.join(tmp, "fileShare.mjs")).href);
}
expect("lib/studioflow/fileShare.ts compiles and loads", fsh);

const RAW = "https://firebasestorage.googleapis.com/v0/b/eggcraft-studio.appspot.com/o/companies%2Fws1%2Fclient_files%2Fo1%2Fring.png?alt=media&token=abc";
const SHORT = "https://files.eggcraft.co.uk/f/aB9xK2.png";
const FILE = { storagePath: "companies/ws1/client_files/o1/ring.png", downloadURL: RAW, fileName: "Ring sketch", contentType: "image/png" };

type Call = { kind: string; data?: any };
function fakeNav(opts: { files?: boolean; share?: boolean; clipboard?: boolean; shareError?: string[] }) {
  const calls: Call[] = [];
  const errors = [...(opts.shareError ?? [])];
  const nav: any = {};
  if (opts.share !== false) {
    nav.share = async (data: any) => {
      calls.push({ kind: "share", data });
      const next = errors.shift();
      if (next) { const e = new Error(next); (e as any).name = next; throw e; }
    };
  }
  if (opts.files) nav.canShare = (data: any) => Array.isArray(data?.files) && data.files.every((f: any) => f instanceof File);
  if (opts.clipboard !== false) nav.clipboard = { writeText: async (text: string) => { calls.push({ kind: "copy", data: text }); } };
  return { nav, calls };
}
function deps(nav: any, log: Call[], fetchOk = true) {
  return {
    navigator: () => nav,
    resolve: async (p: unknown, u: unknown) => { log.push({ kind: "resolve", data: [p, u] }); return g.__resolve(p, u); },
    fetch: async (url: string) => {
      log.push({ kind: "fetch", data: url });
      if (!fetchOk) throw new TypeError("Failed to fetch");
      return { ok: true, blob: async () => new Blob(["png-bytes"], { type: "image/png" }) };
    },
    createLink: async (raw: string, host?: string) => { log.push({ kind: "link", data: [raw, host] }); return g.__createLink(raw, host); },
    now: () => 1_000_000
  };
}
const handed = (calls: Call[]) => JSON.stringify(calls.map(c => c.kind === "share" ? { ...c.data, files: c.data.files?.map((f: File) => f.name) } : c.data));

if (fsh) {
  g.__resolve = async () => ({ status: "ready", url: RAW, source: "storage" });
  g.__createLink = async () => SHORT;

  // file sharing
  fsh.clearPreparedShares();
  let n = fakeNav({ files: true });
  let log: Call[] = [];
  let outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, log));
  const shared = n.calls.find(c => c.kind === "share");
  expect("files: shared", outcome === "shared", outcome);
  expect("files: the file itself, named after its display name + stored extension",
    shared?.data?.files?.[0]?.name === "Ring sketch.png" && shared?.data?.files?.[0]?.type === "image/png", handed(n.calls));
  expect("files: no address goes with it", shared && !("url" in shared.data) && !handed(n.calls).includes("firebasestorage"));
  expect("files: the bytes came from the address Storage gave", log.some(c => c.kind === "resolve") && log.some(c => c.kind === "fetch" && c.data === RAW));
  expect("files: no share link was made", !log.some(c => c.kind === "link"));

  // cancelled
  n = fakeNav({ files: true, shareError: ["AbortError"] });
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, []));
  expect("files: closing the sheet is 'cancelled', not an error", outcome === "cancelled", outcome);

  // refused for lack of a fresh tap → the next press shares the same file at once
  fsh.clearPreparedShares();
  n = fakeNav({ files: true, shareError: ["NotAllowedError"] });
  log = [];
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, log));
  expect("files: a refused share says 'press Share again'", outcome === "again", outcome);
  const second: Call[] = [];
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, second));
  expect("files: the second press shares the prepared file", outcome === "shared" && n.calls.filter(c => c.kind === "share").length === 2, outcome);
  expect("files: …without asking Storage or fetching again (nothing awaited before the share)", second.length === 0, JSON.stringify(second));

  // Storage refuses → nothing at all
  for (const status of ["denied", "failed", "missing"]) {
    g.__resolve = async () => ({ status });
    n = fakeNav({ files: true });
    log = [];
    outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, log));
    expect(`refusal (${status}): nothing fetched, shared or copied`, outcome === (status === "denied" ? "denied" : "failed") && n.calls.length === 0 && !log.some(c => c.kind === "fetch" || c.kind === "link"), `${outcome} ${handed(n.calls)}`);
  }
  g.__resolve = async () => ({ status: "ready", url: RAW, source: "storage" });

  // no file sharing → the link is shared
  n = fakeNav({ files: false });
  log = [];
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, log));
  const linkShare = n.calls.find(c => c.kind === "share");
  expect("no file sharing: the short /f/ link is shared", outcome === "link-shared" && linkShare?.data?.url === SHORT && !linkShare?.data?.files, handed(n.calls));
  expect("no file sharing: the link was made on the file host", log.some(c => c.kind === "link" && c.data[0] === RAW && c.data[1] === "files.eggcraft.co.uk"));

  // the file could not be fetched (CORS) → the link
  n = fakeNav({ files: true });
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, [], false));
  expect("fetch blocked: the link is shared instead", outcome === "link-shared" && n.calls.at(-1)?.data?.url === SHORT, `${outcome} ${handed(n.calls)}`);

  // no navigator.share → copied
  n = fakeNav({ share: false });
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, []));
  expect("no share at all: the link is copied", outcome === "link-copied" && n.calls.length === 1 && n.calls[0].kind === "copy" && n.calls[0].data === SHORT, `${outcome} ${handed(n.calls)}`);
  expect("'link copied' is said", fsh.shareOutcomeMessage("link-copied")?.text === "This browser cannot share files, so the file's link was copied.");

  // link share refused (no fresh tap) → copied
  n = fakeNav({ files: false, shareError: ["NotAllowedError"] });
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, []));
  expect("link share refused: copied instead", outcome === "link-copied" && n.calls.at(-1)?.kind === "copy", outcome);

  // a link that is still a Storage address is never handed over
  g.__createLink = async raw => raw;
  n = fakeNav({ share: false });
  outcome = await fsh.shareStoredFile(FILE, "files.eggcraft.co.uk", deps(n.nav, []));
  expect("a raw Storage address is never shared or copied", outcome === "failed" && n.calls.length === 0, `${outcome} ${handed(n.calls)}`);
  g.__createLink = async () => SHORT;

  // bank receipts: the masked link only
  g.__masked = [];
  n = fakeNav({ share: false });
  log = [];
  outcome = await fsh.shareStoredFile({ ...FILE, maskedLinkOnly: true }, "files.eggcraft.co.uk", deps(n.nav, log));
  expect("bank receipt: the masked link, never nvCreateFileLink", outcome === "link-copied" && !log.some(c => c.kind === "link") && g.__masked.length === 1, `${outcome} ${JSON.stringify(log)}`);

  // the name vectors (the apps': scripts/file-share/main.swift, FileShareRulesTest.kt)
  const V: [string, string, string, string, string][] = [
    ["Ring sketch", "companies/ws/client_files/o-1/ring.png", "", "", "Ring sketch.png"],
    ["invoice.pdf", "companies/ws/client_files/o-1/ring.png", "", "", "invoice.pdf"],
    ["a/b:c\\d.png", "", "", "", "a-b-c-d.png"],
    ["  ", "x/y/z.JPEG", "", "", "file.jpeg"],
    ["..hidden", "companies/ws/client_files/o-1/ring.png", "", "", "hidden.png"],
    ["line one\nline two", "companies/ws/client_files/o-1/ring.png", "", "", "line one line two.png"],
    ["Sketch", "", "https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/companies%2Fws%2Fclient_files%2Fo-1%2Fsketch.webp?alt=media&token=t", "", "Sketch.webp"],
    ["Scan", "", "", "application/pdf", "Scan.pdf"],
    ["Report.final v2", "", "", "application/pdf", "Report.final v2.pdf"],
    ["Plain", "", "", "", "Plain"]
  ];
  for (const [display, p, u, type, want] of V) {
    const got = fsh.shareFileName(display, p, u, type);
    expect(`name: ${JSON.stringify(display)} → ${want}`, got === want, got);
  }
  const long = fsh.shareFileName("ş".repeat(300) + ".png");
  expect("name: a long one is cut to 200 bytes and keeps its extension", new TextEncoder().encode(long).length <= 200 && long.endsWith(".png"));
}

// ---- 2. the screens
const files = read("app/files/page.tsx");
const rowActions = between(files, '<div className="client-file-icon-actions">', "{canManageClientFiles ? (");
expect("Files page row: Share under Open's gate (canUseClientFiles + a stored file)",
  rowActions.includes("{canUseClientFiles && (file.downloadURL || file.storagePath) ? (") && rowActions.includes("<FileShareButton\n                              file={file}\n                              brandedHost={workspace?.fileLinkHost}"));
const preview = between(files, "function FilesPreviewModal(", "export default function FilesPage()");
expect("Files page preview: Share beside Open / Download", preview.includes("{activeUrl ? (\n            // Share (8 Nov 2026)") && preview.includes("<FileShareButton\n              file={activeFile}\n              brandedHost={brandedHost}"));
const order = read("app/orders/OrderDetailContent.tsx");
const card = between(order, "function ClientFileCard({", "function ClientFilePreviewModal({");
expect("order Client files row: Share under Open's gate", card.includes("{canUseClientFiles && (file.downloadURL || file.storagePath) ? (") && card.includes('<ClientFileActionIcon name="share" />'));
const orderPreview = between(order, "function ClientFilePreviewModal({", "function ClientFilesUpgradeHint() {");
expect("order preview: Share beside Open file / Download", orderPreview.includes("<FileShareButton\n                file={activeFile}\n                brandedHost={brandedHost}"));
const library = read("app/files/FilesLibraryView.tsx");
const actions = between(library, "<header><strong>{t(\"Actions\")}</strong></header>", "</section>");
expect("Files library: Share beside Open / Download (same gate), receipts masked only",
  library.includes('{canEdit && !selected.trashedAtMs ? (\n            <section className="inventory-panel-card">\n              <header><strong>{t("Actions")}</strong></header>')
  && actions.indexOf("{selected.storagePath ? (") > actions.indexOf('{t("Open / Download")}')
  && actions.includes('maskedLinkOnly: selected.source === "bankReceipt"'));
const button = read("components/FileShareButton.tsx");
expect("the button is busy while the file is fetched and says what happened",
  button.includes("disabled={busy}") && button.includes("aria-busy={busy}") && button.includes("shareOutcomeMessage(outcome)"));
const helper = read("lib/studioflow/fileShare.ts");
expect("the helper never shares the stored address: the link is checked", helper.includes('if (!link || isStorageAddress(link)) return "failed";'));
expect("the file's bytes come from resolveStorageUrl (audit #19 A1)", helper.includes("resolve: resolveStorageUrl,") && helper.includes('if (resolved.status === "denied") return "denied";'));

// ---- 3. the words
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const table = read("lib/studioflow/fileShareTranslations.ts");
for (const key of ["Preparing to share…", "The file could not be prepared for sharing. Check your connection and try again.", "This browser cannot share files, so the file's link was copied.", "The file is ready. Press Share again to send it."]) {
  const line = table.split("\n").find(l => l.trimStart().startsWith(JSON.stringify(key) + ":")) ?? "";
  const langs = LANGS.filter(lang => line.includes(`"${lang}": "`));
  expect(`'${key.slice(0, 40)}…' in all 11 other languages`, langs.length === LANGS.length, `${langs.length}`);
}
const language = read("lib/studioflow/language.ts");
expect("the table is merged (gaps only)", language.includes("mergeMissingIntoTranslations(FILE_SHARE_TRANSLATIONS);"));
const shareRow = language.split("\n").find(l => l.trimStart().startsWith('"Share": {')) ?? "";
expect("'Share' is in every language", LANGS.every(lang => shareRow.includes(`"${lang}": "`)));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nfile-share: ${checks - failures}/${checks} passed${failures ? `, ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
