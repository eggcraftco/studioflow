"use client";

// Royal Mail Click & Drop in Settings ▸ Integrations: the workspace's own Click & Drop API key.
//
// - Only the owner connects or disconnects. The key is checked against Royal Mail before
//   anything is stored, stored encrypted on the server, and never shown again (its last four
//   characters only). Royal Mail charges nothing for Click & Drop or its API; the business pays
//   its own postage.
// - The kind of account is Royal Mail's, read when the key is saved: pay-as-you-go accounts send
//   orders with Royal Mail's price and print the label in Click & Drop; a Royal Mail business
//   account gets the label in NivaDesk.
// - The tile and this screen exist only where the server has opened Royal Mail for the workspace
//   (appConfig/shipping.royalMail).
import { useCallback, useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import {
  CLICK_AND_DROP_SIGN_UP_URL,
  CLICK_AND_DROP_URL,
  disconnectRoyalMailConnection,
  getRoyalMailConnection,
  royalMailErrorMessage,
  saveRoyalMailConnection,
  type RoyalMailConnectionView
} from "@/lib/studioflow/royalMail";

type Props = { workspace: WorkspaceContext; language?: string };

export function RoyalMailIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [view, setView] = useState<RoyalMailConnectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    try {
      const next = await getRoyalMailConnection(companyId, { fresh: true });
      setView(next);
      setTradingName(current => current || next.tradingName || workspace.name || "");
    } catch (failure) {
      setError(royalMailErrorMessage(failure, t));
    } finally {
      setLoading(false);
    }
  }, [companyId, t, workspace.name]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function guard(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (failure) {
      setError(royalMailErrorMessage(failure, t));
    } finally {
      setBusy("");
    }
  }

  const accountTypeName = (type: string | undefined) => type === "olp" ? t("Pay as you go") : type === "account" ? t("Business account") : t("Not known yet.");
  const accountTypeText = (type: string | undefined) => type === "olp"
    ? t("Pay as you go: you pay for and print each label in Click & Drop.")
    : type === "account"
      ? t("Royal Mail business account: labels come to NivaDesk.")
      : "";

  // How a business gets its own key, in four steps (Royal Mail's Click & Drop screens).
  const howTo = (
    <div className="shipment-settings-form" data-testid="royal-mail-howto">
      <p className="muted-copy">{t("NivaDesk sends your orders to your own Royal Mail Click & Drop account. Click & Drop is free; you pay Royal Mail only for postage.")}</p>
      <ol className="settings-steps">
        <li>{t("Sign in to Click & Drop (or register for free).")} <a href={CLICK_AND_DROP_SIGN_UP_URL} target="_blank" rel="noopener noreferrer">{t("Open Click & Drop")}</a></li>
        <li>{t("Open Settings ▸ Integrations ▸ Add a new integration, and choose Click & Drop API.")}</li>
        <li>{t("Save it, then copy the Click & Drop API authorisation key it shows.")}</li>
        <li>{t("Paste the key below. NivaDesk checks it with Royal Mail before saving.")}</li>
      </ol>
    </div>
  );

  const connectForm = (
    <div className="shipment-settings-form">
      <div className="inventory-form">
        <label className="inventory-field"><span>{t("Click & Drop API key")}</span>
          <input className="input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="new-password" spellCheck={false} disabled={busy === "connect"} data-testid="royal-mail-key" /></label>
        <label className="inventory-field"><span>{t("Trading name on labels")}</span>
          <input className="input" value={tradingName} onChange={e => setTradingName(e.target.value)} maxLength={250} disabled={busy === "connect"} />
          <small className="shipment-muted">{t("Royal Mail prints it as the sender on the label.")}</small></label>
      </div>
      <div className="shipment-actions">
        <button
          type="button"
          className="button"
          disabled={busy === "connect" || !apiKey.trim()}
          data-testid="royal-mail-connect"
          onClick={() => guard("connect", async () => {
            const out = await saveRoyalMailConnection(companyId, { apiKey: apiKey.trim(), tradingName: tradingName.trim() });
            setApiKey("");
            setShowForm(false);
            setNotice(`${t("Royal Mail connected.")} ${t("Key")} ••••${out.keyLast4}`);
            await refresh();
          })}
        >{busy === "connect" ? t("Checking with Royal Mail…") : view?.connected ? t("Save new key") : t("Connect Royal Mail")}</button>
        {view?.connected && showForm ? <button type="button" className="button secondary" onClick={() => { setShowForm(false); setApiKey(""); }}>{t("Cancel")}</button> : null}
      </div>
    </div>
  );

  return (
    <div className="settings-card-stack">
      {notice ? <p className="settings-notice" style={{ color: "#16a34a", fontWeight: 600 }}>{notice}</p> : null}
      {error ? <p className="settings-notice" style={{ color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}
      {loading ? <p className="muted-copy">{t("Loading...")}</p> : !view?.enabled ? (
        <section className="settings-card">
          <CardTitle icon="bolt" eyebrow="Royal Mail" title={t("Not available yet")} />
          <p className="muted-copy">{t("Royal Mail is not available for this workspace yet.")}</p>
        </section>
      ) : (
        <>
          <section className="settings-card">
            <CardTitle icon="bolt" eyebrow="Royal Mail Click & Drop" title={view.connected ? t("Connected") : t("Connect your Click & Drop account")} />
            <p className="muted-copy">{t("Send an order to Click & Drop from its Shipping & Tracking card, with no address to retype. Once the label is printed, its tracking number comes back to the order, and the order is marked dispatched when Royal Mail has the parcel.")}</p>
            {view.attention === "key_rejected" ? (
              <p className="shipment-banner" data-tone="warn">{t("Royal Mail no longer accepts the saved key. Create a new key in Click & Drop and save it here.")}</p>
            ) : null}
            {view.connected ? (
              <>
                <ul className="settings-facts">
                  <li>{t("Account")} <strong>{accountTypeName(view.accountType)}</strong></li>
                  {view.keyLast4 ? <li>{t("Key")} <strong>••••{view.keyLast4}</strong></li> : null}
                  {view.tradingName ? <li>{t("Trading name on labels")} <strong>{view.tradingName}</strong></li> : null}
                </ul>
                {accountTypeText(view.accountType) ? <p className="muted-copy">{accountTypeText(view.accountType)}</p> : null}
                <p className="muted-copy"><a href={CLICK_AND_DROP_URL} target="_blank" rel="noopener noreferrer">{t("Open Click & Drop")}</a></p>
                {isOwner ? (
                  showForm ? connectForm : <button type="button" className="button secondary" onClick={() => setShowForm(true)}>{t("Enter a new key")}</button>
                ) : null}
              </>
            ) : isOwner ? (<>{howTo}{connectForm}</>) : (
              <p className="muted-copy">{t("Only the workspace owner can connect or disconnect Royal Mail.")}</p>
            )}
          </section>

          {isOwner && view.connected ? (
            <section className="settings-card">
              <CardTitle icon="bolt" eyebrow="Royal Mail" title={t("Disconnect Royal Mail")} />
              {confirmDisconnect ? (
                <div className="shipment-settings-form">
                  <p className="muted-copy">{t("Disconnect Royal Mail? The stored key is deleted and no new order can be sent. Orders already in Click & Drop stay there, and tracking numbers already on orders stay.")}</p>
                  <div className="shipment-actions">
                    <button type="button" className="button danger" disabled={busy === "disconnect"} onClick={() => guard("disconnect", async () => {
                      await disconnectRoyalMailConnection(companyId);
                      setConfirmDisconnect(false);
                      setNotice(t("Royal Mail disconnected."));
                      await refresh();
                    })}>{t("Disconnect")}</button>
                    <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep connected")}</button>
                  </div>
                </div>
              ) : <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect Royal Mail")}</button>}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
