// The Production board's detail panel and Done lane (29 Sep 2026).
//
// 1. The panel opens the order from a real link near its top, and the link names
//    the workspace the board listed the order in. The order page reads that hint
//    before it loads anything: another workspace stops the load (the page offers
//    the switch, which checks the membership), and a role without orders access
//    is turned away before the order is read.
// 2. The Done lane shows the latest few with the count, "Show all" opens the
//    whole list inside a lane with its own height, and the panel no longer
//    stretches to the tallest lane.
// 3. Every sentence these screens pass to t() is in all 12 languages — checked by
//    running studioT from the tree's own language.ts, not by reading the file.
//
// The helpers are compiled with the tree's own TypeScript and run; the screen
// wiring is read from the sources, and each pattern fails loudly if it stops
// matching.
//
//   node scripts/check-production-panel.mjs
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
const read = (rel) => {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "production-panel-"));
const compile = (rel, out, rewrite = (s) => s) => {
  const source = read(rel);
  if (source === null) return null;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  const file = path.join(tmp, out);
  fs.writeFileSync(file, rewrite(js));
  return file;
};

// ---- 1. the link and the order page's reading of it (compiled and run)
const linkFile = compile("lib/studioflow/orderLink.ts", "orderLink.mjs");
if (!linkFile) {
  failures.push("lib/studioflow/orderLink.ts is missing: no link names the order's workspace");
} else {
  const { orderPageHref, orderWorkspaceHint, orderWorkspaceDecision, ORDER_WORKSPACE_HINT_PARAM } = await import(pathToFileURL(linkFile).href);
  expect("href names the order and its workspace", orderPageHref("prod-ws", "PR-ACTIVE-2"), "/orders/PR-ACTIVE-2?workspace=prod-ws");
  expect("href encodes both parts", orderPageHref("ws/1 a", "id?#2"), "/orders/id%3F%232?workspace=ws%2F1%20a");
  expect("href without a workspace is the old link", orderPageHref("", "PR-1"), "/orders/PR-1");
  expect("the hint parameter", ORDER_WORKSPACE_HINT_PARAM, "workspace");
  expect("hint read and trimmed", orderWorkspaceHint(new URLSearchParams("workspace=%20prod-ws%20")), "prod-ws");
  expect("no hint", orderWorkspaceHint(new URLSearchParams("tab=overview")), "");
  expect("no params", orderWorkspaceHint(null), "");
  const round = new URL(`http://x${orderPageHref("ws/1 a", "PR-1")}`);
  expect("an encoded hint reads back", orderWorkspaceHint(round.searchParams), "ws/1 a");
  expect("no hint opens as before", orderWorkspaceDecision("", "prod-ws"), { kind: "open" });
  expect("the same workspace opens", orderWorkspaceDecision("prod-ws", "prod-ws"), { kind: "open" });
  expect("another workspace stops the load", orderWorkspaceDecision("other-ws", "prod-ws"), { kind: "other-workspace", workspaceId: "other-ws" });
  expect("a personal workspace is another workspace too", orderWorkspaceDecision("prod-ws", "uid-123"), { kind: "other-workspace", workspaceId: "prod-ws" });
}

// ---- 2. the Done lane (compiled and run)
const laneFile = compile("lib/studioflow/productionDoneLane.ts", "productionDoneLane.mjs");
if (!laneFile) {
  failures.push("lib/studioflow/productionDoneLane.ts is missing: the Done lane draws every finished job");
} else {
  const { sortDoneLane, doneLaneView, rememberMovedHere, DONE_LANE_PREVIEW } = await import(pathToFileURL(laneFile).href);
  const day = 86400000;
  const card = (id, dueOffsetDays) => ({ order: { id }, dueDate: dueOffsetDays === null ? null : new Date(Date.UTC(2026, 8, 1) + dueOffsetDays * day) });
  const ids = (list) => list.map((c) => c.order.id);
  const lane = [card("a", 1), card("b", 5), card("none", null), card("c", 3), card("d", 5)];
  expect("latest due first, undated last, ties keep their order", ids(sortDoneLane(lane)), ["b", "d", "c", "a", "none"]);
  expect("a job just moved here goes first", ids(sortDoneLane(lane, ["a"])), ["a", "b", "d", "c", "none"]);
  expect("two moves: the latest first", ids(sortDoneLane(lane, ["none", "a"])), ["none", "a", "b", "d", "c"]);
  expect("a moved id not in the lane changes nothing", ids(sortDoneLane(lane, ["zz"])), ["b", "d", "c", "a", "none"]);
  expect("sorting does not change the input", ids(lane), ["a", "b", "none", "c", "d"]);
  expect("the preview is short", DONE_LANE_PREVIEW >= 1 && DONE_LANE_PREVIEW <= 5, true);
  const forty = Array.from({ length: 40 }, (_, i) => card(`o${i}`, i));
  const collapsed = doneLaneView(sortDoneLane(forty), false);
  expect("collapsed: the preview", [collapsed.visible.length, collapsed.hidden, collapsed.total, collapsed.collapsible], [DONE_LANE_PREVIEW, 40 - DONE_LANE_PREVIEW, 40, true]);
  expect("collapsed: the latest ones", ids(collapsed.visible)[0], "o39");
  const expanded = doneLaneView(sortDoneLane(forty), true);
  expect("expanded: all of them", [expanded.visible.length, expanded.hidden, expanded.total], [40, 0, 40]);
  const short = doneLaneView(forty.slice(0, DONE_LANE_PREVIEW), false);
  expect("a short lane has no toggle", [short.visible.length, short.collapsible], [DONE_LANE_PREVIEW, false]);
  expect("an empty lane", [doneLaneView([], false).total, doneLaneView([], false).collapsible], [0, false]);
  expect("remember: newest first, no duplicates", rememberMovedHere(["a", "b"], "b"), ["b", "a"]);
  expect("remember: bounded", rememberMovedHere(Array.from({ length: 20 }, (_, i) => `x${i}`), "new").length, 20);
  expect("remember: an empty id changes nothing", rememberMovedHere(["a"], " "), ["a"]);
}

