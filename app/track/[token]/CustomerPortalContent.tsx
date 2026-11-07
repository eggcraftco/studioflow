"use client";

import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

// Exactly what the server chose to send, and nothing more. There is no order
// object on this page to accidentally render: internal notes, costs, supplier
// and profit never cross the wire.
type PortalView = {
  reference: string;
  itemName: string;
  customerFirstName: string;
  businessName: string;
  logoUrl: string;
  footerNote: string;
  currency: string;
  accentColor?: string;
  showPoweredBy?: boolean;
  shows: {
    status: boolean;
    estimate: boolean;
    payments: boolean;
    photos: boolean;
    expectedDate: boolean;
  };
  stages: { title: string; state: "done" | "current" | "upcoming" }[];
  currentStatus: string;
  expectedDateMs: number;
  estimate: { number: string; total: number; status: string } | null;
  payments: { paid: number; remaining: number; total: number } | null;
  photos: string[];
  // Library files the workshop explicitly shared to the portal; absent on
  // older server builds.
  files?: { name: string; url: string; fileType: string; fileSize: number }[];
};

// Twilio SMS r4 (7 Nov 2026): the customer's own switch for text updates. Wording approved by the owner
// (docs/legal/TWILIO-SMS-METINLER-2026-11-07.md §6.3, version below). The server reads the number from the
// order and only returns it masked; this page never sends a number. An older server has no such callable,
// and then the card simply does not appear.
// r5: "b" = the wording that says one text with a link comes first (owner, 7 Nov 2026).
const SMS_PORTAL_TEXT_VERSION = "sms-consent-portal-2026-11b";
type PortalSmsView = {
  ok?: boolean;
  eligible: "ok" | "no_number" | "marketplace_order" | "sms_not_available";
  consent: {
    state: "active" | "pending_confirmation" | "none" | "revoked" | "opted_out" | "global_stop" | "no_number";
    number: string;
    confirm?: { sentAtMs: number; canResend: boolean; sendsLeft: number } | null;
  };
  acceptedTextVersions: string[];
};

function money(currency: string, value: number) {
  return `${currency}${value.toFixed(2)}`;
}

