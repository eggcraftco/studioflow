"use client";

// Settings → Customer Channels.
//
// WhatsApp and Instagram, one card each, always both — so a workspace sees the
// channel it has and the one it does not. Every state on these cards is the
// server's measurement (a message stored, a reply accepted, an authentication
// failure on a send), read through `getCustomerChannelStatus`; nothing here
// claims "connected" that the server did not see.
//
// The owner can connect the business's OWN WhatsApp number (Meta's Embedded
// Signup pop-up), renew it, and disconnect it. The button appears only when
// this build carries Meta's public sign-up ids — until NivaDesk is approved to
// connect other businesses' numbers it does not — and never in an emulator
// run. A line NivaDesk itself routed is not the owner's to change; its card
// says to contact support. Instagram is not offered at all yet.

import { useCallback, useEffect, useState } from "react";
import { SettingsCardHead } from "./pageHeader";
import { studioT, studioLocaleTag } from "@/lib/studioflow/language";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  connectWhatsAppNumber,
  disconnectWhatsAppNumber,
  loadCustomerChannelStatus,
  type CustomerChannelCard,
  type CustomerChannelStatus
} from "@/lib/studioflow/customerInbox";
import { metaSignupConfig, runEmbeddedSignup } from "@/lib/studioflow/metaSignup";

type Props = { workspace: WorkspaceContext; language?: string };

const STATE_LABEL: Record<CustomerChannelCard["state"], string> = {
  connected: "Connected",
  reconnect_required: "Reconnect required",
  pending: "Waiting for the first message",
  not_connected: "Not connected",
  unavailable: "Not available yet"
};

function stateSentence(card: CustomerChannelCard, canSignUp: boolean): string {
  if (card.channel === "instagram" && card.state === "unavailable") return "Instagram Direct messages are not available yet.";
  const ownLine = card.connections.some((line) => line.connectedVia === "signup");
  switch (card.state) {
    case "connected": return "Customers who write to this line appear in Messages ▸ Customers.";
    case "reconnect_required": return ownLine
      ? "Replies cannot be sent until the number is reconnected. Use Reconnect below."
      : "Replies cannot be sent until this connection is renewed. Contact NivaDesk support to renew it.";
    case "pending": return "This line has not received a message yet.";
    case "not_connected": return canSignUp
      ? "Connect the WhatsApp Business number your customers already write to."
      : "Connecting your own WhatsApp Business number is not open yet. NivaDesk needs Meta's approval before it can connect other businesses' numbers.";
    default: return "This channel is not available yet.";
  }
}

function problemSentence(errorClass: string): string {
  switch (errorClass) {
    case "auth": return "The WhatsApp connection needs to be reconnected.";
    case "permission": return "The 24-hour window may have closed, or this number cannot receive WhatsApp messages.";
    case "transient": return "WhatsApp had a temporary problem. Try again in a moment.";
    default: return "WhatsApp did not deliver this reply.";
  }
}

/** A refused connect or disconnect, from the server's reason word or the pop-up's. Keys: the caller translates. */
function refusalSentence(reason: string): string {
  switch (reason) {
    case "number_in_use": return "That number is already connected to another NivaDesk workspace.";
    case "workspace_has_line": return "This workspace already has a WhatsApp number. Disconnect it first.";
    case "operator_line": return "This WhatsApp number was connected by NivaDesk. Contact NivaDesk support to change it.";
    case "code_rejected": return "Meta did not accept the sign-up. Start again.";
    case "account_unreachable": return "The WhatsApp Business Account could not be read with this sign-up. Start again.";
    case "number_not_in_account": return "That number is not in the WhatsApp Business Account you signed up with.";
    case "subscribe_failed": return "Meta did not let NivaDesk receive this account's messages. Try again.";
    case "register_failed": return "Meta did not register the number for messaging. Try again, or check the number in WhatsApp Manager.";
    case "not_configured": return "Connecting your own WhatsApp number is not available yet.";
    case "owner_only": return "Only the workspace owner can connect or disconnect a WhatsApp number.";
    case "cancelled": return "The sign-up was closed before it finished.";
    case "finish_without_number": return "The sign-up finished without a phone number. Start again and choose a number.";
    case "timed_out": return "The sign-up took too long. Start again.";
    case "popup_failed": return "The Meta sign-up window could not open. Allow pop-ups for NivaDesk and try again.";
    case "no_line": return "This workspace has no WhatsApp number connected.";
    default: return "The number could not be connected. Try again.";
  }
}

