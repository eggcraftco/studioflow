// Note editor text area fits the note (28 Oct 2026, owner): editing a long note kept it in the six-row box a
// new note opens with, so most of the text was hidden and had to be scrolled inside a small box.
//
//   1. lib/studioflow/noteTextArea.ts, run against a fake text area: the box takes the height of the whole
//      text (plus its measured borders), never drops below its rows (a new note starts as before), shrinks
//      again after a deletion, and puts the editor window's scroll position back (no jump while typing).
//   2. app/notes/page.tsx wiring: the window is 760px wide (was 560); the text area is fitted in a layout
//      effect on every text change (also for a read-only note), capped at 60vh with its own scrollbar
//      below the window's 90vh, so Type / Visibility / Color … stay underneath and reachable; the fit
//      writes nothing and no window resize handler is added.
//
//   node scripts/check-notes-editor-autogrow.mjs      (CHECK_ROOT=<live web files> runs it as the control: red)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = process.env.CHECK_ROOT
  ? path.resolve(process.env.CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readOptional = (rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };

// 1. The fit, run. -------------------------------------------------------------------------------------------
async function loadHelper() {
  const source = readOptional("lib/studioflow/noteTextArea.ts");
  if (!source) return null;
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "note-autogrow-")), "noteTextArea.mjs");
  fs.writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

// A text area as the browser lays it out: `content` px of text + padding, `floor` px for its six rows (what
// height "auto" draws — a text area does not grow by itself), `border` px top + bottom, drawn at most `cap`
// px tall (the CSS maxHeight). Every height change re-lays it out: its own scroll position and the editor
// window's are clamped at once. The window's range shrinks while the box is collapsed to "auto" — that
// clamp is the jump the helper has to undo.
function fakeArea({ content, floor = 150, border = 2, cap = 540, height = "auto", scrollTop = 0 }) {
  const inner = () => (height === "auto" ? floor : Math.min(parseFloat(height), cap) - border);
  const clampOwn = () => { scrollTop = Math.max(0, Math.min(scrollTop, area.scrollHeight - inner())); };
  const area = {
    content,
    style: {},
    onLayout: [],
    // A box taller than its text reports its own height, so it only shrinks if it is collapsed first.
    get scrollHeight() { return Math.max(area.content, inner()); },
    get clientHeight() { return inner(); },
    get offsetHeight() { return inner() + border; },
    get scrollTop() { return scrollTop; },
    set scrollTop(value) { scrollTop = value; clampOwn(); },
  };
  Object.defineProperty(area.style, "height", {
    get: () => height,
    set: (value) => { height = value; clampOwn(); area.onLayout.forEach((relayout) => relayout()); },
    enumerable: true,
  });
  return area;
}
function fakeWindow(area, { above = 200, below = 500, viewport = 700, scrollTop = 0 } = {}) {
  const clamp = () => { scrollTop = Math.max(0, Math.min(scrollTop, above + area.offsetHeight + below - viewport)); };
  area.onLayout.push(clamp);
  return {
    get scrollTop() { return scrollTop; },
    set scrollTop(value) { scrollTop = value; clamp(); },
  };
}

