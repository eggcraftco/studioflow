"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MemberAccessEditor } from "@/components/MemberAccessEditor";
import {
  WORKSPACE_MEMBER_ACCESS_DEFAULTS,
  type TeamMemberDetail,
  type WorkspaceMemberAccess
} from "@/lib/studioflow/firestore";
import { WEB_TEAM_ROLES, type TeamMemberInput } from "@/lib/studioflow/teamActions";

function freshDefaultAccess(): WorkspaceMemberAccess {
  return { ...WORKSPACE_MEMBER_ACCESS_DEFAULTS };
}

type AddTeamMemberFormProps = {
  disabled?: boolean;
  saving?: boolean;
  onAdd: (input: TeamMemberInput) => Promise<unknown>;
};

export function AddTeamMemberForm({ disabled = false, saving = false, onAdd }: AddTeamMemberFormProps) {
  const [uid, setUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [access, setAccess] = useState<WorkspaceMemberAccess>(() => freshDefaultAccess());
  const canSubmit = uid.trim().length > 0 && !disabled && !saving;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await onAdd({
      uid: uid.trim(),
      displayName: displayName.trim(),
      email: email.trim(),
      role,
      access
    });
    setUid("");
    setDisplayName("");
    setEmail("");
    setRole("member");
    setAccess(freshDefaultAccess());
  }

  return (
    <form className="team-member-create-card" onSubmit={submit}>
      <div className="member-access-panel-heading">
        <strong>Add member</strong>
        <span>Use the user's Firebase UID, then set their access.</span>
      </div>
      <div className="team-member-create-grid">
        <label>
          <span>Firebase UID</span>
          <input className="input" value={uid} onChange={event => setUid(event.target.value)} placeholder="User UID" disabled={disabled || saving} />
        </label>
        <label>
          <span>Name</span>
          <input className="input" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Visible name" disabled={disabled || saving} />
        </label>
        <label>
          <span>Email</span>
          <input className="input" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" disabled={disabled || saving} />
        </label>
        <label>
          <span>Role</span>
          <select className="input" value={role} onChange={event => setRole(event.target.value)} disabled={disabled || saving}>
            {WEB_TEAM_ROLES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <MemberAccessEditor access={access} disabled={disabled || saving} saving={saving} onChange={setAccess} />
      <div className="settings-button-row">
        <button className="button" type="submit" disabled={!canSubmit}>{saving ? "Adding..." : "Add member"}</button>
        <span className="muted-inline">The user must already have a StudioFlow/Firebase account.</span>
      </div>
    </form>
  );
}

type MemberProfileEditorProps = {
  member: TeamMemberDetail;
  disabled?: boolean;
  saving?: boolean;
  onSave: (profile: { displayName: string; email: string }) => Promise<unknown>;
};

export function MemberProfileEditor({ member, disabled = false, saving = false, onSave }: MemberProfileEditorProps) {
  const [displayName, setDisplayName] = useState(member.displayName);
  const [email, setEmail] = useState(member.email);

  useEffect(() => {
    setDisplayName(member.displayName);
    setEmail(member.email);
  }, [member.displayName, member.email, member.id]);

  const dirty = useMemo(() => {
    return displayName.trim() !== member.displayName || email.trim() !== member.email;
  }, [displayName, email, member.displayName, member.email]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || disabled || saving) return;
    await onSave({ displayName: displayName.trim(), email: email.trim() });
  }

  return (
    <form className="member-profile-editor" onSubmit={submit}>
      <label>
        <span>Name</span>
        <input className="input" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Visible name" disabled={disabled || saving} />
      </label>
      <label>
        <span>Email</span>
        <input className="input" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" disabled={disabled || saving} />
      </label>
      <button className="button secondary" type="submit" disabled={!dirty || disabled || saving}>{saving ? "Saving..." : "Save profile"}</button>
    </form>
  );
}
