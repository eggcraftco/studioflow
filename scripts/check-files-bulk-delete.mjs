// Files page "Delete selected" (8 Oct 2026). From the source alone, plus a
// compiled-dictionary probe and the pure chunk helper run for real:
//   1. every new sentence the feature shows has all eleven translations and
//      studioT returns them (the merge order can swallow a row that is in the file);
//   2. checkboxes, the per-order toggle and the bar render only behind
//      canDeleteClientFiles (role + Pro/Team + the deleteClientFiles key);
//   3. the confirm sits before the call; the per-row Delete and "Delete all"
//      paths are untouched; failures are listed per row;
//   4. chunkClientFileDeleteItems: 50 per chunk, blanks and duplicates dropped,
//      order kept;
//   5. the callable name the web calls is the server's export (functions/index.js
//      of the server branch, when FILES_BULK_SERVER_INDEX points at it; the
//      constant is asserted on its own otherwise).
//
//   node scripts/check-files-bulk-delete.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const page = read("app/files/page.tsx");
const lib = read("lib/studioflow/clientFiles.ts");
const css = read("app/globals.css");
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };

// 1. Strings × 11 languages, in the file and out of the compiled dictionary.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const KEYS = [
  "Select all in this order", "Select file", "Selected files", "{count} selected", "Delete selected",
  "Delete {count} files? This cannot be undone.", "Deleting {count} files…", "Deleted {count} files.",
  "{failed} of {total} files could not be deleted.", "Could not be deleted.", "Clear selection", "Deleting…"
];
// Every table language.ts imports feeds studioT; the list is read from its imports.
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
const dictionary = DICTIONARY_FILES.map((name) => read(`lib/studioflow/${name}.ts`)).join("\n");
for (const key of KEYS) {
  check(`page uses t(${JSON.stringify(key)})`, page.includes(`t(${JSON.stringify(key)})`));
  const needle = `${JSON.stringify(key)}: {`;
  const present = new Set();
  let at = dictionary.indexOf(needle);
  while (at >= 0) {
    const line = dictionary.slice(at, dictionary.indexOf("\n", at));
    for (const language of LANGUAGES) if (line.includes(`${JSON.stringify(language)}:`)) present.add(language);
    at = dictionary.indexOf(needle, at + needle.length);
  }
  check(`${key}: all 11 translations declared (missing: ${LANGUAGES.filter((l) => !present.has(l)).join(", ") || "none"})`, present.size === LANGUAGES.length);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "files-bulk-delete-"));
