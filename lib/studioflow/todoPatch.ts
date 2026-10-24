import type { UpdateOrderInput } from "./orders";

type TodoPatch = NonNullable<UpdateOrderInput["todo"]>;

/**
 * ETSY-E2E r2 (24 Oct 2026): adding a To-do failed on every plan without Team.
 * The web always sent assignedToUid / assignedToEmail (as "" without Team), and
 * updateWebOrder refuses ANY To-do patch carrying those keys unless the workspace
 * has Team ("To Do assignment is available on NivaDesk Team."). The keys are sent
 * only when the person can assign (canSeeTeamAssignment).
 */
export function todoAddPatch(input: {
  title: string;
  priority: string;
  dueDate: string;
  canAssign: boolean;
  assignedToUid?: string;
  assignedToEmail?: string;
}): TodoPatch {
  const patch: TodoPatch = { action: "add", title: input.title, priority: input.priority, dueDate: input.dueDate };
  if (input.canAssign) {
    const uid = String(input.assignedToUid ?? "");
    patch.assignedToUid = uid;
    patch.assignedToEmail = uid ? String(input.assignedToEmail ?? "") : "";
  }
  return patch;
}

/** An assignment change, or null when the workspace cannot assign (the server would refuse it). */
export function todoAssignPatch(taskId: string, uid: string, email: string, canAssign: boolean): TodoPatch | null {
  if (!canAssign) return null;
  return { action: "update", taskId, assignedToUid: uid, assignedToEmail: email };
}
