// Who "Assign Project" offers (N16, 15 Oct 2026, owner's decision).
//
// The owner may assign a job to themselves. Until now both project menus (the
// orders list's right-click "Assign Project" and the order view's control)
// dropped the owner for everyone, so a new Team workspace offered only
// "Unassigned" — while the task picker and the Team Schedule both listed the
// owner. Nothing else changes: a member who may assign projects
// (manageProjectAssignments) sees exactly the list they saw before, the owner
// excluded; who may assign at all is decided elsewhere (orders/page.tsx
// normalizeWorkspaceAssignmentAccess, the server's canManageProjectAssignments).
//
// The owner's own row comes first. Its e-mail falls back to the signed-in
// e-mail when the workspace record carries none (an owner entry rebuilt from
// ownerUid alone), so the order still names who holds it.
//
// Pure, so scripts/check-owner-assignment.mjs runs this very function.
//
// B5 (6 Nov 2026, multi-assignee platform test): a SUSPENDED member (the seat
// limit or the owner took their access; suspendedMembers) is no longer offered.
// They have no access to the workspace and the server refuses to put them on an
// order (updateWebOrder: "Select a workspace member for this project."), yet both
// menus listed them, so the only thing a click could do was fail. One exception:
// a suspended person who is still ON this order (`onOrder`, the order's assignee
// uids — assignment is kept through a suspension by design) keeps their row,
// ticked, so they can be taken off it.

export type ProjectAssigneeMember = {
  id: string;
  email: string;
  displayName: string;
  isOwner: boolean;
  /** No workspace access (suspendedMembers). Optional: older callers pass members without it. */
  suspended?: boolean;
};

export type ProjectAssigneeViewer = {
  uid: string;
  isOwner: boolean;
  email?: string | null;
  displayName?: string | null;
};

export function projectAssigneeOptions<M extends ProjectAssigneeMember>(
  members: readonly M[],
  viewer: ProjectAssigneeViewer,
  onOrder: readonly string[] = []
): M[] {
  const keep = new Set(onOrder.map(uid => String(uid || "").trim()).filter(Boolean));
  const offered = members.filter(member => member.suspended !== true || keep.has(member.id));
  const others = offered.filter(member => !member.isOwner);
  const viewerUid = (viewer.uid || "").trim();
  if (!viewer.isOwner || !viewerUid) return others;
  const self = offered.find(member => member.isOwner && member.id === viewerUid);
  if (!self) return others;
  const email = self.email.trim() || (viewer.email || "").trim();
  const displayName = self.displayName.trim() || (viewer.displayName || "").trim();
  return [{ ...self, email, displayName }, ...others];
}
