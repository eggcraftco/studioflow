"use client";

import { useCallback, useEffect, useState } from "react";
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

function formatDay(ms: number) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function ChatGPTIntegrationSection({
  workspace, language = "English"
}: {
  workspace: WorkspaceContext;
  language?: string;
}) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [connections, setConnections] = useState<ChatGPTConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!workspace.id) return;
    const signals = await loadIntegrationSignals(workspace.id);
    setConnections(signals.chatgptConnections);
    setLoaded(true);
  }, [workspace.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const disconnect = useCallback(async (tokenHash: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(t(await revokeChatGPTConnection(workspace.id, tokenHash)));
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("ChatGPT could not be disconnected."));
    } finally {
      setBusy(false);
    }
  }, [workspace.id, refresh, t]);

  return (
    <section className="card" style={{ padding: 22 }}>
      <div className="pill">{t("ChatGPT")}</div>
      <h2 style={{ margin: "12px 0 6px" }}>{t("ChatGPT access to this workspace")}</h2>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        {t("Connecting is done from ChatGPT. Each connection lasts 30 days, and ending one here takes effect immediately.")}
      </p>

      {message ? <p className="layout-message" style={{ margin: "0 0 12px" }}>{message}</p> : null}
      {error ? <p className="layout-error" style={{ margin: "0 0 12px" }}>{error}</p> : null}

      {!loaded ? (
        <p style={{ color: "var(--muted)" }}>{t("Loading...")}</p>
      ) : connections.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {t("No ChatGPT connection. Nothing outside NivaDesk can read this workspace.")}
        </p>
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          {connections.map(connection => (
            <article
              key={connection.tokenHash}
              className="card"
              style={{ padding: 14, background: "rgba(255,255,255,0.58)", boxShadow: "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
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
                    if (!window.confirm(t("End ChatGPT's access to this workspace?"))) return;
                    void disconnect(connection.tokenHash);
                  }}
                >
                  {t("Disconnect")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
