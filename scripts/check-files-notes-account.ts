// GN-01 / GN-02 / GN-03 (22 Oct 2026), web side.
//   npx tsx scripts/check-files-notes-account.ts
// 1. Files selection: pruned to the shown rows, one workspace, "select all shown",
//    bulk = ticked AND shown; drop helpers; the shared upload refusal order;
//    sequential bulk keeps every failure.
// 2. Note faces: owner / accepted / pending, never me, one per uid, legacy e-mails,
//    hue and initials vectors (the same numbers as Swift and Kotlin), "+N" stack.
// 3. Source wiring: the Files screens use the helpers (no bulk share, no new
//    callable), the stray-drop guard, the notes card stack, the account block.
// 4. Every new string resolves in Türkçe, Deutsch and العربية (Arabic).
// Exit 1 on any miss.
import fs from "fs";
import path from "path";
import {
  emptyFileSelection,
  filesFromDrop,
  dragCarriesFiles,
  pruneFileSelection,
  runBulkSequentially,
  selectedRows,
  selectionForWorkspace,
  selectionScope,
  toggleAllShown,
  toggleFileSelected,
  uploadBatchRefusal,
} from "../lib/studioflow/fileSelection";
import {
  noteAvatarHue,
  noteAvatarInitials,
  noteAvatarPeople,
  noteAvatarPersonText,
  noteAvatarStack,
  noteMembersFromCompany,
} from "../lib/studioflow/noteSharing";
import { FILES_NOTES_ACCOUNT_TRANSLATIONS } from "../lib/studioflow/filesNotesAccountTranslations";
import { studioT } from "../lib/studioflow/language";

