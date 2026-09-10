"use client";

// Feedback Inbox (spec §40, §44, §45 — the v1 slice): what people wrote from
// inside the app, newest first, with a status the admin can move. Reads and
// writes go through the admin callables; nothing here e-mails the person back.
// Access is the support-admin allowlist (functions/index.js SUPPORT_ADMIN_EMAILS,
// mirrored for the page gate in AdminInsightsHub NIVADESK_ADMIN_EMAILS) — not
// the pilot list, which only says whose form is on.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { CardTitle } from "@/components/CardTitle";
import {
  FEEDBACK_STATUSES, getFeedbackDetail, listFeedback, updateFeedbackStatus,
  type FeedbackRecord, type FeedbackRow, type FeedbackStatus
} from "@/lib/studioflow/feedback";

const STATUS_LABELS: Record<string, string> = {
  new: "New", reviewing: "Reviewing", planned: "Planned", in_progress: "In progress", shipped: "Shipped", closed: "Closed", not_planned: "Not planned"
};
const TYPE_LABELS: Record<string, string> = {
  onboarding_effort: "Onboarding effort", activation_blocker: "Activation blocker", missing_expectation: "Missing expectation",
  feature_request: "Feature request", bug_report: "Bug report", confusion: "Confusion", general_feedback: "General feedback",
  cancellation_reason: "Cancellation reason", interview_note: "Interview note"
};
const EXPERIENCE_LABELS: Record<string, string> = { easy: "Going well", okay: "It's okay", difficult: "Struggling" };
const KIND_LABELS: Record<string, string> = { problem: "Something isn't working", missing_feature: "Something is missing", suggestion: "A suggestion" };
const TRIGGER_LABELS: Record<string, string> = { first_success: "After first order", manual: "Manual" };

function when(ms: number, locale: string) {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }); } catch { return new Date(ms).toISOString(); }
}

