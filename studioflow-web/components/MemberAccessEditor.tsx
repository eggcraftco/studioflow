"use client";

import {
  WORKSPACE_CARD_ACCESS_OPTIONS,
  WORKSPACE_MEMBER_ACCESS_DEFAULTS,
  WORKSPACE_MEMBER_ACCESS_OPTIONS,
  WORKSPACE_NAVIGATION_ACCESS_OPTIONS,
  WORKSPACE_SETTINGS_ACCESS_OPTIONS,
  WORKSPACE_SCOPE_ACCESS_OPTIONS,
  WORKSPACE_FILE_ACCESS_OPTIONS,
  type WorkspaceMemberAccess,
  type WorkspaceMemberAccessKey
} from "@/lib/studioflow/firestore";

type AccessOption = (typeof WORKSPACE_MEMBER_ACCESS_OPTIONS)[number];

type AccessSection = {
  id: string;
  eyebrow: string;
  title: string;
  note: string;
  options: readonly AccessOption[];
  onLabel: string;
  offLabel: string;
  allowBulk?: boolean;
};

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
    const strictEnabled = key === "assignedProjectsOnly" || key === "manageProjectAssignments";
    const currentValue = strictEnabled ? normalizedAccess[key] === true : normalizedAccess[key] !== false;
    onChange({
      ...normalizedAccess,
      [key]: !currentValue
    });
  }

  function setSectionAccess(options: readonly AccessOption[], value: boolean) {
    if (disabled || ownerLocked) return;
    onChange({
      ...normalizedAccess,
      ...Object.fromEntries(options.map(option => [option.key, value]))
    });
  }

  const accessSections: AccessSection[] = [
    {
      id: "navigation",
      eyebrow: "Workspace access",
      title: "Navigation & menus",
      note: "Controls the main web app areas shown in the sidebar and top-level pages.",
      options: WORKSPACE_NAVIGATION_ACCESS_OPTIONS,
      onLabel: "Allowed",
      offLabel: "Hidden / locked",
      allowBulk: true
    },
    {
      id: "settings",
      eyebrow: "Settings access",
      title: "Settings Permissions",
      note: "Controls permitted Settings menus. Billing, WooCommerce, data deletion, workspace identity and OpenAI key controls remain protected.",
      options: WORKSPACE_SETTINGS_ACCESS_OPTIONS,
      onLabel: "Allowed",
      offLabel: "Hidden / locked",
      allowBulk: true
    },
    {
      id: "cards",
      eyebrow: "Project detail",
      title: "Order detail cards",
      note: "Controls which project cards are visible inside the order detail workspace.",
      options: WORKSPACE_CARD_ACCESS_OPTIONS,
      onLabel: "Visible",
      offLabel: "Hidden",
      allowBulk: true
    },
    {
      id: "scope",
      eyebrow: "Scope",
      title: "Project assignment",
      note: "Controls assigned-project scope and whether this role can change project assignees.",
      options: WORKSPACE_SCOPE_ACCESS_OPTIONS,
      onLabel: "Only assigned projects",
      offLabel: "All projects"
    },
    {
      id: "files",
      eyebrow: "Files",
      title: "File permissions",
      note: "Controls whether this role can delete client files. Uploading and viewing follow Client Files access above.",
      options: WORKSPACE_FILE_ACCESS_OPTIONS,
      onLabel: "Can delete",
      offLabel: "View only (no delete)"
    }
  ];

  return (
    <div className="member-access-panel">
      <div className="member-access-panel-heading">
        <strong>{heading}</strong>
        <span>{ownerLocked ? "Owner always has full access" : saving ? "Saving..." : note ?? "Extra restrictions on top of role"}</span>
      </div>
      <div className="member-access-sections">
        {accessSections.map(section => {
          const enabledCount = section.options.filter(option => normalizedAccess[option.key] === true).length;
          return (
            <section className={`member-access-section member-access-section-${section.id}`} key={section.id}>
              <div className="member-access-section-head">
                <div>
                  <span>{section.eyebrow}</span>
                  <strong>{section.title}</strong>
                  <small>{section.note}</small>
                </div>
                <div className="member-access-section-actions">
                  <b>{enabledCount}/{section.options.length}</b>
                  {section.allowBulk ? (
                    <>
                      <button type="button" disabled={disabled || ownerLocked} onClick={() => setSectionAccess(section.options, true)}>
                        All on
                      </button>
                      <button type="button" disabled={disabled || ownerLocked} onClick={() => setSectionAccess(section.options, false)}>
                        All off
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="member-access-grid">
                {section.options.map(option => {
                  const strictEnabled = option.key === "assignedProjectsOnly" || option.key === "manageProjectAssignments";
                  const enabled = strictEnabled ? normalizedAccess[option.key] === true : normalizedAccess[option.key] !== false;
                  const detail = accessToggleDetail(option.key, enabled, section);
                  return (
                    <button
                      key={option.key}
                      className={[
                        "member-access-toggle",
                        enabled ? "is-on" : "",
                        strictEnabled ? "is-scope-toggle" : ""
                      ].filter(Boolean).join(" ")}
                      type="button"
                      aria-pressed={enabled}
                      disabled={disabled || ownerLocked}
                      title={option.description}
                      onClick={() => toggleAccess(option.key)}
                    >
                      <span className="member-access-switch" aria-hidden="true" />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{detail}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function accessToggleDetail(key: WorkspaceMemberAccessKey, enabled: boolean, section: AccessSection) {
  if (key === "manageProjectAssignments") {
    return enabled ? "Can assign projects" : "Assign hidden";
  }
  return enabled ? section.onLabel : section.offLabel;
}