// ---- 3. the screen wiring (read from the sources)
const board = read("app/production/ProductionContent.tsx") || "";
const panelStart = board.indexOf("function ProductionDetailPanel(");
const panelEnd = board.indexOf("function BlockerModal(");
const panel = panelStart >= 0 && panelEnd > panelStart ? board.slice(panelStart, panelEnd) : "";
if (!panel) failures.push("ProductionContent.tsx: ProductionDetailPanel .. BlockerModal not found — update this check");
const linkAt = panel.search(/<Link\s+href=\{orderHref\}[^>]*data-production-open-order/);
const stepsAt = panel.indexOf('<ol className="production-steps">');
const titleAt = panel.indexOf("production-panel-title");
expect("the panel's Open order is a Link to orderHref", linkAt >= 0, true);
expect("the link sits under the name, above the steps", linkAt > titleAt && titleAt >= 0 && stepsAt > linkAt, true);
expect("the link text is Open order through t()", /data-production-open-order[^]*?\{t\("Open order"\)\}\s*<\/Link>/.test(panel), true);
expect("no Open order button left at the foot of the panel", /<button[^>]*onClick=\{onOpenOrder\}/.test(board) || /onOpenOrder/.test(board), false);
expect("no router.push to an order id from the board", /router\.push\(`\/orders\/\$\{/.test(board), false);
expect("the board passes the workspace-named href", /orderHref=\{orderPageHref\(workspace\.id, selected\.order\.id\)\}/.test(board), true);
expect("the Done lane is cut to a view", /doneLaneView\(list, doneExpanded\)/.test(board), true);
expect("the Done lane is sorted latest first, moves first", /sortDoneLane\(list, movedIntoDone\)/.test(board), true);
expect("a move into Done is remembered", /stageId === doneStageId\) setMovedIntoDone\(ids => rememberMovedHere\(ids, orderId\)\)/.test(board), true);
expect("the toggle says whether it is open", /data-production-done-toggle[^]*?aria-expanded=\{doneExpanded\}[^]*?aria-controls=\{bodyId\}/.test(board), true);
expect("the toggle names the count", /`\$\{t\("Show all"\)\} \(\$\{doneView\.total\}\)`/.test(board) && /t\("Show less"\)/.test(board), true);
expect("the count stays in the lane header", /<div className="production-column-meta">\s*<strong>\{list\.length\}<\/strong>/.test(board), true);
// Moving cards (Rounds 196/198 fixed order cards; the board must keep its own drag).
expect("drag start still carries the order id", /event\.dataTransfer\.setData\("text\/plain", orderId\)/.test(board), true);
expect("every lane, Done included, is still a drop target", /onDrop=\{event => onColumnDrop\(event, stage\.id\)\}/.test(board), true);
expect("cards are drawn from the view, still draggable", /\{shown\.map\(card => \(\s*<BoardCard[^]*?draggable=\{canEdit\}/.test(board), true);

const page = read("app/orders/[orderId]/page.tsx") || "";
const runAt = page.indexOf("async function run()");
const decideAt = page.indexOf("orderWorkspaceDecision(workspaceHint, loadedWorkspace.id)");
const gateAt = page.indexOf('workspaceAccessAllows(loadedWorkspace.memberAccess, "orders")');
const setAt = page.indexOf("setWorkspace(loadedWorkspace)");
const loadAt = page.indexOf("loadOrderDetail(", runAt);
expect("the order page reads the hint", /orderWorkspaceHint\(searchParams\)/.test(page), true);
expect("another workspace is decided before anything loads", runAt >= 0 && decideAt > runAt && decideAt < setAt && decideAt < loadAt, true);
expect("orders access is checked before the order is read", gateAt > runAt && gateAt < setAt && gateAt < loadAt, true);
expect("the switch goes through switchActiveWorkspace", /switchActiveWorkspace\(user\.uid, otherWorkspaceId\)/.test(page), true);
expect("the load re-runs when the hint changes", /\}, \[orderId, user, workspaceHint\]\);/.test(page), true);
expect("the error card's own words are translated", /eyebrow=\{t\("Order error"\)\} title=\{t\("Could not load order"\)\}/.test(page), true);

const css = read("app/globals.css") || "";
const panelRule = (css.match(/\n\.production-panel \{[^}]*\}/) || [""])[0];
expect("the panel keeps its own height", /align-self:\s*flex-start/.test(panelRule) && /position:\s*sticky/.test(panelRule) && /max-height:/.test(panelRule), true);
expect("the Done lane has a height of its own", /\.production-column-done \.production-column-body \{[^}]*max-height:/.test(css), true);
// The 1180 px block that stacks the panel under the board (an earlier block of the same width runs on
// into the main .production-panel rule, so every .production-panel rule inside each block is looked at).
const narrowRules = [...css.matchAll(/@media \(max-width: 1180px\) \{([^@]*)/g)]
  .flatMap((m) => [...m[1].matchAll(/\.production-panel \{[^}]*\}/g)].map((r) => r[0]));
expect("under 1180 px the panel is back in the flow, at its own height",
  narrowRules.some((rule) => /flex:\s*0 0 auto/.test(rule) && /position:\s*static/.test(rule) && /max-height:\s*none/.test(rule)), true);
expect("the link has its style", /\.production-panel-open \{/.test(css), true);

// ---- 4. every sentence in all 12 languages, by running studioT
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const KEYS = [
  // the panel and the Done lane
  "Open order", "Latest due first", "Show all", "Show less", "Done",
  // the order page
  "Order error", "Could not load order", "This order is in another workspace.", "Switch to that workspace to open this order.",
  "Switch workspace", "Orders are not available to your role in this workspace.",
  // switchActiveWorkspace's refusals, which the order page now shows
  "Your access to this workspace is no longer available.", "This workspace is no longer available.",
  "Your access to this workspace has been paused. Ask the owner to restore it.", "Workspace could not be selected."
];
// Every literal the two screens' new code passes to t() must be in KEYS.
for (const [file, source] of [["ProductionContent.tsx panel", panel], ["[orderId]/page.tsx", page]]) {
  for (const m of source.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) {
    if (!KEYS.includes(m[1]) && !["Close", "Due", "No due date", "Unassigned", "Production progress", "steps", "In progress",
      "No production steps configured.", "Current operation", "Nothing in progress", "Materials", "Parts ready", "Not confirmed",
      "Blocker", "No blocker", "Stage", "Set by hand", "Update status", "Delivered", "Blocked", "Normal"].includes(m[1])) {
      failures.push(`${file}: t("${m[1]}") is not in this check's key list`);
    }
  }
}
const importsFixed = (js) => js
  .replace(/from "\.\/macTranslations"/g, 'from "./macTranslations.mjs"')
  .replace(/from "\.\/settingsContentTranslations"/g, 'from "./settingsContentTranslations.mjs"')
  .replace(/from "\.\/shippingTranslations"/g, 'from "./shippingTranslations.mjs"')
  .replace(/from "\.\/trackingEmailTranslations"/g, 'from "./trackingEmailTranslations.mjs"');
