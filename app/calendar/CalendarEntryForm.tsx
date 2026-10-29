"use client";

// Calendar V1 — the entry form (new entry and edit). The first screen is short: type, title, date/time,
// who can see it. Description, person, linked order, repeat, place and link open on demand.
// Who an entry is shared with is always written out before saving; assigning a task to somebody never
// opens it silently — the form adds them to the list and says so.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as core from "@/lib/studioflow/calendarCore";
import type { CalendarDraft } from "@/lib/studioflow/calendarData";
import type { NoteWorkspaceMember } from "@/lib/studioflow/noteSharing";
import { TYPE_META } from "./calendarUi";

export type CalendarFormMode =
  | { kind: "create" }
  | { kind: "edit"; entry: core.CalendarEntry; occurrenceKey: string | null; canShare: boolean };

export type CalendarSeriesScope = "only" | "following";

type Props = {
  open: boolean;
  mode: CalendarFormMode;
  initial: CalendarDraft;
  uid: string;
  members: NoteWorkspaceMember[];
  orders: { id: string; title: string }[];
  canPublishWorkspace: boolean;
  t: (text: string) => string;
  onCancel: () => void;
  onSave: (draft: CalendarDraft, scope: CalendarSeriesScope | null) => Promise<void>;
};

const ERROR_TEXT: Record<string, string> = {
  title: "Add a title.",
  noteText: "Write the note.",
  date: "Pick a date.",
  endDate: "The end can't be before the start.",
  span: "An entry can span at most 62 days.",
  startTime: "Pick a start and end time.",
  endTime: "The end time must be after the start.",
  timeZone: "Pick a start and end time.",
  person: "Pick a person or type a name label.",
  weekdays: "Pick at least one weekday.",
  until: "The repeat can't end before it starts.",
  recurrence: "Pick at least one weekday.",
  assigneeAccess: "A task can only be assigned to someone who can see it.",
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function weekdayShort(n: number, locale: string): string {
  // 2024-01-01 was a Monday.
  const date = new Date(Date.UTC(2024, 0, n));
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date);
}

