import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext, WorkspaceMemberAccess } from "@/lib/studioflow/firestore";

// Inviting somebody by email, and the page they land on.
//
// The token in the URL is the credential. It is never stored here, never put in
// application state longer than the request, and the preview it buys is
// deliberately thin: a workspace name, who sent it, and the address it was sent
// to. Everything else waits until the person has signed in as that address.

export type InvitationPreview = {
  companyName: string;
  invitedByName: string;
  email: string;
  role: string;
  status: string;
  expiresAtMs: number;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedByName: string;
  emailSent: boolean;
  createdAtMs: number;
  expiresAtMs: number;
};

type PreviewResult = {
  ok: boolean;
  reason: string;
  message: string;
  invitation: InvitationPreview | null;
};

/** What the accept page can show before anybody signs in. */
export async function previewInvitation(token: string): Promise<PreviewResult> {
  const call = httpsCallable<{ token: string }, PreviewResult>(functions, "previewWorkspaceInvitation");
  const response = await call({ token });
  return response.data;
}

/** Joins the workspace. The signed-in account's email must be the invited one;
 *  the server refuses otherwise, in a sentence worth showing as-is. */
export async function acceptInvitation(token: string): Promise<{ companyId: string; companyName: string }> {
  const call = httpsCallable<{ token: string }, { companyId: string; companyName: string }>(
    functions,
    "acceptWorkspaceInvitation"
  );
  const response = await call({ token });
  return response.data;
}

export async function inviteWorkspaceMember(
  workspace: WorkspaceContext,
  input: { email: string; role: string; access?: WorkspaceMemberAccess }
): Promise<{ message: string; emailSent: boolean; acceptUrl: string }> {
  const call = httpsCallable<Record<string, unknown>, { message: string; emailSent: boolean; acceptUrl: string }>(
    functions,
    "inviteWorkspaceMember"
  );
  const response = await call({
    companyId: workspace.id,
    email: input.email.trim(),
    role: input.role,
    ...(input.access ? { access: input.access } : {})
  });
  return response.data;
}

export async function listWorkspaceInvitations(workspace: WorkspaceContext): Promise<PendingInvitation[]> {
  const call = httpsCallable<{ companyId: string }, { invitations: PendingInvitation[] }>(
    functions,
    "listWorkspaceInvitations"
  );
  const response = await call({ companyId: workspace.id });
  return response.data.invitations ?? [];
}

export async function revokeWorkspaceInvitation(workspace: WorkspaceContext, invitationId: string): Promise<string> {
  const call = httpsCallable<{ companyId: string; invitationId: string }, { message: string }>(
    functions,
    "revokeWorkspaceInvitation"
  );
  const response = await call({ companyId: workspace.id, invitationId });
  return response.data.message;
}
