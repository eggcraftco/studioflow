/**
 * ETSY-E2E r2 (24 Oct 2026): adding a To-do failed on every plan without Team —
 * the web sent assignedToUid/assignedToEmail ("" without Team) and updateWebOrder
 * refuses any To-do patch carrying those keys unless the workspace has Team.
 *
 * Run: npm run test:todo-patch   (npx tsx scripts/check-todo-patch.mts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const lib = await import("../lib/studioflow/todoPatch").catch(() => ({})) as Record<string, any>;
const need = (name: string) => { assert.equal(typeof lib[name], "function", `lib/studioflow/todoPatch.ts: ${name} missing`); return lib[name]; };
const detail = readFileSync(join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
const addFn = detail.slice(detail.indexOf("function addTodoItem()"), detail.indexOf("function startEditingTodoTitle("));
const assignFn = detail.slice(detail.indexOf("function assignTodoTask("), detail.indexOf("function setTodoDueDate("));

check("non-Team workspace: the add patch has NO assignedTo* keys", () => {
  const patch = need("todoAddPatch")({ title: "Glaze", priority: "Normal", dueDate: "", canAssign: false, assignedToUid: "u1", assignedToEmail: "a@b.c" });
  assert.deepEqual(patch, { action: "add", title: "Glaze", priority: "Normal", dueDate: "" });
  assert.equal("assignedToUid" in patch || "assignedToEmail" in patch, false);
});
check("Team workspace: the add patch carries the assignee (or empty = unassigned)", () => {
  assert.deepEqual(need("todoAddPatch")({ title: "Glaze", priority: "High", dueDate: "2026-10-30", canAssign: true, assignedToUid: "u1", assignedToEmail: "a@b.c" }),
    { action: "add", title: "Glaze", priority: "High", dueDate: "2026-10-30", assignedToUid: "u1", assignedToEmail: "a@b.c" });
  assert.deepEqual(need("todoAddPatch")({ title: "Glaze", priority: "Normal", dueDate: "", canAssign: true, assignedToUid: "", assignedToEmail: "x@y.z" }),
    { action: "add", title: "Glaze", priority: "Normal", dueDate: "", assignedToUid: "", assignedToEmail: "" });
});
check("assignment change is not sent without Team", () => {
  assert.equal(need("todoAssignPatch")("t1", "u1", "a@b.c", false), null);
  assert.deepEqual(need("todoAssignPatch")("t1", "u1", "a@b.c", true), { action: "update", taskId: "t1", assignedToUid: "u1", assignedToEmail: "a@b.c" });
});
check("the order screen builds its To-do patches with these helpers (no unconditional assignedTo* keys)", () => {
  assert.match(addFn, /saveTodoPatch\(todoAddPatch\(\{/);
  assert.match(addFn, /canAssign: canSeeTeamAssignment/);
  assert.doesNotMatch(addFn, /assignedToUid: canSeeTeamAssignment \? newTodoAssignedToUid : ""/);
  assert.match(assignFn, /todoAssignPatch\(task\.id, uid, email, canSeeTeamAssignment\)/);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