export function CalendarEntryForm({ open, mode, initial, uid, members, orders, canPublishWorkspace, t, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState<CalendarDraft>(initial);
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [scope, setScope] = useState<CalendarSeriesScope>("only");
  const [repeatEnd, setRepeatEnd] = useState<"never" | "until" | "count">("never");
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setErrors([]);
    setSaveError("");
    setSaving(false);
    setScope("only");
    const r = initial.recurrence;
    setRepeatEnd(r?.untilKey ? "until" : r?.count ? "count" : "never");
    setMoreOpen(Boolean(initial.description || (initial.personUid && initial.type === "task") || initial.orderId || initial.recurrence || initial.location || initial.meetingUrl));
    window.setTimeout(() => firstField.current?.focus(), 30);
  }, [open, initial]);

  const isEdit = mode.kind === "edit";
  const seriesOccurrence = mode.kind === "edit" && mode.entry.rowType === "series" && mode.occurrenceKey;
  const canShare = mode.kind === "create" || mode.canShare;
  const ownerUid = mode.kind === "edit" ? mode.entry.ownerUid : uid;
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-GB";

  const pickable = useMemo(() => members.filter((m) => m.uid && m.uid !== ownerUid && !m.suspended), [members, ownerUid]);
  const memberName = (m: NoteWorkspaceMember) => m.name || m.email || m.uid;
  const nameOf = (memberUid: string) => {
    const m = members.find((x) => x.uid === memberUid);
    return m ? memberName(m) : memberUid;
  };

  const sharing = core.sharingFor({ ownerUid, visibility: draft.visibility, viewerUids: draft.viewerUids, editorUids: draft.editorUids, workspaceRole: draft.workspaceRole, personUid: draft.personUid, type: draft.type });

  function patch(next: Partial<CalendarDraft>) {
    setDraft((d) => ({ ...d, ...next }));
    setErrors([]);
    setSaveError("");
  }

  // Picking somebody else for a private task makes it "Selected people" with them on the list (shown).
  function choosePerson(value: string) {
    if (value.startsWith("uid:")) {
      const personUid = value.slice(4);
      const next: Partial<CalendarDraft> = { personUid, personLabel: null };
      if (draft.type === "task" && personUid !== ownerUid && draft.visibility === "private" && canShare) {
        next.visibility = "selected";
        next.viewerUids = [...new Set([...draft.viewerUids, personUid])];
      }
      patch(next);
    } else if (value === "label") {
      patch({ personUid: null, personLabel: draft.personLabel || "" });
    } else {
      patch({ personUid: null, personLabel: null });
    }
  }

  function togglePerson(memberUid: string, role: "none" | "view" | "edit") {
    const viewers = draft.viewerUids.filter((x) => x !== memberUid);
    const editors = draft.editorUids.filter((x) => x !== memberUid);
    if (role === "view") viewers.push(memberUid);
    if (role === "edit") editors.push(memberUid);
    patch({ viewerUids: viewers, editorUids: editors });
  }

  function setRepeat(kind: "none" | "daily" | "weekly") {
    if (kind === "none") patch({ recurrence: null });
    else patch({ recurrence: { freq: kind, interval: 1, byWeekday: kind === "weekly" ? (draft.recurrence?.byWeekday?.length ? draft.recurrence.byWeekday : [core.isoWeekday(draft.dateKey)]) : [], untilKey: draft.recurrence?.untilKey ?? null, count: draft.recurrence?.count ?? null } });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const recurrence = draft.recurrence
      ? { ...draft.recurrence, untilKey: repeatEnd === "until" ? draft.recurrence.untilKey : null, count: repeatEnd === "count" ? draft.recurrence.count : null }
      : null;
    const toSave: CalendarDraft = {
      ...draft,
      endDateKey: draft.endDateKey && draft.endDateKey >= draft.dateKey ? draft.endDateKey : draft.dateKey,
      recurrence,
    };
    const found = core.validateDraft({ ...toSave, ownerUid, accessUids: sharing.accessUids, visibility: sharing.visibility });
    if (found.length) {
      setErrors(found);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSave(toSave, seriesOccurrence ? scope : null);
    } catch (error) {
      const name = (error as Error)?.name;
      setSaveError(name === "CalendarConflictError"
        ? t("Someone else changed this entry while you were editing. Your changes were not saved; reopen it and try again.")
        : name === "CalendarGoneError"
          ? t("This entry is no longer available to you.")
          : t("Not saved. Nothing was changed — try again."));
      setSaving(false);
    }
  }

  if (!open) return null;
  const personValue = draft.personUid ? `uid:${draft.personUid}` : draft.personLabel !== null ? "label" : "";
  const personIsMember = (m: NoteWorkspaceMember) => m.uid === draft.personUid;
  // Work day and unavailable need a person: the field sits on the first screen for them.
  const personFirst = draft.type === "workday" || draft.type === "unavailable";
  const personField = draft.type === "note" ? null : (
                <div className="cal-field">
                  <span>{draft.type === "task" ? t("Assigned to") : t("Who it is about")}</span>
                  <select className="input" value={personValue} onChange={(e) => choosePerson(e.target.value)}>
                    <option value="">{t("Nobody")}</option>
                    {members.filter((m) => !m.suspended).map((m) => (
                      <option key={m.uid} value={`uid:${m.uid}`} disabled={draft.type === "task" && !canShare && !draft.viewerUids.includes(m.uid) && !personIsMember(m) && draft.visibility !== "workspace"}>{memberName(m)}</option>
                    ))}
                    {draft.type !== "task" ? <option value="label">{t("Name label")}</option> : null}
                  </select>
                  {draft.personLabel !== null && !draft.personUid ? (
                    <>
                      <input className="input" value={draft.personLabel} onChange={(e) => patch({ personLabel: e.target.value })} maxLength={core.LABEL_MAX} aria-label={t("Name label")} />
                      <small className="muted-copy">{t("A name label is only text — not an account. It gets no access and no notifications.")}</small>
                    </>
                  ) : null}
                </div>
  );
  const errorLines = [...new Set(errors.map((code) => ERROR_TEXT[code] || "Not saved. Nothing was changed — try again."))];
  const isNote = draft.type === "note";
  const viewerOnlyMember = (m: NoteWorkspaceMember) => m.role === "viewer";

  return (
    <div className="modal-backdrop cal-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}>
      <section className="cal-form" role="dialog" aria-modal="true" aria-labelledby="cal-form-title" onKeyDown={(e) => { if (e.key === "Escape" && !saving) onCancel(); }}>
        <form onSubmit={submit} noValidate>
          <header className="cal-form-head">
            <h2 id="cal-form-title">{isEdit ? t("Edit entry") : t("New entry")}</h2>
            <button type="button" className="cal-icon-button" onClick={onCancel} aria-label={t("Close")} disabled={saving}>×</button>
          </header>

          <div className="cal-type-row" role="radiogroup" aria-label={t("Type")}>
            {(["event", "task", "note", "workday", "unavailable"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={draft.type === type}
                className={`cal-type-choice${draft.type === type ? " is-active" : ""}`}
                onClick={() => patch({ type, personUid: type === "task" || type === "workday" || type === "unavailable" ? draft.personUid : null, personLabel: (type === "workday" || type === "unavailable") && !draft.personUid ? draft.personLabel ?? "" : type === "task" ? null : draft.personLabel })}
                disabled={isEdit && mode.kind === "edit" && mode.entry.rowType === "series" && Boolean(mode.occurrenceKey)}
              >
                <span aria-hidden="true">{TYPE_META[type].icon}</span> {t(TYPE_META[type].label)}
              </button>
            ))}
          </div>

          {isNote ? (
            <label className="cal-field">
              <span>{t("Note text")}</span>
              <textarea ref={(el) => { firstField.current = el; }} className="input cal-note-text" rows={5} value={draft.description} onChange={(e) => patch({ description: e.target.value })} maxLength={core.DESCRIPTION_MAX} />
            </label>
          ) : (
            <label className="cal-field">
              <span>{t("Title")}</span>
              <input ref={(el) => { firstField.current = el; }} className="input" value={draft.title} onChange={(e) => patch({ title: e.target.value })} maxLength={core.TITLE_MAX} />
            </label>
          )}

          <div className="cal-grid-2">
            <label className="cal-field">
              <span>{t("Date")}</span>
              <input type="date" className="input" value={draft.dateKey} onChange={(e) => {
                const dateKey = e.target.value;
                const span = core.isDateKey(draft.endDateKey) && core.isDateKey(draft.dateKey) ? core.dayNumber(draft.endDateKey) - core.dayNumber(draft.dateKey) : 0;
                patch({ dateKey, endDateKey: core.isDateKey(dateKey) ? core.addDays(dateKey, Math.max(0, span)) : dateKey });
              }} />
            </label>
            {!isNote ? (
              <label className="cal-field">
                <span>{t("End date")}</span>
                <input type="date" className="input" value={draft.endDateKey} min={draft.dateKey} onChange={(e) => patch({ endDateKey: e.target.value })} />
              </label>
            ) : null}
          </div>

          {!isNote ? (
            <div className="cal-time-row">
              <label className="cal-check">
                <input type="checkbox" checked={draft.allDay} onChange={(e) => patch({ allDay: e.target.checked, startTime: e.target.checked ? null : draft.startTime || "09:00", endTime: e.target.checked ? null : draft.endTime || "10:00" })} />
                <span>{t("All day")}</span>
              </label>
              {!draft.allDay ? (
                <>
                  <label className="cal-field cal-time">
                    <span>{t("Starts")}</span>
                    <input type="time" className="input" value={draft.startTime || ""} onChange={(e) => patch({ startTime: e.target.value })} />
                  </label>
                  <label className="cal-field cal-time">
                    <span>{t("Ends")}</span>
                    <input type="time" className="input" value={draft.endTime || ""} onChange={(e) => patch({ endTime: e.target.value })} />
                  </label>
                  <span className="muted-copy cal-zone">{draft.timeZone}</span>
                </>
              ) : null}
            </div>
          ) : null}

          {personFirst ? personField : null}

          <fieldset className="cal-fieldset" disabled={!canShare}>
            <legend>{t("Who can see it")}</legend>
            <div className="segmented-control cal-visibility" role="radiogroup">
              {([["private", "Only me"], ["selected", "Selected people"], ["workspace", "Whole workspace"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={draft.visibility === value}
                  className={draft.visibility === value ? "active" : ""}
                  disabled={value === "workspace" && !canPublishWorkspace}
                  onClick={() => patch({ visibility: value })}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            {draft.visibility === "selected" ? (
              <ul className="cal-people">
                {pickable.length === 0 ? <li className="muted-copy">{t("Nobody")}</li> : null}
                {pickable.map((m) => {
                  const role = draft.editorUids.includes(m.uid) ? "edit" : draft.viewerUids.includes(m.uid) ? "view" : "none";
                  return (
                    <li key={m.uid} className="cal-person-row">
                      <span className="cal-person-name">{memberName(m)}</span>
                      <select className="input cal-person-role" value={role} onChange={(e) => togglePerson(m.uid, e.target.value as "none" | "view" | "edit")} aria-label={memberName(m)}>
                        <option value="none">{t("Not shared")}</option>
                        <option value="view">{t("Can view")}</option>
                        <option value="edit" disabled={viewerOnlyMember(m)}>{t("Can edit")}</option>
                      </select>
                    </li>
                  );
                })}
                {pickable.some(viewerOnlyMember) ? <li className="muted-copy">{t("View Only members can see entries but never edit them.")}</li> : null}
              </ul>
            ) : null}
            {draft.visibility === "workspace" ? (
              <div className="segmented-control cal-visibility">
                {([["view", "Everyone can view"], ["edit", "Everyone can edit"]] as const).map(([value, label]) => (
                  <button key={value} type="button" className={draft.workspaceRole === value ? "active" : ""} onClick={() => patch({ workspaceRole: value })}>{t(label)}</button>
                ))}
              </div>
            ) : null}
            {sharing.addedForPerson && draft.personUid ? (
              <p className="cal-notice" role="status">{t("Shared with {name} so they can see the task assigned to them.").replace("{name}", nameOf(draft.personUid))}</p>
            ) : null}
            {draft.visibility !== "private" ? (
              <p className="muted-copy cal-share-summary">
                {t("Shared with")}: {sharing.visibility === "workspace"
                  ? t(sharing.workspaceRole === "edit" ? "Everyone in the workspace can edit this." : "Everyone in the workspace can see this.")
                  : sharing.accessUids.filter((x) => x !== ownerUid).map((x) => `${nameOf(x)}${sharing.editorUids.includes(x) ? ` (${t("can edit")})` : ""}`).join(", ") || t("Nobody")}
              </p>
            ) : null}
          </fieldset>

          <button type="button" className="cal-link-button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
            {moreOpen ? t("Fewer options") : t("More options")}
          </button>

          {moreOpen ? (
            <div className="cal-more">
              {isNote ? (
                <label className="cal-field">
                  <span>{t("Title")}</span>
                  <input className="input" value={draft.title} placeholder={core.autoNoteTitle(draft.description)} onChange={(e) => patch({ title: e.target.value })} maxLength={core.TITLE_MAX} />
                </label>
              ) : (
                <label className="cal-field">
                  <span>{t("Description")}</span>
                  <textarea className="input" rows={3} value={draft.description} onChange={(e) => patch({ description: e.target.value })} maxLength={core.DESCRIPTION_MAX} />
                </label>
              )}

              {!personFirst ? personField : null}

              {draft.type !== "note" ? (
                <label className="cal-field">
                  <span>{t("Linked order")}</span>
                  <select className="input" value={draft.orderId || ""} onChange={(e) => patch({ orderId: e.target.value || null })}>
                    <option value="">{t("No order")}</option>
                    {draft.orderId && !orders.some((o) => o.id === draft.orderId) ? <option value={draft.orderId}>{t("You can't open this order.")}</option> : null}
                    {orders.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                  </select>
                </label>
              ) : null}

              {!(seriesOccurrence && scope === "only") ? (
                <div className="cal-field">
                  <span>{t("Repeat")}</span>
                  <select className="input" value={draft.recurrence?.freq || "none"} onChange={(e) => setRepeat(e.target.value as "none" | "daily" | "weekly")}>
                    <option value="none">{t("Does not repeat")}</option>
                    <option value="daily">{t("Every day")}</option>
                    <option value="weekly">{t("Every week on")}</option>
                  </select>
                  {draft.recurrence?.freq === "weekly" ? (
                    <div className="cal-weekdays" role="group" aria-label={t("Every week on")}>
                      {WEEKDAYS.map((n) => {
                        const on = draft.recurrence?.byWeekday.includes(n);
                        return (
                          <button key={n} type="button" aria-pressed={on} className={`cal-weekday${on ? " is-active" : ""}`} onClick={() => {
                            const set = new Set(draft.recurrence?.byWeekday || []);
                            if (set.has(n)) set.delete(n);
                            else set.add(n);
                            patch({ recurrence: { ...(draft.recurrence as core.CalendarRecurrence), byWeekday: [...set].sort((a, b) => a - b) } });
                          }}>{weekdayShort(n, locale)}</button>
                        );
                      })}
                    </div>
                  ) : null}
                  {draft.recurrence ? (
                    <div className="cal-grid-2">
                      <label className="cal-field">
                        <span>{t("Repeat ends")}</span>
                        <select className="input" value={repeatEnd} onChange={(e) => setRepeatEnd(e.target.value as "never" | "until" | "count")}>
                          <option value="never">{t("Never")}</option>
                          <option value="until">{t("On a date")}</option>
                          <option value="count">{t("After a number of times")}</option>
                        </select>
                      </label>
                      {repeatEnd === "until" ? (
                        <label className="cal-field">
                          <span>{t("End date")}</span>
                          <input type="date" className="input" min={draft.dateKey} value={draft.recurrence.untilKey || ""} onChange={(e) => patch({ recurrence: { ...(draft.recurrence as core.CalendarRecurrence), untilKey: e.target.value || null } })} />
                        </label>
                      ) : null}
                      {repeatEnd === "count" ? (
                        <label className="cal-field">
                          <span>{t("Number of times")}</span>
                          <input type="number" min={1} max={500} className="input" value={draft.recurrence.count || ""} onChange={(e) => patch({ recurrence: { ...(draft.recurrence as core.CalendarRecurrence), count: Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 1))) } })} />
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {draft.type === "event" ? (
                <div className="cal-grid-2">
                  <label className="cal-field">
                    <span>{t("Location")}</span>
                    <input className="input" value={draft.location} onChange={(e) => patch({ location: e.target.value })} maxLength={300} />
                  </label>
                  <label className="cal-field">
                    <span>{t("Meeting link")}</span>
                    <input className="input" type="url" value={draft.meetingUrl} onChange={(e) => patch({ meetingUrl: e.target.value })} maxLength={500} />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {seriesOccurrence ? (
            <fieldset className="cal-fieldset">
              <legend>{t("This is a repeating entry. Change only this one, or this one and the ones after it?")}</legend>
              <label className="cal-check"><input type="radio" name="cal-scope" checked={scope === "only"} onChange={() => setScope("only")} /> <span>{t("Only this one")}</span></label>
              <label className="cal-check"><input type="radio" name="cal-scope" checked={scope === "following"} onChange={() => setScope("following")} /> <span>{t("This and following")}</span></label>
              {scope === "following" ? <small className="muted-copy">{t("Earlier ones, their notes and completed tasks stay as they are.")}</small> : null}
            </fieldset>
          ) : null}

          {errorLines.length ? (
            <ul className="cal-errors" role="alert">{errorLines.map((line) => <li key={line}>{t(line)}</li>)}</ul>
          ) : null}
          {saveError ? <p className="cal-errors" role="alert">{saveError}</p> : null}

          <footer className="cal-form-foot">
            <button type="button" className="button secondary" onClick={onCancel} disabled={saving}>{t("Cancel")}</button>
            <button type="submit" className="button" disabled={saving}>{saving ? t("Saving…") : t("Save")}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
