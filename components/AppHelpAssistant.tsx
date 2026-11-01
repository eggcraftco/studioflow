"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OPEN_HELP_ASSISTANT_EVENT } from "@/lib/studioflow/gettingStarted";
import { askAppAssistant, getAppAssistantAvailability, type AppAssistantAvailability } from "@/lib/studioflow/appAssistant";
import {
  appHelpHistoryKey,
  appHelpHistoryStorageKey,
  canKeepAppHelpTurns,
  clearAppHelpTurns,
  loadAppHelpTurns,
  newAppHelpTurnId,
  readAppHelpOpen,
  saveAppHelpTurns,
  writeAppHelpOpen,
  type AppHelpTurn
} from "@/lib/studioflow/appHelpHistory";
import { createNivaDeskSupportTicket } from "@/lib/studioflow/supportTickets";
import { type WorkspaceContext } from "@/lib/studioflow/firestore";

// In-app "how do I…?" helper. It answers from the user guide only: it has no
// access to workspace data, and points at the ChatGPT app or at support when a
// question is outside what the guide covers.
//
// It is hidden for everyone whenever the shared OpenAI key is missing — which it
// was from 17 Sep 2026, so the owner saw no helper and no reason. A support admin
// now sees a paused button that says why (offReason, sent to them only).
//
// The conversation is kept in this browser (appHelpHistory.ts, 1 Nov 2026): one
// per account and workspace, so a reload, a sign-in refresh or the next page
// (AppShell is mounted by each page) shows it again, and an open panel opens
// again in the same tab. "New conversation" starts over; sign-out deletes it.
export default function AppHelpAssistant({
  workspace,
  userId,
  language,
  t
}: {
  workspace: WorkspaceContext | null;
  userId: string;
  language: string;
  t: (text: string) => string;
}) {
  const [availability, setAvailability] = useState<AppAssistantAvailability>({});
  const available = availability.available === true;
  const paused = !available && Boolean(availability.offReason);
  // Nothing is drawn before availability arrives, so reading the tab's last
  // state here cannot differ from the server's (empty) render.
  const [open, setOpen] = useState(() => readAppHelpOpen());
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<AppHelpTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);
  // The conversation's name in this browser: null until it is known, or when
  // the account or workspace is not (then nothing is kept).
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const historyKeyRef = useRef<string | null>(null);
  // False in a browser that refuses storage (some private windows): the
  // conversation then stays on screen only, and the panel does not claim it is kept.
  const [keeping, setKeeping] = useState(false);
  const keepingRef = useRef(false);
  const companyId = workspace?.id ?? "";

  useEffect(() => { writeAppHelpOpen(open); }, [open]);

  useEffect(() => {
    let cancelled = false;
    historyKeyRef.current = null;
    keepingRef.current = false;
    setHistoryKey(null);
    setKeeping(false);
    setTurns([]);
    void (async () => {
      const key = await appHelpHistoryKey(userId, companyId);
      if (cancelled) return;
      const canKeep = Boolean(key) && canKeepAppHelpTurns();
      historyKeyRef.current = key;
      keepingRef.current = canKeep;
      setHistoryKey(key);
      setKeeping(canKeep);
      setTurns(key && canKeep ? loadAppHelpTurns(key) : []);
    })();
    return () => { cancelled = true; };
  }, [userId, companyId]);

  // Another tab of the same account asked, or started over: show the same.
  useEffect(() => {
    if (!historyKey || !keeping) return;
    const name = appHelpHistoryStorageKey(historyKey);
    const reload = (event: StorageEvent) => {
      if (event.key === name || event.key === null) setTurns(loadAppHelpTurns(historyKey));
    };
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, [historyKey, keeping]);

  /**
   * Changes the conversation that `forKey` names: the copy in this browser
   * first (another tab may have added to it), then the screen if it still
   * shows that conversation — an answer that arrives after the workspace
   * changed is kept with the conversation it was asked in. One asked before
   * the name was known goes to the conversation shown now.
   */
  const changeTurns = useCallback((forKey: string | null, change: (current: AppHelpTurn[]) => AppHelpTurn[]) => {
    const target = forKey ?? historyKeyRef.current;
    if (target && keepingRef.current) {
      const saved = saveAppHelpTurns(target, change(loadAppHelpTurns(target)));
      if (historyKeyRef.current === target) setTurns(saved);
      return;
    }
    if (historyKeyRef.current === target) setTurns(current => change(current));
  }, []);

  function startNewConversation() {
    const key = historyKeyRef.current;
    if (key) clearAppHelpTurns(key);
    setTurns([]);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getAppAssistantAvailability();
      if (!cancelled) setAvailability(result);
    })();
    return () => { cancelled = true; };
  }, [workspace?.id]);

  /**
   * The question the guide could not answer IS the ticket.
   *
   * This used to be a link to Settings, and ?support= was read by nothing, so
   * it landed on whatever section happened to be first — the person then had to
   * find the support screen, pick a tab, pick a category and type their question
   * again. One press sends it, with the answer the assistant gave attached so
   * support can see what it already tried.
   */
  async function sendToSupport(turn: AppHelpTurn) {
    if (!workspace) return;
    if (turn.ticket === "sending" || turn.ticket === "sent") return;
    const forKey = historyKeyRef.current;
    const mark = (ticket: string) =>
      changeTurns(forKey, current => current.map(item => item.id === turn.id ? { ...item, ticket } : item));
    mark("sending");
    try {
      await createNivaDeskSupportTicket(workspace, {
        title: turn.question.trim().slice(0, 120),
        message: `${turn.question.trim()}\n\n---\n${t("The in-app assistant could not answer this. What it replied:")}\n${turn.answer.answer}`,
        category: "question",
        priority: "normal",
        language
      });
      mark("sent");
    } catch (sendError) {
      mark(sendError instanceof Error ? sendError.message : t("The ticket could not be sent."));
    }
  }

  // The newest turn in view: after an answer, and when the panel opens on a kept conversation.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [turns, busy, open]);

  // Opened from Getting started ▸ "Ask the help assistant a question" (GN-05):
  // by the window event when the button is on the same page, and by
  // ?help=open when the step arrived from another page (the Dashboard card,
  // Settings ▸ Getting started). The parameter is taken off the address once
  // read, so Back or a reload does not keep reopening the panel.
  const pathname = usePathname();
  useEffect(() => {
    const openNow = () => setOpen(true);
    window.addEventListener(OPEN_HELP_ASSISTANT_EVENT, openNow);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("help") === "open") {
        url.searchParams.delete("help");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        setOpen(true);
      }
    } catch { /* an address we cannot read opens nothing */ }
    return () => window.removeEventListener(OPEN_HELP_ASSISTANT_EVENT, openNow);
  }, [pathname]);

  if (!available && !paused) return null;

  if (paused) {
    return (
      <>
        <button type="button" className="app-help-bubble is-paused" onClick={() => setOpen(value => !value)} aria-expanded={open}
                aria-label={t("Help assistant off")}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M8 7.5v5M12 7.5v5" />
          </svg>
          <span>{t("Help assistant off")}</span>
        </button>
        {open ? (
          <div className="app-help-panel" role="dialog" aria-label={t("Help assistant off")}>
            <div className="app-help-head">
              <div>
                <strong>{t("Help assistant off")}</strong>
                <span>{t("Only NivaDesk support admins see this.")}</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Close")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="app-help-thread">
              <p className="app-help-intro">{t("The OpenAI key both NivaDesk assistants use is missing, so members do not see this helper and the website chat cannot answer. Save the key again in Settings ▸ AI Reply Settings ▸ OpenAI API Key on the workspace that runs the assistants.")}</p>
              <p className="app-help-sources">{t("Reason")}: {availability.offReason}</p>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    const forKey = historyKeyRef.current;
    try {
      const answer = await askAppAssistant({ question: text, language, companyId: workspace?.id ?? "" });
      const turn: AppHelpTurn = { id: newAppHelpTurnId(), askedAt: Date.now(), question: text, answer: { ...answer, answer: answer.answer ?? "" }, ticket: "" };
      changeTurns(forKey, current => [...current, turn]);
      setQuestion("");
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : String(askError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="app-help-bubble"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={t("How do I…?")}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M7.8 7.6a2.3 2.3 0 1 1 2.9 2.6c-.5.2-.8.6-.8 1.1v.4M10 14.4v.1" />
        </svg>
        <span>{t("How do I…?")}</span>
      </button>

      {open ? (
        <div className="app-help-panel" role="dialog" aria-label={t("How do I…?")}>
          <div className="app-help-head">
            <div>
              <strong>{t("NivaDesk help")}</strong>
              <span>{t("Answers from the user guide.")}</span>
              {turns.length && keeping ? (
                <span className="app-help-kept">{t("This conversation is kept on this device for 7 days.")}</span>
              ) : null}
            </div>
            <div className="app-help-head-actions">
              {turns.length ? (
                <button type="button" className="app-help-new" onClick={startNewConversation} disabled={busy}
                        data-testid="app-help-new-conversation">
                  {t("New conversation")}
                </button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Close")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="app-help-thread" ref={threadRef}>
            {turns.length === 0 ? (
              <p className="app-help-intro">{t("Ask how something in NivaDesk works — where a button lives, what a card is for, how to set something up. This assistant reads the guide, not your workspace, so it never sees your orders or figures.")}</p>
            ) : null}
            {turns.map(turn => (
              <div className="app-help-turn" key={turn.id}>
                <p className="app-help-question">{turn.question}</p>
                <div className="app-help-answer">
                  <p>{turn.answer.answer}</p>
                  {turn.answer.sources?.length ? (
                    <p className="app-help-sources">
                      {t("Guide")}: {turn.answer.sources.map(source => source.path).join(" · ")}
                    </p>
                  ) : null}
                  {turn.answer.needsChatGPT ? (
                    <Link className="app-help-action" href="/chatgpt" target="_blank">
                      {t("Ask the ChatGPT app about your own data")} →
                    </Link>
                  ) : null}
                  {turn.answer.needsSupport ? (
                    turn.ticket === "sent" ? (
                      <p className="app-help-sent">
                        {t("Sent to NivaDesk Support.")}{" "}
                        <Link href="/settings?section=support-tickets&support=appSupport" onClick={() => setOpen(false)}>
                          {t("See your tickets")} →
                        </Link>
                      </p>
                    ) : (
                      <>
                        <button type="button" className="app-help-action" disabled={!workspace || turn.ticket === "sending"}
                                onClick={() => void sendToSupport(turn)}>
                          {turn.ticket === "sending" ? t("Sending...") : t("Send this to NivaDesk Support")} →
                        </button>
                        {typeof turn.ticket === "string" && turn.ticket !== "sending" ? (
                          <p className="app-help-error">{turn.ticket}</p>
                        ) : null}
                      </>
                    )
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? <p className="app-help-intro">{t("Looking it up…")}</p> : null}
          </div>

          <form className="app-help-form" onSubmit={submit}>
            <textarea
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={t("How do I add a material to an order?")}
              rows={2}
              maxLength={1000}
              required
            />
            {error ? <p className="app-help-error">{t(error)}</p> : null}
            <button type="submit" className="button" disabled={busy}>
              {busy ? t("Asking...") : t("Ask")}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
