"use client";

// Feedback Inbox (spec §40, §44, §45 — the v1 slice): what people wrote from
// inside the app, newest first, with a status the admin can move. Reads and
// writes go through the admin callables; nothing here e-mails the person back.

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
  const [saved, setSaved] = useState(false);

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
    setOpenId(id); setDetail(null); setSaved(false); setError("");
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
    setSaving(true); setSaved(false); setError("");
    try {
      const updated = await updateFeedbackStatus(detail.id, detailStatus, detailNote);
      setDetail(updated); setSaved(true);
      setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, status: updated.status, ownerUid: updated.ownerUid, updatedAtMs: updated.updatedAtMs } : row)));
    } catch (err) {
      setError(String((err as { message?: string })?.message || "The change could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  const cell = { padding: "8px 6px", verticalAlign: "top" as const };
  const head = { textAlign: "left" as const, color: "var(--muted)", fontSize: 11, fontWeight: 800 };
  const pill = (value: string) => <span className="studio-pill" style={{ whiteSpace: "nowrap" }}>{t(STATUS_LABELS[value] || value)}</span>;

  if (openId) {
    return (
      <section className="card app-card quick-reply-settings-card" data-testid="feedback-inbox-detail">
        <button type="button" className="button secondary" onClick={() => { setOpenId(""); setDetail(null); }}>{t("Back")}</button>
        {!detail ? <p className="muted-copy">{t("Working it out…")}</p> : (
          <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
            <CardTitle icon="docText" eyebrow={t("Customer Feedback")} title={`${t(TYPE_LABELS[detail.feedbackType] || detail.feedbackType)} · ${t(EXPERIENCE_LABELS[detail.experience] || detail.experience)}`} />
            <ul className="settings-summary-list" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 13 }}>
              <li><span>{t("Received")}</span>: {when(detail.createdAtMs, locale)}</li>
              <li><span>{t("Workspace")}</span>: {detail.workspaceName || "—"} <span className="muted-copy">({detail.companyId})</span></li>
              <li><span>{t("From")}</span>: {detail.userEmail || detail.uid}</li>
              <li><span>{t("Trigger")}</span>: {t(TRIGGER_LABELS[detail.trigger] || detail.trigger)}{detail.kind ? ` · ${t(KIND_LABELS[detail.kind] || detail.kind)}` : ""}</li>
              <li><span>{t("Page")}</span>: {detail.page || "—"} · <span>{t("Platform")}</span>: {detail.platform || "—"} · <span>{t("Language")}</span>: {detail.language || "—"}</li>
            </ul>
            <div>
              <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.02em", color: "var(--muted)" }}>{t("Note")}</strong>
              <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0", fontSize: 14 }}>{detail.text || <span className="muted-copy">{t("No text — a one-tap answer.")}</span>}</p>
            </div>
            <div className="settings-action-row" style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                <span>{t("Status")}</span>
                <select value={detailStatus} onChange={(event) => setDetailStatus(event.target.value as FeedbackStatus)} disabled={saving}>
                  {FEEDBACK_STATUSES.map((value) => <option key={value} value={value}>{t(STATUS_LABELS[value])}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                <span>{t("Internal note")}</span>
                <textarea rows={3} value={detailNote} maxLength={2000} onChange={(event) => setDetailNote(event.target.value)} disabled={saving} />
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="button" onClick={() => void save()} disabled={saving}>{saving ? t("Saving…") : t("Save")}</button>
                {saved ? <span className="muted-copy">{t("Saved.")}</span> : null}
              </div>
            </div>
            {detail.statusHistory?.length ? (
              <div>
                <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.02em", color: "var(--muted)" }}>{t("History")}</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, display: "grid", gap: 2 }}>
                  {detail.statusHistory.map((entry, index) => <li key={`${entry.atMs}-${index}`}>{when(entry.atMs, locale)} · {t(STATUS_LABELS[entry.status] || entry.status)}</li>)}
                </ul>
              </div>
            ) : null}
            {error ? <p className="layout-error">{t(error)}</p> : null}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card app-card quick-reply-settings-card" data-testid="feedback-inbox">
      <CardTitle icon="docText" eyebrow={t("Product")} title={t("Customer Feedback")} />
      <p className="muted-copy">{t("What people wrote from inside the app. Newest first. Nothing here is sent back to them automatically.")}</p>
      <div className="settings-action-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <span className="muted-copy">{t("Status")}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as FeedbackStatus | "")}>
            <option value="">{t("All")}</option>
            {FEEDBACK_STATUSES.map((value) => <option key={value} value={value}>{t(STATUS_LABELS[value])}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <span className="muted-copy">{t("Type")}</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">{t("All")}</option>
            {(types.length ? types : Object.keys(TYPE_LABELS)).map((value) => <option key={value} value={value}>{t(TYPE_LABELS[value] || value)}</option>)}
          </select>
        </label>
        <button type="button" className="button secondary" onClick={() => void load(false)} disabled={loading}>{t("Refresh")}</button>
      </div>
      {error ? <p className="layout-error">{t(error)}</p> : null}
      {loading && rows.length === 0 ? <p className="muted-copy">{t("Working it out…")}</p> : null}
      {!loading && rows.length === 0 ? <p className="muted-copy">{t("Nothing yet.")}</p> : null}
      {rows.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={head}>
              <th style={cell}>{t("Received")}</th><th style={cell}>{t("Type")}</th><th style={cell}>{t("Experience")}</th>
              <th style={cell}>{t("Workspace")}</th><th style={cell}>{t("From")}</th><th style={cell}>{t("Note")}</th><th style={cell}>{t("Status")}</th><th style={cell}></th>
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{when(row.createdAtMs, locale)}</td>
                  <td style={cell}>{t(TYPE_LABELS[row.feedbackType] || row.feedbackType)}{row.kind ? <div className="muted-copy" style={{ fontSize: 12 }}>{t(KIND_LABELS[row.kind] || row.kind)}</div> : null}</td>
                  <td style={cell}>{t(EXPERIENCE_LABELS[row.experience] || row.experience)}</td>
                  <td style={cell}>{row.workspaceName || row.companyId}</td>
                  <td style={cell}>{row.userEmail || "—"}</td>
                  <td style={{ ...cell, maxWidth: 360 }}>{row.excerpt ? `${row.excerpt}${row.textLength > row.excerpt.length ? "…" : ""}` : <span className="muted-copy">{t("No text — a one-tap answer.")}</span>}</td>
                  <td style={cell}>{pill(row.status)}</td>
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
