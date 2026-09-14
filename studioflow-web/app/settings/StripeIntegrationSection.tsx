"use client";

// The workspace's own Stripe account, so an order can be paid by card.
//
// This screen only ever shows what the server decided. `capabilitiesFor()` in
// payments/connectionState.js owns the five statuses and what each one permits;
// nothing here re-derives them, because two answers to "can this workspace take
// a payment" is exactly one answer too many.
//
// The Stripe account id is never returned by any callable and is not displayed.
import { useCallback, useEffect, useRef, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { StripeConnectionSummary } from "@/lib/studioflow/integrations";
import { CardTitle } from "@/components/CardTitle";
import {
  getStripeConnection, beginStripeOnboarding, refreshStripeConnection,
  disconnectStripeConnection, stripeStatusLabel,
} from "@/lib/studioflow/stripeConnect";

type Props = { workspace: WorkspaceContext; language?: string };

function messageForError(error: unknown, fallback: string): string {
  const code = String((error as { code?: string })?.code || "");
  const raw = String((error as Error)?.message || "");
  if (/permission-denied/.test(code) || /only the workspace owner/i.test(raw)) {
    return "Only the workspace owner can connect or disconnect Stripe.";
  }
  if (/unauthenticated/.test(code)) return "Sign in again to manage this connection.";
  if (/unavailable|deadline-exceeded/.test(code) || /fetch|network/i.test(raw)) {
    return "Stripe could not be reached. Check your connection and try again.";
  }
  // The server's own sentence when it has one: it names which fix applies.
  return raw || fallback;
}

export function StripeIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";

  // Three states, not two. `null` is "we could not find out", which is a
  // different thing from "not connected" — and telling somebody they have no
  // Stripe account when the truth is that the read failed is how a screen
  // invents a fact.
  const [connection, setConnection] = useState<StripeConnectionSummary | null>(null);
  const [known, setKnown] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!companyId) return;
    const ticket = ++latest.current;
    try {
      const view = await getStripeConnection(companyId);
      if (ticket !== latest.current) return;
      setConnection(view.connection);
      setConfigured(view.configured);
      setKnown(true);
      // A success clears whatever the last failure said, or a recovered screen
      // keeps apologising.
      setError("");
    } catch (err) {
      if (ticket !== latest.current) return;
      setKnown(false);
      setConnection(null);
      setError(messageForError(err, t("This connection could not be loaded.")));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { void load(); }, [load]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); }
    catch (err) { setError(messageForError(err, t("That did not work."))); }
    finally { setBusy(""); }
  }

  const status = connection?.status ?? "disconnected";
  const capable = connection?.canCreatePaymentRequest === true;

  const connect = () => guard("connect", async () => {
    const result = await beginStripeOnboarding(companyId);
    if (result?.url) {
      // Stripe's hosted onboarding. A new tab, so the workspace keeps its place
      // here and the status can be re-read on return.
      window.open(result.url, "_blank", "noopener,noreferrer");
      setNotice(t("Finish in the Stripe tab, then choose Check again."));
    }
    await load();
  });

  const recheck = () => guard("refresh", async () => {
    const result = await refreshStripeConnection(companyId);
    setConnection(result?.connection ?? null);
    setKnown(true);
    setNotice(t("Checked with Stripe just now."));
  });

  const disconnect = () => guard("disconnect", async () => {
    const result = await disconnectStripeConnection(companyId);
    setConnection(result?.connection ?? null);
    setKnown(true);
    setConfirmDisconnect(false);
    setNotice(result?.accountKeptAtProvider
      ? t("Disconnected. Your Stripe account and its money are untouched.")
      : t("Disconnected."));
    await load();
  });

  const requirements = connection?.requirementsSummary;
  const outstanding = (requirements?.pastDueCount ?? 0) + (requirements?.currentlyDueCount ?? 0);

  return (
    <div className="settings-card-stack">
      <CardTitle icon="bolt" eyebrow="Stripe" title={t("Card payments into your own account")} />

      {notice ? <p className="layout-status">{notice}</p> : null}
      {error ? <p role="alert" className="layout-error">{error}</p> : null}

      {loading ? (
        <p className="muted-copy">{t("Loading...")}</p>
      ) : !configured ? (
        // The server has no Stripe keys. Nothing a workspace does here can fix
        // that, so it must not be offered a button that cannot work.
        <p className="muted-copy">{t("Card payments are not set up on this server yet.")}</p>
      ) : !known ? (
        <p className="muted-copy">{t("This connection could not be read, so its state is unknown.")}</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{t(stripeStatusLabel(status))}</p>
          <p className="muted-copy">
            {t("Take card payments for an order straight into your own Stripe account. NivaDesk never holds the money: it lands in your Stripe balance and pays out to your bank.")}
          </p>

          {status === "restricted" && outstanding > 0 ? (
            // Whole sentences, chosen by count — never a sentence built from
            // fragments with a number dropped into the middle. English's
            // one/other plural rule is not every language's, and the word order
            // here is not every language's either, so a translator needs the
            // whole sentence or the result reads like a ransom note.
            <p className="muted-copy">
              {outstanding === 1
                ? t("Stripe is waiting on one more detail. Existing links can still be paid; new ones cannot be created until Stripe is satisfied.")
                : t("Stripe is waiting on some more details. Existing links can still be paid; new ones cannot be created until Stripe is satisfied.")}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {status === "disconnected" || status === "onboarding" ? (
              <button type="button" className="button" disabled={!isOwner || busy === "connect"} onClick={() => void connect()}>
                {busy === "connect" ? t("Opening…") : status === "onboarding" ? t("Continue with Stripe") : t("Connect Stripe")}
              </button>
            ) : null}
            <button type="button" className="button secondary" disabled={!isOwner || busy === "refresh"} onClick={() => void recheck()}>
              {busy === "refresh" ? t("Checking…") : t("Check again")}
            </button>
            {status !== "disconnected" ? (
              <button type="button" className="button secondary" disabled={!isOwner || busy === "disconnect"} onClick={() => setConfirmDisconnect(true)}>
                {t("Disconnect")}
              </button>
            ) : null}
          </div>

          {!isOwner ? (
            <p className="muted-copy">{t("Only the workspace owner can connect or disconnect Stripe. Everyone can see whether payments work.")}</p>
          ) : null}

          {confirmDisconnect ? (
            <div className="settings-card" style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{t("Disconnect Stripe?")}</strong>
              {/*
                What disconnect actually does, said plainly, because the
                asymmetry is the part that surprises people:

                  * the Stripe account is NOT deleted — it is the workspace's
                    and holds their money;
                  * payments and refunds already recorded stay exactly as they
                    are, in Banking and on their orders;
                  * but a link already sent still works at Stripe, and after
                    disconnecting NivaDesk stops being told about it — so a
                    customer could pay and the order would never learn.

                That last one is the reason to cancel open links first, and the
                screen says so rather than leaving it to be discovered.
              */}
              <p className="muted-copy" style={{ margin: 0 }}>
                {t("Your Stripe account is not closed and its money is untouched. Payments and refunds already recorded stay on their orders and in Banking.")}
              </p>
              <p className="muted-copy" style={{ margin: 0 }}>
                {t("But a payment link you have already sent keeps working at Stripe, and NivaDesk will no longer be told when it is paid — the money would arrive in your Stripe account with nothing recorded here. Cancel any open links first.")}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="button" disabled={busy === "disconnect"} onClick={() => void disconnect()}>
                  {busy === "disconnect" ? t("Disconnecting…") : t("Yes, disconnect")}
                </button>
                <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep it")}</button>
              </div>
            </div>
          ) : null}

          {capable ? (
            <p className="muted-copy" style={{ marginTop: 10 }}>
              {t("Create payment links on an order, and see them all together in Banking.")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
