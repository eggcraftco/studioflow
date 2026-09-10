"use client";

// Feedback v1, the web surface: a small invitation after the workspace's first
// real order (the server decides when — see functions/feedback.js), the short
// form it opens, and the same form reachable any time from the account menu.
//
// The invitation is quiet on purpose: a card in the corner, no overlay, no
// timer. It counts as "shown" only once it is on screen (the server is told
// then, not when it is asked). "Not now" closes it for the server's cooldown;
// closing the form opened from it without sending counts the same way; sending
// answers the prompt for good. The manual entry is never held back by that
// cooldown, and closing the manual form records nothing. A draft is kept until
// it is sent, so closing the form does not lose what was typed.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  confirmFeedbackPromptShown, dismissFeedbackPrompt, feedbackErrorText, getFeedbackPrompt, newFeedbackClientKey, submitFeedback,
  FEEDBACK_TEXT_MAX, type FeedbackExperience, type FeedbackKind, type FeedbackTrigger
} from "@/lib/studioflow/feedback";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const promptKey = (companyId: string, uid: string) => `nv_feedback_prompt_${companyId}_${uid}`;
const checkKey = (companyId: string, uid: string) => `nv_feedback_checked_${companyId}_${uid}`;
const shownKey = (companyId: string, uid: string) => `nv_feedback_shown_${companyId}_${uid}`;

function readSession(key: string): string {
  try { return window.sessionStorage.getItem(key) ?? ""; } catch { return ""; }
}
function writeSession(key: string, value: string) {
  try { if (value) window.sessionStorage.setItem(key, value); else window.sessionStorage.removeItem(key); } catch { /* private mode */ }
}

const EXPERIENCE_LABELS: Record<FeedbackExperience, string> = { easy: "Going well", okay: "It's okay", difficult: "Struggling" };
const KIND_LABELS: Record<FeedbackKind, string> = { problem: "Something isn't working", missing_feature: "Something is missing", suggestion: "A suggestion" };

type DialogState = { trigger: FeedbackTrigger; campaign: string };

