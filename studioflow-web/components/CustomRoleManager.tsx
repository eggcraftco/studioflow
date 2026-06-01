"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MemberAccessEditor } from "@/components/MemberAccessEditor";
import {
  WORKSPACE_CARD_ACCESS_OPTIONS,
  WORKSPACE_MEMBER_ACCESS_DEFAULTS,
  WORKSPACE_NAVIGATION_ACCESS_OPTIONS,
  WORKSPACE_SETTINGS_ACCESS_OPTIONS,
  type WorkspaceCustomRole,
  type WorkspaceMemberAccess
} from "@/lib/studioflow/firestore";
import { WEB_TEAM_ROLES } from "@/lib/studioflow/teamActions";

type EditableRole = {
  id?: string;
  name: string;
  baseRole: string;
  access: WorkspaceMemberAccess;
};

type CustomRoleManagerProps = {
  roles: WorkspaceCustomRole[];
  disabled?: boolean;
  savingKey?: string;
  onSave: (role: EditableRole) => Promise<unknown>;
  onDelete: (role: WorkspaceCustomRole) => Promise<unknown>;
};

function defaultAccess(): WorkspaceMemberAccess {
  return { ...WORKSPACE_MEMBER_ACCESS_DEFAULTS };
}

function normalizeAccess(access?: Partial<WorkspaceMemberAccess>): WorkspaceMemberAccess {
  return {
    ...WORKSPACE_MEMBER_ACCESS_DEFAULTS,
    ...(access ?? {})
  };
}

function defaultRole(): EditableRole {
  return {
    name: "",
    baseRole: "member",
    access: defaultAccess()
  };
}

function roleDescription(role: WorkspaceCustomRole) {
  const access = normalizeAccess(role.access);
  const hiddenMenus = WORKSPACE_NAVIGATION_ACCESS_OPTIONS.filter(option => access[option.key] === false).length;
  const hiddenCards = WORKSPACE_CARD_ACCESS_OPTIONS.filter(option => access[option.key] === false).length;
  const hiddenSettings = WORKSPACE_SETTINGS_ACCESS_OPTIONS.filter(option => access[option.key] === false).length;
  const assignedScope = access.assignedProjectsOnly === true ? " · assigned projects only" : "";
  const assignmentControl = access.manageProjectAssignments === true ? " · can assign projects" : "";
  const base = WEB_TEAM_ROLES.find(option => option.value === role.baseRole)?.label ?? "Member";
  const baseDetail = role.baseRole === "viewer"
    ? "read-only behavior"
    : role.baseRole === "workflow"
      ? "non-finance workflow behavior"
      : "member edit behavior";
  const hiddenParts = [
    hiddenMenus > 0 ? `${hiddenMenus} menu${hiddenMenus === 1 ? "" : "s"} hidden` : "",
    hiddenCards > 0 ? `${hiddenCards} card${hiddenCards === 1 ? "" : "s"} hidden` : "",
    hiddenSettings > 0 ? `${hiddenSettings} setting menu${hiddenSettings === 1 ? "" : "s"} hidden` : ""
  ].filter(Boolean);
  return hiddenParts.length === 0
    ? `${base} with ${baseDetail}${assignedScope}${assignmentControl}`
    : `${base} with ${hiddenParts.join(" · ")}${assignedScope}${assignmentControl}`;
}

