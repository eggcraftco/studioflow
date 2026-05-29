"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CustomRoleManager } from "@/components/CustomRoleManager";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadTeamAccessData,
  loadWorkspaceContext,
  type JoinRequestDetail,
  type TeamMemberDetail,
  type WorkspaceCustomRole,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import {
  approveJoinRequest,
  deleteWorkspaceCustomRole,
  declineJoinRequest,
  removeTeamMember,
  requestWorkspaceAccess,
  saveWorkspaceCustomRole,
  syncAcceptedJoinRequests,
  updateTeamMemberRole,
  WEB_TEAM_ROLES
} from "@/lib/studioflow/teamActions";

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function memberLabel(member: TeamMemberDetail) {
  return member.displayName || member.email || member.id;
}

function requestLabel(request: JoinRequestDetail) {
  return request.requesterEmail || request.requesterDisplayName || request.requesterUid;
}

function roleOptionLabel(role: string) {
  return WEB_TEAM_ROLES.find(option => option.value === role)?.label ?? "Member";
}

function roleOptionsWithCustom(customRoles: WorkspaceCustomRole[]) {
  return [
    ...WEB_TEAM_ROLES,
    ...customRoles.map(role => ({ value: role.id, label: role.name }))
  ];
}

export default function TeamPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [members, setMembers] = useState<TeamMemberDetail[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestDetail[]>([]);
  const [customRoles, setCustomRoles] = useState<WorkspaceCustomRole[]>([]);
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});
  const [requestOwnerIdentifier, setRequestOwnerIdentifier] = useState("");
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [actioning, setActioning] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  async function refreshTeam(currentUser = user) {
    if (!currentUser) return;
    setLoadingTeam(true);
    setError("");
    try {
      const workspaceContext = await loadWorkspaceContext(currentUser.uid);
      if (workspaceContext.role.toLowerCase() === "owner") {
        try {
          await syncAcceptedJoinRequests(workspaceContext);
        } catch (syncError) {
          console.warn("Team access sync skipped:", syncError);
        }
      }
      const teamData = await loadTeamAccessData(workspaceContext);
      setWorkspace(workspaceContext);
      setMembers(teamData.members);
      setJoinRequests(teamData.joinRequests);
      setCustomRoles(teamData.customRoles);
      setRequestRoles(previous => {
        const next = { ...previous };
        teamData.joinRequests.forEach(request => {
          if (!next[request.id]) next[request.id] = "member";
        });
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load team access.");
    } finally {
      setLoadingTeam(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!user) return;
      setLoadingTeam(true);
      setError("");
      try {
        const workspaceContext = await loadWorkspaceContext(user.uid);
        if (!cancelled) setWorkspace(workspaceContext);

        if (!workspaceContext.entitlements.features.team_access) {
          if (!cancelled) {
            setMembers([]);
            setJoinRequests([]);
            setCustomRoles([]);
            setRequestRoles({});
          }
          return;
        }

        if (workspaceContext.role.toLowerCase() === "owner") {
          try {
            await syncAcceptedJoinRequests(workspaceContext);
          } catch (syncError) {
            console.warn("Team access sync skipped:", syncError);
          }
        }
        const teamData = await loadTeamAccessData(workspaceContext);
        if (!cancelled) {
          setMembers(teamData.members);
          setJoinRequests(teamData.joinRequests);
          setCustomRoles(teamData.customRoles);
          setRequestRoles(() => Object.fromEntries(teamData.joinRequests.map(request => [request.id, "member"])));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load team access.");
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isOwner = workspace?.role.toLowerCase() === "owner";
  const hasTeamPlan = Boolean(workspace?.entitlements.features.team_access);
  const canManageTeam = Boolean(isOwner && hasTeamPlan && workspace);
  const teamLimit = workspace?.billingTeamMemberLimit ?? workspace?.entitlements.teamMemberLimit ?? 1;
  const currentMemberCount = members.length;
  const limitText = teamLimit > 9999 ? "Unlimited" : `${currentMemberCount} / ${teamLimit}`;
  const roleOptions = useMemo(() => roleOptionsWithCustom(customRoles), [customRoles]);

  const roleCounts = useMemo(() => {
    return members.reduce<Record<string, number>>((acc, member) => {
      acc[member.roleLabel] = (acc[member.roleLabel] ?? 0) + 1;
      return acc;
    }, {});
  }, [members]);

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function runTeamAction(key: string, action: () => Promise<unknown>, success: string) {
    setActioning(key);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refreshTeam();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Team action failed.");
    } finally {
      setActioning("");
    }
  }

  async function submitAccessRequest() {
    const cleanIdentifier = requestOwnerIdentifier.trim();
    if (!cleanIdentifier || actioning) return;
    await runTeamAction(
      "request-access",
      () => requestWorkspaceAccess(cleanIdentifier),
      "Access request sent. The workspace owner can approve it from Team Access."
    );
    setRequestOwnerIdentifier("");
  }

  if (loading || !user) return <LoadingScreen />;

  if (!loadingTeam && workspace && !workspace.entitlements.features.team_access) {
    return (
      <AppShell>
        <section className="card" style={{ padding: 28, maxWidth: 760 }}>
          <div className="pill">Available on Team</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "14px 0 10px" }}>
            Team Access is not included in {workspace.billingPlanName}.
          </h1>
          <p style={{ color: "var(--muted)", margin: "0 0 18px" }}>
            Roles, join requests and shared workspace member management are available on NivaDesk Team. Team includes 5 seats, with additional seats available up to 10 users through self-service.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="button" href="/plan">View Team plan</Link>
            <Link className="button secondary" href="/settings?section=plan-access">Back to Plan &amp; Access</Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {loadingTeam ? <LoadingScreen /> : null}

      <section className="card" style={{ padding: 24, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, alignItems: "center" }}>
          <div>
            <div className="pill">Team Access</div>
            <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "12px 0 8px" }}>
              {workspace?.name ?? "Workspace team"}
            </h1>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Manage workspace members, roles and join requests from the web portal. Owner actions are protected by the Team plan and Firebase Functions checks.
            </p>
          </div>
          <div className="card" style={{ padding: 16, background: "rgba(255,255,255,0.62)", boxShadow: "none" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span className="pill">{workspace?.billingPlanName ?? "Plan"}</span>
              <span className="pill">{workspace?.roleLabel ?? "Role"}</span>
              <span className="pill">Members: {limitText}</span>
            </div>
            <button
              className="button secondary"
              onClick={() => copyText(workspace?.id ?? "", "Workspace ID copied")}
              disabled={!workspace?.id}
              style={{ width: "100%" }}
            >
              Copy Workspace ID
            </button>
            {copied ? <p style={{ color: "var(--muted)", margin: "10px 0 0" }}>{copied}</p> : null}
          </div>
        </div>
      </section>

      <section className="card team-access-entry-card" style={{ padding: 22, marginBottom: 18 }}>
        <div className="pill">Access</div>
        <h2 style={{ margin: "12px 0 12px" }}>Invite and request access</h2>
        <div className="team-access-entry-grid">
          <div className="team-access-entry-panel">
            <div className="team-access-entry-heading">
              <strong>Invite People</strong>
              <span>{isOwner ? hasTeamPlan ? "Share email or Company ID" : "Team plan required" : "Owner only"}</span>
            </div>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Share your account email or Company ID with the person you want to invite. They send a request, then you approve it from Join Requests.
            </p>
            {isOwner && hasTeamPlan ? (
              <div className="team-access-id-box">
                <code>{workspace?.id ?? ""}</code>
                <button className="button secondary" type="button" onClick={() => copyText(workspace?.id ?? "", "Company ID copied")} disabled={!workspace?.id}>Copy</button>
              </div>
            ) : (
              <p style={{ color: "var(--muted)", margin: 0 }}>
                {isOwner ? "Upgrade to NivaDesk Team to approve new members." : "Only the workspace owner can invite and approve new members."}
              </p>
            )}
          </div>

          <form className="team-access-entry-panel" onSubmit={event => {
            event.preventDefault();
            void submitAccessRequest();
          }}>
            <div className="team-access-entry-heading">
              <strong>Request Access</strong>
              <span>Every role and plan</span>
            </div>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Enter another owner’s email address or Company ID to ask for access to their workspace.
            </p>
            <div className="team-access-request-row">
              <input
                className="input"
                value={requestOwnerIdentifier}
                onChange={event => setRequestOwnerIdentifier(event.target.value)}
                placeholder="Owner email or Company ID"
                disabled={Boolean(actioning)}
              />
              <button className="button" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)}>
                {actioning === "request-access" ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </section>

      {message ? (
        <section className="card" style={{ padding: 18, marginBottom: 18, background: "rgba(16,185,129,0.08)" }}>
          <strong>{message}</strong>
        </section>
      ) : null}

      {error ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <div className="pill">Team error</div>
          <h2 style={{ margin: "12px 0 6px" }}>Could not complete Team Access action</h2>
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
        </section>
      ) : null}

      {!hasTeamPlan ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <div className="pill">Available in NivaDesk Team</div>
          <h2 style={{ margin: "12px 0 8px" }}>Team management is locked on this plan</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            You can still see your current workspace membership, but accepting join requests and changing team roles require NivaDesk Team.
          </p>
        </section>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 18 }}>
        <StatCard label="Members" value={`${currentMemberCount}`} note={`Limit: ${teamLimit > 9999 ? "Unlimited" : teamLimit}`} />
        <StatCard label="Pending join requests" value={`${joinRequests.length}`} note={isOwner ? "Owner only" : "Only owners can review requests"} />
        <StatCard label="Roles" value={`${Object.keys(roleCounts).length}`} note={Object.entries(roleCounts).map(([role, count]) => `${role}: ${count}`).join(" · ") || "No members"} />
      </div>

      <section className="card" style={{ padding: 22, marginBottom: 18 }}>
        <div className="pill">Role Profiles</div>
        <h2 style={{ margin: "12px 0 8px" }}>Custom access roles</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Create role choices beside Member, View Only and Workflow Only. Each role profile carries its own visible areas and permissions.
        </p>
        {canManageTeam ? (
          <CustomRoleManager
            roles={customRoles}
            disabled={Boolean(actioning)}
            savingKey={actioning}
            onSave={role => runTeamAction(
              role.id ? `custom-role-${role.id}` : "custom-role-new",
              () => saveWorkspaceCustomRole(workspace!, role),
              "Role profile saved."
            )}
            onDelete={role => runTeamAction(
              `delete-custom-role-${role.id}`,
              () => deleteWorkspaceCustomRole(workspace!, role),
              "Role profile deleted."
            )}
          />
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Only the workspace owner on NivaDesk Team can create custom role profiles.
          </p>
        )}
      </section>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }}>
        <section className="card" style={{ padding: 22 }}>
          <div className="pill">Members</div>
          <h2 style={{ margin: "12px 0 14px" }}>Workspace members</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Assign existing members to standard or custom role profiles.
          </p>
          <div className="grid" style={{ gap: 10 }}>
            {members.map(member => {
              const changingKey = `role-${member.id}`;
              const removeKey = `remove-${member.id}`;
              const canChangeRole = canManageTeam && !member.isOwner;
              return (
                <article key={member.id} className="card" style={{ padding: 14, background: "rgba(255,255,255,0.58)", boxShadow: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong>{memberLabel(member)}</strong>
                      <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>{member.email || member.id}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "start", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {member.isOwner ? <span className="pill">Owner</span> : null}
                      <span className="pill">{member.roleLabel}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                    <button className="button secondary" onClick={() => copyText(member.id, "User ID copied")}>Copy User ID</button>
                    {member.email ? <button className="button secondary" onClick={() => copyText(member.email, "Email copied")}>Copy Email</button> : null}
                    {canChangeRole ? (
                      <>
                        <select
                          className="input"
                          value={roleOptions.some(option => option.value === member.role) ? member.role : "member"}
                          onChange={event => {
                            const nextRole = event.target.value;
                            if (nextRole === member.role) return;
                            runTeamAction(
                              changingKey,
                              () => updateTeamMemberRole(workspace!, member, nextRole),
                              `Role updated to ${roleOptions.find(option => option.value === nextRole)?.label ?? roleOptionLabel(nextRole)}.`
                            );
                          }}
                          disabled={Boolean(actioning)}
                          style={{ maxWidth: 170 }}
                        >
                          {roleOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        {actioning === changingKey ? <span className="pill">Updating...</span> : null}
                        <button
                          className="button secondary"
                          onClick={() => {
                            if (!window.confirm(`Remove ${memberLabel(member)} from this workspace?`)) return;
                            runTeamAction(
                              removeKey,
                              () => removeTeamMember(workspace!, member),
                              "Team member removed."
                            );
                          }}
                          disabled={Boolean(actioning)}
                        >
                          Remove
                        </button>
                        {actioning === removeKey ? <span className="pill">Removing...</span> : null}
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {members.length === 0 ? <p style={{ color: "var(--muted)" }}>No members found.</p> : null}
          </div>
        </section>

        <section className="card" style={{ padding: 22 }}>
          <div className="pill">Join Requests</div>
          <h2 style={{ margin: "12px 0 14px" }}>Pending requests</h2>
          {!isOwner ? (
            <p style={{ color: "var(--muted)", marginTop: 0 }}>Only workspace owners can see join requests.</p>
          ) : null}
          {isOwner && joinRequests.length === 0 ? (
            <p style={{ color: "var(--muted)", marginTop: 0 }}>No pending join requests.</p>
          ) : null}
          {isOwner ? (
            <div className="grid" style={{ gap: 10 }}>
              {joinRequests.map(request => {
                const selectedRole = requestRoles[request.id] ?? "member";
                const approveKey = `approve-${request.id}`;
                const declineKey = `decline-${request.id}`;
                return (
                  <article key={request.id} className="card" style={{ padding: 14, background: "rgba(255,255,255,0.58)", boxShadow: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <strong>{requestLabel(request)}</strong>
                        <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Requested {formatDate(request.createdAt)}</p>
                      </div>
                      <span className="pill">{request.status}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                      <select
                        className="input"
                        value={selectedRole}
                        onChange={event => setRequestRoles(previous => ({ ...previous, [request.id]: event.target.value }))}
                        disabled={!canManageTeam || Boolean(actioning)}
                        style={{ maxWidth: 180 }}
                      >
                        {roleOptions.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        className="button"
                        disabled={!canManageTeam || Boolean(actioning)}
                        onClick={() => runTeamAction(
                          approveKey,
                          () => approveJoinRequest(workspace!, request, selectedRole),
                          "Access request approved."
                        )}
                      >
                        {actioning === approveKey ? "Approving..." : "Approve"}
                      </button>
                      <button
                        className="button secondary"
                        disabled={!isOwner || Boolean(actioning)}
                        onClick={() => runTeamAction(
                          declineKey,
                          () => declineJoinRequest(workspace!, request),
                          "Access request declined."
                        )}
                      >
                        {actioning === declineKey ? "Declining..." : "Decline"}
                      </button>
                    </div>
                    {!hasTeamPlan ? (
                      <p style={{ color: "var(--muted)", margin: "12px 0 0" }}>
                        Approving new team members requires NivaDesk Team. Decline remains available for cleanup.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="pill">{label}</div>
      <strong style={{ display: "block", fontSize: 30, marginTop: 12 }}>{value}</strong>
      <p style={{ color: "var(--muted)", margin: "8px 0 0" }}>{note}</p>
    </section>
  );
}
