// MULTI-ASSIGN (4 Nov 2026): lib/studioflow/orderAssignees.ts against the same cases as the server module
// (functions orders/assignees.js) and the native contract. Run: npm run test:order-assignees
import assert from "node:assert/strict";
import {
  MAX_ORDER_ASSIGNEES, assigneeDetailsPatch, assigneeUidsFromData, isOrderAssignee, orderAssigneeUids, toggledAssigneeUids
} from "../lib/studioflow/orderAssignees.ts";

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log("PASS", name); } catch (error) { failures.push(name); console.log("FAIL", name, "-", (error as Error).message); }
}

check("legacy order: the first person only", () => assert.deepEqual(orderAssigneeUids({ assignedToUid: "a" }), ["a"]));
check("unassigned order: nobody", () => assert.deepEqual(orderAssigneeUids({}), []));
check("list + first person: first person first, cleaned, unique", () =>
  assert.deepEqual(orderAssigneeUids({ assignedToUid: "b", assigneeUids: ["a", "b", " c "] }), ["b", "a", "c"]));
check("server lag: a first person missing from the list still counts", () =>
  assert.deepEqual(orderAssigneeUids({ assignedToUid: "x", assigneeUids: ["a"] }), ["x", "a"]));
check("isOrderAssignee: anyone on the list; blank never", () => {
  assert.equal(isOrderAssignee({ assignedToUid: "a", assigneeUids: ["a", "c"] }, "c"), true);
  assert.equal(isOrderAssignee({ assignedToUid: "a" }, "b"), false);
  assert.equal(isOrderAssignee({ assigneeUids: [""] }, ""), false);
});
check("toggle: tick appends, untick removes, the 11th is refused", () => {
  assert.deepEqual(toggledAssigneeUids({ assignedToUid: "a", assigneeUids: ["a", "b"] }, "c"), ["a", "b", "c"]);
  assert.deepEqual(toggledAssigneeUids({ assignedToUid: "a", assigneeUids: ["a", "b"] }, "a"), ["b"]);
  const ten = Array.from({ length: MAX_ORDER_ASSIGNEES }, (_, i) => `u${i}`);
  assert.deepEqual(toggledAssigneeUids({ assignedToUid: "u0", assigneeUids: ten }, "u10"), ten);
});
check("stored list from Firestore data: only strings, unique", () =>
  assert.deepEqual(assigneeUidsFromData(["a", 3, null, "a", " b "]), ["a", "b"]));
check("updateWebOrder details: the list plus the first person for an older server", () => {
  assert.deepEqual(assigneeDetailsPatch(["b", "a"], (uid) => `${uid}@x`), { assigneeUids: ["b", "a"], assignedToUid: "b", assignedToEmail: "b@x" });
  assert.deepEqual(assigneeDetailsPatch([], () => "never"), { assigneeUids: [], assignedToUid: "", assignedToEmail: "" });
});

console.log(`order-assignees: ${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