for (const name of DICTIONARY_FILES) {
  const js = ts.transpileModule(read(`lib/studioflow/${name}.ts`), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
}
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
for (const key of KEYS) {
  for (const language of LANGUAGES) {
    const out = studioT(key, language);
    check(`studioT(${JSON.stringify(key)}, ${language}) returns a translation`, Boolean(out) && out !== key);
  }
}
check("Türkçe probe: Delete selected → Seçilenleri sil", studioT("Delete selected", "Türkçe") === "Seçilenleri sil");
check("Türkçe probe: {count} selected → {count} seçili", studioT("{count} selected", "Türkçe") === "{count} seçili");
check("English stays English", studioT("Delete selected", "English") === "Delete selected");

// 2. Gating: every selection surface sits behind canDeleteClientFiles.
check("canDeleteClientFiles = manage + memberAccess.deleteClientFiles !== false", /const canDeleteClientFiles = Boolean\(canManageClientFiles && workspace\?\.memberAccess\?\.deleteClientFiles !== false\);/.test(page));
check("row checkbox behind canDeleteClientFiles", /\{canDeleteClientFiles \? \(\s*<label className="client-file-select">/.test(page));
check("per-order toggle behind canDeleteClientFiles", /\{canDeleteClientFiles \? \(\(\) => \{\s*const allSelected = group\.files\.every/.test(page));
check("selection bar behind canDeleteClientFiles", /\{canDeleteClientFiles && \(selectedCount > 0 \|\| selectionFailures\.length > 0\) \? \(\s*<div className="files-selection-bar"/.test(page));
check("handler refuses without canDeleteClientFiles", /async function handleDeleteSelection\(\) \{[\s\S]*?if \(!canDeleteClientFiles\) \{\s*setActionError\(/.test(page));

// 3. Confirm before the call; per-row Delete and Delete all untouched; failures listed.
const handler = page.slice(page.indexOf("async function handleDeleteSelection()"), page.indexOf("async function handleDeleteOrderGroup("));
check("confirm dialog uses the {count} sentence", handler.includes('window.confirm(') && handler.includes('t("Delete {count} files? This cannot be undone.")'));
check("confirm comes before the batch call", handler.indexOf("window.confirm(") < handler.indexOf("deleteClientFilesBatchForOrders("));
check("a declined confirm returns before the call", /if \(!confirmed\) return;\s*\n\s*setDeletingSelection\(true\);/.test(handler));
check("failed rows kept in state and rendered per row", handler.includes("setSelectionFailures(failedRows)") && /selectionFailures\.map\(row => \(/.test(page) && page.includes("row.fileName || row.fileId"));
check("the selection keeps only the rows that failed", handler.includes("filter(id => failedIds.has(id))"));
check("list refreshed after the batch", /finally \{\s*try \{\s*await refreshFiles\(workspace\);/.test(handler));
check("per-row Delete still calls deleteClientFileForOrder", /async function handleDelete\(file: ClientFileListItem\)[\s\S]*?await deleteClientFileForOrder\(\{/.test(page) || /const result = await deleteClientFileForOrder\(\{\s*workspace,\s*orderId: file\.orderId,\s*fileId: file\.fileId\s*\}\);/.test(page));
check("Delete all still loops deleteClientFileForOrder per file", /async function handleDeleteOrderGroup\(group: FilesByOrder\)[\s\S]*?for \(const file of group\.files\) \{\s*try \{\s*await deleteClientFileForOrder\(/.test(page));
check("Delete all's confirm sentence unchanged", page.includes('t("Delete all {count} files for {name}? This cannot be undone.")'));
check("per-row confirm sentence unchanged", page.includes('t("Delete \\"{name}\\" from this order? This cannot be undone.")'));
check("selection pruned when the list changes", /useEffect\(\(\) => \{\s*setSelectedFileIds\(previous => \{\s*const present = new Set\(files\.map\(file => file\.id\)\);/.test(page));
check("bar is sticky", /\.files-selection-bar \{[^}]*position: sticky;/.test(css));
check("bar text: N selected · Delete selected · Clear selection", page.includes('t("{count} selected").replace("{count}", String(selectedCount))') && page.includes('t("Delete selected")') && page.includes('t("Clear selection")'));

// 4. The pure chunk helper, run.
const helperJs = ts.transpileModule(lib, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const helperStart = helperJs.indexOf("export const DELETE_CLIENT_FILES_BATCH_LIMIT");
const helperEnd = helperJs.indexOf("export async function deleteClientFilesBatchForOrders");
fs.writeFileSync(path.join(tmp, "chunk.mjs"), helperJs.slice(helperStart, helperEnd));
const { chunkClientFileDeleteItems, DELETE_CLIENT_FILES_BATCH_LIMIT, DELETE_CLIENT_FILES_BATCH_CALLABLE } = await import(pathToFileURL(path.join(tmp, "chunk.mjs")).href);
fs.rmSync(tmp, { recursive: true, force: true });
check("limit is 50", DELETE_CLIENT_FILES_BATCH_LIMIT === 50);
const items = Array.from({ length: 123 }, (_, i) => ({ orderId: `o${i % 7}`, fileId: `f${i}` }));
const chunks = chunkClientFileDeleteItems(items);
check("123 items → 50 + 50 + 23", chunks.map((c) => c.length).join("+") === "50+50+23");
check("order kept", chunks.flat().map((i) => i.fileId).join(",") === items.map((i) => i.fileId).join(","));
check("blanks and duplicates dropped", chunkClientFileDeleteItems([{ orderId: "o", fileId: "a" }, { orderId: "", fileId: "b" }, { orderId: "o", fileId: " a " }, { orderId: "o", fileId: "" }]).flat().length === 1);
check("empty → no chunks", chunkClientFileDeleteItems([]).length === 0);
check("custom size respected", chunkClientFileDeleteItems(items, 10).length === 13);
check("wrapper chunks by the limit (chunkClientFileDeleteItems(items))", /for \(const chunk of chunkClientFileDeleteItems\(items\)\) \{\s*const response = await callClientFileFunction\(DELETE_CLIENT_FILES_BATCH_CALLABLE, \{ companyId: workspace\.id, items: chunk \}\);/.test(lib));
check("a row the server did not answer is reported, not dropped", lib.includes('reason: "no_answer"'));

// 5. Callable name = the server's export.
check("web callable constant is deleteClientFilesBatch", DELETE_CLIENT_FILES_BATCH_CALLABLE === "deleteClientFilesBatch");
const serverIndex = process.env.FILES_BULK_SERVER_INDEX;
if (serverIndex) {
  const server = fs.readFileSync(serverIndex, "utf8");
  check(`server exports ${DELETE_CLIENT_FILES_BATCH_CALLABLE} (${serverIndex})`, server.includes(`exports.${DELETE_CLIENT_FILES_BATCH_CALLABLE} = onCall(`));
  check("server limit is 50 too", /const DELETE_CLIENT_FILES_BATCH_LIMIT = 50;/.test(server));
} else {
  console.log("  (FILES_BULK_SERVER_INDEX not set — the server export is not cross-checked in this run)");
}

console.log(`check-files-bulk-delete: ${checks - failures.length}/${checks} passed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
