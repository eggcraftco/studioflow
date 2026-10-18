"use client";

import { useCallback, useEffect, useState } from "react";
import { chatGPTConnectionAssistant } from "@/lib/chatgpt/claudeMcp";
import {
  loadIntegrationSignals,
  revokeChatGPTConnection,
  type ChatGPTConnection
} from "@/lib/studioflow/integrations";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { studioT } from "@/lib/studioflow/language";

// The ChatGPT connection, and the way to end it.
//
// The grant lives in a top-level collection no client may read, which is right
// — but it meant a workspace that had connected ChatGPT was shown nothing at
// all, anywhere, and nothing in the product could withdraw the access. A token
// lasts thirty days. This screen is the whole of that: what exists, who granted
// it, when it lapses, and a button that ends it now.

// One screen per assistant (owner, 18 Oct 2026): the ChatGPT card lists ChatGPT
// grants, the Claude card lists Claude and Claude Code grants (the Claude endpoint
// shares the grant store). Strings stay the translated ChatGPT ones; only the brand
// word, which no language translates, is swapped — so no new translation keys.
function brand(text: string, name: string) {
  return name === "ChatGPT" ? text : text.split("ChatGPT").join(name);
}

function formatDay(ms: number) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function ChatGPTIntegrationSection({
  workspace, language = "English", assistant = "chatgpt"
}: {
  workspace: WorkspaceContext;
  language?: string;
  /** Which assistant's connections this card shows; a grant without one is ChatGPT's. */
  assistant?: "chatgpt" | "claude";
}) {
  const name = assistant === "claude" ? "Claude" : "ChatGPT";
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [connections, setConnections] = useState<ChatGPTConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!workspace.id) return;
    const signals = await loadIntegrationSignals(workspace.id);
    setConnections(signals.chatgptConnections.filter(row => (row.assistant === "claude" ? "claude" : "chatgpt") === assistant));
    setLoaded(true);
  }, [workspace.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // "Disconnect all" on this card ends this assistant's connections only, one by one:
  // the server's revoke-all would also end the other assistant's.
  const disconnect = useCallback(async (target: { connectionId?: string; tokenHash?: string } | "all", label: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (target === "all") {
        let result = "";
        for (const row of connections) result = await revokeChatGPTConnection(workspace.id, { connectionId: row.connectionId, tokenHash: row.tokenHash });
        setMessage(brand(t(result), label));
      } else {
        setMessage(brand(t(await revokeChatGPTConnection(workspace.id, target)), label));
      }
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : brand(t("ChatGPT could not be disconnected."), label));
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [workspace.id, connections, refresh, t]);

  return (
    <section className="card" style={{ padding: 22 }}>
      <div className="pill">{name}</div>
      <h2 style={{ margin: "12px 0 6px" }}>{name}</h2>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        {assistant === "claude"
          ? t("Connecting is done from Claude or Claude Code. Each connection is listed here, and ending one takes effect immediately.")
          : t("Connecting is done from ChatGPT. Each connection is listed here, and ending one takes effect immediately.")}
      </p>

      {message ? <p className="layout-message" style={{ margin: "0 0 12px" }}>{message}</p> : null}
      {error ? <p className="layout-error" style={{ margin: "0 0 12px" }}>{error}</p> : null}

      {!loaded ? (
        <p style={{ color: "var(--muted)" }}>{t("Loading...")}</p>
      ) : connections.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {brand(t("No ChatGPT connection."), name)}
        </p>
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          {connections.map(connection => (
            <article
              key={connection.connectionId || connection.tokenHash}
              className="card"
              style={{ padding: 14, background: "rgba(255,255,255,0.58)", boxShadow: "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <span className="pill" style={{ marginRight: 8 }}>{chatGPTConnectionAssistant(connection)}</span>
                  <strong>{connection.grantedByEmail || t("A workspace member")}</strong>
                  <p style={{ color: "var(--muted)", margin: "6px 0 0", fontSize: 13 }}>
                    {t("Connected")} {formatDay(connection.createdAtMs)} · {t("ends")} {formatDay(connection.expiresAtMs)}
                  </p>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const label = chatGPTConnectionAssistant(connection);
                    if (!window.confirm(brand(t("End ChatGPT's access to this workspace?"), label))) return;
                    void disconnect({ connectionId: connection.connectionId, tokenHash: connection.tokenHash }, label);
                  }}
                >
                  {t("Disconnect")}
                </button>
              </div>
            </article>
          ))}
          {connections.length > 1 ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(brand(t("End every ChatGPT connection to this workspace? ChatGPT will need to connect again."), name))) return;
                  void disconnect("all", name);
                }}
              >
                {t("Disconnect all")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
