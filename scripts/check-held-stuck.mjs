// held-stuck (23 Oct 2026, capacity stage 1 UI, CAP-K12 candidate; rebuilt on e2c75207 27 Oct): stuck store orders in the parked-queue banner.
//   1. lib/studioflow/heldQueue.ts, run for real: only rows the server marked "stuck" count; a list from a server
//      without the rule (no queueState) has none; Import counts what it can actually bring in; "Try again" is
//      owner/admin only; ids are cleaned and capped at 50; reasons become fixed sentences;
//   2. components/HeldStuckOrders.tsx rendered for real (react-dom/server): nothing for today's live list; the
//      reason, the dates, the failed count and the "does not hold the queue" note for stuck rows; Try again only
//      for owner/admin;
//   3. the orders page wires it: the banner shows it, Import passes stuck rows over, Try again sends retryIds,
//      Import alone sends exactly what it sent before ({companyId});
//   4. every new string is translated in all eleven languages (compiled studioT).
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "held-stuck-"));
const transpile = (source, jsx = false) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, jsx: jsx ? ts.JsxEmit.ReactJSX : undefined } }).outputText
  .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"')
  .replace(/from "@\/lib\/studioflow\/(\w+)"/g, 'from "./$1.mjs"')
  .replace(/from "react\/jsx-runtime"/g, `from "${pathToFileURL(require.resolve("react/jsx-runtime")).href}"`);

// 1. Pure module.
const modulePath = "lib/studioflow/heldQueue.ts";
const hasModule = fs.existsSync(path.join(root, modulePath));
check("heldQueue.ts exists", hasModule);
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
for (const name of DICTIONARY_FILES) fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(`lib/studioflow/${name}.ts`)));
const { studioT, studioTranslationRow } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
let q = {};
if (hasModule) {
  fs.writeFileSync(path.join(tmp, "heldQueue.mjs"), transpile(read(modulePath)));
  q = await import(pathToFileURL(path.join(tmp, "heldQueue.mjs")).href);
}
const live = { ok: true, held: [{ id: "h1", provider: "amazon", externalId: "A-1", heldAtMs: 1 }, { id: "h2", provider: "inbound", externalId: "W-2", heldAtMs: 2 }], heldCount: 2, activeOrderCount: 25, orderLimit: 25, roomAvailable: 0 };
const T0 = Date.UTC(2026, 9, 20, 9, 0);
const stage1 = {
  ok: true, heldCount: 3, stuckCount: 1, roomAvailable: 2,
  held: [
    { id: "s1", provider: "amazon", externalId: "113-555", heldAtMs: T0, queueState: "stuck", stuckAtMs: T0 + 86400000, stuckReason: "invalid:row_incomplete", failedImports: 3 },
    { id: "w1", provider: "amazon", externalId: "113-556", heldAtMs: T0 + 1000, queueState: "waiting", stuckAtMs: null, stuckReason: "", failedImports: 1 },
    { id: "w2", provider: "inbound", externalId: "W-9", heldAtMs: T0 + 2000, queueState: "waiting", stuckAtMs: null, stuckReason: "", failedImports: 0 }
  ]
};
check("today's live list: no stuck rows", hasModule && q.stuckHeldRows(live).length === 0 && q.stuckHeldCount(live) === 0);
check("today's live list: Import count unchanged (heldCount)", hasModule && q.importableHeldCount(live) === 2);
check("null list: nothing", hasModule && q.stuckHeldRows(null).length === 0 && q.importableHeldCount(undefined) === 0);
check("stage 1: one stuck row", hasModule && q.stuckHeldRows(stage1).map((r) => r.id).join() === "s1");
check("stage 1: Import counts the two waiting rows", hasModule && q.importableHeldCount(stage1) === 2);
check("server stuckCount beyond the listed 100 wins", hasModule && q.stuckHeldCount({ ...stage1, stuckCount: 140 }) === 140 && q.importableHeldCount({ ...stage1, heldCount: 150, stuckCount: 140 }) === 10);
check("row with queueState 'waiting' or none is not stuck", hasModule && q.stuckHeldRows({ held: [{ id: "x", queueState: "waiting" }, { id: "y" }, { id: "", queueState: "stuck" }] }).length === 0);
for (const role of ["owner", "admin", " Owner ", "ADMIN"]) check(`role ${role} may try again`, hasModule && q.canRetryStuckOrders(role) === true);
for (const role of ["member", "viewer", "workflow", "", null, "view_only"]) check(`role ${role || "(none)"} may not`, hasModule && q.canRetryStuckOrders(role) === false);
const many = Array.from({ length: 60 }, (_, i) => `id${i}`);
check("retry ids: capped at 50, deduped, junk dropped", hasModule && q.retryIdsFor([...many, "id1", "bad id", "x/y", ""]).length === 50 && !q.retryIdsFor(["bad id", "x/y"]).length);
const reasonCases = [
  ["invalid:row_incomplete", "The store sent this order without the details NivaDesk needs to import it."],
  ["failed:no_payload", "The store sent this order without the details NivaDesk needs to import it."],
  ["failed:refetch_not_found", "The store no longer has this order."],
  ["error:unknown_provider_x", "This store is no longer connected, so the order cannot be imported."],
  ["error:worker_not_landed", "The store connection took the order but did not finish importing it."],
  ["retry:auto_sync_off", "Automatic sync is off for this store, so Import cannot bring the order in."],
  ["error:ECONNRESET socket hang up", "This order failed to import several times."],
  ["", "This order failed to import several times."]
];
for (const [code, sentence] of reasonCases) check(`reason ${code || "(empty)"} → fixed sentence`, hasModule && q.stuckReasonSentence(code) === sentence);

