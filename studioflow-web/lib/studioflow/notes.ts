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
  // One note, shown wherever its context lives (the Files model): the TYPE
  // says what the note is about, the linked ids say where else it surfaces,
  // and visibility is a separate axis from type.
  noteType: "personal" | "order" | "customer" | "team";
  linkedOrderId: string;
  linkedOrderLabel: string;
  linkedCustomerName: string;
  visibility: "only_me" | "workspace";
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
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  // A {seconds, nanoseconds} map (written by a non-web SDK or a raw REST
  // payload) and an ISO string are still real dates — dropping them to null
  // is exactly the silent reminder loss the QA report caught.
  if (typeof value === "object" && typeof (value as { seconds?: unknown }).seconds === "number") {
    return Math.round((value as { seconds: number }).seconds * 1000);
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
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
    noteType: (["personal", "order", "customer", "team"].includes(String(data.noteType)) ? String(data.noteType) : "personal") as StudioKeepNote["noteType"],
    linkedOrderId: (data.linkedOrderId as string) || "",
    linkedOrderLabel: (data.linkedOrderLabel as string) || "",
    linkedCustomerName: (data.linkedCustomerName as string) || "",
    visibility: (String(data.visibility) === "workspace" ? "workspace" : "only_me") as StudioKeepNote["visibility"],
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
    // NaN is falsy, but be explicit: an invalid millis value must never be
    // silently written as "no reminder".
    reminderDate: note.reminderDateMillis != null && Number.isFinite(note.reminderDateMillis)
      ? Timestamp.fromMillis(note.reminderDateMillis)
      : null,
    manualOrder: note.manualOrder,
    noteType: note.noteType || "personal",
    linkedOrderId: note.linkedOrderId || "",
    linkedOrderLabel: note.linkedOrderLabel || "",
    linkedCustomerName: note.linkedCustomerName || "",
    visibility: note.visibility === "workspace" ? "workspace" : "only_me",
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
