# Notes sharing contract (14 Oct 2026)

One contract for web, iPhone/iPad, Mac and Android. The server callables in
`functions/index.js` enforce it. The pure rules live in one module per side, and each
side's tests import that module:

- Server: `functions/personalNoteSharing.js`
- Web: `lib/studioflow/noteSharing.ts`
- Android: `features/notes/NoteSharing.kt`
- Apple: `keepPeople`, `keepCollaboratorUids` and `keepNotePeopleKeys` in `ContentView.swift`

## Why this was written (owner report, 14 Oct)

**What happened.** The owner set notes to "Workspace members". A member who signed in on the
web saw none of those notes. The same member on the Mac app saw them and could approve them.

**Root cause.**
- Sharing is a request followed by an approval. The owner's save creates a *pending
  invitation* for each member. The note reaches a member only after that member accepts.
- The Mac lists pending invitations (`listPersonalNoteCollaborationInvites`) and has
  Accept/Decline. The web had no invitation list, no Accept and no Decline.
- On the web, the bell row for an invitation opened nothing, and so did the push.
- So a web member could never accept, the server never wrote their copy, and their Notes
  list (`personal_notes/{their uid}/notes`) stayed empty.

**Production, read-only, 14 Oct.**
- The 3 notes the owner shared on 12 Oct have 6 invitations, all still `pending`: 2 members × 3 notes.
- None of these invitations has a copy (mirror note) yet.
- 2 of the 6 invitations carry no e-mail. The web sent only `targetUserId`.
- The two members have the `workflow` role with `notes: true`, so the rules let them read their copies.
- The live ruleset (`baeb7a9e`) is correct for this design (`notes-sharing-rules.test.mjs`: 18/18 passed).
- No rule change is needed.

**Other defects found on the way and fixed here.**

*Leaks and security:*
1. `syncSharedPersonalNoteContent` and `setSharedPersonalNoteEditingPresence` treated an
   empty collaborator list as "every member" (`resolvePersonalNoteCollaboratorUserIds`).
   - A note whose lists were empty was written into every member's collection.
   - The fallback also let any member push content into other people's copies.
2. Accept and decline matched the invitation by `request.data.userEmail` whenever the token
   carried no e-mail. Any member could accept someone else's invitation.

*Privacy:*
3. The bell and push text carried the note title: `… invited you to collaborate on a note: <title>`.

*Repeated or lost data:*
4. Android and the web re-invited every member on every save. The server reset an
   accepted share back to `pending` and rang the bell again each time.
5. Android saved with a full `.set()` and the web with a full `setDoc`. Either one wiped
   the server's lists on the owner's copy (`pendingCollaboratorEmails`, …).

*Platform gaps:*
6. Android chose collaborators by typing an e-mail. The invitation then failed when that
   e-mail was not in the Messages member list, which non-Messages workspaces never load.
7. Edits did not reach the other copies from the web or from Android. Only Apple called the sync.
8. iPhone had no way to open the collaborator picker; only Mac and iPad with a pointer did.
9. Only the bell opened Notes. A push tap did not, on iPhone, Android or the web.

## Data model

All paths below are under `companies/{companyId}/`.

### `personal_notes/{uid}/notes/{noteId}`: one copy per person

- The owner's copy is the **source**.
- Each accepted collaborator holds a **copy** with the same `noteId` in their own collection.
- Only the server writes copies.
- `ownerUserId` is the owner's uid on every copy. The rules allow no copy to change it.

