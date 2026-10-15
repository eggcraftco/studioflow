// Notes sharing contract (docs/notes-sharing-contract-2026-10-14.md), web side.
// npx tsx scripts/check-notes-sharing.ts — imports the modules the page uses.
//   1. the picker offers workspace members by uid, never the signed-in person or a suspended member;
//   2. collaborators are uids (store-app emails bridged through the member map);
//   3. "workspace" visibility invites only people not already in or pending;
//   4. the save never writes the collaborator lists (the server owns them) and merges;
//   5. the Notes page has an invitation inbox with Accept/Decline and no email field for people;
//   6. the bell and the push open Notes for a note invitation;
//   7. every new string has all eleven languages.
// Exit 1 on any miss.
import fs from "fs";
import path from "path";
import { keepNoteDocumentFields, keepNoteFromDoc, type StudioKeepNote } from "../lib/studioflow/noteDocument";
import {
  isSharedNote,
  isViewOnlyWorkspaceRole,
  noteIsReadOnlyForMe,
  personalNoteFields,
  PERSONAL_NOTE_FIELD_NAMES,
  noteCollaboratorUids,
  noteInvitesFromResponse,
  noteMemberIdentity,
  noteMemberLabel,
  noteMembersFromCompany,
  noteUnmatchedCollaboratorEmails,
  pickableNoteMembers,
  workspaceFanOutDue,
  workspaceInviteTargets,
} from "../lib/studioflow/noteSharing";
import { accessLost, memberAccessFingerprint } from "../lib/studioflow/accessWatch";
import { NOTES_SHARING_TRANSLATIONS } from "../lib/studioflow/notesSharingTranslations";
import { studioT } from "../lib/studioflow/language";

