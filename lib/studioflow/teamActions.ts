import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import {
  WORKSPACE_MEMBER_ACCESS_DEFAULTS,
  type JoinRequestDetail,
  type TeamMemberDetail,
  type WorkspaceContext,
  type WorkspaceCustomRole,
  type WorkspaceMemberAccess
} from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export const WEB_TEAM_ROLES = [
  { value: "member", label: "Member" },
  { value: "viewer", label: "View Only" },
  { value: "workflow", label: "Workflow Only" }
] as const;

export type WebTeamRole = (typeof WEB_TEAM_ROLES)[number]["value"];

export type TeamMemberInput = {
  uid: string;
  email?: string;
  displayName?: string;
  role?: string;
  access?: WorkspaceMemberAccess;
};

type CallableResult = {
  ok?: boolean;
  message?: string;
  [key: string]: unknown;
};

function normalizeRole(role: string): string {
  const clean = role.trim().toLowerCase();
  if (/^custom_[a-z0-9_-]{6,64}$/i.test(role.trim())) return role.trim();
  if (clean === "viewer") return "viewer";
  if (clean === "workflow") return "workflow";
  return "member";
}

function callableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Team action failed. Please try again.";
}

function normalizeAccess(access: WorkspaceMemberAccess): WorkspaceMemberAccess {
  return {
    ...WORKSPACE_MEMBER_ACCESS_DEFAULTS,
    ...access
  };
}

async function callTeamFunction(name: string, payload: Record<string, unknown>) {
  try {
    return await withWebSyncStatus(async () => {
      const callable = httpsCallable<Record<string, unknown>, CallableResult>(functions, name);
      const response = await callable(payload);
      if (response.data?.ok === false) {
        throw new Error(response.data.message || "Team action was not allowed.");
      }
      return response.data;
    }, "Saving team changes to cloud.");
  } catch (error) {
    throw new Error(callableError(error));
  }
}

export async function approveJoinRequest(workspace: WorkspaceContext, request: JoinRequestDetail, role: string) {
  return callTeamFunction("approveWorkspaceJoinRequest", {
    companyId: workspace.id,
    requestId: request.id,
    role: normalizeRole(role)
  });
}

export async function declineJoinRequest(workspace: WorkspaceContext, request: JoinRequestDetail) {
  return callTeamFunction("declineWorkspaceJoinRequest", {
    companyId: workspace.id,
    requestId: request.id
  });
}

export async function requestWorkspaceAccess(ownerIdentifier: string) {
  const cleanIdentifier = ownerIdentifier.trim();
  return callTeamFunction("requestWorkspaceAccess", {
    ownerIdentifier: cleanIdentifier,
    ownerCompanyId: cleanIdentifier
  });
}

export async function addTeamMember(workspace: WorkspaceContext, input: TeamMemberInput) {
  return callTeamFunction("addWorkspaceTeamMember", {
    companyId: workspace.id,
    memberUid: input.uid,
    email: input.email || "",
    displayName: input.displayName || "",
    role: normalizeRole(input.role || "member"),
    access: input.access ? normalizeAccess(input.access) : undefined
  });
}

export async function updateTeamMemberProfile(workspace: WorkspaceContext, member: TeamMemberDetail, profile: { displayName: string; email: string }) {
  return callTeamFunction("updateWorkspaceMemberProfile", {
    companyId: workspace.id,
    memberUid: member.id,
    displayName: profile.displayName,
    email: profile.email
  });
}

export async function saveWorkspaceCustomRole(workspace: WorkspaceContext, role: Partial<WorkspaceCustomRole> & { name: string; access: WorkspaceMemberAccess }) {
  return callTeamFunction("saveWorkspaceCustomRole", {
    companyId: workspace.id,
    roleId: role.id || "",
    name: role.name,
    baseRole: role.baseRole || "member",
    access: normalizeAccess(role.access)
  });
}

export async function deleteWorkspaceCustomRole(workspace: WorkspaceContext, role: WorkspaceCustomRole) {
  return callTeamFunction("deleteWorkspaceCustomRole", {
    companyId: workspace.id,
    roleId: role.id
  });
}

export async function updateTeamMemberRole(workspace: WorkspaceContext, member: TeamMemberDetail, role: string) {
  return callTeamFunction("updateWorkspaceMemberRole", {
    companyId: workspace.id,
    memberUid: member.id,
    role: normalizeRole(role)
  });
}

export async function updateTeamMemberAccess(workspace: WorkspaceContext, member: TeamMemberDetail, access: WorkspaceMemberAccess) {
  return callTeamFunction("updateWorkspaceMemberAccess", {
    companyId: workspace.id,
    memberUid: member.id,
    access: normalizeAccess(access)
  });
}

export async function removeTeamMember(workspace: WorkspaceContext, member: TeamMemberDetail) {
  return callTeamFunction("removeWorkspaceTeamMember", {
    companyId: workspace.id,
    memberUid: member.id
  });
}

export async function syncAcceptedJoinRequests(workspace: WorkspaceContext) {
  return callTeamFunction("syncWorkspaceAcceptedJoinRequests", {
    companyId: workspace.id
  });
}