| Field | Written by | Meaning |
|---|---|---|
| `collaboratorUserIds` | server only | Accepted collaborators, as uids. **This is the identity.** |
| `pendingCollaboratorUserIds` | server only (source only) | Invited people who have not answered yet. |
| `sharedWith`, `collaboratorEmails` | server, plus the store apps | Legacy display lists. Kept because iOS 2.0 and Android vc11/12 read them. Never used to decide who receives a note, except as a bridge (an e-mail that matches a member counts as that member's uid). |
| `pendingCollaboratorEmails` | server only | Legacy pending list. |
| `title`, `text`, `colorName`, `links`, `reminderDate` | each person's own save; then the server copies them to the others | Shared content. |
| `noteType`, `linked*` | the owner's save, copied to the others; a collaborator's copy never changes them | What the note is about. |
| `visibility` | the owner only; never copied | The owner's sharing setting. A collaborator's "only me" copy once switched the owner's note off during acceptance (fixed before release). |
| `isPinned`, `isArchived`, `isDeleted`, `manualOrder`, `labels` | each person's own save | Belong to that person. **Never copied** to anyone else. |

**Clients never write the four collaborator lists.**
- The web (`keepNoteDocumentFields`) and Android (`saveKeepNote`) save with **merge** and leave those fields out.
- Apple saves with `setData(merge:)` and never writes the uid lists.

### `personal_note_collaboration_invites/{sha1(companyId_noteId_targetUid)}`

- Readable and writable by the server only. The rules say `allow read, write: if false`.
- Fields: `status` (`pending` | `accepted` | `declined` | `revoked`), `targetUserId`,
  `targetEmail`, `sourceUserId`, `sourceName`, `ownerUserId`, and `notePreview`
  (title plus the first 1,200 characters).
- The preview is shown only to the invited person, through the list callable.

## Who can do what

| Action | Who | Callable |
|---|---|---|
| Invite one person | The note's owner, picking from the **workspace member list**. Nobody types an e-mail. | `createPersonalNoteCollaborationInvite(companyId, noteId, targetUserId)` |
| Invite everyone | The owner, by setting visibility to "Workspace members" and saving. The client invites each member who is not already in and not pending. | same, once per person |
| See pending invitations | The invited person, on any app | `listPersonalNoteCollaborationInvites(companyId)` |
| Accept / decline | The invited person: `targetUserId == auth.uid`, never matched by e-mail | `accept…` / `decline…PersonalNoteCollaborationInvite(companyId, inviteId)` |
| Send an edit to the others | The owner, or an accepted collaborator whose workspace role is not View Only (see View Only below) | `syncSharedPersonalNoteContent(companyId, noteId, note)` |
| Editing presence | Same as editing (`isEditing: false` is allowed to anyone on the note, but only clears their own presence when they may not edit) | `setSharedPersonalNoteEditingPresence` |
| Revoke (accepted or pending) | The owner | `removeSharedPersonalNoteFromWorkspaceMember(companyId, noteId, targetUserId)` |
| Leave | The collaborator, passing their own uid | same callable |
| Remove a leftover e-mail | The owner, passing `targetUserId: ""` and `targetEmail` | same callable |
| Direct share, no approval | Not used by any current client. Owner only; uid only. | `sharePersonalNoteWithWorkspaceMember` |

### The member picker (all four apps)

- **Source.** The workspace document's `members` map (key = uid) plus `ownerUid`.
  - Web: `noteMembersFromCompany`.
  - Android: `NoteSharing.membersFromCompany`.
  - Apple: `AuthViewModel.teamMembers`.
- **Never offered:** the signed-in person, and a member listed in `suspendedMembers`.
  - The server checks again: `uidHasCompanyAccess`, which already refuses suspended members.
- **A removed member is not in the map, so is never offered.**

### Rules the server enforces

**Invite**
- **Who can invite:** the caller must own the note (`ownerUserId == auth.uid`).
- **Who can be invited:** the target must be a current, unsuspended member, and not the caller.
- **The note must be saved first.** The server no longer creates a skeleton note to invite into.
- **A repeat is a no-op.** Inviting someone already pending or already accepted returns
  `alreadyPending` / `alreadyShared`. Nothing is reset and no bell or push is sent.
- **Re-inviting after a decline or revoke** creates a new pending invitation.

**Sync and presence**
- **Audience.** The server reads the owner's source and builds the audience:
  - the owner;
  - every uid in `collaboratorUserIds`;
  - every legacy e-mail that matches a member;
  - minus anyone who is no longer a member or is suspended.
- **Never "every member".** An empty collaborator list reaches nobody else.
- **Existing copies only.** The server writes only copies that already exist and carry the
  same `ownerUserId`. It never creates a copy, so a deleted copy is not resurrected.
- **The collaborator lists come from the source.** They are never taken from what the client sent.

**Accept**
- Writes the new copy, with pin, archive, trash and labels reset.
- Adds the uid and the e-mail to the source.
- Clears the pending entries, including a blank e-mail left by the old web code.
- Writes the new list to every other existing copy.

## View Only (owner decision, 15 Oct 2026)

A member whose workspace role is **View Only** (stored `viewer`; a custom role counts by its base role) **reads** a
note shared with them and never changes it. Being picked as a collaborator ("editor") does not override the role. The
note's owner always edits their own note (a View Only member's own notes included). Owner, admin, member and workflow
collaborators edit as before.