export default function FeedbackCenter({
  workspace, uid, language, t, manualOpen, onManualClose, onAvailability
}: {
  workspace: WorkspaceContext | null;
  uid: string;
  language: string;
  t: (text: string) => string;
  manualOpen: boolean;
  onManualClose: () => void;
  onAvailability?: (enabled: boolean) => void;
}) {
  const pathname = usePathname() || "";
  const [invitation, setInvitation] = useState<string>("");   // the open invitation's campaign, "" when none
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // The draft survives a close: only a sent note clears it.
  const [experience, setExperience] = useState<FeedbackExperience | "">("");
  const [kind, setKind] = useState<FeedbackKind | "">("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const clientKeyRef = useRef("");
  const openerRef = useRef<HTMLElement | null>(null);
  const firstControlRef = useRef<HTMLButtonElement | null>(null);
  const companyId = workspace?.id ?? "";

  // Ask the server whether the invitation may be shown — once per ten minutes
  // per session, and again when the page changes after that. A "yes" is kept
  // for the session so navigating does not make the card vanish and reappear.
  useEffect(() => {
    if (!companyId || !uid) return;
    const cached = readSession(promptKey(companyId, uid));
    if (cached) { setInvitation(cached); onAvailability?.(true); return; }
    const last = Number(readSession(checkKey(companyId, uid))) || 0;
    if (Date.now() - last < CHECK_INTERVAL_MS) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getFeedbackPrompt(companyId, pathname.slice(0, 200));
        if (cancelled) return;
        writeSession(checkKey(companyId, uid), String(Date.now()));
        onAvailability?.(Boolean(result.enabled));
        if (result.enabled && result.show && result.campaign) {
          writeSession(promptKey(companyId, uid), result.campaign);
          setInvitation(result.campaign);
        }
      } catch {
        // Not knowing is the same as "not now": nothing is shown, nothing is written.
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, uid, pathname, onAvailability]);

  // The card is on screen: tell the server once per session. Before this call
  // nothing has been counted, so a card that never rendered costs nothing.
  useEffect(() => {
    if (!invitation || !companyId || !uid) return;
    if (readSession(shownKey(companyId, uid)) === invitation) return;
    writeSession(shownKey(companyId, uid), invitation);
    void confirmFeedbackPromptShown(companyId, invitation).catch(() => { /* best-effort; the card stays */ });
  }, [invitation, companyId, uid]);

  const openDialog = useCallback((next: DialogState) => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    clientKeyRef.current = clientKeyRef.current || newFeedbackClientKey();
    setError(""); setSent(false); setBusy(false);
    setDialog(next);
  }, []);

  useEffect(() => {
    if (manualOpen) openDialog({ trigger: "manual", campaign: "" });
  }, [manualOpen, openDialog]);

  // Focus goes to the first control on open and back to whatever opened the form on close.
  useEffect(() => {
    if (dialog) {
      const handle = window.setTimeout(() => firstControlRef.current?.focus(), 30);
      return () => window.clearTimeout(handle);
    }
    // The opener may be gone (a menu item unmounts with its menu, the card
    // goes when it is answered): then the account button is the next best place.
    const opener = openerRef.current;
    const target = opener && document.contains(opener) ? opener : document.querySelector<HTMLElement>(".toolbar-avatar");
    // After the other key handlers and the re-render that closes the form, so nothing blurs it again.
    const handle = window.setTimeout(() => { if (target && typeof target.focus === "function") target.focus(); }, 0);
    return () => window.clearTimeout(handle);
  }, [dialog]);

  const clearInvitation = useCallback(() => {
    if (companyId && uid) writeSession(promptKey(companyId, uid), "");
    setInvitation("");
  }, [companyId, uid]);

  async function dismissInvitation(campaign: string) {
    clearInvitation();
    if (!companyId) return;
    try { await dismissFeedbackPrompt(companyId, campaign); } catch { /* the server's cooldown is best-effort here; the card is gone either way */ }
  }

  function closeDialog() {
    const current = dialog;
    setDialog(null);
    if (!current) return;
    if (current.trigger === "manual") { onManualClose(); return; }
    // Opened from the invitation and closed without sending: that is "not now". The draft stays for the menu entry.
    if (!sent) void dismissInvitation(current.campaign);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); closeDialog(); }
  }

  async function send() {
    if (!dialog || !companyId || !experience || busy) return;
    setBusy(true); setError("");
    try {
      await submitFeedback(companyId, {
        trigger: dialog.trigger, experience, kind, text: text.trim().slice(0, FEEDBACK_TEXT_MAX),
        page: pathname.slice(0, 200), clientKey: clientKeyRef.current, language
      });
      setSent(true);
      setExperience(""); setKind(""); setText(""); clientKeyRef.current = "";
      if (dialog.trigger === "first_success") clearInvitation();
    } catch (err) {
      setError(feedbackErrorText(err));   // the draft is untouched
    } finally {
      setBusy(false);
    }
  }

  const canSend = Boolean(experience) && !busy && !sent;
  const remaining = FEEDBACK_TEXT_MAX - text.length;
  const hasDraft = text.trim().length > 0;

  return (
    <>
      {invitation && !dialog ? (
        <aside className="feedback-invite" role="status" aria-live="polite" data-testid="feedback-invite">
          <strong className="feedback-invite-title">{t("How is it going so far?")}</strong>
          <p className="muted-copy">{t("Your first order is in. Two taps tell us what to fix next.")}</p>
          <div className="feedback-invite-actions">
            <button type="button" className="button" onClick={() => openDialog({ trigger: "first_success", campaign: invitation })}>{t("Give feedback")}</button>
            <button type="button" className="button secondary" onClick={() => void dismissInvitation(invitation)}>{t("Not now")}</button>
          </div>
        </aside>
      ) : null}

      {dialog ? (
        // A click outside closes only an empty form: a typed note is not lost to a stray click.
        <div className="modal-backdrop" role="presentation" onMouseDown={busy || hasDraft ? undefined : closeDialog}>
          <div className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={onKeyDown} data-testid="feedback-dialog">
            {sent ? (
              <div className="feedback-dialog-body">
                <div className="feedback-dialog-head">
                  <h2 id="feedback-dialog-title">{t("Thank you")}</h2>
                  <button ref={firstControlRef} type="button" className="feedback-close" aria-label={t("Close")} onClick={() => { setDialog(null); if (dialog.trigger === "manual") onManualClose(); }}>×</button>
                </div>
                <p className="muted-copy">{t("We read every note. If it needs a reply, we will write to the email on your account.")}</p>
                <div className="feedback-dialog-actions">
                  <button type="button" className="button" onClick={() => { setDialog(null); if (dialog.trigger === "manual") onManualClose(); }}>{t("Close")}</button>
                </div>
              </div>
            ) : (
              <form className="feedback-dialog-body" onSubmit={(event) => { event.preventDefault(); void send(); }}>
                <div className="feedback-dialog-head">
                  <h2 id="feedback-dialog-title">{dialog.trigger === "first_success" ? t("How is NivaDesk working for you so far?") : t("Send feedback")}</h2>
                  <button type="button" className="feedback-close" aria-label={t("Close")} onClick={closeDialog} disabled={busy}>×</button>
                </div>
                <p className="muted-copy">{t("Choose an option and send. Add a note if you like.")}</p>

                <fieldset className="feedback-fieldset">
                  <legend>{t("Overall")}</legend>
                  <div className="feedback-choices" role="group" aria-label={t("Overall")}>
                    {(Object.keys(EXPERIENCE_LABELS) as FeedbackExperience[]).map((value, index) => (
                      <button key={value} ref={index === 0 ? firstControlRef : undefined} type="button" className={experience === value ? "feedback-choice is-selected" : "feedback-choice"} aria-pressed={experience === value} onClick={() => setExperience(value)} disabled={busy}>
                        {t(EXPERIENCE_LABELS[value])}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="feedback-fieldset">
                  <legend>{t("What is it about?")} <span className="muted-copy">{t("(optional)")}</span></legend>
                  <div className="feedback-choices" role="group" aria-label={t("What is it about?")}>
                    {(Object.keys(KIND_LABELS) as FeedbackKind[]).map((value) => (
                      <button key={value} type="button" className={kind === value ? "feedback-choice is-selected" : "feedback-choice"} aria-pressed={kind === value} onClick={() => setKind(kind === value ? "" : value)} disabled={busy}>
                        {t(KIND_LABELS[value])}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="feedback-text-label">
                  <span>{t("Tell us more")} <span className="muted-copy">{t("(optional)")}</span></span>
                  <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, FEEDBACK_TEXT_MAX))} rows={4} maxLength={FEEDBACK_TEXT_MAX} disabled={busy} placeholder={t("What happened, or what would help?")} />
                  <span className="muted-copy feedback-count">{remaining < 200 ? `${remaining}` : ""}</span>
                </label>
                <p className="muted-copy feedback-privacy">{t("We send your feedback with your account and workspace details, current page, language and platform. We don't automatically attach customer, order or bank records.")}</p>
                {error ? <p className="layout-error" role="alert">{t(error)}</p> : null}

                <div className="feedback-dialog-actions">
                  <button type="submit" className="button" disabled={!canSend} aria-busy={busy}>{busy ? t("Sending…") : t("Send")}</button>
                  <button type="button" className="button secondary" onClick={closeDialog} disabled={busy}>{dialog.trigger === "first_success" ? t("Not now") : t("Cancel")}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
