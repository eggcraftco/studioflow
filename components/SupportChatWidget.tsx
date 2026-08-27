"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  loadWebsiteChatThread,
  readWebsiteChatSession,
  requestWebsiteChatHuman,
  sendWebsiteChatMessage,
  startWebsiteChat,
  writeWebsiteChatSession,
  type WebsiteChatMessage,
  type WebsiteChatSession
} from "@/lib/publicSite/websiteChat";

// "Ask NivaDesk": the window opens straight into conversation — no form. The
// AI answers first; when it is not sure it says so and OFFERS the team instead
// of bluffing. After the visible hand-off the assistant goes quiet and a
// person answers in the SAME thread. Who is talking is always visible: sparkle
// avatar for the machine, a named initial for the person.
export default function SupportChatWidget() {
  const { t, language } = usePublicSiteLanguage();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<WebsiteChatSession | null>(null);
  const [messages, setMessages] = useState<WebsiteChatMessage[]>([]);
  const [needsHuman, setNeedsHuman] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [signedInUser, setSignedInUser] = useState<User | null>(null);
  const [company, setCompany] = useState(""); // honeypot: humans never see it
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The Send-to-team offer the visitor waved away with "Keep chatting".
  const [dismissedOfferId, setDismissedOfferId] = useState("");
  // Set while the handoff needs an address from an anonymous visitor.
  const [emailPromptOpen, setEmailPromptOpen] = useState(false);
  const [handoffEmail, setHandoffEmail] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSession(readWebsiteChatSession());
  }, []);

  useEffect(() => onAuthStateChanged(auth, user => setSignedInUser(user)), []);

  const refresh = useCallback(async (current: WebsiteChatSession) => {
    try {
      const thread = await loadWebsiteChatThread(current);
      setMessages(thread.messages ?? []);
      setNeedsHuman(thread.needsHuman === true);
      setHasEmail(thread.hasEmail === true);
    } catch {
      // A thread that can no longer be opened just resets to a fresh chat.
      writeWebsiteChatSession(null);
      setSession(null);
      setMessages([]);
      setNeedsHuman(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !session) return;
    void refresh(session);
    const timer = window.setInterval(() => void refresh(session), 20000);
    return () => window.clearInterval(timer);
  }, [open, session, refresh]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, open, emailPromptOpen]);

  const sendText = useCallback(async (text: string): Promise<WebsiteChatSession | null> => {
    const trimmed = text.trim();
    if (!trimmed || busy) return session;
    setBusy(true);
    setError("");
    try {
      if (session) {
        await sendWebsiteChatMessage(session, trimmed);
        await refresh(session);
        return session;
      }
      const created = await startWebsiteChat({
        message: trimmed,
        page: typeof window === "undefined" ? "" : window.location.pathname,
        language,
        company
      });
      writeWebsiteChatSession(created);
      setSession(created);
      await refresh(created);
      return created;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
      return session;
    } finally {
      setBusy(false);
    }
  }, [busy, session, language, company, refresh]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft;
    setDraft("");
    const result = await sendText(text);
    if (!result && text.trim()) setDraft(text);
  };

  // "Send to team" — from the unsure-offer, the chip, or the standing link.
  // A signed-in user is never asked for an address (we already know them);
  // an anonymous visitor without one gets a single optional email field.
  const handToTeam = useCallback(async (current: WebsiteChatSession | null, email?: string) => {
    if (!current) return;
    if (!signedInUser && !hasEmail && email === undefined) {
      setEmailPromptOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestWebsiteChatHuman(current, email && email.trim() ? email.trim() : undefined);
      setEmailPromptOpen(false);
      setHandoffEmail("");
      await refresh(current);
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : String(handoffError));
    } finally {
      setBusy(false);
    }
  }, [signedInUser, hasEmail, refresh]);

  const startFromChip = async (chip: "plans" | "features" | "migrating" | "team") => {
    if (chip === "team") {
      const current = await sendText(t("chatWidget.chipTeam"));
      await handToTeam(current);
      return;
    }
    const text = chip === "plans"
      ? t("chatWidget.chipPlans")
      : chip === "features" ? t("chatWidget.chipFeatures") : t("chatWidget.chipMigrating");
    await sendText(text);
  };

  // The offer belongs under the LAST bubble, and only while the assistant is
  // still the one talking.
  const offerMessageId = useMemo(() => {
    if (needsHuman || messages.length === 0) return "";
    const last = messages[messages.length - 1];
    if (!last.fromAssistant || last.assistantConfident !== false) return "";
    return last.id === dismissedOfferId ? "" : last.id;
  }, [messages, needsHuman, dismissedOfferId]);

  const timeLabel = (millis: number) => {
    if (!millis) return "";
    try {
      return new Date(millis).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const showChips = !session && messages.length === 0;

  return (
    <>
      <button
        type="button"
        className="support-chat-bubble"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={t("chatWidget.open")}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h12v8H9l-4 3v-3H4z" />
        </svg>
        <span>{t("chatWidget.open")}</span>
      </button>

      {open ? (
        <div className="support-chat-panel" role="dialog" aria-label={t("chatWidget.title")}>
          <div className="support-chat-head">
            <div>
              <strong>{t("chatWidget.title")}</strong>
              <span>{t("chatWidget.subtitle")}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("chatWidget.close")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="support-chat-thread" ref={threadRef}>
            {/* The greeting is the front door — a conversation, not a form. */}
            <div className="support-chat-row">
              <span className="support-chat-avatar is-ai" aria-hidden="true">✦</span>
              <div className="support-chat-msg is-assistant">
                <p>{t("chatWidget.greeting")}</p>
              </div>
            </div>

            {showChips ? (
              <div className="support-chat-chips">
                <button type="button" disabled={busy} onClick={() => void startFromChip("plans")}>💳 {t("chatWidget.chipPlans")}</button>
                <button type="button" disabled={busy} onClick={() => void startFromChip("features")}>✨ {t("chatWidget.chipFeatures")}</button>
                <button type="button" disabled={busy} onClick={() => void startFromChip("migrating")}>🔄 {t("chatWidget.chipMigrating")}</button>
                <button type="button" disabled={busy} onClick={() => void startFromChip("team")}>👥 {t("chatWidget.chipTeam")}</button>
              </div>
            ) : null}

            {messages.map(item => {
              if (item.fromSystem) {
                return item.kind === "handoff" ? (
                  <div className="support-chat-divider" key={item.id}>
                    <span>👥 {t("chatWidget.handedToTeam")}</span>
                  </div>
                ) : null;
              }
              if (item.fromVisitor) {
                return (
                  <div className="support-chat-row is-visitor" key={item.id}>
                    <div className="support-chat-msg is-visitor">
                      <p>{item.message}</p>
                      <em className="support-chat-meta">
                        {t("chatWidget.you")} · {timeLabel(item.createdAtMillis)} <span aria-hidden="true">✓✓</span>
                      </em>
                    </div>
                  </div>
                );
              }
              const isOfferBubble = item.id === offerMessageId;
              return (
                <div className="support-chat-row" key={item.id}>
                  {item.fromAssistant ? (
                    <span className="support-chat-avatar is-ai" aria-hidden="true">✦</span>
                  ) : (
                    <span className="support-chat-avatar is-human" aria-hidden="true">
                      {String(item.authorName || "N").slice(0, 1)}
                      <i className="support-chat-presence" />
                    </span>
                  )}
                  <div className={`support-chat-msg${item.fromAssistant ? " is-assistant" : " is-human"}`}>
                    <p>{item.message}</p>
                    <em className="support-chat-meta">
                      {item.fromAssistant ? t("chatWidget.assistantName") : item.authorName} · {timeLabel(item.createdAtMillis)}
                    </em>
                    {isOfferBubble ? (
                      <div className="support-chat-offer">
                        {emailPromptOpen ? (
                          <div className="support-chat-offer-email">
                            <input
                              type="email"
                              value={handoffEmail}
                              onChange={event => setHandoffEmail(event.target.value)}
                              placeholder={t("chatWidget.emailPrompt")}
                              maxLength={240}
                            />
                            <button type="button" className="support-chat-offer-primary" disabled={busy} onClick={() => void handToTeam(session, handoffEmail)}>
                              ✉ {t("chatWidget.sendToTeam")}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button type="button" className="support-chat-offer-primary" disabled={busy} onClick={() => void handToTeam(session)}>
                              ✉ {t("chatWidget.sendToTeam")}
                            </button>
                            <button type="button" className="support-chat-offer-secondary" disabled={busy} onClick={() => setDismissedOfferId(item.id)}>
                              💬 {t("chatWidget.keepChatting")}
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {session && messages.length > 0 && !needsHuman && !offerMessageId ? (
            <button type="button" className="support-chat-person-link" disabled={busy} onClick={() => void handToTeam(session)}>
              {t("chatWidget.talkToPerson")}
            </button>
          ) : null}

          <form className="support-chat-form" onSubmit={submit}>
            <input
              type="text"
              className="support-chat-hp"
              value={company}
              onChange={event => setCompany(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            {error ? <p className="support-chat-error">{error}</p> : null}
            <div className="support-chat-input-row">
              <input
                type="text"
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder={t("chatWidget.messagePlaceholder")}
                maxLength={4000}
                aria-label={t("chatWidget.messagePlaceholder")}
              />
              <button type="submit" className="support-chat-send" disabled={busy || !draft.trim()} aria-label={t("chatWidget.send")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
            <p className="support-chat-privacy">
              <span aria-hidden="true">🔒</span> {t("chatWidget.secureNote")} · <Link href="/privacy">{t("chatWidget.privacyLink")}</Link>
            </p>
          </form>
        </div>
      ) : null}
    </>
  );
}
