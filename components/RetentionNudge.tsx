"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { setupStepHref } from "@/lib/studioflow/setupChecklist";
import { closeRetentionMessage, fetchRetentionMessage, type RetentionMessage } from "@/lib/studioflow/retention";

// The server is asked at most this often per session unless something changed
// (a card was closed, the feedback invitation went away) — the same rhythm the
// feedback prompt keeps, so one page does not fan out into calls.
const LOOK_INTERVAL_MS = 10 * 60 * 1000;
const lookKey = (companyId: string, uid: string) => `nv_retention_looked_${companyId}_${uid}`;
function readSession(key: string): string { try { return window.sessionStorage.getItem(key) ?? ""; } catch { return ""; } }
function writeSession(key: string, value: string) { try { window.sessionStorage.setItem(key, value); } catch { /* private mode */ } }

// The words for each campaign, keyed by the same English the server writes, so
// the translation tables apply and a card written before a copy change still
// reads in the person's language. An unknown campaign falls back to the stored text.
const COPY: Record<string, { title: string; body: string; cta: string }> = {
  finish_onboarding: { title: "Finish setting up", body: "Two more answers and NivaDesk knows what to show you first.", cta: "Continue setup" },
  connect_first_store: { title: "Connect your first sales channel", body: "Shopify, Etsy, WooCommerce or Square — orders then arrive on their own.", cta: "Connect a channel" },
  connect_bank: { title: "Connect your bank", body: "Read-only. NivaDesk can never move money.", cta: "Connect bank" },
  complete_first_order: { title: "Complete your first project", body: "You started one — add the customer, what it is worth or what it contains, and it counts.", cta: "Open the project" },
  create_first_order: { title: "Create your first project", body: "One real job, so the board has something to hold.", cta: "Create a project" }
};

function hrefFor(message: RetentionMessage): string {
  const action = String(message.action || "");
  if (action === "setup") return "/home?setup=continue";
  return setupStepHref(action, message.target ?? undefined);
}

/**
 * One card, the next step, above the page. The server is asked what may be shown
 * at the moment of looking (a met goal, an opt-out, a cancelled or activated
 * workspace withdraw a card; an open support case or a feedback prompt in the last
 * day hold it), again when the feedback invitation closes and after a card is
 * closed. While the invitation is on screen (`hold`) nothing is rendered, so two
 * cards never stack. Closing goes through the server: "acted" when the person
 * follows the card, "dismissed" on Not now or the × — the dismissal is what starts
 * the campaign's cooldown; a click never counts as completing the goal.
 */
export default function RetentionNudge({
  companyId, uid, t, hold, onOpen
}: {
  companyId: string;
  uid: string;
  t: (text: string) => string;
  hold: boolean;
  onOpen: (href: string) => void;
}) {
  const pathname = usePathname() || "";
  const [message, setMessage] = useState<RetentionMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const heldBefore = useRef(hold);

  const look = useCallback(async (force: boolean) => {
    if (!companyId || !uid || inFlight.current) return;
    const last = Number(readSession(lookKey(companyId, uid))) || 0;
    if (!force && Date.now() - last < LOOK_INTERVAL_MS) return;
    inFlight.current = true;
    try {
      const result = await fetchRetentionMessage(companyId);
      writeSession(lookKey(companyId, uid), String(Date.now()));
      setMessage(result.enabled ? result.message : null);
    } catch {
      setMessage(null);   // not knowing is the same as "nothing to show"
    } finally {
      inFlight.current = false;
    }
  }, [companyId, uid]);

  // On mount and when the page changes, at the session rhythm.
  useEffect(() => { setMessage(null); void look(false); }, [look, pathname]);
  // The feedback invitation just closed: ask again right away rather than showing
  // whatever was fetched before it — the server applies the day-long hold.
  useEffect(() => {
    if (heldBefore.current && !hold) void look(true);
    heldBefore.current = hold;
  }, [hold, look]);

  if (!message || hold) return null;

  const copy = COPY[message.campaign];
  const title = copy ? t(copy.title) : message.title;
  const body = copy ? t(copy.body) : message.body;
  const cta = copy ? t(copy.cta) : t("Open");
  const href = hrefFor(message);

  const close = async (outcome: "dismissed" | "acted") => {
    if (busy) return;
    setBusy(true);
    const closing = message.id;
    setMessage(null);
    try {
      await closeRetentionMessage(companyId, closing, outcome);
    } catch {
      // The card is already hidden here; the next look decides whether anything comes back.
    } finally {
      setBusy(false);
      void look(true);   // the next card, if the server has one and nothing holds it
    }
  };

  return (
    <div className="retention-nudge" role="status" aria-live="polite" data-testid="retention-nudge" data-campaign={message.campaign}>
      <span className="retention-nudge-icon" aria-hidden="true">→</span>
      <span className="retention-nudge-text">
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
      {href ? (
        <button type="button" className="retention-nudge-primary" disabled={busy} onClick={() => { void close("acted"); onOpen(href); }}>
          {cta}
        </button>
      ) : null}
      <button type="button" className="retention-nudge-secondary" disabled={busy} onClick={() => void close("dismissed")}>
        {t("Not now")}
      </button>
      <button type="button" className="retention-nudge-close" aria-label={t("Dismiss")} disabled={busy} onClick={() => void close("dismissed")}>
        ×
      </button>
    </div>
  );
}