let failures = 0;
let checks = 0;
const check = (ok: boolean, what: string) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } else console.log(`PASS ${what}`); };
const root = path.join(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const company = {
  ownerUid: "own",
  ownerEmail: "owner@studio.test",
  members: {
    own: { email: "owner@studio.test", displayName: "Olive", role: "owner" },
    ali: { email: "Ali@Studio.test", displayName: "Ali", role: "workflow" },
    bea: { email: "bea@studio.test", displayName: "Bea", role: "member" },
    sue: { email: "sue@studio.test", displayName: "Sue", role: "member" },
  },
  suspendedMembers: { sue: { at: 1 } },
};
const members = noteMembersFromCompany(company);

function note(overrides: Partial<StudioKeepNote> = {}): StudioKeepNote {
  return {
    id: "n1", title: "T", text: "B", colorName: "default", ownerUserId: "own", ownerEmail: "", ownerName: "",
    sharedWith: [], collaboratorEmails: [], collaboratorUserIds: [], pendingCollaboratorUserIds: [],
    activeEditorUserId: "", activeEditorEmail: "", activeEditorUpdatedAtMillis: null,
    isPinned: false, isArchived: false, isDeleted: false, labels: [], links: [], reminderDateMillis: null, manualOrder: 1,
    createdAtMillis: 1, updatedAtMillis: 2, noteType: "personal", linkedOrderId: "", linkedOrderLabel: "", linkedCustomerName: "",
    visibility: "only_me", ...overrides,
  };
}

// 1. Picker
check(members.length === 4 && members[0].uid === "own" && members[0].isOwner, "members: owner first, then the members map");
check(members.find((m) => m.uid === "ali")?.email === "ali@studio.test", "member emails are normalised");
const pick = pickableNoteMembers(members, "own").map((m) => m.uid);
check(pick.join(",") === "ali,bea", `owner's picker = other active members (${pick.join(",")})`);
check(!pickableNoteMembers(members, "ali").some((m) => m.uid === "ali"), "nobody is offered themselves");
check(pickableNoteMembers(members, "ali").some((m) => m.uid === "own"), "a member can pick the owner");

// 1b. Two people with the same name (15 Oct): the picker offers both, and every row tells them apart
const twins = noteMembersFromCompany({
  ownerUid: "own",
  members: {
    own: { email: "owner@studio.test", displayName: "Olive", role: "owner" },
    a1: { email: "ali.k@studio.test", displayName: "Ali", role: "workflow" },
    a2: { email: "ali.y@studio.test", displayName: "Ali", role: "workflow" },
    a3: { displayName: "Ali", role: "member" },
  },
});
const twinPick = pickableNoteMembers(twins, "own");
check(twinPick.length === 3 && new Set(twinPick.map(noteMemberLabel)).size === 1, "same-name members are all offered (same label)");
check(new Set(twinPick.map(noteMemberIdentity)).size === 3, `each same-name member has its own identity line (${twinPick.map(noteMemberIdentity).join(" | ")})`);
check(noteMemberIdentity(twins.find((m) => m.uid === "a3")!) === "ID a3", "a member without an e-mail is told apart by a short id");
const twinInvite = noteInvitesFromResponse({ invites: [{ inviteId: "i2", sourceUserId: "a1", sourceName: "Ali", sourceEmail: "ali.k@studio.test" }] });
check(twinInvite[0].sourceEmail === "ali.k@studio.test", "an invitation keeps the inviter's e-mail for the inbox");

// 2. Collaborators as uids
check(noteCollaboratorUids(note({ collaboratorUserIds: ["bea"], collaboratorEmails: ["ALI@studio.test", "gone@x.test"] }), members).join(",") === "bea,ali", "uid list + store-app emails bridged to uids");
check(noteUnmatchedCollaboratorEmails(note({ collaboratorEmails: ["ali@studio.test", "gone@x.test"] }), members).join(",") === "gone@x.test", "an email no member carries is reported, not guessed");
check(!isSharedNote(note(), "own", members), "a note without collaborators is not shared");
check(isSharedNote(note({ collaboratorUserIds: ["ali"] }), "own", members), "owner + accepted collaborator = shared");
check(isSharedNote(note(), "ali", members), "someone else's note in my list = shared");

// 3. Workspace fan-out
check(workspaceInviteTargets(note({ visibility: "workspace" }), members, "own").join(",") === "ali,bea", "workspace: every active member but me");
check(workspaceInviteTargets(note({ visibility: "workspace", collaboratorUserIds: ["ali"], pendingCollaboratorUserIds: ["bea"] }), members, "own").length === 0, "workspace: nobody already in or pending is asked again");

// 3b. The fan-out runs only when the owner's note BECOMES "Workspace members" (15 Oct: every save
// re-invited a member who had declined, and would re-invite one the owner removed or who left)
check(workspaceFanOutDue(undefined, note({ visibility: "workspace" }), "own"), "fan-out: a new workspace note invites");
check(workspaceFanOutDue(note({ visibility: "only_me" }), note({ visibility: "workspace" }), "own"), "fan-out: Only me → Workspace members invites");
check(!workspaceFanOutDue(note({ visibility: "workspace" }), note({ visibility: "workspace", text: "edited" }), "own"), "fan-out: an ordinary edit of a workspace note invites nobody (a decline / removal / leave sticks)");
check(!workspaceFanOutDue(note({ visibility: "workspace" }), note({ visibility: "workspace", isPinned: true }), "own"), "fan-out: a pin does not invite");
check(!workspaceFanOutDue(undefined, note({ visibility: "workspace", ownerUserId: "own" }), "ali"), "fan-out: never from someone else's copy");
check(!workspaceFanOutDue(undefined, note({ visibility: "workspace", isDeleted: true }), "own"), "fan-out: never for a trashed note");

// 3c. Access lost (removed / suspended / gone) wipes the browser cache before the reload; a narrower access does not
const accessCompany = { ownerUid: "own", members: { ali: { role: "workflow" } }, memberAccess: { ali: { notes: true } } };
check(!accessLost(memberAccessFingerprint(accessCompany, "c", "ali")), "access: a current member has not lost access");
check(accessLost(memberAccessFingerprint({ ownerUid: "own", members: {} }, "c", "ali")), "access: removed from the members map = lost");
check(accessLost(memberAccessFingerprint({ ...accessCompany, suspendedMembers: { ali: { at: 1 } } }, "c", "ali")), "access: suspended = lost");
check(accessLost("absent") && !accessLost("owner"), "access: a missing workspace document = lost; the owner never");
const provider = read("lib/auth/AuthProvider.tsx");
check(/reloadForAccessChange\(companyId, true\)/.test(provider) && /clearFirestoreLocalCache\(\)\.finally/.test(provider), "access: a refused watch clears the Firestore cache, then reloads");

// 4. Save fields
const written = keepNoteDocumentFields(note({ collaboratorUserIds: ["ali"], sharedWith: ["ali@studio.test"], collaboratorEmails: ["ali@studio.test"] }));
for (const key of ["collaboratorUserIds", "pendingCollaboratorUserIds", "sharedWith", "collaboratorEmails", "pendingCollaboratorEmails"]) {
  check(!(key in written), `the save does not write ${key}`);
}
const back = keepNoteFromDoc("n1", { collaboratorUserIds: ["ali", 3, ""], pendingCollaboratorUserIds: ["bea"] });
check(back.collaboratorUserIds.join(",") === "ali" && back.pendingCollaboratorUserIds.join(",") === "bea", "the uid lists are read back, junk dropped");
check(/setDoc\(ref, \{[\s\S]*?\}, \{ merge: true \}\)/.test(read("lib/studioflow/notes.ts")), "saveKeepNote merges");

// 5. Page
const page = read("app/notes/page.tsx");
check(!/type="email"/.test(page), "no email field for collaborators on the Notes page");
check(page.includes("listNoteInvites(") && page.includes("acceptNoteInvite(") && page.includes("declineNoteInvite("), "the Notes page lists, accepts and declines invitations");
check(page.includes('data-testid="note-invites"'), "the invitation inbox is rendered");
check(page.includes("removeNoteMember(") && page.includes("inviteNoteMember("), "invite and revoke go through the callables");
check(page.includes("syncSharedNote("), "edits to a shared note are sent to the other copies");
check((page.match(/noteMemberIdentity\(/g) ?? []).length >= 5, "picker, collaborator, pending, owner and inbox rows all show the identity line");
check(/workspaceFanOutDue\(stored, finalized, user\.uid\)/.test(page), "the page invites the workspace only through workspaceFanOutDue");
check(/listenToKeepNotes\(workspace\.id, user\.uid, setNotes, \(/.test(page) && /permission-denied/.test(page), "a refused Notes listener empties the list and closes the editor");
check(page.includes('t("This note is no longer shared with you.")') && page.includes("clearNoteDraft(workspace.id, user.uid, editing.id)"), "an open shared note whose copy is gone closes, its draft dropped");
check(page.includes('data-testid="note-shared-by"'), "a shared copy names its owner instead of Type / Visibility choices");
const keepBoth = page.slice(page.indexOf("async function saveDraftAsNewNote"), page.indexOf("async function destroy("));
check(/visibility: "only_me"/.test(keepBoth) && /draft\.noteType === "team" \? "personal"/.test(keepBoth), "a conflict copy (Keep both) is private: Only me, never a Team note");
check(!page.includes(">\\u2302 {"), "no raw \\u2302 escape in JSX text");
check(page.includes("data-invite-from="), "the invitation inbox names the inviter's identity, not only the name");
check(!page.includes('"createPersonalNoteCollaborationInvite"'), "the page does not call the invite callable without the shared wrapper");
const invites = noteInvitesFromResponse({ invites: [{ id: "i1", companyId: "c", noteId: "n1", sourceEmail: "olive@x.test", notePreview: { title: "Plan", text: "Body" } }] });
check(invites.length === 1 && invites[0].sourceName === "olive" && invites[0].title === "Plan", "an older server's invitation (no sourceName) still reads");

// 5b. View Only (owner decision 15 Oct 2026): a shared note is read-only for a View Only member, whatever the
// note's collaborator list says; the owner of a note is never read-only on it; no other role is affected.
const shared = note({ ownerUserId: "own", collaboratorUserIds: ["ali", "vic"] });
check(!noteIsReadOnlyForMe(shared, "own", "owner"), "view only: the owner edits their own note");
check(!noteIsReadOnlyForMe(shared, "ali", "member") && !noteIsReadOnlyForMe(shared, "ali", "admin") && !noteIsReadOnlyForMe(shared, "ali", "workflow"), "view only: member / admin / workflow collaborators edit");
for (const spelling of ["viewer", "viewOnly", "readonly", "View Only", "view_only"]) {
  check(noteIsReadOnlyForMe(shared, "vic", spelling), `view only: a "${spelling}" collaborator only reads`);
}
check(!noteIsReadOnlyForMe(note({ ownerUserId: "vic" }), "vic", "viewer"), "view only: a View Only member edits a note of their own");
check(!noteIsReadOnlyForMe(note({ ownerUserId: "" }), "vic", "viewer"), "view only: a new (ownerless) note is theirs");
check(!isViewOnlyWorkspaceRole("member") && !isViewOnlyWorkspaceRole("") && !isViewOnlyWorkspaceRole(undefined), "view only: other roles are not View Only");
const personal = personalNoteFields(note({ isPinned: true, labels: ["x"], manualOrder: 3, title: "T", text: "B", colorName: "yellow", reminderDateMillis: 5 }));
check(Object.keys(personal).sort().join(",") === [...PERSONAL_NOTE_FIELD_NAMES].sort().join(","), `view only: a read-only copy writes only ${Object.keys(personal).sort().join(",")}`);
for (const content of ["title", "text", "colorName", "links", "reminderDate", "noteType", "linkedOrderId", "visibility", "ownerUserId"]) {
  check(!(content in personal), `view only: the personal write leaves ${content} alone`);
}
const notesLib = read("lib/studioflow/notes.ts");
const personalSave = notesLib.slice(notesLib.indexOf("export async function saveKeepNotePersonalState"), notesLib.indexOf("export async function uploadKeepNoteImage"));
check(/updateDoc\(/.test(personalSave) && !/setDoc\(/.test(personalSave) && /personalNoteFields\(note\)/.test(personalSave), "view only: the personal write is an update (a revoked copy is not re-created) of the personal fields only");
const saveBody = page.slice(page.indexOf("async function save(note: StudioKeepNote"), page.indexOf("async function shareNoteWithWorkspace"));
const roIndex = saveBody.indexOf("if (readOnlyNote(finalized))");
check(roIndex >= 0 && roIndex < saveBody.indexOf("saveKeepNote(") && roIndex < saveBody.indexOf("syncSharedNote(") && roIndex < saveBody.indexOf("workspaceFanOutDue("), "view only: save() routes a read-only copy to the personal write before any content save, sync or invite");
check(/saveKeepNotePersonalState\(workspace\.id, user\.uid, finalized\)/.test(saveBody) && /return;\n    \}/.test(saveBody.slice(roIndex)), "view only: the read-only branch returns after the personal write");
check(/noteIsReadOnlyForMe\(note, user\.uid, workspace\.role\)/.test(page), "view only: the page reads the workspace's effective role");
check(/readOnly=\{readOnlyNote\(notes\.find\(\(n\) => n\.id === editing\.id\) \?\? editing\)\}/.test(page), "view only: the editor is told, from the live copy");
const editor = page.slice(page.indexOf("function NoteEditor("), page.indexOf("function ProjectNotesView("));
check(editor.includes('data-testid="note-read-only"') && editor.includes('t("Your role in this workspace is View Only. You can read this note but not change it.")'), "view only: the editor says why it is read-only");
check(/readOnly=\{readOnly\}/.test(editor) && (editor.match(/onChange=\{\(e\) => \{ if \(!readOnly\)/g) ?? []).length === 2, "view only: title and body are read-only inputs (still selectable)");
check(/if \(saving \|\| readOnly\) return;/.test(editor), "view only: the draft mirror never writes or clears a draft while read-only");
check(/async function submit\(force = false\) \{\n    if \(readOnly\) \{ onClose\(\); return; \}/.test(editor), "view only: closing never saves");
check(editor.includes('data-testid="note-read-only-draft"') && editor.includes('t("Your unsaved changes are kept on this device but cannot be sent.")') && /onClick=\{discardDraft\}/.test(editor), "view only: a kept draft is shown, never sent, and can be discarded");
check(/accessReloadRef\.current/.test(editor) && /studio-access-reload/.test(editor) && /dispatchEvent\(new Event\("studio-access-reload"\)\)/.test(provider), "view only: a role-change reload does not stop on the leave-page prompt");
const card = page.slice(page.indexOf("function NoteCard("), page.indexOf("function localDateInputValue("));
check(/\{!readOnly && \(\n        <div style=\{\{ position: "relative" \}\}>/.test(card) && card.includes('data-testid="note-card-read-only"'), "view only: the card offers no colour / reminder change and says Read only");

// 6. Bell + push
check(/route === "notes"/.test(read("components/NotificationsDrawer.tsx")), "the bell opens Notes for a note invitation");
check(/data\.route === "notes"/.test(read("public/firebase-messaging-sw.js")), "a note push opens Notes");

// 7. Languages
const languages = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"] as const;
for (const [key, row] of Object.entries(NOTES_SHARING_TRANSLATIONS)) {
  const missing = languages.filter((language) => !(row as Record<string, string>)[language]);
  check(missing.length === 0, `"${key}" has all eleven languages`);
  check(studioT(key, "Türkçe") !== key || key === "Owner", `"${key}" resolves in Turkish`);
}
for (const used of page.match(/t\("([^"]+)"\)/g) ?? []) {
  const key = used.slice(3, -2);
  if (key in NOTES_SHARING_TRANSLATIONS) check(studioT(key, "Deutsch") !== key, `page string "${key}" resolves in German`);
}

if (failures) { console.error(`${failures} of ${checks} notes sharing checks failed.`); process.exit(1); }
console.log(`All ${checks} notes sharing checks passed.`);
