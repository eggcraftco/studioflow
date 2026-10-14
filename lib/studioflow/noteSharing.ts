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
    });
  }
  return Array.from(out.values());
}

export function noteMemberLabel(member: Pick<NoteWorkspaceMember, "name" | "email" | "uid">): string {
  return member.name || (member.email ? member.email.split("@")[0] : "") || member.uid.slice(0, 6);
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
        title: clean(preview.title),
        preview: typeof preview.text === "string" ? preview.text : "",
        createdAtMillis: typeof row.createdAtMillis === "number" ? row.createdAtMillis : null,
      };
    })
    .filter((invite) => invite.inviteId);
}

/** The fields every copy of a shared note carries; a save that changes none of them sends nothing. */
export function sharedContentSignature(note: StudioKeepNote): string {
  return JSON.stringify([
    note.title, note.text, note.colorName, note.links, note.reminderDateMillis,
    note.noteType, note.linkedOrderId, note.linkedOrderLabel, note.linkedCustomerName, note.visibility,
  ]);
}
