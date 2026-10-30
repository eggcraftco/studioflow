"use client";

// The workspace's own Stripe account, so an order can be paid by card.
//
// This screen only ever shows what the server decided. `capabilitiesFor()` in
// payments/connectionState.js owns the five statuses and what each one permits;
// nothing here re-derives them, because two answers to "can this workspace take
// a payment" is exactly one answer too many.
//
// The Stripe account id is never returned by any callable and is not displayed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { StripeConnectionSummary } from "@/lib/studioflow/integrations";
import { CardTitle } from "@/components/CardTitle";
import { PaymentLinkDomainBlock } from "./PaymentLinkDomainBlock";
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
  const [unavailableReason, setUnavailableReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // SC-8 (30 Oct 2026): the business's country, asked before the FIRST account
  // is opened — Stripe cannot open one without it, and a workspace may never
  // have said which (EGGcraft met that as "internal" on 29 Oct).
  const [onboarding, setOnboarding] = useState<{ country: string; supportedCountries: string[] } | null>(null);
  const [pickingCountry, setPickingCountry] = useState(false);
  const [country, setCountry] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!companyId) return;
    const ticket = ++latest.current;
    try {
      // "settings": this card is where connecting starts, so it is told the
      // rail is here before any account exists (the order card is not).
      const view = await getStripeConnection(companyId, "settings");
      if (ticket !== latest.current) return;
      setConnection(view.connection);
      setOnboarding(view.onboarding);
      if (view.onboarding?.country) setCountry(current => current || view.onboarding?.country || "");
      setConfigured(view.configured);
      setUnavailableReason(view.configured ? "" : view.reason);
      setKnown(true);
      // A success clears whatever the last failure said, or a recovered screen
      // keeps apologising.
      setError("");
    } catch (err) {
      if (ticket !== latest.current) return;
      setKnown(false);
      setConnection(null);
      // Translated after the choice, not before it: the three fixed sentences
      // in messageForError and the server's own sentence were rendered as
      // they came, so they read English in every language.
      setError(t(messageForError(err, "This connection could not be loaded.")));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { void load(); }, [load]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); }
    catch (err) { setError(t(messageForError(err, "That did not work."))); }
    finally { setBusy(""); }
  }

  const status = connection?.status ?? "disconnected";
  const capable = connection?.canCreatePaymentRequest === true;

  // The names in the reader's own language; the codes are Stripe's and the server's.
  const countryOptions = useMemo(() => {
    const codes = onboarding?.supportedCountries ?? [];
    let names: Intl.DisplayNames | null = null;
    try { names = new Intl.DisplayNames([studioLocaleTag(language)], { type: "region" }); } catch { names = null; }
    return codes
      .map(code => ({ code, name: names?.of(code) || code }))
      .sort((a, b) => a.name.localeCompare(b.name, studioLocaleTag(language)));
  }, [onboarding, language]);

  const connect = (chosenCountry = "") => guard("connect", async () => {
    const result = await beginStripeOnboarding(companyId, chosenCountry);
    setPickingCountry(false);
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
        // Not offered here. Either this workspace is outside the Payment Links
        // pilot (the server's answer, S2) or the server has the rail switched
        // off. Nothing a workspace does here can change either, so there is no
        // button that cannot work and nothing that reads as an error.
        <p className="muted-copy">{unavailableReason === "not_in_pilot"
          ? t("Card payment links are not available for this workspace yet.")
          : t("Card payments are not set up on this server yet.")}</p>
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
            {status === "disconnected" || status === "onboarding" || status === "restricted" ? (
              // A restricted account is one Stripe is still asking about: the
              // owner must be able to go back and answer, and the server resumes
              // onboarding on the SAME account (beginStripeConnectOnboarding
              // reuses the stored account id), so no second account is made.
              <button type="button" className="button" disabled={!isOwner || busy === "connect"}
                onClick={() => (status === "disconnected" && countryOptions.length > 0 ? setPickingCountry(true) : void connect())}>
                {busy === "connect" ? t("Opening…") : status === "disconnected" ? t("Connect Stripe") : t("Continue with Stripe")}
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

          {pickingCountry && status === "disconnected" ? (
            <div className="settings-card" style={{ marginTop: 10, display: "grid", gap: 8 }} data-stripe-country-picker>
              <label style={{ display: "grid", gap: 4 }}>
                <strong style={{ fontSize: 13 }}>{t("Country your business is registered in")}</strong>
                <select className="input" value={country} onChange={event => setCountry(event.target.value)}>
                  <option value="">{t("Choose a country")}</option>
                  {countryOptions.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
                </select>
              </label>
              <p className="muted-copy" style={{ margin: 0 }}>{t("Stripe needs this to open your account, and it cannot be changed later.")}</p>
              <p className="muted-copy" style={{ margin: 0 }}>{t("Not in the list? Stripe does not accept businesses registered there yet.")}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="button" disabled={!country || busy === "connect"} onClick={() => void connect(country)}>
                  {busy === "connect" ? t("Opening…") : t("Continue to Stripe")}
                </button>
                <button type="button" className="button secondary" onClick={() => setPickingCountry(false)}>{t("Cancel")}</button>
              </div>
            </div>
          ) : null}

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
            <>
              <p className="muted-copy" style={{ marginTop: 10 }}>
                {t("Create payment links on an order, and see them all together in Banking.")}
              </p>
              {/* NivaDesk sends the customer nothing; a receipt is Stripe's, and only when the owner turned it on. */}
              <p className="muted-copy" style={{ margin: 0 }}>
                {t("Customers get a receipt from Stripe by email only when Successful payments is turned on in your Stripe Dashboard (Settings → Customer emails).")}
              </p>
            </>
          ) : null}

          {/* Short links on the business's own domain (pay.<their domain>/p/<code>): owner only, like the
              connection itself, and only once links can be made at all. */}
          {capable && isOwner ? <PaymentLinkDomainBlock workspace={workspace} t={t} /> : null}
        </>
      )}
    </div>
  );
}
