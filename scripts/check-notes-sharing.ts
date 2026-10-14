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
  noteCollaboratorUids,
  noteInvitesFromResponse,
  noteMembersFromCompany,
  noteUnmatchedCollaboratorEmails,
  pickableNoteMembers,
  workspaceInviteTargets,
} from "../lib/studioflow/noteSharing";
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

// 2. Collaborators as uids
check(noteCollaboratorUids(note({ collaboratorUserIds: ["bea"], collaboratorEmails: ["ALI@studio.test", "gone@x.test"] }), members).join(",") === "bea,ali", "uid list + store-app emails bridged to uids");
check(noteUnmatchedCollaboratorEmails(note({ collaboratorEmails: ["ali@studio.test", "gone@x.test"] }), members).join(",") === "gone@x.test", "an email no member carries is reported, not guessed");
check(!isSharedNote(note(), "own", members), "a note without collaborators is not shared");
check(isSharedNote(note({ collaboratorUserIds: ["ali"] }), "own", members), "owner + accepted collaborator = shared");
check(isSharedNote(note(), "ali", members), "someone else's note in my list = shared");

// 3. Workspace fan-out
check(workspaceInviteTargets(note({ visibility: "workspace" }), members, "own").join(",") === "ali,bea", "workspace: every active member but me");
check(workspaceInviteTargets(note({ visibility: "workspace", collaboratorUserIds: ["ali"], pendingCollaboratorUserIds: ["bea"] }), members, "own").length === 0, "workspace: nobody already in or pending is asked again");

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
check(!page.includes('"createPersonalNoteCollaborationInvite"'), "the page does not call the invite callable without the shared wrapper");
const invites = noteInvitesFromResponse({ invites: [{ id: "i1", companyId: "c", noteId: "n1", sourceEmail: "olive@x.test", notePreview: { title: "Plan", text: "Body" } }] });
check(invites.length === 1 && invites[0].sourceName === "olive" && invites[0].title === "Plan", "an older server's invitation (no sourceName) still reads");

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
