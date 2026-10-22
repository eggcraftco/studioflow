// Notes sharing contract (docs/notes-sharing-contract-2026-10-14.md), the pure web half.
// No Firebase import, so scripts/check-notes-sharing.ts runs it in Node.
//
// People are uids. The member list comes from the workspace document's members map
// (key = uid) plus the owner; a suspended member and the signed-in person are never
// offered. Emails are only display and the bridge for notes shared by the store apps,
// which listed collaborators by email.
import type { StudioKeepNote } from "./noteDocument";

export type NoteWorkspaceMember = {
  uid: string;
  email: string;
  name: string;
  role: string;
  isOwner: boolean;
  suspended: boolean;
  /** The profile photo the workspace's members map holds for them (GN-02); "" when none. */
  photoURL?: string;
};

function asMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cleanEmail = (value: unknown) => clean(value).toLowerCase();

/** Every person of the workspace: the owner first, then the members map, with the suspended flag. */
export function noteMembersFromCompany(companyData: Record<string, unknown> | null | undefined): NoteWorkspaceMember[] {
  const data = companyData ?? {};
  const ownerUid = clean(data.ownerUid);
  const members = asMap(data.members);
  const suspended = asMap(data.suspendedMembers);
  const out = new Map<string, NoteWorkspaceMember>();
  if (ownerUid) {
    const entry = asMap(members[ownerUid]);
    out.set(ownerUid, {
      uid: ownerUid,
      email: cleanEmail(entry.email) || cleanEmail(data.ownerEmail) || cleanEmail(data.email),
      name: clean(entry.displayName) || clean(entry.name) || clean(data.ownerName),
      role: "owner",
      isOwner: true,
      suspended: false,
      photoURL: memberPhotoURL(entry),
    });
  }
  for (const [key, raw] of Object.entries(members)) {
    const uid = clean(key);
    if (!uid || uid === ownerUid) continue;
    const entry = asMap(raw);
    out.set(uid, {
      uid,
      email: cleanEmail(entry.email) || cleanEmail(entry.userEmail),
      name: clean(entry.displayName) || clean(entry.name),
      role: clean(entry.role) || "member",
      isOwner: false,
      suspended: Object.prototype.hasOwnProperty.call(suspended, uid),
      photoURL: memberPhotoURL(entry),
    });
  }
  return Array.from(out.values());
}

