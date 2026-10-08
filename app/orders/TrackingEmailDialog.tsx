"use client";

// The editable preview of "Send the tracking details to the customer by e-mail?".
//
// Opening it sends nothing: the server renders the words (preview: true) and the member reads
// them — recipient, sender, subject, message, and the details block the server will append: the
// order reference, the carrier, the number and a link the server built from an allow-list of
// carriers (else 17TRACK's public page). Only the Send button sends, exactly once per number;
// "Send again" is the member's explicit choice and is counted on the record.

import { useEffect, useRef, useState } from "react";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { previewOrderTrackingEmail, sendOrderTrackingEmail, type TrackingEmailPreview } from "@/lib/studioflow/trackingEmail";
import { fillResultLine, isPlausibleEmail, type TrackingEmailRecord } from "@/lib/studioflow/trackingEmailRules";

export function formatTrackingEmailTime(ms: number, locale: string): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return new Date(ms).toISOString();
  }
}

export function TrackingEmailDialog({
  workspace,
  orderId,
  language,
  resend,
  onClose,
  onResult
}: {
  workspace: WorkspaceContext;
  orderId: string;
  language: string;
  /** Opened from "Resend": the member already knows a copy went out. */
  resend: boolean;
  onClose: () => void;
  onResult: (record: TrackingEmailRecord | null) => void;
}) {
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<TrackingEmailPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<TrackingEmailRecord | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [alreadySent, setAlreadySent] = useState<TrackingEmailRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    previewOrderTrackingEmail(workspace, { orderId, language })
      .then(result => {
        if (cancelled) return;
        setPreview(result);
        setTo(result.to);
        setSubject(result.subject);
        setMessage(result.message);
        if (!result.decision.send && result.lastResult) setAlreadySent(result.lastResult);
      })
      .catch(error => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  }, [workspace, orderId, language]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [preview]);

  const toValid = isPlausibleEmail(to);
  const willResend = resend || Boolean(alreadySent);

  async function send() {
    if (!preview || sending || !toValid) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendOrderTrackingEmail(workspace, { orderId, to, subject, message, language, resend: willResend });
      if (result.ok) {
        setSent(result.trackingEmail);
        onResult(result.trackingEmail);
      } else if (result.reason === "already_sent") {
        // A second tab or a second click: nothing went out. Offer the explicit resend.
        setAlreadySent(result.trackingEmail);
        setSendError(t("Not sent: this number was already e-mailed."));
        onResult(result.trackingEmail);
      } else {
        setSendError(fillResultLine(t("The e-mail could not be sent: {error}"), { to: "", at: "", error: result.message || result.trackingEmail?.lastError || "unknown error" }));
        onResult(result.trackingEmail);
      }
    } catch (error) {
      setSendError(fillResultLine(t("The e-mail could not be sent: {error}"), { to: "", at: "", error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setSending(false);
    }
  }

  const detailRows: Array<[string, string]> = preview ? [
    [t("Order reference"), preview.orderReference || "-"],
    [t("Carrier"), preview.carrierLabel || preview.carrier || t("Not set")],
    [t("Tracking number"), preview.trackingNumber]
  ] : [];

  return (
    <div className="inventory-modal-backdrop" role="presentation" onMouseDown={() => { if (!sending) onClose(); }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="inventory-modal tracking-email-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-email-title"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => { if (event.key === "Escape" && !sending) onClose(); }}
        style={{ maxWidth: 640 }}
      >
        <div className="inventory-modal-head">
          <h2 id="tracking-email-title">{t("Tracking details by e-mail")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")} disabled={sending}>×</button>
        </div>

        {!preview && !loadError ? <p className="shipment-muted" role="status">{t("Preparing the preview…")}</p> : null}
        {loadError ? <p className="layout-error" role="alert">{`${t("Could not prepare the e-mail preview.")} ${loadError}`}</p> : null}

        {preview && sent ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p className="layout-status" role="status" style={{ margin: 0, fontWeight: 600 }}>
              {fillResultLine(t("Tracking details e-mailed to {to} on {at}."), { to: sent.to, at: formatTrackingEmailTime(sent.sentAtMs, locale), error: "" })}
            </p>
            <div className="inventory-modal-actions">
              <button type="button" className="button" onClick={onClose}>{t("Close")}</button>
            </div>
          </div>
        ) : null}

        {preview && !sent ? (
          <form
            style={{ display: "grid", gap: 12 }}
            onSubmit={event => { event.preventDefault(); void send(); }}
          >
            {alreadySent ? (
              <p className="shipment-banner" data-tone="warn" style={{ margin: 0 }}>
                {fillResultLine(t("Already e-mailed to {to} on {at}. Sending again will deliver a second copy."), { to: alreadySent.to, at: formatTrackingEmailTime(alreadySent.sentAtMs, locale), error: "" })}
              </p>
            ) : null}

            {!preview.hasCustomerEmail ? (
              <p className="shipment-banner" data-tone="warn" style={{ margin: 0 }} role="alert">
                {t("This order has no customer e-mail address. Enter one here to send, or add it to the order first.")}
              </p>
            ) : null}

            <div className="inventory-form">
              <label className="inventory-field is-wide">
                <span>{t("Recipient")}</span>
                <input
                  className="input"
                  type="email"
                  value={to}
                  onChange={event => setTo(event.target.value)}
                  aria-invalid={to.length > 0 && !toValid}
                  autoComplete="off"
                  disabled={sending}
                />
                {to.length > 0 && !toValid ? <span className="inventory-field-hint" style={{ color: "#dc2626" }}>{t("Enter a valid e-mail address.")}</span> : null}
              </label>
              <label className="inventory-field">
                <span>{t("Sender")}</span>
                <input className="input" value={preview.from} readOnly aria-readonly="true" />
              </label>
              <label className="inventory-field">
                <span>{t("Reply-To")}</span>
                <input className="input" value={preview.replyTo} readOnly aria-readonly="true" placeholder={t("Not set")} />
                {!preview.replyTo ? <span className="inventory-field-hint">{t("Not set — add a reply-to address in Settings so the customer's reply reaches you.")}</span> : null}
              </label>
              <label className="inventory-field is-wide">
                <span>{t("Subject")}</span>
                <input className="input" value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} disabled={sending} />
              </label>
              <label className="inventory-field is-wide">
                <span>{t("Message")}</span>
                <textarea
                  className="input"
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  rows={6}
                  maxLength={4000}
                  disabled={sending}
                  style={{ fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
                />
                <span className="inventory-field-hint">{t("A tracking number is not proof of dispatch: the message says the details appear once the carrier scans the parcel.")}</span>
              </label>
            </div>

            <section className="shipment-section" style={{ borderRadius: 10, padding: "10px 12px", background: "rgba(120,120,140,0.08)" }}>
              <dl style={{ display: "grid", gridTemplateColumns: "minmax(110px, max-content) 1fr", gap: "4px 12px", margin: 0, fontSize: 13 }}>
                {detailRows.map(([label, value]) => (
                  <div key={label} style={{ display: "contents" }}>
                    <dt style={{ opacity: 0.7, fontWeight: 700, fontSize: 11 }}>{label}</dt>
                    <dd style={{ margin: 0, fontWeight: 600, overflowWrap: "anywhere" }}>{value}</dd>
                  </div>
                ))}
                <div style={{ display: "contents" }}>
                  <dt style={{ opacity: 0.7, fontWeight: 700, fontSize: 11 }}>{t("Tracking link")}</dt>
                  <dd style={{ margin: 0, overflowWrap: "anywhere" }}>
                    {preview.link ? <a href={preview.link} target="_blank" rel="noopener noreferrer">{preview.link}</a> : "-"}
                  </dd>
                </div>
              </dl>
              <p className="shipment-muted" style={{ marginTop: 8 }}>
                {preview.linkIsGeneric
                  ? t("17TRACK public page: this carrier is not in the link list.")
                  : t("The link is built by NivaDesk from the tracking number; a typed link is never used.")}
                {" "}
                {`${preview.labels.closing} ${preview.fromName}`}
              </p>
            </section>

            {sendError ? <p className="layout-error" role="alert" style={{ margin: 0 }}>{sendError}</p> : null}

            <div className="inventory-modal-actions">
              <button type="button" className="button secondary" onClick={onClose} disabled={sending}>{t("Cancel")}</button>
              <button type="submit" className="button" disabled={sending || !toValid} data-resend={willResend ? "true" : "false"}>
                {sending ? t("Sending…") : willResend ? t("Send again") : t("Send")}
              </button>
            </div>
            <p className="shipment-muted" style={{ margin: 0 }}>{t("Nothing is sent until you press Send.")}</p>
          </form>
        ) : null}
      </div>
    </div>
  );
}
