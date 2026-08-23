"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { askAppAssistant, getAppAssistantAvailability, type AppAssistantAnswer } from "@/lib/studioflow/appAssistant";
import { type WorkspaceContext } from "@/lib/studioflow/firestore";

type HelpTurn = { question: string; answer: AppAssistantAnswer };

// In-app "how do I…?" helper. It answers from the user guide only: it has no
// access to workspace data, and points at the ChatGPT app or at support when a
// question is outside what the guide covers.
export default function AppHelpAssistant({
  workspace,
  language,
  t
}: {
  workspace: WorkspaceContext | null;
  language: string;
  t: (text: string) => string;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<HelpTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getAppAssistantAvailability();
      if (!cancelled) setAvailable(Boolean(result.available));
    })();
    return () => { cancelled = true; };
  }, [workspace?.id]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [turns, busy]);

  if (!available) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const answer = await askAppAssistant({ question: text, language, companyId: workspace?.id ?? "" });
      setTurns(current => [...current, { question: text, answer }]);
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
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("Close")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="app-help-thread" ref={threadRef}>
            {turns.length === 0 ? (
              <p className="app-help-intro">{t("Ask how something in NivaDesk works — where a button lives, what a card is for, how to set something up. This assistant reads the guide, not your workspace, so it never sees your orders or figures.")}</p>
            ) : null}
            {turns.map((turn, index) => (
              <div className="app-help-turn" key={`${index}-${turn.question}`}>
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
                    <Link className="app-help-action" href="/settings?support=appSupport">
                      {t("Send this to NivaDesk Support")} →
                    </Link>
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
            {error ? <p className="app-help-error">{error}</p> : null}
            <button type="submit" className="button" disabled={busy}>
              {busy ? t("Asking...") : t("Ask")}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
