// Notes content and drafts (8 Oct 2026). Runs the pure half of the notes model
// in Node (npx tsx scripts/check-notes-roundtrip.ts) and proves four things:
//   1. a note's title and text come back from the Firestore document byte for
//      byte — line breaks, blank lines, lists, tabs, emoji (ZWJ, flags), CRLF,
//      a 40k-character note — so nothing on the save path can "change" text;
//   2. the card preview cut never splits a surrogate pair and leaves short
//      text untouched;
//   3. the concurrent-edit detector fires only for a newer, different, server-
//      confirmed copy that this device did not write;
//   4. drafts are scoped by workspace + user + note and survive a clear of the
//      in-memory tier (a reload) through localStorage.
// Exit 1 on any miss.
import { Timestamp } from "firebase/firestore";
import { keepNoteDocumentFields, keepNoteFromDoc, type StudioKeepNote } from "../lib/studioflow/noteDocument";
import {
  clearNoteDraft,
  detectNoteConflict,
  listNoteDrafts,
  noteDraftIsDirty,
  noteDraftKey,
  notePreviewText,
  readNoteDraft,
  writeNoteDraft,
} from "../lib/studioflow/noteDrafts";

let failures = 0;
let checks = 0;
const check = (ok: boolean, what: string) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };

function note(overrides: Partial<StudioKeepNote> = {}): StudioKeepNote {
  return {
    id: "n1", title: "Title", text: "Body", colorName: "yellow", ownerUserId: "u1", ownerEmail: "a@b.c", ownerName: "A",
    sharedWith: [], collaboratorEmails: [], activeEditorUserId: "", activeEditorEmail: "", activeEditorUpdatedAtMillis: null,
    isPinned: false, isArchived: false, isDeleted: false, labels: ["x"], links: [], reminderDateMillis: null, manualOrder: 5,
    createdAtMillis: 1000, updatedAtMillis: 2000, noteType: "personal", linkedOrderId: "", linkedOrderLabel: "", linkedCustomerName: "",
    visibility: "only_me", ...overrides,
  };
}

// 1. Round trip ---------------------------------------------------------------
const samples: Array<[string, string]> = [
  ["line breaks and blank lines", "first line\n\nthird line\n   indented line\nlast"],
  ["bullet and numbered lists", "- apples\n- pears\n\n1. one\n2. two\n\t• tabbed bullet"],
  ["emoji incl. ZWJ and flags", "Family 👨‍👩‍👧‍👦 flag 🇬🇧 skin 👍🏽 heart ❤️ end 🎉"],
  ["CRLF kept as typed", "a\r\nb\r\nc"],
  ["inner spacing kept", "two  spaces   three\n\ttab start\nend  "],
  ["html-looking text is not sanitised", "<b>bold?</b> & <script>alert(1)</script> \"quotes\" 'single'"],
  ["40k-character note", Array.from({ length: 2000 }, (_, i) => `line ${i} — some words here 🙂`).join("\n")],
];
for (const [name, text] of samples) {
  const original = note({ text, title: `T ${name} 🙂\nsecond title line` });
  const docData = { ...keepNoteDocumentFields(original), createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(2000) };
  const back = keepNoteFromDoc(original.id, docData);
  check(back.text === original.text, `round trip text: ${name}`);
  check(back.title === original.title, `round trip title: ${name}`);
  check(back.labels.join("|") === original.labels.join("|") && back.manualOrder === original.manualOrder, `round trip fields: ${name}`);
}
// The document never contains a normalised copy of the text (no trim, no collapse).
const fields = keepNoteDocumentFields(note({ text: "  keep edges  \n\n" }));
check(fields.text === "  keep edges  \n\n", "keepNoteDocumentFields writes text verbatim (no trim)");

