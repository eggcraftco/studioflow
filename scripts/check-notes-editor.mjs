// Notes page (8 Oct 2026): the three fixes stay in place. Static — reads the
// sources, runs nothing (the runtime half is scripts/check-notes-roundtrip.ts).
//   1. No save is wired to a size change: the matchMedia and ResizeObserver
//      effects only set layout state. The only writes are explicit actions.
//   2. The editor saves before it closes (backdrop click), shows a saving
//      state, keeps the draft on failure, and detects a concurrent edit.
//   3. Cards are at least 280px wide (one column inside 375px), take their own
//      height, clamp long text with Show more / Show less, and no longer cut
//      the preview at a raw 220th UTF-16 unit.
// Exit 1 on any miss.
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const page = read("app/notes/page.tsx");
const notesLib = read("lib/studioflow/notes.ts");
const lang = read("lib/studioflow/language.ts");
let failures = 0; let checks = 0;
const check = (ok, what) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };

// 1. Size changes never save -------------------------------------------------
const effectBodies = [...page.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/g)].map((m) => m[1]);
const sizeEffects = effectBodies.filter((b) => /matchMedia|ResizeObserver/.test(b));
check(sizeEffects.length >= 3, `the page has its size-aware effects (found ${sizeEffects.length})`);
for (const body of sizeEffects) {
  check(!/\b(save|onSave|saveKeepNote|setDoc|saveFromEditor|writeNoteDraft)\s*\(/.test(body), "a size-aware effect calls no save or write");
}
check(!/addEventListener\("resize"/.test(page), "the notes page has no window resize handler at all");
check(/\.\.\.keepNoteDocumentFields\(note\),/.test(notesLib), "saveKeepNote writes the pure document fields (text verbatim)");
check(!/text:\s*note\.text\.(trim|replace|normalize)/.test(notesLib), "the save path does not trim or normalise the text");

// 2. Editor: save before close, saving state, kept draft, conflict ------------
check(/onClick=\{\(\) => \{ if \(!saving && !conflict\) void submit\(\); \}\}/.test(page), "the backdrop click saves (submit) instead of closing");
check(!/<div\s+onClick=\{onClose\}/.test(page), "no overlay closes the editor directly any more");
check(/\{saving \? t\("Saving\.\.\."\) : t\("Save"\)\}/.test(page), "the Save button shows the saving state");
check(/\{saving \? t\("Saving\.\.\."\) : t\("Unsaved changes"\)\}/.test(page), "the header shows saving / unsaved state");
check(/const result = await onSave\(draft, force\);\s*if \(result === "saved"\) clearNoteDraft\(/.test(page), "the draft is cleared only on a confirmed save");
check(/setError\(saveError instanceof Error && saveError\.message \? saveError\.message : t\("The note could not be saved\."\)\)/.test(page), "a failed save shows an inline error and keeps the editor open");
check(/if \(dirty\) writeNoteDraft\(workspaceId, userId, \{ \.\.\.draft, title, text \}, baseUpdatedAtRef\.current\);/.test(page), "every change is mirrored into the per-note draft (memory + localStorage)");
check(/readNoteDraft\(workspaceId, userId, note\.id\)/.test(page), "the editor restores a stored draft on open");
check(/addEventListener\("beforeunload", guard\)/.test(page), "unsaved typing arms a beforeunload guard");
check(/class NoteConflictError extends Error/.test(page) && /detectNoteConflict\(base, live, lastWrittenRef\.current\.get\(note\.id\) \?\? null\)/.test(page), "the page checks for a newer copy before writing");
for (const label of ["Use theirs", "Keep both", "Keep mine"]) check(page.includes(`{t("${label}")}`), `conflict choice "${label}" is offered`);
check(/if \(dirty && !confirm\(t\("Discard unsaved changes\?"\)\)\) return;/.test(page), "Cancel asks before discarding typed text");
check(/live\.updatedAtMillis != null && !noteDraftIsDirty\(draft\.note, live\)\) clearNoteDraft\(/.test(page), "drafts are reconciled only against server-confirmed copies");
check(/orphanDrafts\.map\(/.test(page) && page.includes('{t("Unsaved draft")}'), "drafts of never-saved notes are offered as cards");
check(/new Promise<"pending">/.test(page) && page.includes(`t("Saved on this device. It will sync when you're back online.")`), "an offline save does not hang: the write is queued and the person is told");
check(/key=\{editing\.id\}/.test(page), "the editor remounts per note (its state is per note)");

// 3. Cards -------------------------------------------------------------------
const gridCount = (page.match(/gridTemplateColumns: "repeat\(auto-fill, minmax\(min\(100%, 280px\), 1fr\)\)"/g) || []).length;
check(gridCount >= 2, `cards are at least 280px wide and one column inside 375px (found ${gridCount} grids)`);
check(!/minmax\(160px, 1fr\)/.test(page), "the 160px strips are gone");
check(/alignItems: "start",/.test(page), "cards take their own content height (grid align start)");
check(!/slice\(0, 220\)/.test(page), "the raw 220-unit slice (which could split an emoji) is gone");
check(/WebkitLineClamp: PREVIEW_LINES/.test(page) && /const PREVIEW_LINES = 8;/.test(page), "long text is clamped by lines");
check(/\{expanded \? t\("Show less"\) : t\("Show more"\)\}/.test(page), "Show more / Show less toggles the clamp");
check(/notePreviewText\(note\.text\)/.test(page), "the collapsed preview uses the code-point-safe cut");
check(/overflowWrap: "anywhere"/.test(page), "long words wrap instead of overflowing the card");
check(/draggable=\{canDrag && !note\.isPinned\}/.test(page) && /e\.dataTransfer\.setData\("text\/plain", note\.id\)/.test(page) && /manualOrder: ts \+ i/.test(page), "drag ordering (manualOrder) is unchanged");

// 4. Translations --------------------------------------------------------------
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const KEYS = ["Unsaved draft", "An unsaved draft of this note was restored.", "Discard draft", "Discard unsaved changes?",
  "This note was changed on another device while you were editing. Which version do you want to keep?", "Use theirs", "Keep both", "Keep mine",
  "Saved on this device. It will sync when you're back online.", "Show more", "Show less", "Unsaved changes", "The note could not be saved.",
  "Uploading image…", "attachment(s)", "Image upload failed.", "Note image"];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const key of KEYS) {
  const rows = [...lang.matchAll(new RegExp(`^\\s*"${escape(key)}": \\{([^\\n]*)\\}`, "gm"))].map((m) => m[1]);
  const covered = LANGUAGES.filter((l) => rows.some((r) => r.includes(`"${l}":`)));
  check(covered.length === LANGUAGES.length, `"${key}" has all 11 translations in language.ts (${covered.length})`);
}

// 5. B1 (8 Oct 2026 live acceptance): Add image… then Cancel left an image-only
// note. The upload must not save the note; Cancel deletes what it uploaded.
const editorStart = page.indexOf("function NoteEditor(");
const editor = editorStart >= 0 ? page.slice(editorStart) : "";
check(editorStart >= 0, "the NoteEditor component is found");
check(!/onUploadImage/.test(page), "no interim save path for images (onUploadImage is gone)");
check(!/uploadKeepNoteImage\(/.test(page), "the page no longer calls the save-coupled uploader");
const addImage = (editor.match(/function addImage\(file: File\) \{([\s\S]*?)\n  \}/) || [])[1] || "";
check(addImage.includes("startKeepNoteImageUpload(") && !/\b(onSave|save|saveKeepNote|submit)\(/.test(addImage), "addImage uploads only; it writes no note");
check(/links,\n    \};/.test(editor), "buildDraft carries the editor's links (written only by Save)");
check(/discardUnsavedImages\(\);\n    clearNoteDraft\(workspaceId, userId, note\.id\);\n    onClose\(\);/.test(editor), "Cancel deletes the images this editor uploaded");
check(/isOwnKeepNoteImage\(url, note\.id\)\) void deleteKeepNoteImage\(url\)/.test(editor), "only this note's own uploads are deleted");
check(/useEffect\(\(\) => \(\) => \{ uploadCancelRef\.current\?\.\(\); \}, \[\]\);/.test(editor), "closing mid-upload cancels the upload task");
check(/\{t\("Uploading image…"\)\} \{upload\.percent\}%/.test(editor), "the editor shows upload progress");
check(/if \(saving \|\| upload\) return;/.test(editor), "Save waits for the upload to finish");
check(/isNew \? \(!isNoteEmpty\(draft\) \|\| draft\.links\.length > 0\)/.test(editor), "an image-only new note still counts as a change");
check(/uploadBytesResumable\(ref, file/.test(notesLib) && /deleteObject\(storageRef\(storage, url\)\)/.test(notesLib), "notes.ts has the resumable upload and the delete");
check(/role="dialog"\n        aria-modal="true"\n        aria-labelledby="note-editor-title"/.test(editor), "the editor is a labelled modal dialog");
check(/if \(event\.key === "Escape"\) escapeRef\.current\(\);/.test(editor) && /escapeRef\.current = \(\) => \{ if \(!saving\) discardAndClose\(\); \};/.test(editor), "Escape is Cancel");
check(/aria-label=\{`\$\{t\("Color"\)\}: /.test(editor) && /aria-label=\{t\("Reminder"\)\}/.test(editor), "colour swatches and the reminder date have accessible names");
for (const w of ["COLOR", "REMINDER", "LABELS", "COLLABORATORS", "IMAGE"]) check(!editor.includes(`>${w}</div>`), `${w} goes through t()`);
check(/=== 1 \? t\("note"\) : t\("notes"\)/.test(page), "the note count goes through t()");

check(!/background: "white"/.test(editor.slice(0, editor.indexOf("\nfunction ProjectNotesView"))) && !/background: [^,]*\? [^,]*: "white"/.test(editor.slice(0, editor.indexOf("\nfunction ProjectNotesView"))), "the editor uses theme tokens, not literal white (dark mode)");
if (failures) { console.error(`${failures} of ${checks} notes-editor checks failed.`); process.exit(1); }
console.log(`All ${checks} notes-editor checks passed.`);