- **Server.** `personalNoteSharing.sharedNoteWriteDecision` → `not_collaborator` / `notes_off` / `view_only` / `allow`.
  - `syncSharedPersonalNoteContent`: `view_only` and `notes_off` are refused (`permission-denied`, `details.reason`).
  - `setSharedPersonalNoteEditingPresence`: `isEditing: true` refused the same way; `isEditing: false` allowed, but a
    caller who may not edit clears only their own presence (a role change can leave one behind).
  - `acceptPersonalNoteCollaborationInvite`: works (they may read); the result carries `readOnly`.
- **Rules.** On someone else's note in their own collection, a View Only member cannot change `title`, `text`,
  `colorName`, `links` or `reminderDate` (the reminder compares by the millisecond). Pin, archive, trash, labels and
  order stay theirs.
- **Clients** (one predicate per side, its test imports it: web `noteIsReadOnlyForMe`, Android
  `NoteViewOnly.readOnlySharedNote`, Apple `EGGcraft/NoteViewOnly.swift`):
  - the editor is read-only, with a "Read only" banner and the reason; Close never saves; without a local draft it
    shows the shared version live;
  - no sync, no editing presence;
  - pin / archive / trash / labels / order write only those fields (`update`, so a copy that is gone is not re-created);
  - **draft: kept, shown, never sent.** A draft this device holds for the note stays on the device and is shown under
    "Your unsaved changes are kept on this device but cannot be sent." with "Discard draft". When the role changes
    back, the same draft is editable and saveable again.
- **Role change while Notes is open.** Web: the access watch reloads the page (the open editor's draft is already on
  disk, and the reload is no longer stopped by the "Leave site?" prompt). Android and Apple: the open editor flips to
  or from read-only in place, the typed text stays.

## How a member sees a shared note

1. The owner shares. The member gets a bell row and a push.
2. The member opens Notes on **any** app. A "Collaboration invitations" block with Accept and Decline is
   shown above the notes:
   - Web: polls on open, on focus, every 30 s, and when the bell is tapped.
   - Apple: 8 s, backing off to 120 s; restarts on return to the foreground.
   - Android: 20 s, backing off to 120 s.
3. Accept. The server writes the copy into the member's own collection, and the existing Notes listener shows
   it. No special query is needed: every app lists `personal_notes/{own uid}/notes`.
4. Reopening uses the cached listener (Firestore's persistent cache). The copy is an ordinary document of the
   member's own collection, so it shows offline too.

## Revoke, leave, member removal

- **Revoke:**
  - The person's copy is deleted.
  - A pending invitation becomes `revoked`, and the next list no longer shows it.
  - The remaining copies get the new list.
- **Leave:**
  - Same as revoke, started by the collaborator.
  - A pending invitation becomes `declined`.
- **Member removed or suspended:**
  - The rules close their copies at once. `canAccessOwnPersonalNotes` requires
    `canReadCompany`, which fails for a non-member or a suspended member. This is tested.
  - The sync no longer writes to them.
  - The owner still sees the person in the collaborator list as "No longer a member" and can remove them.
  - An invitation from someone who is no longer a member is not offered (list), and cannot be accepted.

## Bell and push privacy

**The text**
- Invitation: `"<sender name> invited you to collaborate on a note."`
- Share: `"<sender name> shared a note with you."`
- Never the note's title or text. The test guards that the message is built without the title.

**The routing**
- `route: "notes"` opens Notes on every app:
  - web: bell and service worker;
  - Apple: bell and `NotificationManager.storeRoute`;
  - Android: bell `PendingActivityNavigation.Notes`, and push extra `studio_open_notes`.
- The sender's name comes from the workspace member map. An e-mail is shown only as its local part.

## Store apps (iOS 2.0, Android vc11/12)

The store apps call the same callables, with the same arguments.

**What changes for them:**
- A repeated invite no longer resets anything.
- An e-mail-only target is resolved to a uid.
- The leak through an empty list is closed.

**What stays as it was until they update:**
- Android vc11/12 still saves with a full `.set()`. The uid list on the owner's copy can then
  drop. The audience falls back to the e-mail lists, which that same save carries.
- Android vc11/12 does not sync edits.

## Data migration (e-mail → uid)

- `functions/scripts/notes-sharing-migrate-dry-run.js` is read-only.
- For each copy with e-mail collaborators, it prints the `collaboratorUserIds` the e-mails resolve to through
  the member map, and the e-mails that resolve to nobody.
- No write path exists in the script. A real migration is a separate decision.
- The new server code already treats a legacy e-mail that matches a member as that member's uid. Nothing
  breaks if the migration never runs.