function formatDate(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function CustomerPortalContent({ token }: { token: string }) {
  const [portal, setPortal] = useState<PortalView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sms, setSms] = useState<PortalSmsView | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsNotice, setSmsNotice] = useState("");
  const [smsDeferredUntil, setSmsDeferredUntil] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const callable = httpsCallable<{ token: string; host?: string }, { ok?: boolean; portal?: PortalView }>(
        functions,
        "getPortalForVisitor"
      );
      // The serving host rides along so the server can refuse dressing this
      // order in another workspace's client domain.
      const result = await callable({ token, host: typeof window !== "undefined" ? window.location.host : "" });
      if (!result.data?.portal) throw new Error("This link is no longer available.");
      setPortal(result.data.portal);
    } catch (failure) {
      const raw = failure instanceof Error ? failure.message : "";
      setError(raw.replace(/^[a-z-]+:\s*/i, "").trim() || "This link is no longer available.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const host = typeof window !== "undefined" ? window.location.host : "";
  useEffect(() => {
    if (!portal) return;
    let cancelled = false;
    httpsCallable<{ token: string; host?: string }, PortalSmsView>(functions, "getSmsConsentForPortal")({ token, host })
      .then(result => {
        if (!cancelled) setSms(result.data?.ok ? result.data : null);
      })
      .catch(() => {
        if (!cancelled) setSms(null);
      });
    return () => {
      cancelled = true;
    };
  }, [portal, token, host]);

  async function chooseTexts(choice: "opt_in" | "opt_out") {
    setSmsBusy(true);
    setSmsNotice("");
    try {
      const callable = httpsCallable<
        { token: string; host?: string; choice: string; consentTextVersion?: string },
        { ok: boolean; reason?: string; consent: PortalSmsView["consent"]; confirmation?: { sent: boolean; reason: string; deferredUntilMs: number } | null }
      >(functions, "setSmsConsentFromPortal");
      const result = await callable({
        token,
        host,
        choice,
        ...(choice === "opt_in" ? { consentTextVersion: SMS_PORTAL_TEXT_VERSION } : {})
      });
      setSms(current => (current ? { ...current, consent: result.data.consent } : current));
      if (!result.data.ok) setSmsNotice("Texts could not be switched on for this number.");
      const confirmation = result.data.confirmation;
      setSmsDeferredUntil(confirmation && confirmation.reason === "quiet_hours_deferred" ? confirmation.deferredUntilMs : 0);
      if (confirmation && !confirmation.sent && confirmation.reason !== "quiet_hours_deferred" && confirmation.reason !== "confirm_recently_sent") {
        setSmsNotice(confirmation.reason === "confirm_limit"
          ? "We can't send more texts for this request."
          : "We couldn't send the text just now. Please try again later.");
      }
    } catch {
      setSmsNotice("That did not work. Please try again in a moment.");
    } finally {
      setSmsBusy(false);
    }
  }

  // The page wears the studio's logo and colour; the browser tab did not. On a
  // connected domain that is the one place NivaDesk still showed through —
  // track.eggcraft.co.uk with our favicon is exactly the mismatch the branded
  // domain exists to remove.
  //
  // Set here rather than in generateMetadata because the studio is identified
  // by the token, which only this callable can resolve; the page is noindex, so
  // nothing is lost by the tab settling a moment after the content.
  useEffect(() => {
    if (!portal || typeof document === "undefined") return;
    const name = portal.businessName.trim();
    if (name) document.title = `${name} — Track your order`;
    const logo = portal.logoUrl.trim();
    if (!logo) return;
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      ?? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
    link.href = logo;
  }, [portal]);

  if (loading) {
    return <section className="portal-shell"><p className="portal-shell-muted">Loading…</p></section>;
  }

  if (error || !portal) {
    return (
      <section className="portal-shell">
        <h1 className="portal-shell-title">Link unavailable</h1>
        <p className="portal-shell-muted">{error || "This link is no longer available."}</p>
      </section>
    );
  }

  return (
    <section
      className="portal-shell"
      style={portal.accentColor ? ({ "--portal-accent": portal.accentColor } as React.CSSProperties) : undefined}
    >
      <header className="portal-shell-head">
        {portal.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portal.logoUrl} alt="" className="portal-shell-logo" />
        ) : null}
        <strong className="portal-shell-business">{portal.businessName}</strong>
      </header>

      <h1 className="portal-shell-title">
        {portal.customerFirstName ? `${portal.customerFirstName}, here is your order` : "Your order"}
      </h1>
      <p className="portal-shell-muted">
        {portal.itemName || "Your item"}
        {portal.reference ? ` · ${portal.reference}` : ""}
      </p>

      {portal.shows.status && portal.stages.length > 0 ? (
        <div className="portal-shell-card">
          <span className="portal-shell-label">Current status</span>
          <strong className="portal-shell-status">{portal.currentStatus || portal.stages[0].title}</strong>
          <ol className="portal-track">
            {portal.stages.map(stage => (
              <li key={stage.title} className={`portal-track-step is-${stage.state}`}>
                <span className="portal-track-dot" aria-hidden="true" />
                <span className="portal-track-title">{stage.title}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {portal.shows.expectedDate && portal.expectedDateMs > 0 ? (
        <div className="portal-shell-card">
          <span className="portal-shell-label">Expected</span>
          <strong>{formatDate(portal.expectedDateMs)}</strong>
        </div>
      ) : null}

      {portal.shows.estimate && portal.estimate ? (
        <div className="portal-shell-card">
          <span className="portal-shell-label">Estimate</span>
          <strong>
            {money(portal.currency, portal.estimate.total)}
            {portal.estimate.status ? ` — ${portal.estimate.status}` : ""}
          </strong>
          {portal.estimate.number ? (
            <span className="portal-shell-muted">{portal.estimate.number}</span>
          ) : null}
        </div>
      ) : null}

      {portal.shows.payments && portal.payments ? (
        <div className="portal-shell-card">
          <span className="portal-shell-label">Payment</span>
          <div className="portal-shell-row">
            <span>Paid</span>
            <strong>{money(portal.currency, portal.payments.paid)}</strong>
          </div>
          <div className="portal-shell-row">
            <span>Remaining</span>
            <strong>{money(portal.currency, portal.payments.remaining)}</strong>
          </div>
        </div>
      ) : null}

      {portal.shows.photos && portal.photos.length > 0 ? (
        <div className="portal-shell-card">
          <span className="portal-shell-label">Photos</span>
          <div className="portal-shell-photos">
            {portal.photos.map(url => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" />
            ))}
          </div>
        </div>
      ) : null}

      {(portal.files ?? []).length > 0 ? (
        <div className="portal-shell-card">
          <span className="portal-shell-label">Files</span>
          <ul className="portal-shell-files">
            {(portal.files ?? []).map(file => (
              <li key={file.url}>
                <a href={file.url} target="_blank" rel="noreferrer">{file.name}</a>
                {file.fileSize > 0 ? (
                  <span className="portal-shell-muted">
                    {" "}· {file.fileSize >= 1024 * 1024
                      ? `${(file.fileSize / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(file.fileSize / 1024))} KB`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sms && sms.eligible === "ok" && sms.acceptedTextVersions.includes(SMS_PORTAL_TEXT_VERSION) ? (
        <div className="portal-shell-card portal-sms-card" data-sms-portal={sms.consent.state}>
          <span className="portal-shell-label">Text updates</span>
          {sms.consent.state === "active" ? (
            <div className="portal-sms-row">
              <span>You&apos;re getting text updates at {sms.consent.number}.</span>
              <button type="button" className="portal-sms-button is-secondary" disabled={smsBusy} onClick={() => void chooseTexts("opt_out")}>
                Stop texts
              </button>
            </div>
          ) : sms.consent.state === "pending_confirmation" ? (
            <>
              <strong>Check your phone</strong>
              <span className="portal-shell-muted">
                {smsDeferredUntil
                  ? `We'll send a text to ${sms.consent.number} at 08:00 UK time. Tap the link in it to confirm.`
                  : sms.consent.confirm && sms.consent.confirm.sentAtMs
                    ? `We've sent a text to ${sms.consent.number}. Tap the link in it to confirm. Texts start only after you confirm.`
                    : `Texts start after you confirm with the link we text to ${sms.consent.number}.`}
              </span>
              {sms.consent.confirm && sms.consent.confirm.canResend ? (
                <div>
                  <button type="button" className="portal-sms-button is-secondary" disabled={smsBusy} onClick={() => void chooseTexts("opt_in")}>
                    Send the text again
                  </button>
                </div>
              ) : null}
            </>
          ) : sms.consent.state === "global_stop" ? (
            <span className="portal-shell-muted">Texts to this number are switched off.</span>
          ) : (
            <>
              <strong>Get text updates about this order</strong>
              <span className="portal-shell-muted">
                We&apos;ll send one text to {sms.consent.number} with a link to confirm. After that we&apos;ll text you when your
                order reaches an important stage, for example when it is ready to collect. You can stop the texts at any time.
              </span>
              <div>
                <button type="button" className="portal-sms-button" disabled={smsBusy} onClick={() => void chooseTexts("opt_in")}>
                  Text me updates
                </button>
              </div>
            </>
          )}
          {smsNotice ? <span className="portal-shell-muted" role="alert">{smsNotice}</span> : null}
          <span className="portal-shell-muted portal-sms-foot">
            Texts are sent by NivaDesk for {portal.businessName}. Privacy notice:{" "}
            <a href="https://nivadesk.app/privacy" target="_blank" rel="noreferrer">nivadesk.app/privacy</a>
          </span>
        </div>
      ) : null}

      {portal.footerNote ? <p className="portal-shell-footer">{portal.footerNote}</p> : null}
      {portal.showPoweredBy !== false ? <p className="portal-shell-credit">Powered by NivaDesk</p> : null}
    </section>
  );
}
