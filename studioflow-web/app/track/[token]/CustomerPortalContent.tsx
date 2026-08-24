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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const callable = httpsCallable<{ token: string }, { ok?: boolean; portal?: PortalView }>(
        functions,
        "getPortalForVisitor"
      );
      const result = await callable({ token });
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
    <section className="portal-shell">
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

      {portal.footerNote ? <p className="portal-shell-footer">{portal.footerNote}</p> : null}
      <p className="portal-shell-credit">Powered by NivaDesk</p>
    </section>
  );
}