const helper = await loadHelper();
const fit = helper && typeof helper.fitTextAreaToContent === "function" ? helper.fitTextAreaToContent : null;
check("lib/studioflow/noteTextArea.ts exports fitTextAreaToContent", Boolean(fit));
if (fit) {
  const long = fakeArea({ content: 900, height: "152px" });
  fit(long, null);
  check(`a long note opens at its full height (got ${long.style.height}, want 902px; the 60vh cap clips it)`, long.style.height === "902px");

  const short = fakeArea({ content: 40 });
  fit(short, null);
  check(`a short or new note keeps the six-row floor (got ${short.style.height}, want 152px)`, short.style.height === "152px");

  const deleted = fakeArea({ content: 900, height: "902px" });
  deleted.content = 300;
  fit(deleted, null);
  check(`the box shrinks again after text is deleted (got ${deleted.style.height}, want 302px)`, deleted.style.height === "302px");

  const thick = fakeArea({ content: 400, border: 4 });
  fit(thick, null);
  check(`the borders are measured, not assumed (got ${thick.style.height}, want 404px)`, thick.style.height === "404px");

  const typing = fakeArea({ content: 1200, height: "540px", scrollTop: 600 });
  const editorWindow = fakeWindow(typing, { scrollTop: 300 });
  fit(typing, editorWindow);
  check(`the editor window does not jump while typing (scrollTop ${editorWindow.scrollTop}, want 300)`, editorWindow.scrollTop === 300);
  check(`the text keeps its own scroll position (scrollTop ${typing.scrollTop}, want 600)`, typing.scrollTop === 600);
  check(`the text, capped at 60vh, is as tall as its content (got ${typing.style.height}, want 1202px)`, typing.style.height === "1202px");
  check("a fit without a scrolling window still works", (() => { const a = fakeArea({ content: 500 }); fit(a); return a.style.height === "502px"; })());
}

// 2. The page wiring. ----------------------------------------------------------------------------------------
const page = readOptional("app/notes/page.tsx");
const start = page.indexOf("function NoteEditor(");
const editor = start >= 0 ? page.slice(start, page.indexOf("\nfunction ", start + 10)) : "";
check("the NoteEditor component is found", editor.length > 0);
check("the editor window is 760px wide (92vw on a phone)", /width: "min\(760px, 92vw\)",\n\s*maxHeight: "90vh",/.test(editor));
check("the 560px editor width is gone", !editor.includes("min(560px"));
check("useLayoutEffect is imported", /import React, \{[^}]*\buseLayoutEffect\b[^}]*\} from "react";/.test(page));
check("the helper is imported", page.includes('import { fitTextAreaToContent } from "@/lib/studioflow/noteTextArea";'));
const effect = (editor.match(/useLayoutEffect\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]*)\]\);/) || []);
check("a layout effect fits the text area to the window it scrolls in", /fitTextAreaToContent\(area, area\.closest<HTMLElement>\('\[role="dialog"\]'\)\)/.test(effect[1] || ""));
check(`the fit runs on every change of the shown text (deps: ${effect[2] ?? "none"})`, (effect[2] || "").trim() === "shownText");
check("the fit writes nothing (no save, no draft)", effect[1] !== undefined && !/\b(save|onSave|submit|writeNoteDraft|clearNoteDraft|setDoc)\s*\(/.test(effect[1]));
check("shownText (also a read-only note's text) is defined before the effect",
  editor.indexOf("const shownText =") >= 0 && editor.indexOf("const shownText =") < editor.indexOf("useLayoutEffect("));
const area = (editor.match(/<textarea\n([\s\S]*?)\/>/) || [])[1] || "";
check("the text area carries the ref", /ref=\{textAreaRef\}/.test(area) && /const textAreaRef = useRef<HTMLTextAreaElement>\(null\);/.test(editor));
check("the text area shows the shown text", /value=\{shownText\}/.test(area));
check("it stays at least six rows (a new note starts as before)", /rows=\{6\}/.test(area));
check("it is capped at 60vh and scrolls inside past that", /maxHeight: "60vh", overflowY: "auto"/.test(area));
check("it can still be dragged taller or shorter", /resize: "vertical"/.test(area));
const areaAt = editor.indexOf("ref={textAreaRef}");
for (const heading of ["Type", "Visibility", "Color", "Reminder", "Image"]) {
  const at = editor.search(new RegExp(`\\{t\\("${heading}"\\)\\.(toUpperCase|toLocaleUpperCase)\\(`));
  check(`the ${heading} section stays below the text`, areaAt >= 0 && at > areaAt);
}
check("no window resize handler is added (size changes never save)", !/addEventListener\("resize"/.test(page));

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${failures.length} of ${checks} note text-area checks failed.`);
  process.exit(1);
}
console.log(`All ${checks} note text-area checks passed.`);