export function CustomerChannelsSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [status, setStatus] = useState<CustomerChannelStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "connecting" | "disconnecting">("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const isOwner = normalizeWorkspaceRole(workspace.role) === "owner";
  const signupConfig = metaSignupConfig();

  const when = useCallback((ms: number) => {
    if (!ms) return "";
    try {
      return new Intl.DateTimeFormat(studioLocaleTag(language), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
    } catch {
      return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
    }
  }, [language]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await loadCustomerChannelStatus(workspace.id));
    } catch (failure) {
      setStatus(null);
      setError(friendlyErrorMessage(failure, t));
    } finally {
      setLoading(false);
    }
  }, [workspace.id, t]);

  useEffect(() => { void load(); }, [load]);

  const connect = useCallback(async () => {
    setBusy("connecting");
    setNotice("");
    setActionError("");
    try {
      const signup = await runEmbeddedSignup(signupConfig);
      if (!signup.ok) { setActionError(t(refusalSentence(signup.reason))); return; }
      // The code lives 30 seconds: straight to the server.
      const result = await connectWhatsAppNumber(workspace.id, { code: signup.code, phoneNumberId: signup.phoneNumberId, wabaId: signup.wabaId });
      if (!result.ok) { setActionError(t(refusalSentence(result.reason))); return; }
      setNotice(t("WhatsApp number connected."));
      await load();
    } catch (failure) {
      setActionError(friendlyErrorMessage(failure, t));
    } finally {
      setBusy("");
    }
  }, [signupConfig, workspace.id, t, load]);

  const disconnect = useCallback(async () => {
    if (!window.confirm(t("Disconnect this WhatsApp number from NivaDesk? Customers who write to it will no longer appear here and replies will stop. Conversations already in Messages stay."))) return;
    setBusy("disconnecting");
    setNotice("");
    setActionError("");
    try {
      const result = await disconnectWhatsAppNumber(workspace.id);
      if (!result.ok) { setActionError(t(refusalSentence(result.reason))); return; }
      setNotice(result.unsubscribed
        ? t("WhatsApp number disconnected.")
        : t("Disconnected from NivaDesk. Meta could not be told, so also remove NivaDesk from the account in Meta Business Settings."));
      await load();
    } catch (failure) {
      setActionError(friendlyErrorMessage(failure, t));
    } finally {
      setBusy("");
    }
  }, [workspace.id, t, load]);

  if (loading) return <p className="muted-copy">{t("Loading…")}</p>;
  if (!status) {
    return (
      <section className="card app-card">
        <SettingsCardHead title={t("Customer Channels")} subtitle={t("WhatsApp and Instagram: which line your customers write to, and whether it works.")} />
        <p className="layout-error">{error}</p>
        <div className="settings-action-row">
          <button type="button" className="button secondary" onClick={() => void load()}>{t("Try again")}</button>
        </div>
      </section>
    );
  }

  const canSignUp = Boolean(signupConfig);
  return (
    <div className="settings-card-stack settings-channels-page">
      <p className="settings-field-hint" role="status">{t("{count} connected").replace("{count}", String(status.connected))}</p>
      {notice ? <p className="settings-field-hint" role="status">{notice}</p> : null}
      {actionError ? <p className="layout-error" role="alert">{actionError}</p> : null}
      {status.cards.map((card) => {
        const ownLine = card.connections.find((line) => line.connectedVia === "signup") || null;
        const offerConnect = card.channel === "whatsapp" && card.state === "not_connected" && canSignUp;
        const offerReconnect = card.channel === "whatsapp" && Boolean(ownLine) && card.state === "reconnect_required" && canSignUp;
        return (
          <section className="card app-card" key={card.channel} aria-label={card.channel === "whatsapp" ? "WhatsApp" : "Instagram"}>
            <SettingsCardHead
              title={card.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
              subtitle={t(stateSentence(card, canSignUp))}
              aside={
                <span className={card.state === "connected" ? "settings-status-pill is-saved" : "settings-status-pill is-dirty"}>
                  <span className="settings-status-pill-mark" aria-hidden="true">{card.state === "connected" ? "✓" : "●"}</span>
                  {t(STATE_LABEL[card.state])}
                </span>
              }
            />
            {card.connections.length ? (
              <div className="settings-two-col">
                {card.connections.map((line, index) => (
                  <div className="settings-subpanel" key={`${line.displayLabel}-${index}`}>
                    <strong className="settings-fact-value" dir="ltr">{line.displayLabel || "—"}</strong>
                    <span className="settings-field-hint">
                      {t("Last message received")}: {line.lastInboundAtMs ? when(line.lastInboundAtMs) : "—"}
                    </span>
                    <span className="settings-field-hint">
                      {t("Last reply sent")}: {line.lastOutboundAtMs ? when(line.lastOutboundAtMs) : "—"}
                    </span>
                    {line.lastErrorClass ? (
                      <span className="settings-field-hint">
                        {t("Last problem")}: {when(line.lastErrorAtMs)} — {t(problemSentence(line.lastErrorClass))}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {card.channel === "whatsapp" && (offerConnect || offerReconnect || ownLine) ? (
              isOwner ? (
                <div className="settings-action-row">
                  {offerConnect || offerReconnect ? (
                    <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void connect()}>
                      {busy === "connecting" ? t("Connecting…") : offerReconnect ? t("Reconnect") : t("Connect your WhatsApp number")}
                    </button>
                  ) : null}
                  {ownLine ? (
                    <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void disconnect()}>
                      {busy === "disconnecting" ? t("Disconnecting…") : t("Disconnect")}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="settings-field-hint">{t("Only the workspace owner can connect or disconnect a WhatsApp number.")}</p>
              )
            ) : null}
            {offerConnect && isOwner ? (
              <p className="settings-field-hint">
                {t("You sign in to Meta in a pop-up and choose the number. It stays your business's number, in your own WhatsApp Business Account.")}
              </p>
            ) : null}
          </section>
        );
      })}
      <p className="settings-field-hint">
        {t("Customer messages are deleted automatically 90 days after they arrive, and photos and PDFs after 30 days. Deleted messages can stay in NivaDesk's backups for up to 14 days.")}
      </p>
    </div>
  );
}
