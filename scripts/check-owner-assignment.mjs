// N16 (15 Oct 2026, owner's decision): the owner can assign a job to
// themselves; everyone else's list and rights stay as they were; the Team
// Schedule workload total says unassigned jobs are not counted.
//
// 1. lib/studioflow/projectAssignees.ts projectAssigneeOptions — the very
//    function both menus call — run on an owner, an admin/member who may
//    assign, a workspace whose owner entry has no e-mail, and odd inputs.
// 2. Both "Assign Project" menus (orders list, order view) call it and no
//    longer drop the owner for everyone with `.filter(member => !member.isOwner)`.
// 3. The workload total's label says unassigned jobs are not counted, in all
//    11 languages through the real studioT (deep merge, Mac table last); the
//    count (memberActiveCount summed over the listed people) is unchanged.
//
//   node scripts/check-owner-assignment.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const ok = (name, condition) => {
  checks += 1;
  if (!condition) failures.push(name);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "owner-assignment-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};

// --- 1. the function
const modulePath = "lib/studioflow/projectAssignees.ts";
if (!fs.existsSync(path.join(root, modulePath))) {
  checks += 1;
  failures.push(`${modulePath} does not exist`);
} else {
  compile(modulePath, "projectAssignees");
  const { projectAssigneeOptions } = await import(pathToFileURL(path.join(tmp, "projectAssignees.mjs")).href);
  const owner = { id: "owner-uid", email: "owner@example.test", displayName: "Olive Owner", isOwner: true, role: "owner" };
  const ann = { id: "ann-uid", email: "ann@example.test", displayName: "Ann", isOwner: false, role: "member" };
  const bob = { id: "bob-uid", email: "bob@example.test", displayName: "Bob", isOwner: false, role: "workflow" };
  const team = [owner, ann, bob];
  const ids = (list) => list.map((m) => m.id).join(",");

  const asOwner = projectAssigneeOptions(team, { uid: "owner-uid", isOwner: true, email: "owner@example.test" });
  ok(`owner sees self first, then the team (got ${ids(asOwner)})`, ids(asOwner) === "owner-uid,ann-uid,bob-uid");
  ok("owner row keeps the stored e-mail", asOwner[0].email === "owner@example.test");
  ok("owner row keeps its other fields", asOwner[0].role === "owner" && asOwner[0].isOwner === true);

  const asAdmin = projectAssigneeOptions(team, { uid: "ann-uid", isOwner: false, email: "ann@example.test" });
  ok(`a member who may assign sees the same list as before — no owner (got ${ids(asAdmin)})`, ids(asAdmin) === "ann-uid,bob-uid");
  ok("before-and-after equality for a non-owner", ids(asAdmin) === ids(team.filter((m) => !m.isOwner)));

  const noEmailOwner = { ...owner, email: "", displayName: "" };
  const rebuilt = projectAssigneeOptions([noEmailOwner, ann], { uid: "owner-uid", isOwner: true, email: "owner@example.test", displayName: "Olive Owner" });
  ok("owner entry without e-mail takes the signed-in e-mail", rebuilt[0].email === "owner@example.test");
  ok("owner entry without a name takes the signed-in name", rebuilt[0].displayName === "Olive Owner");

  ok("an owner whose uid is not the owner entry's gets no extra row", ids(projectAssigneeOptions(team, { uid: "someone-else", isOwner: true })) === "ann-uid,bob-uid");
  ok("a blank viewer uid gets no owner row", ids(projectAssigneeOptions(team, { uid: " ", isOwner: true })) === "ann-uid,bob-uid");
  ok("an owner alone in the workspace is offered themselves", ids(projectAssigneeOptions([owner], { uid: "owner-uid", isOwner: true })) === "owner-uid");
  ok("an empty team stays empty", projectAssigneeOptions([], { uid: "owner-uid", isOwner: true }).length === 0);
  ok("the input list is not changed", ids(team) === "owner-uid,ann-uid,bob-uid" && team[0].email === "owner@example.test");
}

// --- 2. the two menus
const list = read("app/orders/page.tsx");
const detail = read("app/orders/OrderDetailContent.tsx");
ok("orders list imports projectAssigneeOptions", list.includes('import { projectAssigneeOptions } from "@/lib/studioflow/projectAssignees";'));
ok("orders list menu calls projectAssigneeOptions(teamMembers, …)", list.includes("{projectAssigneeOptions(teamMembers, {"));
ok("orders list no longer drops the owner for everyone", !/teamMembers\s*\.filter\(member => !member\.isOwner\)/.test(list));
ok("orders list passes whether the viewer is the owner", list.includes('isOwner: Boolean(workspace && normalizeWorkspaceRole(workspace.role) === "owner")'));
ok("order view imports projectAssigneeOptions", detail.includes('import { projectAssigneeOptions } from "@/lib/studioflow/projectAssignees";'));
ok("order view builds assignableMembers with projectAssigneeOptions", /const assignableMembers = useMemo\(\s*\(\) => projectAssigneeOptions\(teamMembers, \{/.test(detail));
ok("order view no longer drops the owner for everyone", !detail.includes("teamMembers.filter(member => !member.isOwner)"));
ok("who may assign is unchanged (orders list)", list.includes('return normalizeWorkspaceRole(workspace.role) === "owner" ||\n    (canDeleteOrdersForRole(workspace.role) && workspaceAccessAllows(workspace.memberAccess, "manageProjectAssignments"));'));
ok("who may assign is unchanged (order view)", detail.includes('normalizeWorkspaceRole(workspace.role) === "owner" ||\n      (canDeleteOrdersForRole(workspace.role) && workspaceAccessAllows(workspace.memberAccess, "manageProjectAssignments"))'));

// --- 3. the workload label
const LABEL = "Assigned active work (unassigned not counted)";
const schedule = read("app/schedule/page.tsx");
ok("Team Schedule total uses the new label", schedule.includes(`<span>{t("${LABEL}")}</span><strong>{teamTotalActive}</strong>`));
ok("the old label is gone from the page", !schedule.includes('t("Total active work")'));
ok("the count is unchanged", schedule.includes("const teamTotalActive = teamMembers.reduce((sum, member) => sum + memberActiveCount(member.id), 0);")
  && schedule.includes("const memberActiveCount = (memberId: string) => orders.filter(order => (order.assignedToUid || \"\").trim() === memberId && !orderIsClosed(order)).length;"));
const tables = ["language", ...new Set([...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1]))];
for (const name of tables) {
  if (fs.existsSync(path.join(root, `lib/studioflow/${name}.ts`))) compile(`lib/studioflow/${name}.ts`, name);
}
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const languages = SUPPORTED_STUDIO_LANGUAGES.filter((l) => l !== "English");
ok(`11 non-English languages (got ${languages.length})`, languages.length === 11);
for (const lang of languages) {
  const out = studioT(LABEL, lang);
  ok(`label has a ${lang} translation`, out !== LABEL && out.trim().length > 0);
}
ok("English stays English", studioT(LABEL, "English") === LABEL);
ok("Türkçe reads as written", studioT(LABEL, "Türkçe") === "Atanmış aktif iş (atanmamışlar sayılmaz)");

if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS ${checks} checks`);
