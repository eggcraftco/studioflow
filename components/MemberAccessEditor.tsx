"use client";

import {
  WORKSPACE_MEMBER_ACCESS_DEFAULTS,
  WORKSPACE_MEMBER_ACCESS_OPTIONS,
  type WorkspaceMemberAccess,
  type WorkspaceMemberAccessKey
} from "@/lib/studioflow/firestore";

type MemberAccessEditorProps = {
  access: WorkspaceMemberAccess;
  disabled?: boolean;
  saving?: boolean;
  ownerLocked?: boolean;
  heading?: string;
  note?: string;
  onChange: (access: WorkspaceMemberAccess) => void;
};

export function MemberAccessEditor({
  access,
  disabled = false,
  saving = false,
  ownerLocked = false,
  heading = "Custom access",
  note,
  onChange
}: MemberAccessEditorProps) {
  const normalizedAccess: WorkspaceMemberAccess = {
    ...WORKSPACE_MEMBER_ACCESS_DEFAULTS,
    ...access
  };

  function toggleAccess(key: WorkspaceMemberAccessKey) {
    if (disabled || ownerLocked) return;
    const isAssignedScope = key === "assignedProjectsOnly";
    const currentValue = isAssignedScope ? normalizedAccess[key] === true : normalizedAccess[key] !== false;
    onChange({
      ...normalizedAccess,
      [key]: !currentValue
    });
  }

  return (
    <div className="member-access-panel">
      <div className="member-access-panel-heading">
        <strong>{heading}</strong>
        <span>{ownerLocked ? "Owner always has full access" : saving ? "Saving..." : note ?? "Extra restrictions on top of role"}</span>
      </div>
      <div className="member-access-grid">
        {WORKSPACE_MEMBER_ACCESS_OPTIONS.map(option => {
          const isAssignedScope = option.key === "assignedProjectsOnly";
          const enabled = isAssignedScope ? normalizedAccess[option.key] === true : normalizedAccess[option.key] !== false;
          return (
            <button
              key={option.key}
              className={enabled ? "member-access-toggle is-on" : "member-access-toggle"}
              type="button"
              aria-pressed={enabled}
              disabled={disabled || ownerLocked}
              title={option.description}
              onClick={() => toggleAccess(option.key)}
            >
              <span className="member-access-switch" aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{isAssignedScope ? (enabled ? "Only assigned projects" : "All projects") : (enabled ? "Allowed" : "Hidden / locked")}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
