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

  // B5 (6 Nov 2026): a suspended member is offered only while on the order (so they can be taken off it).
  const sue = { id: "sue-uid", email: "sue@example.test", displayName: "Sue", isOwner: false, role: "member", suspended: true };
  const cat = { id: "cat-uid", email: "cat@example.test", displayName: "Cat", isOwner: false, role: "member", suspended: false };
  const withSue = [owner, ann, sue, cat];
  ok(`B5 a suspended member not on the order is not offered (got ${ids(projectAssigneeOptions(withSue, { uid: "owner-uid", isOwner: true }))})`,
    ids(projectAssigneeOptions(withSue, { uid: "owner-uid", isOwner: true })) === "owner-uid,ann-uid,cat-uid");
  ok("B5 same with an explicit empty order list", ids(projectAssigneeOptions(withSue, { uid: "owner-uid", isOwner: true }, [])) === "owner-uid,ann-uid,cat-uid");
  ok("B5 a suspended member ON the order keeps their row, in place",
    ids(projectAssigneeOptions(withSue, { uid: "owner-uid", isOwner: true }, ["ann-uid", "sue-uid"])) === "owner-uid,ann-uid,sue-uid,cat-uid");
  ok("B5 order uids are trimmed", ids(projectAssigneeOptions(withSue, { uid: "owner-uid", isOwner: true }, [" sue-uid "])) === "owner-uid,ann-uid,sue-uid,cat-uid");
  ok("B5 a member who may assign gets the same rule (no owner row)",
    ids(projectAssigneeOptions(withSue, { uid: "ann-uid", isOwner: false }, ["sue-uid"])) === "ann-uid,sue-uid,cat-uid"
    && ids(projectAssigneeOptions(withSue, { uid: "ann-uid", isOwner: false })) === "ann-uid,cat-uid");
  ok("B5 suspended:false and a missing flag are both offered", ids(projectAssigneeOptions([ann, cat], { uid: "x", isOwner: false })) === "ann-uid,cat-uid");
  ok("B5 the kept row is the member itself (flag kept for the label)", projectAssigneeOptions(withSue, { uid: "owner-uid", isOwner: true }, ["sue-uid"])
    .find((m) => m.id === "sue-uid")?.suspended === true);
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
ok("B5 orders list menu passes the order's people", list.includes("}, orderAssigneeUids(contextOrder))"));
ok("B5 order view passes the order's people", detail.includes('}, orderAssigneeKey ? orderAssigneeKey.split("\\n") : []),'));
ok("B5 both menus mark a kept suspended row with the translated \"No access\"",
  list.includes('{member.suspended ? ` · ${t("No access")}` : ""}') && detail.includes('{member.suspended ? ` · ${t("No access")}` : ""}'));
ok("who may assign is unchanged (orders list)", list.includes('return normalizeWorkspaceRole(workspace.role) === "owner" ||\n    (canDeleteOrdersForRole(workspace.role) && workspaceAccessAllows(workspace.memberAccess, "manageProjectAssignments"));'));
ok("who may assign is unchanged (order view)", detail.includes('normalizeWorkspaceRole(workspace.role) === "owner" ||\n      (canDeleteOrdersForRole(workspace.role) && workspaceAccessAllows(workspace.memberAccess, "manageProjectAssignments"))'));

// --- 3. the workload label
const LABEL = "Assigned active work (unassigned not counted)";
const schedule = read("app/schedule/page.tsx");
ok("Team Schedule total uses the new label", schedule.includes(`<span>{t("${LABEL}")}</span><strong>{teamTotalActive}</strong>`));
ok("the old label is gone from the page", !schedule.includes('t("Total active work")'));
ok("the count is unchanged", schedule.includes("const teamTotalActive = teamMembers.reduce((sum, member) => sum + memberActiveCount(member.id), 0);")
  // MULTI-ASSIGN (4 Nov 2026): a member's count is every active order they are on, not only those naming them first.
  && schedule.includes("const memberActiveCount = (memberId: string) => orders.filter(order => isOrderAssignee(order, memberId) && !orderIsClosed(order)).length;"));
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
