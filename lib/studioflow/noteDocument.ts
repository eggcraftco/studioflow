import { Timestamp } from "firebase/firestore";

// Pure half of the notes model: the type, and the two converters between a
// StudioKeepNote and its Firestore document. No Firebase client import, so a
// plain Node script can prove that a note's text survives the round trip
// byte for byte (scripts/check-notes-roundtrip.ts). The saving side lives in
// notes.ts and adds only the two server timestamps.

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

export function tsToMillis(value: unknown): number | null {
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

export function keepNoteFromDoc(id: string, data: Record<string, unknown>): StudioKeepNote {
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

/**
 * Every field saveKeepNote writes except createdAt/updatedAt (those are
 * server timestamps and added by the caller). The text and title are written
 * exactly as given — no trimming, no normalisation, no sanitising — so the
 * only place a note's content can change is the editor's own Save.
 */
export function keepNoteDocumentFields(note: StudioKeepNote): Record<string, unknown> {
  return {
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
  };
}
