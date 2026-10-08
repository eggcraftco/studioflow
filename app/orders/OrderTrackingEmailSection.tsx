"use client";

// Under the live tracking panel on the Shipping & Tracking card: the question after a tracking
// number is saved, the last e-mail's result, and the explicit way to send (again).
//
// The record is read where the server writes it — companies/{companyId}/trackingResults/{orderId}
// .trackingEmail, the row the live panel already listens to — with the order's own copy as the
// fallback. A record for a previous number is not this number's result and is not shown.
// Nothing here sends: the dialog's Send button is the only path, and declining the question or
// closing the card sends nothing.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  cleanTrackingNumber,
  currentTrackingEmail,
  fillResultLine,
  shouldOfferTrackingEmail,
  trackingEmailRecordFrom,
  trackingEmailResultLine,
  type TrackingEmailRecord
} from "@/lib/studioflow/trackingEmailRules";
import { TrackingEmailDialog, formatTrackingEmailTime } from "./TrackingEmailDialog";

export function OrderTrackingEmailSection({
  workspace,
  orderId,
  trackingNumber,
  orderRecord,
  language,
  canSend,
  promptForNumber,
  onPromptHandled
}: {
  workspace: WorkspaceContext;
  orderId: string;
  trackingNumber: string;
  /** The order document's own copy of the record (lib/studioflow/firestore.ts). */
  orderRecord: TrackingEmailRecord | null;
  language: string;
  canSend: boolean;
  /** The number the member just saved, set by the card right after the save succeeds. */
  promptForNumber: string | null;
  onPromptHandled: () => void;
}) {
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  const [rowRecord, setRowRecord] = useState<TrackingEmailRecord | null>(null);
  const [rowLoaded, setRowLoaded] = useState(false);
  const [dialog, setDialog] = useState<{ resend: boolean } | null>(null);
  const [declinedNumber, setDeclinedNumber] = useState<string | null>(null);
  const [localRecord, setLocalRecord] = useState<TrackingEmailRecord | null>(null);

  useEffect(() => {
    setRowRecord(null);
    setRowLoaded(false);
    if (!workspace.id || !orderId) return;
    return onSnapshot(
      doc(db, "companies", workspace.id, "trackingResults", orderId),
      snapshot => {
        setRowRecord(trackingEmailRecordFrom(snapshot.data()?.trackingEmail));
        setRowLoaded(true);
      },
      () => { setRowRecord(null); setRowLoaded(true); }
    );
  }, [workspace.id, orderId]);

  const number = cleanTrackingNumber(trackingNumber);
  // The row is authoritative; the order copy fills in when the row has none; the dialog's own
  // answer wins until the listener catches up.
  const record = currentTrackingEmail(number, localRecord) ?? currentTrackingEmail(number, rowRecord) ?? currentTrackingEmail(number, orderRecord);
  const result = trackingEmailResultLine(record);

  const promptNumber = cleanTrackingNumber(promptForNumber || "");
  const showPrompt = canSend
    && rowLoaded
    && Boolean(promptNumber)
    && promptNumber === number
    && declinedNumber !== promptNumber
    && shouldOfferTrackingEmail(number, record);

  if (!number) return null;

  return (
    <div className="order-tracking-email" data-tracking-email-status={record?.status || "none"} style={{ display: "grid", gap: 8, marginBottom: 10 }}>
      {showPrompt ? (
        <div role="group" aria-label={t("Send the tracking details to the customer by e-mail?")} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(10,132,255,0.35)", background: "rgba(10,132,255,0.08)" }}>
          <strong style={{ fontSize: 12.5, flex: "1 1 220px" }}>{t("Send the tracking details to the customer by e-mail?")}</strong>
          <button type="button" className="button" data-tracking-email-action="yes" onClick={() => { setDialog({ resend: false }); onPromptHandled(); }}>
            {t("Yes, prepare the e-mail")}
          </button>
          <button type="button" className="button secondary" data-tracking-email-action="not-now" onClick={() => { setDeclinedNumber(promptNumber); onPromptHandled(); }}>
            {t("Not now")}
          </button>
        </div>
      ) : null}

      {result ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <p
            className={record?.status === "failed" ? "layout-error finance-inline-message" : "layout-status finance-inline-message"}
            role={record?.status === "failed" ? "alert" : "status"}
            style={{ margin: 0, flex: "1 1 240px" }}
          >
            {fillResultLine(t(result.key), { to: result.to, at: formatTrackingEmailTime(result.atMs, locale), error: result.error })}
            {record && record.attempts > 1 ? ` (${record.attempts}×)` : ""}
          </p>
          {canSend ? (
            <button type="button" className="button secondary" data-tracking-email-action={record?.status === "failed" ? "retry" : "resend"} onClick={() => setDialog({ resend: record?.status === "sent" })}>
              {record?.status === "failed" ? t("Try again") : t("Resend")}
            </button>
          ) : null}
        </div>
      ) : null}

      {!result && !showPrompt && canSend ? (
        <div>
          <button type="button" className="button secondary" data-tracking-email-action="open" onClick={() => setDialog({ resend: false })}>
            {t("E-mail tracking details")}
          </button>
        </div>
      ) : null}

      {dialog ? (
        <TrackingEmailDialog
          workspace={workspace}
          orderId={orderId}
          language={language}
          resend={dialog.resend}
          onClose={() => setDialog(null)}
          onResult={next => { if (next) setLocalRecord(next); }}
        />
      ) : null}
    </div>
  );
}