// 2. Preview cut --------------------------------------------------------------
check(notePreviewText("short") === "short", "preview leaves short text untouched");
const emojiRun = "🎉".repeat(2000);
const cut = notePreviewText(emojiRun, 100);
check((cut as unknown as { isWellFormed: () => boolean }).isWellFormed(), "preview cut never splits a surrogate pair");
check(cut.endsWith("…") && Array.from(cut).length <= 101, `preview cut length is bounded (${Array.from(cut).length})`);
const words = ("word ".repeat(400)).trim();
const cutWords = notePreviewText(words, 1000);
check(!cutWords.includes("wor…") && cutWords.endsWith("…"), "preview prefers a word boundary");

// 3. Conflict detection -------------------------------------------------------
const base = note();
check(detectNoteConflict(base, undefined, null) === null, "no live copy → no conflict (new note)");
check(detectNoteConflict(base, note(), null) === null, "identical live copy → no conflict");
check(detectNoteConflict(base, note({ text: "theirs", updatedAtMillis: 3000 }), null) !== null, "newer, different live copy → conflict");
check(detectNoteConflict(base, note({ text: "theirs", updatedAtMillis: null }), null) === null, "pending local write (null updatedAt) → no conflict");
check(detectNoteConflict(base, note({ text: "theirs", updatedAtMillis: 2000 }), null) === null, "not newer than base → no conflict");
const mine = note({ text: "mine" });
check(detectNoteConflict(base, note({ text: "mine", updatedAtMillis: 3000 }), mine) === null, "our own confirmed write → no conflict");
check(detectNoteConflict(base, note({ isPinned: true, updatedAtMillis: 3000 }), null) === null, "pin/archive changes are not content conflicts");

// 4. Dirty check and drafts ---------------------------------------------------
check(!noteDraftIsDirty(note({ text: "Body  \n" }), note()), "whitespace-only typing is not dirty");
check(noteDraftIsDirty(note({ text: "Body!" }), note()), "a text change is dirty");
check(!noteDraftIsDirty(note({ isPinned: true }), note()), "pin state does not make the editor dirty");

// A minimal localStorage so the storage tier runs in Node.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};
writeNoteDraft("wsA", "u1", note({ id: "d1", text: "draft A1" }), 2000);
writeNoteDraft("wsA", "u1", note({ id: "d2", text: "draft A2" }), null);
writeNoteDraft("wsB", "u1", note({ id: "d1", text: "draft B1" }), 2000);
writeNoteDraft("wsA", "u2", note({ id: "d1", text: "other user" }), 2000);
check(readNoteDraft("wsA", "u1", "d1")?.note.text === "draft A1", "draft read back for its workspace/user/note");
check(readNoteDraft("wsA", "u1", "d1")?.baseUpdatedAtMillis === 2000, "draft keeps the base stamp it was made against");
check(listNoteDrafts("wsA", "u1").map((d) => d.noteId).sort().join(",") === "d1,d2", "listing is scoped to workspace + user");
check(listNoteDrafts("wsB", "u1").length === 1 && listNoteDrafts("wsB", "u1")[0].note.text === "draft B1", "another workspace sees only its own draft");
check(store.has(noteDraftKey("wsA", "u1", "d1")), "draft is mirrored to localStorage under the scoped key");
// Only the storage tier survives a reload: read the raw JSON back as a fresh process would.
const raw = JSON.parse(store.get(noteDraftKey("wsA", "u1", "d1")) as string);
check(raw.v === 1 && raw.note.text === "draft A1" && raw.workspaceId === "wsA" && raw.userId === "u1", "stored JSON carries version, scope and the note");
clearNoteDraft("wsA", "u1", "d1");
check(readNoteDraft("wsA", "u1", "d1") === null && !store.has(noteDraftKey("wsA", "u1", "d1")), "clear removes both tiers");
check(readNoteDraft("wsB", "u1", "d1")?.note.text === "draft B1", "clearing one workspace's draft leaves the other's");

if (failures) { console.error(`${failures} of ${checks} notes round-trip checks failed.`); process.exit(1); }
console.log(`All ${checks} notes round-trip checks passed.`);
