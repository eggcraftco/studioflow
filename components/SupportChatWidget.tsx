"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  loadWebsiteChatThread,
  readWebsiteChatSession,
  sendWebsiteChatMessage,
  startWebsiteChat,
  writeWebsiteChatSession,
  type WebsiteChatMessage,
  type WebsiteChatSession
} from "@/lib/publicSite/websiteChat";

// Floating "Any questions?" bubble on the public site. Phase 1: the visitor
// writes to the team and the thread comes back to them here and by email.
export default function SupportChatWidget() {
  const { t, language } = usePublicSiteLanguage();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<WebsiteChatSession | null>(null);
  const [messages, setMessages] = useState<WebsiteChatMessage[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot: humans never see it
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSession(readWebsiteChatSession());
  }, []);

  const refresh = useCallback(async (current: WebsiteChatSession) => {
    try {
      const thread = await loadWebsiteChatThread(current);
      setMessages(thread.messages ?? []);
    } catch {
      // A thread that can no longer be opened just resets to a fresh form.
      writeWebsiteChatSession(null);
      setSession(null);
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
  }, [messages, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const text = draft.trim();
    if (!text) return;

    setBusy(true);
    setError("");
    try {
      if (session) {
        await sendWebsiteChatMessage(session, text);
        setDraft("");
        await refresh(session);
      } else {
        const created = await startWebsiteChat({
          name: name.trim(),
          email: email.trim(),
          message: text,
          page: typeof window === "undefined" ? "" : window.location.pathname,
          language,
          company
        });
        writeWebsiteChatSession(created);
        setSession(created);
        setDraft("");
        setSent(true);
        await refresh(created);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  };

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
            {messages.length === 0 ? (
              <p className="support-chat-intro">{t("chatWidget.intro")}</p>
            ) : (
              messages.map(item => (
                <div className={item.fromVisitor ? "support-chat-msg is-visitor" : "support-chat-msg"} key={item.id}>
                  <span>{item.authorName}</span>
                  <p>{item.message}</p>
                </div>
              ))
            )}
            {sent && messages.length > 0 ? <p className="support-chat-note">{t("chatWidget.sentNote")}</p> : null}
          </div>

          <form className="support-chat-form" onSubmit={submit}>
            {!session ? (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder={t("chatWidget.namePlaceholder")}
                  autoComplete="name"
                  maxLength={120}
                />
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder={t("chatWidget.emailPlaceholder")}
                  autoComplete="email"
                  required
                  maxLength={240}
                />
                <input
                  type="text"
                  className="support-chat-hp"
                  value={company}
                  onChange={event => setCompany(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />
              </>
            ) : null}
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder={t("chatWidget.messagePlaceholder")}
              rows={session ? 2 : 3}
              required
              maxLength={4000}
            />
            {error ? <p className="support-chat-error">{error}</p> : null}
            <button type="submit" className="public-button" disabled={busy}>
              {busy ? t("chatWidget.sending") : t("chatWidget.send")}
            </button>
            <p className="support-chat-privacy">{t("chatWidget.privacy")}</p>
          </form>
        </div>
      ) : null}
    </>
  );
}