/** Only an https address is used as a photo; anything else falls back to initials. */
function memberPhotoURL(entry: Record<string, unknown>): string {
  for (const key of ["photoURL", "accountPhotoURL", "avatarURL", "profilePhotoURL"]) {
    const value = clean(entry[key]);
    if (value && /^https:\/\//i.test(value)) return value;
  }
  return "";
}

// ---------------------------------------------------------------------------
// GN-02 (22 Oct 2026): the small faces on a shared note's card, the same on
// every app. One person per uid; the owner (when it is someone else's note),
// then the accepted collaborators, then — on the owner's own copy only, where
// the server keeps that list — the people invited who have not answered yet.
// The signed-in person is never shown. A store-app e-mail that matches no
// member still shows (as accepted, by e-mail) so nobody silently disappears.
// Nothing here is cached or written: the faces are worked out from the note
// and the members map on every render, so a revoked share loses its face the
// moment the note's lists change.

export type NoteAvatarStatus = "owner" | "accepted" | "pending";

export type NoteAvatarPerson = {
  /** uid, or "email:<address>" for an unmatched store-app e-mail. */
  key: string;
  uid: string;
  email: string;
  label: string;
  /** What tells two people with the same name apart: the e-mail, or "ID abc123". */
  identity: string;
  photoURL: string;
  initials: string;
  /** 0–359, from the key: two people with the same initials get different colours. */
  hue: number;
  status: NoteAvatarStatus;
};

export const NOTE_AVATAR_MAX_SHOWN = 4;

export function noteAvatarHue(key: string): number {
  // FNV-1a 32-bit over the UTF-16 code units; the same numbers on every platform.
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

export function noteAvatarInitials(label: string, email: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
  if (words.length === 1) return (Array.from(words[0])[0] ?? "").toUpperCase();
  return (Array.from(email.trim())[0] ?? "?").toUpperCase();
}

function avatarPerson(key: string, uid: string, email: string, name: string, photoURL: string, status: NoteAvatarStatus): NoteAvatarPerson {
  const cleanName = clean(name);
  const mail = cleanEmail(email);
  const label = cleanName || (mail ? mail.split("@")[0] : "") || (uid ? uid.slice(0, 6) : "?");
  return {
    key,
    uid,
    email: mail,
    label,
    identity: mail || (uid ? `ID ${uid.slice(0, 6)}` : ""),
    photoURL: photoURL && /^https:\/\//i.test(photoURL) ? photoURL : "",
    initials: noteAvatarInitials(cleanName, mail || uid),
    hue: noteAvatarHue(key),
    status,
  };
}

/**
 * Order inside a status group: label, then identity, lower-cased, by UTF-16
 * code unit — not the locale's collation — so every app lists the same faces in
 * the same order (Swift and Kotlin compare the same way).
 */
function compareAvatarPeople(a: NoteAvatarPerson, b: NoteAvatarPerson): number {
  const order = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return order(a.label.toLowerCase(), b.label.toLowerCase()) || order(a.identity.toLowerCase(), b.identity.toLowerCase());
}

export function noteAvatarPeople(
  note: Pick<StudioKeepNote, "ownerUserId" | "ownerEmail" | "ownerName" | "collaboratorUserIds" | "pendingCollaboratorUserIds" | "sharedWith" | "collaboratorEmails">,
  members: NoteWorkspaceMember[],
  selfUid: string,
  selfEmail = ""
): NoteAvatarPerson[] {
  const byUid = new Map(members.map((member) => [member.uid, member]));
  const me = clean(selfUid);
  const myEmail = cleanEmail(selfEmail);
  const owner = clean(note.ownerUserId);
  const seen = new Set<string>();
  const out: NoteAvatarPerson[] = [];
  const push = (person: NoteAvatarPerson) => {
    if (seen.has(person.key)) return;
    seen.add(person.key);
    out.push(person);
  };
  const fromUid = (uid: string, status: NoteAvatarStatus) => {
    const member = byUid.get(uid);
    const fallbackEmail = status === "owner" ? note.ownerEmail : "";
    const fallbackName = status === "owner" ? note.ownerName : "";
    return avatarPerson(uid, uid, member?.email || fallbackEmail || "", member?.name || fallbackName || "", member?.photoURL || "", status);
  };

  if (owner && owner !== me) push(fromUid(owner, "owner"));
  const accepted = noteCollaboratorUids(note, members).filter((uid) => uid !== me && uid !== owner);
  const acceptedPeople = accepted.map((uid) => fromUid(uid, "accepted"));
  const legacy = noteUnmatchedCollaboratorEmails(note, members)
    .filter((email) => email !== myEmail && email !== cleanEmail(note.ownerEmail))
    .map((email) => avatarPerson(`email:${email}`, "", email, "", "", "accepted"));
  [...acceptedPeople, ...legacy]
    .sort(compareAvatarPeople)
    .forEach(push);
  const acceptedSet = new Set(accepted);
  (note.pendingCollaboratorUserIds ?? [])
    .map(clean)
    .filter((uid) => uid && uid !== me && uid !== owner && !acceptedSet.has(uid))
    .map((uid) => fromUid(uid, "pending"))
    .sort(compareAvatarPeople)
    .forEach(push);
  return out;
}

/** The faces drawn on the card and how many more there are ("+N"). */
export function noteAvatarStack(people: NoteAvatarPerson[], max = NOTE_AVATAR_MAX_SHOWN): { shown: NoteAvatarPerson[]; overflow: number } {
  if (people.length <= max) return { shown: people, overflow: 0 };
  // With an overflow chip the last slot goes to "+N", so the row never grows past `max` circles.
  return { shown: people.slice(0, max - 1), overflow: people.length - (max - 1) };
}

/** English source of the status words; each app translates them through its own table. */
export const NOTE_AVATAR_STATUS_TEXT: Record<NoteAvatarStatus, string> = {
  owner: "Owner",
  accepted: "Shared",
  pending: "Invitation pending",
};

/** "Ayşe Kaya (ayse@x.com) — Invitation pending": what a screen reader and a tooltip say for one face. */
export function noteAvatarPersonText(person: NoteAvatarPerson, translate: (text: string) => string = (text) => text): string {
  const who = person.identity && person.identity !== person.label ? `${person.label} (${person.identity})` : person.label;
  return `${who} — ${translate(NOTE_AVATAR_STATUS_TEXT[person.status])}`;
}

export function noteMemberLabel(member: Pick<NoteWorkspaceMember, "name" | "email" | "uid">): string {
  return member.name || (member.email ? member.email.split("@")[0] : "") || member.uid.slice(0, 6);
}

/**
 * The line that tells two people with the same name apart (15 Oct): the e-mail the
 * workspace holds for them, or a short id when the members map has none. Every row
 * that names a person (picker, collaborators, pending, owner) shows it under the name.
 */
export function noteMemberIdentity(member: Pick<NoteWorkspaceMember, "email" | "uid">): string {
  return member.email || `ID ${member.uid.slice(0, 6)}`;
}

/** The people the signed-in person may pick: not themselves, not suspended, by name. */
export function pickableNoteMembers(members: NoteWorkspaceMember[], selfUid: string): NoteWorkspaceMember[] {
  return members
    .filter((member) => member.uid && member.uid !== selfUid && !member.suspended)
    .sort((a, b) => noteMemberLabel(a).localeCompare(noteMemberLabel(b)));
}

/** Accepted collaborators as uids: the uid list, plus store-app emails that match a member. */
export function noteCollaboratorUids(note: Pick<StudioKeepNote, "collaboratorUserIds" | "sharedWith" | "collaboratorEmails" | "ownerUserId">, members: NoteWorkspaceMember[]): string[] {
  const byEmail = new Map(members.filter((member) => member.email).map((member) => [member.email, member.uid]));
  const out: string[] = [];
  const add = (uid: string) => { if (uid && uid !== note.ownerUserId && !out.includes(uid)) out.push(uid); };
  for (const uid of note.collaboratorUserIds ?? []) add(clean(uid));
  for (const email of [...(note.sharedWith ?? []), ...(note.collaboratorEmails ?? [])]) add(byEmail.get(cleanEmail(email)) ?? "");
  return out;
}

/** Store-app collaborator emails that no member carries (left the workspace, or typed by hand). */
export function noteUnmatchedCollaboratorEmails(note: Pick<StudioKeepNote, "sharedWith" | "collaboratorEmails">, members: NoteWorkspaceMember[]): string[] {
  const known = new Set(members.map((member) => member.email).filter(Boolean));
  const out: string[] = [];
  for (const email of [...(note.sharedWith ?? []), ...(note.collaboratorEmails ?? [])]) {
    const value = cleanEmail(email);
    if (value && !known.has(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Shared = someone else holds a copy (I own it and have collaborators), or it is someone else's note. */
export function isSharedNote(note: StudioKeepNote, selfUid: string, members: NoteWorkspaceMember[]): boolean {
  if (note.ownerUserId && note.ownerUserId !== selfUid) return true;
  return noteCollaboratorUids(note, members).length > 0;
}

/**
 * Does this save invite the workspace? Only when the owner's note BECOMES "Workspace members"
 * (a new note, or one that was "Only me"). Measured 15 Oct on the live web: re-running the fan-out
 * on every save re-invited a member who had declined (a second bell, the note pending again), and
 * would do the same to someone the owner had just removed or who had left the note. Choosing
 * "Workspace members" again is the explicit way to ask everyone (that includes new members); one
 * person is added from the picker.
 */
export function workspaceFanOutDue(
  previous: Pick<StudioKeepNote, "visibility"> | undefined,
  next: Pick<StudioKeepNote, "visibility" | "isDeleted" | "ownerUserId">,
  selfUid: string
): boolean {
  if (next.visibility !== "workspace" || next.isDeleted) return false;
  if (next.ownerUserId && next.ownerUserId !== selfUid) return false;
  return !previous || previous.visibility !== "workspace";
}

/** "Workspace members" visibility: who still needs an invitation (not me, not suspended, not already in or pending). */
export function workspaceInviteTargets(note: StudioKeepNote, members: NoteWorkspaceMember[], selfUid: string): string[] {
  const inOrPending = new Set([...noteCollaboratorUids(note, members), ...(note.pendingCollaboratorUserIds ?? [])]);
  return pickableNoteMembers(members, selfUid).map((member) => member.uid).filter((uid) => !inOrPending.has(uid));
}

export type NoteInvite = {
  inviteId: string;
  companyId: string;
  noteId: string;
  sourceUserId: string;
  sourceName: string;
  /** The inviter's e-mail as the server stored it; shown with the name so two people of the same name differ. */
  sourceEmail: string;
  title: string;
  preview: string;
  createdAtMillis: number | null;
};

/** The listPersonalNoteCollaborationInvites response, tolerant of older servers (no sourceName). */
export function noteInvitesFromResponse(data: unknown): NoteInvite[] {
  const invites = Array.isArray(asMap(data).invites) ? (asMap(data).invites as unknown[]) : [];
  return invites
    .map((raw) => {
      const row = asMap(raw);
      const preview = asMap(row.notePreview);
      const sourceEmail = cleanEmail(row.sourceEmail);
      return {
        inviteId: clean(row.inviteId) || clean(row.id),
        companyId: clean(row.companyId),
        noteId: clean(row.noteId),
        sourceUserId: clean(row.sourceUserId),
        sourceName: clean(row.sourceName) || (sourceEmail ? sourceEmail.split("@")[0] : ""),
        sourceEmail,
        title: clean(preview.title),
        preview: typeof preview.text === "string" ? preview.text : "",
        createdAtMillis: typeof row.createdAtMillis === "number" ? row.createdAtMillis : null,
      };
    })
    .filter((invite) => invite.inviteId);
}

/**
 * Owner decision, 15 Oct 2026: a member whose workspace role is View Only READS a note shared with them
 * and never changes it — being on the note's collaborator list does not override the role. The role is
 * the workspace's effective role (a custom role counts by its base role; WorkspaceContext.role already
 * resolves it). The note's owner is never read-only on their own note. The server (sync / presence) and
 * the rules (their copy's content) refuse the same thing; this only keeps the screen honest.
 */
export function isViewOnlyWorkspaceRole(role: string | null | undefined): boolean {
  const compact = String(role ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return compact === "viewer" || compact === "viewonly" || compact === "readonly";
}

export function noteIsReadOnlyForMe(note: Pick<StudioKeepNote, "ownerUserId">, selfUid: string, workspaceRole: string | null | undefined): boolean {
  const owner = clean(note.ownerUserId);
  return Boolean(owner) && owner !== clean(selfUid) && isViewOnlyWorkspaceRole(workspaceRole);
}

/** What a read-only copy may still write: this person's own pin, archive, trash, labels and order. Never content. */
export const PERSONAL_NOTE_FIELD_NAMES = ["isPinned", "isArchived", "isDeleted", "labels", "manualOrder"] as const;

export function personalNoteFields(note: Pick<StudioKeepNote, (typeof PERSONAL_NOTE_FIELD_NAMES)[number]>): Record<string, unknown> {
  return {
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    isDeleted: note.isDeleted,
    labels: note.labels,
    manualOrder: note.manualOrder,
  };
}

/** The fields every copy of a shared note carries; a save that changes none of them sends nothing. */
export function sharedContentSignature(note: StudioKeepNote): string {
  return JSON.stringify([
    note.title, note.text, note.colorName, note.links, note.reminderDateMillis,
    note.noteType, note.linkedOrderId, note.linkedOrderLabel, note.linkedCustomerName, note.visibility,
  ]);
}
