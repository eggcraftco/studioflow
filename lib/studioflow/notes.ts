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
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";

// ------------------------------------------------------------------
// Types — mirror Android StudioKeepNote / Mac StudioKeepNote
// ------------------------------------------------------------------

export type StudioKeepNote = {
  id: string;
  title: string;
  text: string;
  colorName: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  sharedWith: string[];
  collaboratorEmails: string[];
  activeEditorUserId: string;
  activeEditorEmail: string;
  activeEditorUpdatedAtMillis: number | null;
  isPinned: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  labels: string[];
  links: string[];
  reminderDateMillis: number | null;
  manualOrder: number;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
};

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

function tsToMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return null;
}

function keepNoteFromDoc(id: string, data: Record<string, unknown>): StudioKeepNote {
  return {
    id,
    title: (data.title as string) || "",
    text: (data.text as string) || "",
    colorName: (data.colorName as string) || "default",
    ownerUserId: (data.ownerUserId as string) || "",
    ownerEmail: (data.ownerEmail as string) || "",
    ownerName: (data.ownerName as string) || "",
    sharedWith: Array.isArray(data.sharedWith) ? (data.sharedWith as string[]) : [],
    collaboratorEmails: Array.isArray(data.collaboratorEmails)
      ? (data.collaboratorEmails as string[])
      : [],
    activeEditorUserId: (data.activeEditorUserId as string) || "",
    activeEditorEmail: (data.activeEditorEmail as string) || "",
    activeEditorUpdatedAtMillis: tsToMillis(data.activeEditorUpdatedAt),
    isPinned: Boolean(data.isPinned),
    isArchived: Boolean(data.isArchived),
    isDeleted: Boolean(data.isDeleted),
    labels: Array.isArray(data.labels) ? (data.labels as string[]) : [],
    links: Array.isArray(data.links) ? (data.links as string[]) : [],
    reminderDateMillis: tsToMillis(data.reminderDate),
    manualOrder: typeof data.manualOrder === "number" ? (data.manualOrder as number) : 0,
    createdAtMillis: tsToMillis(data.createdAt),
    updatedAtMillis: tsToMillis(data.updatedAt),
  };
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
  await setDoc(ref, {
    title: note.title,
    text: note.text,
    colorName: note.colorName,
    ownerUserId: note.ownerUserId,
    ownerEmail: note.ownerEmail,
    ownerName: note.ownerName,
    sharedWith: note.sharedWith,
    collaboratorEmails: note.collaboratorEmails,
    activeEditorUserId: note.activeEditorUserId,
    activeEditorEmail: note.activeEditorEmail,
    activeEditorUpdatedAt: note.activeEditorUpdatedAtMillis
      ? Timestamp.fromMillis(note.activeEditorUpdatedAtMillis)
      : null,
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    isDeleted: note.isDeleted,
    labels: note.labels,
    links: note.links,
    reminderDate: note.reminderDateMillis
      ? Timestamp.fromMillis(note.reminderDateMillis)
      : null,
    manualOrder: note.manualOrder,
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
  };
}

export function isNoteEmpty(note: StudioKeepNote): boolean {
  return !note.title.trim() && !note.text.trim();
}

export function colorForNote(name: string): string {
  switch ((name || "default").toLowerCase()) {
    case "red":
      return "#FFE0E0";
    case "orange":
      return "#FFEFD0";
    case "yellow":
      return "#FFF7CC";
    case "green":
      return "#D8F5D8";
    case "blue":
      return "#D8E9FF";
    case "purple":
      return "#E6DAFF";
    case "pink":
      return "#FFD9F0";
    default:
      return "#FFFFFF";
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