export function CustomRoleManager({ roles, disabled = false, savingKey = "", onSave, onDelete }: CustomRoleManagerProps) {
  const [newRole, setNewRole] = useState<EditableRole>(() => defaultRole());
  const [drafts, setDrafts] = useState<Record<string, EditableRole>>({});
  const [newRoleExpanded, setNewRoleExpanded] = useState(false);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  function normalizedRoleName(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  function roleNameExists(value: string, exceptId = "") {
    const normalized = normalizedRoleName(value);
    if (!normalized) return false;
    return roles.some(role => role.id !== exceptId && normalizedRoleName(role.name) === normalized);
  }

  useEffect(() => {
    setDrafts(Object.fromEntries(roles.map(role => [
      role.id,
      {
        id: role.id,
        name: role.name,
        baseRole: role.baseRole,
        access: normalizeAccess(role.access)
      }
    ])));
  }, [roles]);

  useEffect(() => {
    if (expandedRoleId && !roles.some(role => role.id === expandedRoleId)) {
      setExpandedRoleId(null);
    }
  }, [expandedRoleId, roles]);

  const canCreate = useMemo(
    () => newRole.name.trim().length > 0 && !roleNameExists(newRole.name) && !disabled && !savingKey,
    [disabled, newRole.name, roles, savingKey]
  );

  async function submitNewRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    await onSave({
      ...newRole,
      name: newRole.name.trim()
    });
    setNewRole(defaultRole());
    setNewRoleExpanded(false);
  }

  function updateDraft(id: string, update: Partial<EditableRole>) {
    setDrafts(previous => ({
      ...previous,
      [id]: (() => {
        const existing = previous[id] ?? roles.find(role => role.id === id) ?? defaultRole();
        const base = {
          ...existing,
          access: normalizeAccess(existing.access)
        };
        return {
          ...base,
          ...update,
          access: update.access ? normalizeAccess(update.access) : base.access
        };
      })()
    }));
  }

  return (
    <div className="custom-role-manager">
      <form className="custom-role-card custom-role-card-new" onSubmit={submitNewRole}>
        <div className="member-access-panel-heading">
          <strong>Create role profile</strong>
          <span>Add a role beside Member, View Only and Workflow Only.</span>
        </div>
        <div className="custom-role-form-row">
          <label>
            <span>Role name</span>
            <input
              className="input"
              value={newRole.name}
              onChange={event => setNewRole(previous => ({ ...previous, name: event.target.value }))}
              placeholder="Workshop Assistant"
              disabled={disabled || Boolean(savingKey)}
            />
          </label>
          <label>
            <span>Base behavior</span>
            <select
              className="input"
              value={newRole.baseRole}
              onChange={event => setNewRole(previous => ({ ...previous, baseRole: event.target.value }))}
              disabled={disabled || Boolean(savingKey)}
            >
              {WEB_TEAM_ROLES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <button
          className="custom-role-expand-button"
          type="button"
          onClick={() => setNewRoleExpanded(value => !value)}
          disabled={disabled || Boolean(savingKey)}
          aria-expanded={newRoleExpanded}
        >
          <span>Role permissions</span>
          <strong>{newRoleExpanded ? "Hide" : "Show"}</strong>
        </button>
        {newRoleExpanded ? (
          <MemberAccessEditor
            access={newRole.access}
            disabled={disabled || Boolean(savingKey)}
            saving={savingKey === "custom-role-new"}
            heading="Role permissions"
            note="Choose which areas this role can see and use."
            onChange={access => setNewRole(previous => ({ ...previous, access }))}
          />
        ) : null}
        <div className="settings-button-row">
          <button className="button" type="submit" disabled={!canCreate}>
            {savingKey === "custom-role-new" ? "Saving..." : "Create role"}
          </button>
          <span className="muted-inline">{roleNameExists(newRole.name) ? "A role with this name already exists." : "Assign this role to members after creating it."}</span>
        </div>
      </form>

      <div className="custom-role-list">
        {roles.map(role => {
          const draft = {
            ...(drafts[role.id] ?? role),
            access: normalizeAccess((drafts[role.id] ?? role).access)
          };
          const roleAccess = normalizeAccess(role.access);
          const saveKey = `custom-role-${role.id}`;
          const deleteKey = `delete-custom-role-${role.id}`;
          const cleanDraftName = draft.name.trim();
          const hasNameConflict = roleNameExists(cleanDraftName, role.id);
          const dirty = draft.name.trim() !== role.name || draft.baseRole !== role.baseRole ||
            Object.keys(WORKSPACE_MEMBER_ACCESS_DEFAULTS).some(key => draft.access[key as keyof WorkspaceMemberAccess] !== roleAccess[key as keyof WorkspaceMemberAccess]);
          const expanded = expandedRoleId === role.id;
          return (
            <article key={role.id} className={expanded ? "custom-role-card is-expanded" : "custom-role-card"}>
              <button
                className="custom-role-summary-button"
                type="button"
                onClick={() => setExpandedRoleId(current => current === role.id ? null : role.id)}
                aria-expanded={expanded}
              >
                <div>
                  <strong>{role.name}</strong>
                  <small>{roleDescription(role)}</small>
                </div>
                <span className="custom-role-summary-meta">
                  <span className="studio-pill">{role.id}</span>
                  <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
                </span>
              </button>
              {expanded ? (
                <>
                  <div className="custom-role-form-row">
                    <label>
                      <span>Role name</span>
                      <input
                        className="input"
                        value={draft.name}
                        onChange={event => updateDraft(role.id, { name: event.target.value })}
                        disabled={disabled || Boolean(savingKey)}
                      />
                    </label>
                    <label>
                      <span>Base behavior</span>
                      <select
                        className="input"
                        value={draft.baseRole}
                        onChange={event => updateDraft(role.id, { baseRole: event.target.value })}
                        disabled={disabled || Boolean(savingKey)}
                      >
                        {WEB_TEAM_ROLES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <MemberAccessEditor
                    access={draft.access}
                    disabled={disabled || Boolean(savingKey)}
                    saving={savingKey === saveKey}
                    heading="Role permissions"
                    note="Changes apply to every member using this role."
                    onChange={access => updateDraft(role.id, { access })}
                  />
                  <div className="settings-button-row">
                    <button
                      className="button"
                      type="button"
                      disabled={!dirty || !cleanDraftName || hasNameConflict || disabled || Boolean(savingKey)}
                      onClick={() => onSave({ ...draft, id: role.id, name: cleanDraftName, access: normalizeAccess(draft.access) })}
                    >
                      {savingKey === saveKey ? "Saving..." : "Save role"}
                    </button>
                    {hasNameConflict ? <span className="muted-inline">Name already used.</span> : null}
                    <button
                      className="button secondary"
                      type="button"
                      disabled={disabled || Boolean(savingKey)}
                      onClick={() => {
                        if (!window.confirm(`Delete the ${role.name} role profile? Members must be moved away from it first.`)) return;
                        void onDelete(role);
                      }}
                    >
                      {savingKey === deleteKey ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </>
              ) : null}
            </article>
          );
        })}
        {roles.length === 0 ? <p className="muted-inline">No custom role profiles yet.</p> : null}
      </div>
    </div>
  );
}