compile("lib/studioflow/macTranslations.ts", "macTranslations.mjs", importsFixed);
compile("lib/studioflow/settingsContentTranslations.ts", "settingsContentTranslations.mjs", importsFixed);
compile("lib/studioflow/shippingTranslations.ts", "shippingTranslations.mjs", importsFixed);
compile("lib/studioflow/trackingEmailTranslations.ts", "trackingEmailTranslations.mjs", importsFixed);
const languageFile = compile("lib/studioflow/language.ts", "language.mjs", importsFixed);
const { studioT } = await import(pathToFileURL(languageFile).href);
expect("studioT answers English as is", studioT("Open order", "English"), "Open order");
expect("control: an unknown sentence falls back to English", studioT("zz no such sentence zz", "Türkçe"), "zz no such sentence zz");
let cells = 0;
for (const key of KEYS) {
  const absent = LANGUAGES.filter((language) => { const v = studioT(key, language); return !v || v === key; });
  cells += LANGUAGES.length - absent.length;
  checks += 1;
  if (absent.length) failures.push(`"${key}" falls back to English in: ${absent.join(", ")}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-production-panel: ${failures.length} of ${checks} checks FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-production-panel: all ${checks} checks pass (${KEYS.length} sentences × 11 languages = ${cells} translated cells).`);