export function AdminFeedbackInbox() {
  const { language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const locale = useMemo(() => (language === "Türkçe" ? "tr-TR" : "en-GB"), [language]);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [nextBeforeMs, setNextBeforeMs] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [status, setStatus] = useState<FeedbackStatus | "">("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");
  const [detail, setDetail] = useState<FeedbackRecord | null>(null);
  const [detailStatus, setDetailStatus] = useState<FeedbackStatus>("new");
  const [detailNote, setDetailNote] = useState("");
  const [saving, setSaving] = useState(false);
  // "Saved." shows only after a successful save, and only while nothing has changed since.
  const [savedAs, setSavedAs] = useState<{ status: string; note: string } | null>(null);

  const load = useCallback(async (append: boolean) => {
    setLoading(true); setError("");
    try {
      const result = await listFeedback({ status, feedbackType: type, limit: 50, beforeMs: append ? nextBeforeMs : 0 });
      setRows((current) => (append ? [...current, ...result.rows] : result.rows));
      setNextBeforeMs(result.nextBeforeMs);
      if (result.feedbackTypes?.length) setTypes(result.feedbackTypes);
    } catch (err) {
      setError(String((err as { message?: string })?.message || "The inbox could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [status, type, nextBeforeMs]);

  useEffect(() => { void load(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type]);

  async function open(id: string) {
    setOpenId(id); setDetail(null); setSavedAs(null); setError("");
    try {
      const record = await getFeedbackDetail(id);
      setDetail(record);
      setDetailStatus((FEEDBACK_STATUSES.includes(record.status as FeedbackStatus) ? record.status : "new") as FeedbackStatus);
      setDetailNote(record.adminNote || "");
    } catch (err) {
      setError(String((err as { message?: string })?.message || "The note could not be opened."));
    }
  }

  async function save() {
    if (!detail || saving) return;
    setSaving(true); setError("");
    try {
      const updated = await updateFeedbackStatus(detail.id, detailStatus, detailNote);
      setDetail(updated);
      setSavedAs({ status: updated.status, note: updated.adminNote || "" });
      setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, status: updated.status, ownerUid: updated.ownerUid, updatedAtMs: updated.updatedAtMs } : row)));
    } catch (err) {
      setError(String((err as { message?: string })?.message || "The change could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  const dirty = Boolean(detail) && (detailStatus !== (detail?.status || "new") || detailNote !== (detail?.adminNote || ""));
  const showSaved = Boolean(savedAs) && !dirty && savedAs?.status === detailStatus && savedAs?.note === detailNote;
  const badge = (value: string) => <span className={`studio-pill feedback-status feedback-status-${value}`}>{t(STATUS_LABELS[value] || value)}</span>;
  const cell = { padding: "10px 8px", verticalAlign: "top" as const };
  const head = { textAlign: "left" as const, color: "var(--muted)", fontSize: 11, fontWeight: 800, letterSpacing: "0.02em" };

  if (openId) {
    return (
      <section className="card app-card quick-reply-settings-card feedback-detail" data-testid="feedback-inbox-detail">
        <p className="muted-copy" style={{ margin: "0 0 10px" }}>
          <button type="button" className="feedback-back" onClick={() => { setOpenId(""); setDetail(null); setSavedAs(null); }}>← {t("Back to feedback")}</button>
        </p>
        {!detail ? <p className="muted-copy">{t("Working it out…")}</p> : (
          <div style={{ display: "grid", gap: 16 }}>
            <CardTitle icon="docText" eyebrow={t("Customer Feedback")} title={`${t(TYPE_LABELS[detail.feedbackType] || detail.feedbackType)} · ${t(EXPERIENCE_LABELS[detail.experience] || detail.experience)}`} />

            <section className="feedback-detail-message" aria-label={t("Message")}>
              <span className="feedback-detail-label">{t("Message")}</span>
              {detail.text ? <p>{detail.text}</p> : <p className="muted-copy">{t("No text — a one-tap answer.")}</p>}
            </section>

            <dl className="feedback-meta" aria-label={t("Details")}>
              <div><dt>{t("Received")}</dt><dd>{when(detail.createdAtMs, locale)}</dd></div>
              <div><dt>{t("Workspace")}</dt><dd>{detail.workspaceName || "—"} <span className="muted-copy">({detail.companyId})</span></dd></div>
              <div><dt>{t("From")}</dt><dd>{detail.userEmail || detail.uid}</dd></div>
              <div><dt>{t("Trigger")}</dt><dd>{t(TRIGGER_LABELS[detail.trigger] || detail.trigger)}</dd></div>
              <div><dt>{t("Topic")}</dt><dd>{detail.kind ? t(KIND_LABELS[detail.kind] || detail.kind) : "—"}</dd></div>
              <div><dt>{t("Type")}</dt><dd>{t(TYPE_LABELS[detail.feedbackType] || detail.feedbackType)}</dd></div>
              <div><dt>{t("Experience")}</dt><dd>{t(EXPERIENCE_LABELS[detail.experience] || detail.experience)}</dd></div>
              <div><dt>{t("Page")}</dt><dd>{detail.page || "—"} · {detail.platform || "—"} · {detail.language || "—"}</dd></div>
            </dl>

            <div className="feedback-detail-controls">
              <label className="feedback-field">
                <span>{t("Status")}</span>
                <select className="input feedback-select" value={detailStatus} onChange={(event) => setDetailStatus(event.target.value as FeedbackStatus)} disabled={saving}>
                  {FEEDBACK_STATUSES.map((value) => <option key={value} value={value}>{t(STATUS_LABELS[value])}</option>)}
                </select>
              </label>
              <label className="feedback-field">
                <span>{t("Internal note")}</span>
                <textarea className="input feedback-note" rows={4} value={detailNote} maxLength={2000} onChange={(event) => setDetailNote(event.target.value)} disabled={saving} />
              </label>
              <div className="feedback-detail-actions">
                <button type="button" className="button" onClick={() => void save()} disabled={saving || !dirty}>{saving ? t("Saving…") : t("Save")}</button>
                {showSaved ? <span className="muted-copy" role="status">{t("Saved.")}</span> : null}
              </div>
              {error ? <p className="layout-error" role="alert">{t(error)}</p> : null}
            </div>

            {detail.statusHistory?.length ? (
              <section aria-label={t("History")}>
                <span className="feedback-detail-label">{t("History")}</span>
                <ol className="feedback-history">
                  {detail.statusHistory.map((entry, index) => (
                    <li key={`${entry.atMs}-${index}`}><span className="muted-copy">{when(entry.atMs, locale)}</span> {badge(entry.status)}</li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        )}
        {!detail && error ? <p className="layout-error" role="alert">{t(error)}</p> : null}
      </section>
    );
  }

  return (
    <section className="card app-card quick-reply-settings-card" data-testid="feedback-inbox">
      <CardTitle icon="docText" eyebrow={t("Product")} title={t("Customer Feedback")} />
      <p className="muted-copy">{t("Status changes and internal notes are visible only to admins.")}</p>
      <div className="feedback-filters">
        <label className="feedback-filter-field">
          <span className="muted-copy">{t("Status")}</span>
          <select className="input feedback-select" value={status} onChange={(event) => setStatus(event.target.value as FeedbackStatus | "")}>
            <option value="">{t("All")}</option>
            {FEEDBACK_STATUSES.map((value) => <option key={value} value={value}>{t(STATUS_LABELS[value])}</option>)}
          </select>
        </label>
        <label className="feedback-filter-field">
          <span className="muted-copy">{t("Type")}</span>
          <select className="input feedback-select" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">{t("All")}</option>
            {(types.length ? types : Object.keys(TYPE_LABELS)).map((value) => <option key={value} value={value}>{t(TYPE_LABELS[value] || value)}</option>)}
          </select>
        </label>
        <button type="button" className="button secondary" onClick={() => void load(false)} disabled={loading}>{t("Refresh")}</button>
      </div>
      {error ? <p className="layout-error" role="alert">{t(error)}</p> : null}
      {loading && rows.length === 0 ? <p className="muted-copy" role="status">{t("Working it out…")}</p> : null}
      {!loading && !error && rows.length === 0 ? <p className="muted-copy">{t("Nothing yet.")}</p> : null}
      {rows.length ? (
        <div className="feedback-table-wrap">
          <table className="feedback-table">
            <thead><tr style={head}>
              <th style={cell}>{t("Received")}</th><th style={cell}>{t("Type")}</th><th style={cell}>{t("Experience")}</th>
              <th style={cell}>{t("From")}</th><th style={cell}>{t("Note")}</th><th style={cell}>{t("Status")}</th><th style={cell}></th>
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{when(row.createdAtMs, locale)}</td>
                  <td style={cell}>
                    <div>{t(TYPE_LABELS[row.feedbackType] || row.feedbackType)}</div>
                    {row.kind ? <div className="muted-copy feedback-cell-sub">{t(KIND_LABELS[row.kind] || row.kind)}</div> : null}
                  </td>
                  <td style={cell}>{t(EXPERIENCE_LABELS[row.experience] || row.experience)}</td>
                  <td style={cell}>
                    <div><strong>{row.workspaceName || row.companyId}</strong></div>
                    <div className="muted-copy feedback-cell-sub">{row.userEmail || "—"}</div>
                  </td>
                  <td style={{ ...cell, minWidth: 220, maxWidth: 380 }}>
                    {row.excerpt ? <div className="feedback-excerpt" title={row.textLength > row.excerpt.length ? t("Open") : undefined}>{row.excerpt}{row.textLength > row.excerpt.length ? "…" : ""}</div> : <span className="muted-copy">{t("No text — a one-tap answer.")}</span>}
                  </td>
                  <td style={cell}>{badge(row.status)}</td>
                  <td style={cell}><button type="button" className="button secondary" onClick={() => void open(row.id)}>{t("Open")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {nextBeforeMs ? <button type="button" className="button secondary" onClick={() => void load(true)} disabled={loading}>{t("Load more")}</button> : null}
    </section>
  );
}
