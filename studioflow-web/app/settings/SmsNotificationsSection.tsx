"use client";

// Settings → Customer SMS.
//
// The server side of this shipped first and has been sitting there unreachable:
// two callables, a send gate that refuses rather than half-sends, and a
// per-order switch on the Customer Portal card. This is the screen that lets
// the owner see and set any of it.
//
// One rule shapes every sentence here: never promise a text will arrive. The
// Twilio credentials are set, which is the fact most likely to be mistaken for
// readiness — and is not it. `sendingLive` is the only field that means a
// message would actually be delivered, and today it is false, because the
// platform sender ID "NivaDesk" has been in review with the UK networks since
// 25 August 2026. So the screen says so plainly: everything is configurable
// now, nothing is sent yet, and the wait is with the networks rather than with
// anything the owner has done wrong.

import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@/components/CardTitle";
import { SettingsCardHead } from "./pageHeader";
import { studioT, studioLocaleTag } from "@/lib/studioflow/language";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { useUnsavedGuard } from "./unsavedChanges";
import {
  cleanSmsCallingCodeInput,
  cleanSmsSenderIdInput,
  getWorkspaceSmsSettings,
  normalizeSmsTriggers,
  saveWorkspaceSmsSettings,
  SMS_TRIGGER_DEFAULTS,
  type SmsTriggerKey,
  type SmsTriggers,
  type WorkspaceSmsSettings
} from "@/lib/studioflow/sms";

type Props = { workspace: WorkspaceContext; language?: string };

const TRIGGER_ROWS: { key: SmsTriggerKey; title: string; detail: string }[] = [
  {
    key: "estimateReady",
    title: "Estimate ready",
    detail: "Sent when an estimate is waiting for the customer to approve it."
  },
  {
    key: "workStarted",
    title: "Work started",
    detail: "Sent when the piece moves onto the bench."
  },
  {
    key: "readyForCollection",
    title: "Ready for collection",
    detail: "Sent when the work is finished and the customer can come in."
  },
  {
    key: "everyStatusChange",
    title: "Every status change",
    detail:
      "Sent at every step of your workflow, not only the three above. Most workshops leave this off: internal steps mean little to a customer, and every message is charged."
  }
];

/** One read-only fact, in the same tile the rest of Settings uses. */
function SmsFact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="mini-panel settings-info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <span>{note}</span> : null}
    </article>
  );
}

function monthLabel(month: string, language: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return String(month || "");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  try {
    return new Intl.DateTimeFormat(studioLocaleTag(language), { month: "long", year: "numeric" }).format(date);
  } catch {
    return String(month || "");
  }
}

