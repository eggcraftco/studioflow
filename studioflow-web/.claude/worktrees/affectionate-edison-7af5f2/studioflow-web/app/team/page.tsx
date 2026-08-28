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
  loadJoinedWorkspaceOptions,
  loadWorkspaceContext,
  switchActiveWorkspace,
  workspaceAccessAllows,
  type JoinRequestDetail,
  type JoinedWorkspaceOption,
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
import { studioT } from "@/lib/studioflow/language";

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
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
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
  const [joinedWorkspaces, setJoinedWorkspaces] = useState<JoinedWorkspaceOption[]>([]);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  async function refreshTeam(currentUser = user) {
    if (!currentUser) return;
    setLoadingTeam(true);
    setError("");
    try {
      const workspaceContext = await loadWorkspaceContext(currentUser.uid);
      setJoinedWorkspaces(await loadJoinedWorkspaceOptions(currentUser.uid, workspaceContext.id));
      if (workspaceContext.role.toLowerCase() === "owner") {
        try {
          await syncAcceptedJoinRequests(workspaceContext);
        } catch (syncError) {
          console.warn("Team access sync skipped:", syncError);
        }
      }
      if (!workspaceContext.entitlements.features.team_access || !workspaceAccessAllows(workspaceContext.memberAccess, "teamAccess")) {
        setWorkspace(workspaceContext);
        setMembers([]);
        setJoinRequests([]);
        setCustomRoles([]);
        return;
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
      setError(loadError instanceof Error ? loadError.message : t("Could not load team access."));
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
        const availableOptions = await loadJoinedWorkspaceOptions(user.uid, workspaceContext.id);
        if (!cancelled) {
          setWorkspace(workspaceContext);
          setJoinedWorkspaces(availableOptions);
        }

        if (!workspaceContext.entitlements.features.team_access || !workspaceAccessAllows(workspaceContext.memberAccess, "teamAccess")) {
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
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : t("Could not load team access."));
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
  const canViewTeamManagement = Boolean(workspace && hasTeamPlan && workspaceAccessAllows(workspace.memberAccess, "teamAccess"));
  const canManageTeam = Boolean(isOwner && canViewTeamManagement && workspace);
  const teamLimit = workspace?.billingTeamMemberLimit ?? workspace?.entitlements.teamMemberLimit ?? 1;
  const currentMemberCount = members.length;
  const limitText = teamLimit > 9999 ? t("Unlimited") : `${currentMemberCount} / ${teamLimit}`;
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
      setError(actionError instanceof Error ? actionError.message : t("Team action failed."));
    } finally {
      setActioning("");
    }
  }

  async function switchWorkspace(option: JoinedWorkspaceOption) {
    if (!user || option.isCurrent || switchingWorkspaceId) return;
    setSwitchingWorkspaceId(option.id);
    setError("");
    setMessage("");
    try {
      await switchActiveWorkspace(user.uid, option.id);
      window.location.reload();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : t("Could not switch workspace."));
      setSwitchingWorkspaceId("");
    }
  }

  const workspaceSwitchPanel = (
    <section className="card" style={{ padding: 22, maxWidth: 760, marginBottom: 18 }}>
      <div className="pill">{t("Workspaces")}</div>
      <h2 style={{ margin: "12px 0 8px" }}>{t("Connected workspaces")}</h2>
      <p style={{ color: "var(--muted)", margin: "0 0 14px" }}>{t("Switch into the Team workspace you joined to view its orders and permitted tools.")}</p>
      {joinedWorkspaces.map(option => (
        <div className="team-access-workspace-option" key={option.id}>
          <div>
            <strong>{option.name}</strong>
            <small>{option.roleLabel}</small>
          </div>
          {option.isCurrent ? (
            <span className="pill">{t("Current")}</span>
          ) : (
            <button className="button secondary" type="button" onClick={() => void switchWorkspace(option)} disabled={Boolean(switchingWorkspaceId)}>
              {switchingWorkspaceId === option.id ? t("Switching...") : t("Switch")}
            </button>
          )}
        </div>
      ))}
    </section>
  );

  async function submitAccessRequest() {
    const cleanIdentifier = requestOwnerIdentifier.trim();
    if (!cleanIdentifier || actioning) return;
    await runTeamAction(
      "request-access",
      () => requestWorkspaceAccess(cleanIdentifier),
      t("Access request sent. The workspace owner can approve it from Team Access.")
    );
    setRequestOwnerIdentifier("");
  }

  if (loading || !user) return <LoadingScreen />;

  if (!loadingTeam && workspace && !canViewTeamManagement) {
    return (
      <AppShell>
        {workspaceSwitchPanel}
        <section className="card" style={{ padding: 28, maxWidth: 760, marginBottom: 18 }}>
          <div className="pill">{t("Join a Team workspace")}</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "14px 0 10px" }}>
            {t("Request access to an existing Team workspace")}
          </h1>
          <p style={{ color: "var(--muted)", margin: "0 0 18px" }}>
            {t("Requesting access is available on every plan. Enter the Company ID or owner email shared by a Team workspace owner.")}
          </p>
          <form onSubmit={event => {
            event.preventDefault();
            void submitAccessRequest();
          }}>
            <div className="team-access-request-row">
              <input
                className="input"
                value={requestOwnerIdentifier}
                onChange={event => setRequestOwnerIdentifier(event.target.value)}
                placeholder={t("Owner email or Company ID")}
                disabled={Boolean(actioning)}
              />
              <button className="button" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)}>
                {actioning === "request-access" ? t("Sending...") : t("Send request")}
              </button>
            </div>
          </form>
          {message ? <p style={{ color: "var(--success)", marginTop: 16 }}>{message}</p> : null}
          {error ? <p style={{ color: "var(--danger)", marginTop: 16 }}>{error}</p> : null}
        </section>
        {!hasTeamPlan ? (
          <section className="card" style={{ padding: 22, maxWidth: 760 }}>
            <strong>{t("Team management is not included in")} {workspace.billingPlanName}.</strong>
            <p style={{ color: "var(--muted)", margin: "8px 0 0" }}>
              {t("Once a Team workspace owner approves your request, you can access that shared workspace according to your assigned role.")}
            </p>
            <Link className="button secondary" href="/plan" style={{ marginTop: 16 }}>{t("View Team plan")}</Link>
          </section>
        ) : null}
      </AppShell>
    );
  }

  if (!loadingTeam && workspace && canViewTeamManagement && !isOwner) {
    return (
      <AppShell>
        {workspaceSwitchPanel}

        <section className="card" style={{ padding: 24, marginBottom: 18, maxWidth: 820 }}>
          <div className="pill">{t("Team workspace membership")}</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "12px 0 8px" }}>
            {workspace.name || t("Shared workspace")}
          </h1>
          <p style={{ color: "var(--muted)", margin: "0 0 14px" }}>
            {t("You have joined this workspace as")} <strong>{workspace.roleLabel}</strong>. {t("You can access the areas permitted by your assigned role.")}
          </p>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {t("Members, roles, join requests and billing are managed by the workspace owner.")}
          </p>
        </section>

        <section className="card" style={{ padding: 22, maxWidth: 820 }}>
          <div className="pill">{t("Request Access")}</div>
          <h2 style={{ margin: "12px 0 8px" }}>{t("Join another Team workspace")}</h2>
          <p style={{ color: "var(--muted)", margin: "0 0 14px" }}>
            {t("Enter another owner’s email address or Company ID to request access.")}
          </p>
          <form onSubmit={event => {
            event.preventDefault();
            void submitAccessRequest();
          }}>
            <div className="team-access-request-row">
              <input
                className="input"
                value={requestOwnerIdentifier}
                onChange={event => setRequestOwnerIdentifier(event.target.value)}
                placeholder={t("Owner email or Company ID")}
                disabled={Boolean(actioning)}
              />
              <button className="button" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)}>
                {actioning === "request-access" ? t("Sending...") : t("Send request")}
              </button>
            </div>
          </form>
          {message ? <p style={{ color: "var(--success)", marginTop: 16 }}>{message}</p> : null}
          {error ? <p style={{ color: "var(--danger)", marginTop: 16 }}>{error}</p> : null}
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {loadingTeam ? <LoadingScreen /> : null}

      {workspaceSwitchPanel}

      <section className="card" style={{ padding: 24, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, alignItems: "center" }}>
          <div>
            <div className="pill">{t("Team Access")}</div>
            <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "12px 0 8px" }}>
              {workspace?.name ?? t("Workspace team")}
            </h1>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {t("Manage workspace members, roles and join requests from the web portal. Owner actions are protected by the Team plan and Firebase Functions checks.")}
            </p>
          </div>
          <div className="card" style={{ padding: 16, background: "var(--panel)", boxShadow: "none" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span className="pill">{workspace?.billingPlanName ?? t("Plan")}</span>
              <span className="pill">{workspace?.roleLabel ?? t("Role")}</span>
              <span className="pill">{t("Members")}: {limitText}</span>
            </div>
            <button
              className="button secondary"
              onClick={() => copyText(workspace?.id ?? "", t("Workspace ID copied"))}
              disabled={!workspace?.id}
              style={{ width: "100%" }}
            >
              {t("Copy Workspace ID")}
            </button>
            {copied ? <p style={{ color: "var(--muted)", margin: "10px 0 0" }}>{copied}</p> : null}
          </div>
        </div>
      </section>

      <section className="card team-access-entry-card" style={{ padding: 22, marginBottom: 18 }}>
        <div className="pill">{t("Access")}</div>
        <h2 style={{ margin: "12px 0 12px" }}>{t("Invite and request access")}</h2>
        <div className="team-access-entry-grid">
          <div className="team-access-entry-panel">
            <div className="team-access-entry-heading">
              <strong>{t("Invite People")}</strong>
              <span>{isOwner ? hasTeamPlan ? t("Share email or Company ID") : t("Team plan required") : t("Owner only")}</span>
            </div>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {t("Share your account email or Company ID with the person you want to invite. They send a request, then you approve it from Join Requests.")}
            </p>
            {isOwner && hasTeamPlan ? (
              <div className="team-access-id-box">
                <code>{workspace?.id ?? ""}</code>
                <button className="button secondary" type="button" onClick={() => copyText(workspace?.id ?? "", t("Company ID copied"))} disabled={!workspace?.id}>{t("Copy")}</button>
              </div>
            ) : (
              <p style={{ color: "var(--muted)", margin: 0 }}>
                {isOwner ? t("Upgrade to NivaDesk Team to approve new members.") : t("Only the workspace owner can invite and approve new members.")}
              </p>
            )}
          </div>

          <form className="team-access-entry-panel" onSubmit={event => {
            event.preventDefault();
            void submitAccessRequest();
          }}>
            <div className="team-access-entry-heading">
              <strong>{t("Request Access")}</strong>
              <span>{t("Every role and plan")}</span>
            </div>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {t("Enter another owner’s email address or Company ID to ask for access to their workspace.")}
            </p>
            <div className="team-access-request-row">
              <input
                className="input"
                value={requestOwnerIdentifier}
                onChange={event => setRequestOwnerIdentifier(event.target.value)}
                placeholder={t("Owner email or Company ID")}
                disabled={Boolean(actioning)}
              />
              <button className="button" type="submit" disabled={!requestOwnerIdentifier.trim() || Boolean(actioning)}>
                {actioning === "request-access" ? t("Sending...") : t("Send")}
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
          <div className="pill">{t("Team error")}</div>
          <h2 style={{ margin: "12px 0 6px" }}>{t("Could not complete Team Access action")}</h2>
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
        </section>
      ) : null}

      {!hasTeamPlan ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <div className="pill">{t("Available in NivaDesk Team")}</div>
          <h2 style={{ margin: "12px 0 8px" }}>{t("Team management is locked on this plan")}</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {t("You can still see your current workspace membership, but accepting join requests and changing team roles require NivaDesk Team.")}
          </p>
        </section>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 18 }}>
        <StatCard label={t("Members")} value={`${currentMemberCount}`} note={`${t("Limit")}: ${teamLimit > 9999 ? t("Unlimited") : teamLimit}`} />
        <StatCard label={t("Pending join requests")} value={`${joinRequests.length}`} note={isOwner ? t("Owner only") : t("Only owners can review requests")} />
        <StatCard label={t("Roles")} value={`${Object.keys(roleCounts).length}`} note={Object.entries(roleCounts).map(([role, count]) => `${role}: ${count}`).join(" · ") || t("No members")} />
      </div>

      <section className="card" style={{ padding: 22, marginBottom: 18 }}>
        <div className="pill">{t("Role Profiles")}</div>
        <h2 style={{ margin: "12px 0 8px" }}>{t("Custom access roles")}</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          {t("Create role choices beside Member, View Only and Workflow Only. Each role profile carries its own visible areas and permissions.")}
        </p>
        {canManageTeam ? (
          <CustomRoleManager
            roles={customRoles}
            disabled={Boolean(actioning)}
            savingKey={actioning}
            language={language}
            onSave={role => runTeamAction(
              role.id ? `custom-role-${role.id}` : "custom-role-new",
              () => saveWorkspaceCustomRole(workspace!, role),
              t("Role profile saved.")
            )}
            onDelete={role => runTeamAction(
              `delete-custom-role-${role.id}`,
              () => deleteWorkspaceCustomRole(workspace!, role),
              t("Role profile deleted.")
            )}
          />
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {t("Only the workspace owner on NivaDesk Team can create custom role profiles.")}
          </p>
        )}
      </section>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }}>
        <section className="card" style={{ padding: 22 }}>
          <div className="pill">{t("Members")}</div>
          <h2 style={{ margin: "12px 0 14px" }}>{t("Workspace members")}</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            {t("Assign existing members to standard or custom role profiles.")}
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
                      {member.isOwner ? <span className="pill">{t("Owner")}</span> : null}
                      <span className="pill">{member.roleLabel}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                    <button className="button secondary" onClick={() => copyText(member.id, t("User ID copied"))}>{t("Copy User ID")}</button>
                    {member.email ? <button className="button secondary" onClick={() => copyText(member.email, t("Email copied"))}>{t("Copy Email")}</button> : null}
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
                              `${t("Role updated to")} ${roleOptions.find(option => option.value === nextRole)?.label ?? roleOptionLabel(nextRole)}.`
                            );
                          }}
                          disabled={Boolean(actioning)}
                          style={{ maxWidth: 170 }}
                        >
                          {roleOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        {actioning === changingKey ? <span className="pill">{t("Updating...")}</span> : null}
                        <button
                          className="button secondary"
                          onClick={() => {
                            if (!window.confirm(`${t("Remove")} ${memberLabel(member)} ${t("from this workspace?")}`)) return;
                            runTeamAction(
                              removeKey,
                              () => removeTeamMember(workspace!, member),
                              t("Team member removed.")
                            );
                          }}
                          disabled={Boolean(actioning)}
                        >
                          {t("Remove")}
                        </button>
                        {actioning === removeKey ? <span className="pill">{t("Removing...")}</span> : null}
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {members.length === 0 ? <p style={{ color: "var(--muted)" }}>{t("No members found.")}</p> : null}
          </div>
        </section>

        <section className="card" style={{ padding: 22 }}>
          <div className="pill">{t("Join Requests")}</div>
          <h2 style={{ margin: "12px 0 14px" }}>{t("Pending requests")}</h2>
          {!isOwner ? (
            <p style={{ color: "var(--muted)", marginTop: 0 }}>{t("Only workspace owners can see join requests.")}</p>
          ) : null}
          {isOwner && joinRequests.length === 0 ? (
            <p style={{ color: "var(--muted)", marginTop: 0 }}>{t("No pending join requests.")}</p>
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
                        <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>{t("Requested")} {formatDate(request.createdAt)}</p>
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
                          t("Access request approved.")
                        )}
                      >
                        {actioning === approveKey ? t("Approving...") : t("Approve")}
                      </button>
                      <button
                        className="button secondary"
                        disabled={!isOwner || Boolean(actioning)}
                        onClick={() => runTeamAction(
                          declineKey,
                          () => declineJoinRequest(workspace!, request),
                          t("Access request declined.")
                        )}
                      >
                        {actioning === declineKey ? t("Declining...") : t("Decline")}
                      </button>
                    </div>
                    {!hasTeamPlan ? (
                      <p style={{ color: "var(--muted)", margin: "12px 0 0" }}>
                        {t("Approving new team members requires NivaDesk Team. Decline remains available for cleanup.")}
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