let checks = 0;
let failures = 0;
const check = (ok: boolean, what: string) => {
  checks += 1;
  if (ok) console.log(`PASS ${what}`);
  else { failures += 1; console.error(`FAIL ${what}`); }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const root = path.join(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

async function main() {
  // ---- 1. selection -------------------------------------------------------
  let sel = emptyFileSelection("w1");
  sel = toggleFileSelected(sel, "a");
  sel = toggleFileSelected(sel, "b");
  sel = toggleFileSelected(sel, "c", true);
  check(same([...sel.ids].sort(), ["a", "b", "c"]), "toggle adds three ids");
  sel = toggleFileSelected(sel, "b");
  check(same([...sel.ids].sort(), ["a", "c"]), "toggle removes a ticked id");
  check(toggleFileSelected(sel, "c", true).ids.has("c"), "explicit select keeps an id selected");
  const pruned = pruneFileSelection(sel, ["a", "x"]);
  check(same([...pruned.ids], ["a"]), "search change: a hidden row leaves the selection");
  check(pruneFileSelection(pruned, ["a", "x"]) === pruned, "prune returns the same object when nothing changed");
  check(selectionForWorkspace(pruned, "w1") === pruned, "same workspace keeps the selection");
  check(selectionForWorkspace(pruned, "w2").ids.size === 0 && selectionForWorkspace(pruned, "w2").workspaceId === "w2", "another workspace starts empty");
  check(selectionScope(emptyFileSelection("w1"), ["a", "b"]) === "none", "scope none");
  check(selectionScope({ workspaceId: "w1", ids: new Set(["a"]) }, ["a", "b"]) === "some", "scope some");
  check(selectionScope({ workspaceId: "w1", ids: new Set(["a", "b", "z"]) }, ["a", "b"]) === "all", "scope all (extra hidden id does not matter)");
  check(selectionScope({ workspaceId: "w1", ids: new Set(["a"]) }, []) === "none", "empty list is none");
  const all = toggleAllShown({ workspaceId: "w1", ids: new Set(["a"]) }, ["a", "b", "c"]);
  check(same([...all.ids].sort(), ["a", "b", "c"]), "select all shown ticks every shown row");
  const cleared = toggleAllShown(all, ["a", "b", "c"]);
  check(cleared.ids.size === 0, "select all shown again clears them");
  const keepHidden = toggleAllShown({ workspaceId: "w1", ids: new Set(["a", "b", "h"]) }, ["a", "b"]);
  check(same([...keepHidden.ids], ["h"]), "clearing the shown rows does not touch other ids");
  const rows = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
  check(same(selectedRows({ workspaceId: "w", ids: new Set(["r3", "r1", "gone"]) }, rows).map((r) => r.id), ["r1", "r3"]), "bulk rows = ticked AND shown, in shown order");

  // drop helpers
  const fileA = { name: "a.pdf", size: 10 } as unknown as File;
  const folder = { name: "folder", size: 0 } as unknown as File;
  const fileB = { name: "b.png", size: 20 } as unknown as File;
  const dropped = filesFromDrop({
    types: ["Files"],
    files: [fileA, folder, fileB],
    items: [
      { kind: "file", webkitGetAsEntry: () => ({ isDirectory: false }) },
      { kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) },
      { kind: "file", webkitGetAsEntry: () => ({ isDirectory: false }) },
    ],
  });
  check(dropped.files.length === 2 && dropped.skippedFolders === 1, "a dropped folder is left out and counted");
  check(filesFromDrop({ types: ["Files"], files: [fileA, fileB] }).files.length === 2, "no items list: every file is kept");
  check(filesFromDrop(null).files.length === 0, "no transfer: nothing");
  check(dragCarriesFiles({ types: ["Files", "text/plain"] }) && !dragCarriesFiles({ types: ["text/plain"] }) && !dragCarriesFiles(null), "only a drag carrying Files counts");

  const base = { canUpload: true, orderId: "o1", orderExists: true, files: [{ size: 5 }], maxSizeMB: 1, policyAllows: true };
  check(uploadBatchRefusal(base) === null, "a valid batch is queued");
  check(uploadBatchRefusal({ ...base, canUpload: false })?.startsWith("Client Files upload is available") === true, "role/plan refusal comes first");
  check(uploadBatchRefusal({ ...base, orderId: "" }) === "Choose an order before uploading.", "no order");
  check(uploadBatchRefusal({ ...base, orderExists: false })?.startsWith("That order is no longer") === true, "order from another workspace / deleted");
  check(uploadBatchRefusal({ ...base, files: [] }) === "Choose a file to upload.", "no files");
  check(uploadBatchRefusal({ ...base, policyAllows: false }) === "Accept the upload policy in this browser before uploading.", "policy not accepted");
  check(uploadBatchRefusal({ ...base, files: [{ size: 5 }, { size: 2 * 1024 * 1024 }] }) === "This file is larger than the 1 MB workspace upload limit.", "one large file refuses the batch (same text as before)");
  check(uploadBatchRefusal({ ...base, files: [{ size: 1024 * 1024 }] }) === null, "exactly the limit is allowed");

  const calls: string[] = [];
  const outcome = await runBulkSequentially(
    [{ id: "1", n: "one" }, { id: "2", n: "two" }, { id: "1", n: "one" }, { id: "3", n: "three" }],
    (row) => row.n,
    async (row) => { calls.push(row.id); if (row.id === "2") throw new Error("permission-denied"); if (row.id === "3") throw "x"; }
  );
  check(same(calls, ["1", "2", "3"]), "sequential bulk runs each file once, in order (duplicate id skipped)");
  check(outcome.requested === 3 && outcome.succeeded === 1, "requested 3, succeeded 1");
  check(same(outcome.failed.map((row) => [row.id, row.label, row.message]), [["2", "two", "permission-denied"], ["3", "three", "Could not be completed."]]), "each failure keeps its name and reason");

  // ---- 2. note faces ------------------------------------------------------
  const company = {
    ownerUid: "uid-owner",
    ownerEmail: "boss@x.com",
    members: {
      "uid-owner": { email: "boss@x.com", displayName: "Boss Person", photoURL: "https://img.example/boss.png" },
      "uid-a": { email: "ayse@x.com", displayName: "Ayşe Kaya", photoURL: "http://insecure.example/a.png" },
      "uid-b": { email: "ayse.k@y.com", displayName: "Ayşe Kaya" },
      "uid-me": { email: "me@x.com", displayName: "Me Myself" },
      "uid-p": { email: "pending@x.com", name: "Pat Pending", avatarURL: "https://img.example/p.png" },
    },
  };
  const members = noteMembersFromCompany(company);
  check(members.find((m) => m.uid === "uid-owner")?.photoURL === "https://img.example/boss.png", "owner photo read from the members map");
  check(members.find((m) => m.uid === "uid-a")?.photoURL === "", "a non-https photo is not used");
  check(members.find((m) => m.uid === "uid-p")?.photoURL === "https://img.example/p.png", "avatarURL is read too");
  const note = {
    ownerUserId: "uid-owner", ownerEmail: "boss@x.com", ownerName: "Boss",
    collaboratorUserIds: ["uid-b", "uid-a", "uid-me"],
    pendingCollaboratorUserIds: ["uid-p", "uid-a"],
    sharedWith: ["old@x.com", "me@x.com"], collaboratorEmails: ["ayse@x.com"],
  };
  const asMember = noteAvatarPeople(note, members, "uid-me", "me@x.com");
  check(same(asMember.map((p) => [p.key, p.status]), [
    ["uid-owner", "owner"],
    ["uid-b", "accepted"],
    ["uid-a", "accepted"],
    ["email:old@x.com", "accepted"],
    ["uid-p", "pending"],
  ]), "collaborator's view: owner, accepted (label, then identity, by code unit: ayse.k@ < ayse@), legacy e-mail, pending; never me; uid-a not twice");
  const a = asMember.find((p) => p.uid === "uid-a")!;
  const b = asMember.find((p) => p.uid === "uid-b")!;
  check(a.label === b.label && a.initials === "AK" && b.initials === "AK", "two people with the same name share initials …");
  check(a.identity === "ayse@x.com" && b.identity === "ayse.k@y.com" && a.hue !== b.hue, "… but differ by identity and colour");
  check(noteAvatarPersonText(asMember[0]) === "Boss Person (boss@x.com) — Owner", "owner face text");
  check(noteAvatarPersonText(asMember[4]) === "Pat Pending (pending@x.com) — Invitation pending", "pending face text");
  check(noteAvatarPersonText(asMember[3]) === "old (old@x.com) — Shared", "legacy e-mail face text");
  const asOwner = noteAvatarPeople(note, members, "uid-owner", "boss@x.com");
  check(!asOwner.some((p) => p.uid === "uid-owner") && asOwner.some((p) => p.uid === "uid-me"), "owner's view: no owner face, the collaborator is shown");
  const revoked = noteAvatarPeople({ ...note, collaboratorUserIds: ["uid-a"], pendingCollaboratorUserIds: [], sharedWith: [], collaboratorEmails: [] }, members, "uid-owner", "boss@x.com");
  check(same(revoked.map((p) => p.key), ["uid-a"]), "after a revoke the lists shrink and the face goes (nothing cached)");
  const unknownOwner = noteAvatarPeople({ ...note, ownerUserId: "uid-gone", ownerEmail: "gone@x.com", ownerName: "Gone Owner", collaboratorUserIds: [], pendingCollaboratorUserIds: [], sharedWith: [], collaboratorEmails: [] }, members, "uid-me", "me@x.com");
  check(same(unknownOwner.map((p) => [p.key, p.label, p.identity, p.status]), [["uid-gone", "Gone Owner", "gone@x.com", "owner"]]), "an owner no longer in the members map falls back to the note's owner fields");
  check(noteAvatarPeople({ ...note, ownerUserId: "uid-me", collaboratorUserIds: [], pendingCollaboratorUserIds: [], sharedWith: [], collaboratorEmails: [] }, members, "uid-me", "me@x.com").length === 0, "my own unshared note: no faces");

  check(same(["uid-a", "uid-b", "uid-owner", "email:old@x.com", "", "ÄÖü-ğ", "qa-member-uid"].map(noteAvatarHue), [355, 174, 63, 107, 61, 153, 203]), "hue vectors (FNV-1a 32 over UTF-16, mod 360) — same as Swift/Kotlin");
  check(same([
    noteAvatarInitials("Ayşe Kaya", "a@x.com"), noteAvatarInitials("ayse", ""), noteAvatarInitials("", "zed@x.com"),
    noteAvatarInitials("", ""), noteAvatarInitials("  Ömer   faruk  Y ", ""),
  ], ["AK", "A", "Z", "?", "ÖF"]), "initials vectors");
  const five = Array.from({ length: 5 }, (_, index) => ({ ...asMember[0], key: `k${index}` }));
  check(noteAvatarStack(five).shown.length === 3 && noteAvatarStack(five).overflow === 2, "5 people: 3 faces + \"+2\" (four circles)");
  check(noteAvatarStack(five.slice(0, 4)).shown.length === 4 && noteAvatarStack(five.slice(0, 4)).overflow === 0, "4 people: 4 faces, no chip");

  // ---- 3. source wiring ---------------------------------------------------
  const files = read("app/files/page.tsx");
  const library = read("app/files/FilesLibraryView.tsx");
  const notes = read("app/notes/page.tsx");
  const shell = read("components/AppShell.tsx");
  const css = read("app/globals.css");
  check(/const chosen = selectedRows\(selection, filteredSortedFiles\);/.test(files), "classic delete runs on ticked AND shown");
  check(/pruneFileSelection\(selectionForWorkspace\(previous, workspace\?\.id \?\? ""\), shownFileIds\)/.test(files), "classic selection pruned per workspace and search");
  check(/deleteClientFilesBatchForOrders\(/.test(files), "classic bulk delete still goes through the batch callable");
  check((files.match(/queueUploadsForOrder\(/g) ?? []).length >= 3, "pick and both drops share one queue path");
  check(/event\.defaultPrevented \|\| !dragCarriesFiles/.test(files) && /window\.addEventListener\("drop", refuseStrayFileDrop\)/.test(files), "a stray drop cannot open the file in the tab");
  check(/aria-label=\{t\("Select all in this order"\)\}/.test(files), "per-order select all kept");
  check(/runBulkSequentially\(/.test(library) && /trashLibraryFile\(workspace, file\.id\)/.test(library) && /restoreLibraryFile\(workspace, file\.id\)/.test(library), "library bulk trash / restore use the existing callables");
  check(!/runBulk\("share"|shareLibraryFileWithOrder\(workspace, file\.id/.test(library), "no bulk share (FIN-01 gap not widened)");
  check(/const canTickRows = canEdit && \(inTrash \|\| canDelete\);/.test(library), "library ticking follows the single-file gates");
  check(/uploads\.enqueue\(dropped, \{ kind: "new" \}\)/.test(library), "library drop uses the library upload queue");
  check(/<NoteAvatarStack people=\{avatars\} \/>/.test(notes) && !/👥 \{t\("Shared"\)\}/.test(notes), "notes card draws the faces instead of the count line");
  check(/noteAvatarPeople\(note, members, user\.uid, user\.email \?\? ""\)/.test(notes), "faces come from the live note + members");
  check(/onClick=\{\(event\) => event\.stopPropagation\(\)\}/.test(notes.slice(notes.indexOf("function NoteAvatarStack"))), "clicking the faces never opens or changes the note");
  check(/\.note-avatar\.is-pending \{[^}]*dashed/.test(css) && /\.note-avatar\.is-owner \{/.test(css), "pending and owner rings styled");
  check(/memberCanAccess\(workspace, "settings"\) && canEditWorkspaceSettingsForRole\(workspace\?\.role \?\? ""\)/.test(shell), "Workspace settings gate = Mac/Android (owner, admin, member)");
  check(/\[sidebarUserRole, workspace\?\.name\?\.trim\(\)\]\.filter\(Boolean\)\.join\(" · "\)/.test(shell), "block prints role · workspace like the natives");
  check(/aria-label=\{`\$\{t\("Account"\)\}: /.test(shell), "account button's accessible name carries the person and workspace");
  check(/onKeyDown=\{handleAccountMenuKeys\}/.test(shell) && /event\.key === "ArrowDown"/.test(shell) && /event\.key === "Home"/.test(shell), "menu arrow / Home / End keys");
  check(/if \(event\.key === "Escape"\) setAvatarMenuOpen\(false\);/.test(shell), "Escape still closes (rail-menu check pattern kept)");
  check(/className="app-sidebar-settings-shortcut"[\s\S]{0,200}onClick=\{\(\) => openSettingsSection\(\)\}/.test(shell), "drawer gear opens Settings in one tap");
  check(/\.app-sidebar-settings-shortcut \{ display: none; \}/.test(css) && /@media \(max-width: 1023px\) \{\s*\.app-sidebar-user \{ display: flex;/.test(css), "gear only in the drawer (< 1024 px)");
  check(/people\.length === 1 \? t\("Shared with 1 person"\)/.test(notes), "one person reads in the singular");
  check(/setBulkFailures\(\[\]\);\s*\}, \[view\]\);/.test(library), "a view change clears the last run's failure list");

  // ---- 4. translations ----------------------------------------------------
  const keys = Object.keys(FILES_NOTES_ACCOUNT_TRANSLATIONS);
  check(keys.length >= 30, `translation table has ${keys.length} keys`);
  for (const language of ["Türkçe", "Deutsch", "العربية (Arabic)"] as const) {
    const missing = keys.filter((key) => studioT(key, language) === key);
    check(missing.length === 0, `${language}: every new string translated through studioT${missing.length ? ` (missing: ${missing.join(" | ")})` : ""}`);
  }
  for (const key of keys) {
    const placeholders = (key.match(/\{[a-z]+\}/g) ?? []).sort().join(",");
    const row = FILES_NOTES_ACCOUNT_TRANSLATIONS[key];
    const bad = Object.entries(row).filter(([, value]) => ((value ?? "").match(/\{[a-z]+\}/g) ?? []).sort().join(",") !== placeholders);
    if (bad.length) check(false, `placeholders kept in every language for "${key}" (${bad.map(([l]) => l).join(", ")})`);
  }
  check(Object.values(FILES_NOTES_ACCOUNT_TRANSLATIONS).every((row) => Object.keys(row).length === 11), "every row has eleven languages");
  for (const used of ["Select all {count} files in this list", "Shared with {count} people", "Invitation pending", "Move selected to trash"]) {
    check(files.includes(`"${used}"`) || library.includes(`"${used}"`) || notes.includes(`"${used}"`) || read("lib/studioflow/noteSharing.ts").includes(`"${used}"`), `string in use: ${used}`);
  }

  console.log(`check-files-notes-account: ${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
}

void main();