// 2. The component, rendered.
const compPath = "components/HeldStuckOrders.tsx";
const hasComp = fs.existsSync(path.join(root, compPath));
check("HeldStuckOrders.tsx exists", hasComp);
if (hasComp && hasModule) {
  fs.writeFileSync(path.join(tmp, "HeldStuckOrders.mjs"), transpile(read(compPath), true));
  const { HeldStuckOrders } = await import(pathToFileURL(path.join(tmp, "HeldStuckOrders.mjs")).href);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = (list, role, language = "English") => renderToStaticMarkup(React.createElement(HeldStuckOrders, { list, role, language, busy: false, onRetry: () => {} }));
  check("live list renders nothing", html(live, "owner") === "");
  check("null renders nothing", html(null, "owner") === "");
  const owner = html(stage1, "owner");
  check("stuck row shown", owner.includes('data-testid="held-stuck-row-s1"') && !owner.includes("held-stuck-row-w1"));
  check("reason sentence shown", owner.includes("The store sent this order without the details NivaDesk needs to import it."));
  check("does-not-hold-the-queue note shown", owner.includes("they no longer hold the queue"));
  check("since dates + failed count shown", owner.includes("Waiting since") && owner.includes("Stuck since") && owner.includes("Failed imports: 3"));
  check("owner gets Try again", owner.includes('data-testid="held-stuck-retry-s1"'));
  check("admin gets Try again", html(stage1, "admin").includes('data-testid="held-stuck-retry-s1"'));
  const member = html(stage1, "member");
  check("member sees the row but no Try again", member.includes("held-stuck-row-s1") && !member.includes("held-stuck-retry-"));
  check("member told who can", member.includes("Only the workspace owner or an admin can try a stuck order again."));
  const tr = html(stage1, "owner", "Türkçe");
  check("Türkçe render translated", tr.includes("1 mağaza siparişi takıldı") && tr.includes("artık sırayı tutmuyorlar"));
  check("count title", html({ ...stage1, stuckCount: 4 }, "owner").includes("4 store orders are stuck"));
}

