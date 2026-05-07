import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { JoinRequestDetail, TeamMemberDetail, WorkspaceContext } from "@/lib/studioflow/firestore";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export const WEB_TEAM_ROLES = [
  { value: "member", label: "Member" },
  { value: "viewer", label: "View Only" },
  { value: "workflow", label: "Workflow Only" }
] as const;

export type WebTeamRole = (typeof WEB_TEAM_ROLES)[number]["value"];

type CallableResult = {
  ok?: boolean;
  message?: string;
  [key: string]: unknown;
};

function normalizeRole(role: string): WebTeamRole {
  const clean = role.trim().toLowerCase();
  if (clean === "viewer") return "viewer";
  if (clean === "workflow") return "workflow";
  return "member";
}

function callableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Team action failed. Please try again.";
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

export async function updateTeamMemberRole(workspace: WorkspaceContext, member: TeamMemberDetail, role: string) {
  return callTeamFunction("updateWorkspaceMemberRole", {
    companyId: workspace.id,
    memberUid: member.id,
    role: normalizeRole(role)
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
