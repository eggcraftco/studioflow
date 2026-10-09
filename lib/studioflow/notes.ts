import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { keepNoteDocumentFields, keepNoteFromDoc, type StudioKeepNote } from "./noteDocument";

// The type and the document converters live in noteDocument.ts (pure, no
// Firebase client) so the round-trip test can import them from Node.
export type { StudioKeepNote } from "./noteDocument";
export { keepNoteDocumentFields, keepNoteFromDoc } from "./noteDocument";

export type StudioProjectNoteItem = {
  id: string;
  orderId: string;
  orderKey: string;
  projectTitle: string;
  customerName: string;
  noteType: string;
  text: string;
  updatedAtMillis: number | null;
};

// ------------------------------------------------------------------
// Firestore path: companies/{companyId}/personal_notes/{userId}/notes
// ------------------------------------------------------------------

function notesCollection(companyId: string, userId: string) {
  return collection(db, "companies", companyId, "personal_notes", userId, "notes");
}

export function listenToKeepNotes(
  companyId: string,
  userId: string,
  onUpdate: (notes: StudioKeepNote[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  if (!companyId || !userId) {
    onUpdate([]);
    return () => {};
  }
  return onSnapshot(
    notesCollection(companyId, userId),
    (snap) => {
      const items = snap.docs.map((d) => keepNoteFromDoc(d.id, d.data()));
      onUpdate(items);
    },
    (err) => onError?.(err)
  );
}

export async function saveKeepNote(
  companyId: string,
  userId: string,
  note: StudioKeepNote
): Promise<void> {
  if (!companyId || !userId || !note.id) return;
  const ref = doc(notesCollection(companyId, userId), note.id);
  // Field list and values come from keepNoteDocumentFields — the text is
  // written exactly as given. Only the two server timestamps are added here.
  await setDoc(ref, {
    ...keepNoteDocumentFields(note),
    createdAt: note.createdAtMillis
      ? Timestamp.fromMillis(note.createdAtMillis)
      : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function uploadKeepNoteImage(
  companyId: string,
  userId: string,
  noteId: string,
  file: File
): Promise<string> {
  if (!companyId || !userId || !noteId || !file) return "";
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const key = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const ref = storageRef(
    storage,
    `companies/${companyId}/personal_notes/${userId}/note_images/${noteId}/${key}`
  );
  await uploadBytes(ref, file, { contentType: file.type || "image/jpeg" });
  return await getDownloadURL(ref);
}

/**
 * The editor's image upload: resumable, so the editor can show a percentage
 * and abort it when the person cancels. Nothing is written to the note here —
 * the URL only reaches the note document when the person presses Save (B1,
 * 8 Oct 2026: an interim save used to leave an image-only note behind Cancel).
 */
export function startKeepNoteImageUpload(
  companyId: string,
  userId: string,
  noteId: string,
  file: File,
  onProgress: (percent: number) => void
): { done: Promise<string>; cancel: () => void } {
  if (!companyId || !userId || !noteId || !file) return { done: Promise.resolve(""), cancel: () => {} };
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const key = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const ref = storageRef(
    storage,
    `companies/${companyId}/personal_notes/${userId}/note_images/${noteId}/${key}`
  );
  const task = uploadBytesResumable(ref, file, { contentType: file.type || "image/jpeg" });
  const done = new Promise<string>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress(snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
      reject,
      () => { getDownloadURL(ref).then(resolve, reject); }
    );
  });
  return { done, cancel: () => { task.cancel(); } };
}

/** True when the URL is an image this note's editor uploaded (its own folder). */
export function isOwnKeepNoteImage(url: string, noteId: string): boolean {
  if (!url || !noteId) return false;
  return url.includes(`note_images%2F${encodeURIComponent(noteId)}%2F`) || url.includes(`note_images/${noteId}/`);
}

/** Best effort: removes an uploaded note image that Cancel discarded. */
export async function deleteKeepNoteImage(url: string): Promise<void> {
  if (!url) return;
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // Already gone or not ours: nothing to clean up.
  }
}

export async function deleteKeepNote(
  companyId: string,
  userId: string,
  noteId: string
): Promise<void> {
  if (!companyId || !userId || !noteId) return;
  await deleteDoc(doc(notesCollection(companyId, userId), noteId));
}

export function newKeepNote(
  ownerUserId: string,
  ownerEmail: string,
  ownerName: string
): StudioKeepNote {
  const now = Date.now();
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `note-${now}`,
    title: "",
    text: "",
    colorName: "default",
    ownerUserId,
    ownerEmail,
    ownerName,
    sharedWith: [],
    collaboratorEmails: [],
    activeEditorUserId: "",
    activeEditorEmail: "",
    activeEditorUpdatedAtMillis: null,
    isPinned: false,
    isArchived: false,
    isDeleted: false,
    labels: [],
    links: [],
    reminderDateMillis: null,
    manualOrder: now,
    createdAtMillis: now,
    updatedAtMillis: now,
    noteType: "personal",
    linkedOrderId: "",
    linkedOrderLabel: "",
    linkedCustomerName: "",
    visibility: "only_me",
  };
}

export function isNoteEmpty(note: StudioKeepNote): boolean {
  return !note.title.trim() && !note.text.trim();
}

function notesDarkTheme(): boolean {
  return typeof document !== "undefined" && document.body?.dataset?.studioTheme === "dark";
}

export function colorForNote(name: string): string {
  const dark = notesDarkTheme();
  switch ((name || "default").toLowerCase()) {
    case "red":
      return dark ? "#3a2628" : "#FFE0E0";
    case "orange":
      return dark ? "#3a3024" : "#FFEFD0";
    case "yellow":
      return dark ? "#39371f" : "#FFF7CC";
    case "green":
      return dark ? "#23362b" : "#D8F5D8";
    case "blue":
      return dark ? "#233140" : "#D8E9FF";
    case "purple":
      return dark ? "#2f2842" : "#E6DAFF";
    case "pink":
      return dark ? "#3a2636" : "#FFD9F0";
    default:
      return dark ? "#262629" : "#FFFFFF";
  }
}

export const NOTE_COLORS = [
  "default",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
];