// 3. Wiring.
const page = read("app/orders/page.tsx");
const orders = read("lib/studioflow/orders.ts");
check("page renders HeldStuckOrders inside the banner", /orders-held-banner[\s\S]{0,3000}<HeldStuckOrders[\s\S]{0,200}role=\{workspace\?\.role\}[\s\S]{0,200}onRetry=\{ids => importHeld\(ids\)\}/.test(page));
// 27 Oct rebuild on e2c75207: the banner is one `heldBanner` element shown in the desktop list AND on a phone (ETSY-E2E).
check("Import counts only importable rows", page.includes("const heldImportable = heldOrders ? importableHeldCount(heldOrders) : 0;") && page.includes("Math.min(heldOrders.roomAvailable ?? 0, heldImportable)"));
check("no Import button when every waiting row is stuck (no 'Import 0')", /\{heldImportable > 0 \? \(\s*<button[\s\S]{0,400}onClick=\{\(\) => importHeld\(\)\}/.test(page));
check("no 'room now, import' sentence when nothing is importable", page.includes("(heldOrders.roomAvailable ?? 0) > 0 && heldImportable === 0 ? null : ("));
check("the banner (with the stuck rows) is shown in both places", (page.match(/\{heldBanner\}/g) || []).length === 2 && (page.match(/<HeldStuckOrders/g) || []).length === 1);
check("Import toast keeps today's plural phrases", page.includes('studioImportPhrase(importedNow + onTheWay, "ordersBeingImported", language)') && page.includes('studioImportPhrase(importedNow, "ordersImported", language)') && !page.includes('t("orders imported")'));
check("one release call site (importHeld)", (page.match(/releaseHeldIntegrationOrders\(/g) || []).length === 1);
check("Import alone calls importHeld() with no ids", page.includes("onClick={() => importHeld()}"));
check("importHeld passes retryIds to the release call", page.includes("await releaseHeldIntegrationOrders(currentWorkspace, retryIds)"));
check("release sends retryIds only when there are some", orders.includes("callable(ids.length ? { companyId: workspace.id, retryIds: ids } : { companyId: workspace.id })"));
check("list type carries the stage-1 fields", /held\?: HeldQueueRow\[\];[\s\S]{0,40}heldCount\?: number;\s*stuckCount\?: number;/.test(orders));

// 4. Translations.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const comp = hasComp ? read(compPath) : "";
const KEYS = new Set([...comp.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => JSON.parse(`"${m[1]}"`)));
for (const [, sentence] of reasonCases) KEYS.add(sentence);
KEYS.add("Website"); KEYS.add("Store");
check(`component strings found (${KEYS.size})`, KEYS.size >= 18);
for (const key of KEYS) {
  for (const language of LANGUAGES) {
    const out = studioT(key, language);
    // a word that is the same in that language (German "Details", "Website") counts when the table says so
    check(`studioT(${JSON.stringify(key.slice(0, 40))}, ${language}) translated`, Boolean(out) && (out !== key || studioTranslationRow(key)?.[language] === key));
  }
}

// The note names the button the way the button reads, in every language (27 Oct: TR/AR/HI said it differently).
const NOTE = "Try again puts the order back in its old place in the queue and imports it when there is room. If it fails again, it is marked stuck again straight away.";
for (const language of LANGUAGES) check(`note names the button as it reads (${language})`, studioT(NOTE, language).includes(studioT("Try again", language)));

// The CAP-K12 table is what the banner shows: no other table merged after it changes one of its cells.
const langSrc = read("lib/studioflow/language.ts");
const blockAt = langSrc.indexOf("// Stuck store orders in the parked queue (capacity stage 1, CAP-K12");
let capTable = {};
if (blockAt >= 0) {
  const open = langSrc.indexOf("mergeIntoTranslations({", blockAt) + "mergeIntoTranslations(".length;
  const close = langSrc.indexOf("\n});", open);
  try { capTable = JSON.parse(langSrc.slice(open, close + 2)); } catch { capTable = {}; }
}
const capOverridden = Object.entries(capTable).flatMap(([key, row]) => LANGUAGES.filter((l) => row[l] && studioT(key, l) !== row[l]).map((l) => `${key} [${l}]`));
check(`CAP-K12 table merged (${Object.keys(capTable).length} keys) and no cell overridden${capOverridden.length ? ": " + capOverridden.slice(0, 3).join("; ") : ""}`, Object.keys(capTable).length === 14 && capOverridden.length === 0);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-held-stuck: ${failures.length} of ${checks} FAILED`);
  for (const f of failures.slice(0, 40)) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-held-stuck: ${checks}/${checks} passed`);