/** The carrier bills in US dollars, so the number is shown in the currency it was charged in. */
function spendLabel(spendUsd: number, language: string): string {
  const value = Number.isFinite(spendUsd) ? spendUsd : 0;
  try {
    return new Intl.NumberFormat(studioLocaleTag(language), { style: "currency", currency: "USD" }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function SmsNotificationsSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const isOwner = normalizeWorkspaceRole(workspace.role) === "owner";

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WorkspaceSmsSettings | null>(null);
  const [triggers, setTriggers] = useState<SmsTriggers>(SMS_TRIGGER_DEFAULTS);
  const [senderDraft, setSenderDraft] = useState("");
  const [callingCode, setCallingCode] = useState("44");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkspaceSmsSettings(workspace);
      setSettings(data);
      setTriggers(normalizeSmsTriggers(data.triggers));
      setCallingCode(cleanSmsCallingCodeInput(data.defaultCallingCode) || "44");
      // `senderId` is the sender a customer would see, which is the platform's
      // name until the workspace's own is verified. Only in that verified case
      // is it this workspace's own name — so only then does it belong in a box
      // whose contents are saved back as the workspace's own sender ID. Seeding
      // it otherwise would make the next Save claim "NivaDesk" as this
      // workspace's name.
      setSenderDraft(data.senderStatus === "verified" ? data.senderId : "");
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? t(loadError.message) : t("The SMS settings could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only the owner can save, and only on a plan that includes SMS. Everyone
  // else reads the same screen with the controls locked, because knowing what
  // the workspace texts customers is not owner-only knowledge.
  const canEdit = isOwner && settings?.available === true;

  // The draft starts from defaults and is overwritten when the callable lands,
  // so the baseline waits for `loading` to clear.
  const { dirty, markSaved } = useUnsavedGuard(
    "sms-notifications",
    { triggers, senderDraft: cleanSmsSenderIdInput(senderDraft).trim(), callingCode },
    !loading,
    () => handleSave(true)
  );

  async function handleSave(rethrow = false) {
    const sender = cleanSmsSenderIdInput(senderDraft).trim();
    // Every save writes the sender box; the contract has no "leave it alone".
    // A pending registration whose name the callable does not send back can
    // therefore be withdrawn by saving a change to something else entirely, so
    // this is the only place that can stop that happening in silence.
    if (settings?.senderStatus === "pending" && !sender) {
      const goAhead = window.confirm(
        t("Saving with the sender ID box empty withdraws the sender ID you registered, and your texts go back to being sent from NivaDesk. Continue?")
      );
      if (!goAhead) {
        setError(t("Nothing was saved. Type your sender ID again to keep its registration."));
        if (rethrow) throw new Error("sms-save-cancelled");
        return;
      }
    }

    setBusy("save");
    setError("");
    setNotice("");
    try {
      const saved = await saveWorkspaceSmsSettings(workspace, {
        senderId: sender,
        triggers,
        defaultCallingCode: callingCode
      });
      setTriggers(normalizeSmsTriggers(saved.triggers));
      setSenderDraft(saved.senderId);
      setSettings(current =>
        current
          ? {
              ...current,
              senderStatus: saved.senderStatus,
              triggers: normalizeSmsTriggers(saved.triggers),
              // The effective sender only becomes the workspace's own once the
              // networks have verified it; until then a customer still sees the
              // platform's name.
              senderId: saved.senderStatus === "verified" && saved.senderId ? saved.senderId : current.platformSenderId,
              sendingLive: current.platformSenderStatus === "verified" || (saved.senderStatus === "verified" && Boolean(saved.senderId))
            }
          : current
      );
      markSaved();
      setNotice(t("SMS settings saved."));
    } catch (saveError) {
      setError(saveError instanceof Error ? t(saveError.message) : t("The SMS settings could not be saved."));
      if (rethrow) throw saveError;
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p className="muted-copy">{t("Loading…")}</p>;

  if (!settings) {
    return (
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="reply" eyebrow={t("Customer SMS")} title={t("Text updates to your customers")} />
        <p className="layout-error">{error || t("The SMS settings could not be loaded.")}</p>
        <div className="settings-action-row">
          <button type="button" className="button secondary" onClick={() => void load()}>
            {t("Try again")}
          </button>
        </div>
      </section>
    );
  }

  // The headline, in the order the facts actually gate each other: the plan,
  // then the server's credentials, then the sender registration. Each answer is
  // a different sentence because each one needs a different thing to happen
  // next, and only the last of them is something the owner cannot hurry.
  const sendingState = (() => {
    if (!settings.available) {
      return {
        pill: t("Not on this plan"),
        headline: t("Customer SMS is part of NivaDesk Pro and Team."),
        detail: t("Free and Starter workspaces can read this screen but cannot change it. Every text costs money at the carrier, which is why it sits on the paid plans.")
      };
    }
    if (!settings.providerConfigured) {
      return {
        pill: t("Not set up"),
        headline: t("SMS is not switched on for this server yet."),
        detail: t("Nothing is sent until it is. Contact NivaDesk support and we will enable it.")
      };
    }
    if (settings.sendingLive) {
      return {
        pill: t("Sending"),
        headline: t("SMS is live."),
        detail: `${t("Texts go out from")} ${settings.senderId}. ${t("A customer only gets one when Automatic Updates and SMS are both switched on for their order.")}`
      };
    }
    return {
      pill: t("Not sending yet"),
      headline: t("Everything you set here is saved and waiting."),
      detail: t("The sender ID NivaDesk texts from is still being approved by the mobile networks, and until that lands no message leaves. Nothing is broken and there is nothing to fix at your end: approval is theirs to give. Registering your own sender ID below is the other way to start sending.")
    };
  })();

  const usage = settings.usage || { month: "", messages: 0, segments: 0, spendUsd: 0 };
  const nothingSentYet = !usage.messages && !usage.segments && !usage.spendUsd;
  const ownSenderStatusLabel =
    settings.senderStatus === "verified"
      ? t("Verified")
      : settings.senderStatus === "pending"
        ? t("Waiting for approval")
        : t("Not registered");

  const bandTone = !settings.available || !settings.providerConfigured ? "is-caution" : settings.sendingLive ? "is-success" : "is-info";

  return (
    <div className="settings-card-stack settings-sms-page">
      {notice ? <p className="success-copy">{notice}</p> : null}
      {error ? <p className="layout-error">{error}</p> : null}

      {/* ── What is actually happening: one calm band, one clear next step ── */}
      <div className={`settings-status-band ${bandTone}`} role="status">
        <span className="settings-status-band-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></svg>
        </span>
        <div className="settings-status-band-copy">
          <strong>{sendingState.headline}</strong>
          <p>{sendingState.detail}</p>
        </div>
        <span className="settings-status-band-side">
          <span className="settings-tag">{sendingState.pill}</span>
          {!settings.available ? (
            <a className="button secondary" href="/settings?section=plan-access">{t("See plans")}</a>
          ) : !settings.providerConfigured ? (
            <a className="button secondary" href="/settings?section=support-tickets">{t("Contact support")}</a>
          ) : null}
        </span>
      </div>

      {/* ── The four triggers ──────────────────────────────────────────── */}
      <section className="card app-card">
        <SettingsCardHead title={t("Notification moments")} subtitle={t("Choose which order events can send a customer text.")} />
        <div className="settings-switch-list">
          {TRIGGER_ROWS.map(row => (
            <label className="settings-switch-line" key={row.key}>
              <span className="settings-switch-line-copy">
                <strong>{t(row.title)}</strong>
                <small>{t(row.detail)}</small>
              </span>
              <input
                type="checkbox"
                className="settings-switch"
                checked={triggers[row.key]}
                disabled={!canEdit || busy === "save"}
                onChange={event => setTriggers(current => ({ ...current, [row.key]: event.target.checked }))}
              />
            </label>
          ))}
        </div>
        <p className="settings-field-hint">
          {t("These choices apply to the whole workspace. A text still only goes to a customer whose order has Automatic Updates and SMS switched on, on the order's Customer Portal card.")}
        </p>
      </section>

      {/* ── Who the text is from ───────────────────────────────────────── */}
      <section className="card app-card">
        <SettingsCardHead title={t("Sender identity")} subtitle={t("Choose the name customers see when a message arrives.")} />
        <div className="settings-two-col settings-sender-facts">
          <div className="settings-subpanel">
            <span className="settings-field-label">{t("NivaDesk sender ID")}</span>
            <strong className="settings-fact-value">{settings.platformSenderId}</strong>
            <span className={settings.platformSenderStatus === "verified" ? "settings-status-pill is-saved" : "settings-status-pill is-dirty"}>
              <span className="settings-status-pill-mark" aria-hidden="true">{settings.platformSenderStatus === "verified" ? "✓" : "●"}</span>
              {settings.platformSenderStatus === "verified" ? t("Verified") : t("Waiting for approval")}
            </span>
            <span className="settings-field-hint">
              {settings.platformSenderStatus === "verified"
                ? t("Approved by the networks. Used until your own sender ID is verified.")
                : t("Registered and waiting for network approval. Until it lands, nothing sends from this name.")}
            </span>
          </div>
          <div className="settings-subpanel">
            <span className="settings-field-label">{t("Your own sender ID")}</span>
            <strong className="settings-fact-value">
              {settings.senderStatus === "verified" ? settings.senderId : settings.senderStatus === "pending" ? ownSenderStatusLabel : t("None")}
            </strong>
            <span className="settings-field-hint">
              {settings.senderStatus === "verified"
                ? t("Your customers see this name.")
                : settings.senderStatus === "pending"
                  ? t("Registration is with the networks. NivaDesk cannot approve it and neither can you.")
                  : t("Your customers see NivaDesk, and your workspace name is put at the start of the message instead.")}
            </span>
          </div>
        </div>
        <label className="settings-field">
          <span className="settings-field-label">{t("Register your own sender ID")}</span>
          <input
            className="input"
            value={senderDraft}
            maxLength={11}
            disabled={!canEdit || busy === "save"}
            placeholder={cleanSmsSenderIdInput(workspace.name || "") || t("Your studio")}
            onChange={event => setSenderDraft(cleanSmsSenderIdInput(event.target.value))}
          />
          <span className="settings-field-hint">
            {t("Up to 11 letters, numbers and spaces. A customer trusts a text from your studio's name more than one from ours.")}
          </span>
        </label>
        <p className="settings-field-hint is-caution">
          {t("Changing this name starts the registration again: the networks approve a name, not a workspace, so a new one goes back to waiting. NivaDesk cannot mark it verified itself — that answer only comes from them.")}
        </p>
        {settings.senderStatus === "pending" ? (
          <p className="settings-notice is-caution">
            {t("A sender ID of yours is already registered and waiting. Its name is not shown here until the networks approve it, and saving this screen with the box empty withdraws that registration — so type it again before you save anything else.")}
          </p>
        ) : null}
      </section>

      <div className="settings-two-col">
        {/* ── Numbers without a country code ─────────────────────────────── */}
        <section className="card app-card">
          <SettingsCardHead title={t("Phone numbers")} />
          <label className="settings-field">
            <span className="settings-field-label">{t("Default calling code")}</span>
            <div className="settings-domain-input settings-calling-code">
              <span className="settings-domain-suffix">+</span>
              <input
                className="input"
                value={callingCode}
                inputMode="numeric"
                maxLength={4}
                disabled={!canEdit || busy === "save"}
                placeholder="44"
                onChange={event => setCallingCode(cleanSmsCallingCodeInput(event.target.value))}
                // An empty box is not a choice the server can store: it falls back
                // to what is already saved, and the screen would then be showing a
                // code that is not the one in use.
                onBlur={() => setCallingCode(current => current || cleanSmsCallingCodeInput(settings.defaultCallingCode) || "44")}
              />
            </div>
            <span className="settings-field-hint">{t("Digits only, no plus sign. Used when a customer's saved number has no country code of its own — 44 is the United Kingdom.")}</span>
          </label>
          <p className="settings-field-hint">
            {t("A number that already carries its own country code is left exactly as it is.")}
          </p>
        </section>

        {/* ── What it has cost ───────────────────────────────────────────── */}
        <section className="card app-card">
          <SettingsCardHead title={t("Usage this month")} aside={<span className="settings-field-hint">{monthLabel(usage.month, language)}</span>} />
          <dl className="settings-facts">
            <div><dt>{t("Messages")}</dt><dd>{String(usage.messages || 0)}</dd></div>
            <div><dt>{t("Segments")}</dt><dd>{String(usage.segments || 0)}</dd></div>
            <div><dt>{t("Spend")}</dt><dd>{spendLabel(usage.spendUsd || 0, language)}</dd></div>
          </dl>
          <p className="settings-field-hint">
            {nothingSentYet
              ? t("No messages have been sent from this workspace yet, so there is nothing to charge for.")
              : t("A long message is charged as more than one segment: 160 plain characters each, or 70 if it contains an emoji or an accented letter.")}
          </p>
          <div className="settings-action-row">
            <button
              type="button"
              className="button secondary"
              disabled={busy === "save"}
              onClick={() => {
                // Reloading silently threw away unsaved switches, so it says so first.
                if (dirty && !window.confirm(t("Reload will discard your unsaved changes here. Continue?"))) return;
                setNotice("");
                void load();
              }}
            >
              {t("Reload usage")}
            </button>
          </div>
        </section>
      </div>

      <div className="settings-save-row settings-save-bar">
        <p className="settings-save-bar-note">
          {t("These choices apply to the whole workspace.")}
        </p>
        {!isOwner ? <p className="settings-field-hint">{t("Only the workspace owner can change customer SMS settings. You can see what is set.")}</p> : null}
        {isOwner && !settings.available ? <p className="settings-field-hint">{t("Upgrade to NivaDesk Pro or Team to change these settings.")}</p> : null}
        <button
          type="button"
          className="button"
          disabled={!canEdit || busy === "save" || !dirty}
          onClick={() => {
            void handleSave();
          }}
        >
          {busy === "save" ? t("Saving…") : t("Save SMS settings")}
        </button>
      </div>
    </div>
  );
}
