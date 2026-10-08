import type { StudioKeepNote } from "./noteDocument";

// Unsaved note drafts (8 Oct 2026). While the editor is open, every change is
// mirrored into two places: a module-level Map (survives the editor
// unmounting inside the tab) and localStorage (survives a reload, the tab
// going to the background, a lost connection and a workspace switch). The key
// carries workspace, user and note, so a draft never surfaces in another
// workspace or for another account on the same browser. A draft is removed
// the moment the server copy matches it, or when the person discards it.

export const NOTE_DRAFT_VERSION = 1;
const PREFIX = "nivadesk.noteDraft.v1.";

export type StoredNoteDraft = {
  v: number;
  workspaceId: string;
  userId: string;
  noteId: string;
  /** updatedAt of the note as it was when the editor opened (null for a new note). */
  baseUpdatedAtMillis: number | null;
  /** When this draft was last written on this device. */
  savedAtMillis: number;
  note: StudioKeepNote;
};

const memory = new Map<string, StoredNoteDraft>();

export function noteDraftKey(workspaceId: string, userId: string, noteId: string): string {
  return `${PREFIX}${encodeURIComponent(workspaceId)}.${encodeURIComponent(userId)}.${encodeURIComponent(noteId)}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseDraft(raw: string | null): StoredNoteDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredNoteDraft;
    if (!parsed || parsed.v !== NOTE_DRAFT_VERSION || !parsed.note || typeof parsed.note.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readNoteDraft(workspaceId: string, userId: string, noteId: string): StoredNoteDraft | null {
  const key = noteDraftKey(workspaceId, userId, noteId);
  const inMemory = memory.get(key);
  const stored = parseDraft(storage()?.getItem(key) ?? null);
  // The newer of the two wins; the memory copy is usually the same object.
  if (inMemory && stored) return inMemory.savedAtMillis >= stored.savedAtMillis ? inMemory : stored;
  return inMemory ?? stored;
}

export function writeNoteDraft(
  workspaceId: string,
  userId: string,
  note: StudioKeepNote,
  baseUpdatedAtMillis: number | null
): StoredNoteDraft {
  const draft: StoredNoteDraft = {
    v: NOTE_DRAFT_VERSION,
    workspaceId,
    userId,
    noteId: note.id,
    baseUpdatedAtMillis,
    savedAtMillis: Date.now(),
    note,
  };
  const key = noteDraftKey(workspaceId, userId, note.id);
  memory.set(key, draft);
  try {
    storage()?.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota or private mode: the in-memory copy still protects this tab.
  }
  return draft;
}

export function clearNoteDraft(workspaceId: string, userId: string, noteId: string): void {
  const key = noteDraftKey(workspaceId, userId, noteId);
  memory.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {}
}

/** Every draft of this workspace + user on this device, newest first. */
export function listNoteDrafts(workspaceId: string, userId: string): StoredNoteDraft[] {
  const prefix = `${PREFIX}${encodeURIComponent(workspaceId)}.${encodeURIComponent(userId)}.`;
  const found = new Map<string, StoredNoteDraft>();
  const store = storage();
  if (store) {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const draft = parseDraft(store.getItem(key));
      if (draft) found.set(key, draft);
    }
  }
  for (const [key, draft] of memory) {
    if (!key.startsWith(prefix)) continue;
    const existing = found.get(key);
    if (!existing || draft.savedAtMillis >= existing.savedAtMillis) found.set(key, draft);
  }
  return Array.from(found.values()).sort((a, b) => b.savedAtMillis - a.savedAtMillis);
}

// ------------------------------------------------------------------
// Content comparison
// ------------------------------------------------------------------

/**
 * The fields a person edits in the note editor. Pin/archive/trash/order are
 * list actions, not editor content, so two copies that differ only there are
 * the same note as far as "did someone else change it" goes.
 */
export function noteContentSignature(note: StudioKeepNote): string {
  return JSON.stringify({
    title: note.title,
    text: note.text,
    colorName: note.colorName,
    labels: note.labels,
    collaboratorEmails: note.collaboratorEmails,
    reminderDateMillis: note.reminderDateMillis,
    noteType: note.noteType,
    linkedOrderId: note.linkedOrderId,
    linkedCustomerName: note.linkedCustomerName,
    visibility: note.visibility,
    links: note.links,
  });
}

/** Trimmed title and text — what Save would write — so whitespace-only typing is not a change. */
export function noteDraftIsDirty(draft: StudioKeepNote, saved: StudioKeepNote): boolean {
  const normalize = (n: StudioKeepNote): StudioKeepNote => ({ ...n, title: n.title.trim(), text: n.text.trim() });
  return noteContentSignature(normalize(draft)) !== noteContentSignature(normalize(saved));
}

/**
 * A concurrent edit: the live copy differs from the version the editor
 * opened AND from the last version this device wrote, and it carries a
 * server timestamp (a pending local write reads back with null updatedAt and
 * is never a conflict). Compared by content, not by timestamp alone, so our
 * own just-confirmed write — whose server updatedAt is of course newer than
 * the base — is not mistaken for someone else's.
 */
export function detectNoteConflict(
  base: StudioKeepNote,
  live: StudioKeepNote | undefined,
  lastWritten: StudioKeepNote | null
): StudioKeepNote | null {
  if (!live) return null;
  if (live.updatedAtMillis == null) return null;
  // An edit always bumps updatedAt; a copy that is not newer than the base
  // cannot be someone else's later change.
  if (base.updatedAtMillis != null && live.updatedAtMillis <= base.updatedAtMillis) return null;
  const liveSig = noteContentSignature(live);
  if (liveSig === noteContentSignature(base)) return null;
  if (lastWritten && liveSig === noteContentSignature(lastWritten)) return null;
  return live;
}

// ------------------------------------------------------------------
// Card preview
// ------------------------------------------------------------------

/**
 * Cuts a long note for the collapsed card without splitting a surrogate pair
 * (an emoji cut in half renders as a broken glyph) and preferring a line or
 * word boundary near the limit. Returns the text unchanged when it fits.
 */
export function notePreviewText(text: string, maxChars = 1200): string {
  if (text.length <= maxChars) return text;
  const points = Array.from(text);
  if (points.length <= maxChars) return text;
  let cut = points.slice(0, maxChars).join("");
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  if (lastBreak > maxChars * 0.6) cut = cut.slice(0, lastBreak);
  return `${cut.trimEnd()}…`;
}
