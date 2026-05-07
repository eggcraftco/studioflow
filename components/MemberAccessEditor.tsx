"use client";

import {
  WORKSPACE_MEMBER_ACCESS_OPTIONS,
  type WorkspaceMemberAccess,
  type WorkspaceMemberAccessKey
} from "@/lib/studioflow/firestore";

type MemberAccessEditorProps = {
  access: WorkspaceMemberAccess;
  disabled?: boolean;
  saving?: boolean;
  ownerLocked?: boolean;
  onChange: (access: WorkspaceMemberAccess) => void;
};

export function MemberAccessEditor({ access, disabled = false, saving = false, ownerLocked = false, onChange }: MemberAccessEditorProps) {
  function toggleAccess(key: WorkspaceMemberAccessKey) {
    if (disabled || ownerLocked) return;
    onChange({
      ...access,
      [key]: access[key] === false
    });
  }

  return (
    <div className="member-access-panel">
      <div className="member-access-panel-heading">
        <strong>Custom access</strong>
        <span>{ownerLocked ? "Owner always has full access" : saving ? "Saving..." : "Extra restrictions on top of role"}</span>
      </div>
      <div className="member-access-grid">
        {WORKSPACE_MEMBER_ACCESS_OPTIONS.map(option => {
          const enabled = access[option.key] !== false;
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
                <small>{enabled ? "Allowed" : "Hidden / locked"}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
