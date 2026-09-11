"use client";

import { useEffect, useMemo, useState } from "react";
import { setupStepHref } from "@/lib/studioflow/setupChecklist";
import { closeRetentionMessage, subscribeOpenRetentionMessages, type RetentionMessage } from "@/lib/studioflow/retention";

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
 * One card, the next step, above the page. It shows only while the server keeps
 * a message open, waits (`hold`) while the feedback invitation is on screen so two
 * cards never stack, and closes through the server: "acted" when the person
 * follows it, "dismissed" on Not now or the × — the dismissal is what starts the
 * campaign's cooldown.
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
  const [messages, setMessages] = useState<RetentionMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [closedId, setClosedId] = useState("");   // hidden locally until the snapshot catches up

  useEffect(() => {
    if (!companyId || !uid) return;
    setMessages([]);
    return subscribeOpenRetentionMessages(companyId, setMessages, () => setMessages([]));
  }, [companyId, uid]);

  const message = useMemo(() => messages.find((row) => row.id !== closedId) ?? null, [messages, closedId]);
  if (!message || hold) return null;

  const copy = COPY[message.campaign];
  const title = copy ? t(copy.title) : message.title;
  const body = copy ? t(copy.body) : message.body;
  const cta = copy ? t(copy.cta) : t("Open");
  const href = hrefFor(message);

  const close = async (outcome: "dismissed" | "acted") => {
    if (busy) return;
    setBusy(true);
    setClosedId(message.id);
    try {
      await closeRetentionMessage(companyId, message.id, outcome);
    } catch {
      // The card is already hidden here; the next server snapshot decides whether it comes back.
    } finally {
      setBusy(false);
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
