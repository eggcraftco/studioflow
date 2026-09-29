"use client";

// The live courier status of the order's tracking number, on the Shipping & Tracking card.
//
// Read exactly as the Mac and the iPhone read it: the order's `tracking::` custom fields and the
// row companies/{companyId}/trackingResults/{orderId}, the row winning, both dropped when they
// were written for a previous number (lib/studioflow/liveTracking.ts). The badge names the
// provider that answered — 17TRACK, DHL Express or Royal Mail — so the two carriers' roles are not
// confused: 17TRACK follows any number the merchant types, DHL Express follows its own waybills.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import {
  TRACKING_KEYS,
  TRACKING_TONES,
  currentTrackingValues,
  formatTrackingDate,
  trackingDisplayStatus,
  trackingFieldsFromCustomFields,
  trackingOpenUrl,
  trackingProvider,
  trackingStatusLabel,
  trackingSupportLabel,
  trackingSupportMessage,
  trackingTone,
  type TrackingValues
} from "@/lib/studioflow/liveTracking";

function rowValues(data: Record<string, unknown> | undefined): TrackingValues | null {
  if (!data) return null;
  const values: TrackingValues = {};
  for (const key of TRACKING_KEYS) {
    const raw = data[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "object" && typeof (raw as { toDate?: () => Date }).toDate === "function") {
      values[key] = (raw as { toDate: () => Date }).toDate().toISOString();
    } else if (typeof raw !== "object") {
      values[key] = String(raw);
    }
  }
  return values;
}

export function OrderLiveTrackingPanel({
  companyId,
  orderId,
  trackingNumber,
  courier,
  customFields,
  language,
  canRefresh,
  syncing,
  onCheckAgain
}: {
  companyId: string;
  orderId: string;
  trackingNumber: string;
  courier: string;
  customFields: Record<string, string>;
  language: string;
  canRefresh: boolean;
  syncing: boolean;
  onCheckAgain: () => void;
}) {
  const t = (text: string) => studioT(text, language);
  const [live, setLive] = useState<TrackingValues | null>(null);

  useEffect(() => {
    setLive(null);
    if (!companyId || !orderId) return;
    // A refusal or a network failure reads as "no row": the order's own fields still show.
    return onSnapshot(
      doc(db, "companies", companyId, "trackingResults", orderId),
      snapshot => setLive(rowValues(snapshot.data())),
      () => setLive(null)
    );
  }, [companyId, orderId]);

  const values = currentTrackingValues(trackingNumber, trackingFieldsFromCustomFields(customFields), live);
  const status = trackingDisplayStatus(values);
  const provider = trackingProvider(values);
  const supportStatus = values.trackingSupportStatus || "";
  const supportLabel = trackingSupportLabel(supportStatus);
  const tone = trackingTone(status, supportStatus);
  const locale = studioLocaleTag(language);
  const carrier = [values.carrier, courier].map(value => String(value || "").trim()).find(value => value && value !== "Auto Detect") || "-";
  const checkpoint = [values.checkpoint, values.location].map(value => String(value || "").trim()).filter(Boolean).join(" · ");
  const supportMessage = trackingSupportMessage(values.supportMessage || "", values.supportMessageKey || "");
  const lastChecked = formatTrackingDate(values.lastCheckedAt, locale);
  const rows: Array<[string, string]> = [
    ...(supportLabel ? [["Tracking Support", t(supportLabel)] as [string, string]] : []),
    ["Carrier", carrier],
    ["Last Update", formatTrackingDate(values.lastUpdate, locale) || "-"],
    ["Estimated Delivery", formatTrackingDate(values.eta, locale) || "-"],
    ["Latest Checkpoint", checkpoint || "-"]
  ];

  return (
    <div
      className="order-live-tracking"
      data-tracking-status={status}
      data-tracking-provider={provider}
      style={{ display: "grid", gap: 8, marginTop: 10, marginBottom: 10, padding: 12, borderRadius: 12, border: `1px solid ${tone}40`, background: `${tone}14` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: tone, flex: "none" }} />
        <strong style={{ color: tone, fontSize: 12.5, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{t(trackingStatusLabel(status))}</strong>
        <span
          title={provider === "DHL Express" ? t("Tracked directly with DHL Express") : provider === "17TRACK" ? t("Tracked through 17TRACK") : provider}
          style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.7, padding: "3px 7px", borderRadius: 7, background: "rgba(120,120,140,0.14)", whiteSpace: "nowrap" }}
        >
          {provider}
        </span>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(96px, max-content) 1fr", gap: "4px 10px", margin: 0, fontSize: 12.5 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ opacity: 0.7, fontWeight: 700, fontSize: 11 }}>{t(label)}</dt>
            <dd style={{ margin: 0, fontWeight: 600, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
      {lastChecked ? <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>{`${t("Last checked by system")}: ${lastChecked}`}</p> : null}
      {supportMessage ? <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: tone }}>{t(supportMessage)}</p> : null}
      {values.error ? <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 600, color: TRACKING_TONES.red, overflowWrap: "anywhere" }}>{t(values.error)}</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="button secondary" href={trackingOpenUrl(values, trackingNumber)} target="_blank" rel="noopener noreferrer">{t("Open Tracking")}</a>
        {canRefresh ? (
          <button type="button" className="button secondary" disabled={syncing} onClick={onCheckAgain}>
            {syncing ? t("Checking tracking…") : t("Check Again")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
