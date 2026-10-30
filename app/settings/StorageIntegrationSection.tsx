"use client";

// "Cloud storage": where this workspace keeps its order files — NivaDesk Cloud
// (the default) or the owner's own Google Drive, OneDrive, Dropbox or Box. The
// server contract is functions/files/storageConnect.js (own-cloud CONTRACT).
//
// Rules this card keeps, learned on the eBay, Amazon and Stripe cards:
//
//   the card's state is the server's answer, never a local "I pressed Connect"
//   flag, so a reload cannot show a connection nobody has;
//
//   a provider the server says it cannot connect yet shows "Not available yet"
//   and no button — never a consent page for an application that does not exist;
//
//   an answer never crosses a workspace switch: every fetch is stamped with the
//   workspace it was asked for and a sequence number, and a late answer for the
//   previous workspace is dropped rather than rendered;
//
//   disconnecting says what it does and what it does not: new files go back to
//   NivaDesk Cloud, the files already in the provider stay there, and the grant
//   in the person's own account is theirs to remove.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import {
  MANAGED_STORAGE, STORAGE_PROVIDER_IDS,
  beginStorageConnect, disconnectStorage, getStorageStatus, isStorageProviderId, liveStorageConnection,
  storageConnectionNeedingReconnect, storageProviderLabel, storageReasonText,
  type StorageConnectionRow, type StorageProviderId, type StorageStatusResult
} from "@/lib/studioflow/storage";

/**
 * What the callback page put in the address bar, as a sentence. The outcome is a
 * word rather than a message because the card re-reads the connection from the
 * server anyway: the sentence says what happened, the rows say what is true now.
 */
const RETURN_COPY: Readonly<Record<string, string>> = Object.freeze({
  connected: "{provider} connected. New files are saved there.",
  cancelled: "The connection was cancelled. Nothing changed.",
  signin: "Please sign in again, then connect {provider} once more.",
  error: "The connection did not complete. Please try again.",
});

// One row per storage: the name (and account / problem) on the left, the state
// and the action on the right, wrapping under each other on a phone.
const ROW_STYLE: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
  gap: 10, padding: "12px 0", borderTop: "1px solid rgba(127, 127, 127, 0.18)"
};
const ACTIONS_STYLE: React.CSSProperties = {
  display: "inline-flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end"
};

type Props = {
  workspace: WorkspaceContext;
  language?: string;
  /** The tile the person came from, if any: that provider's row is highlighted. */
  focus?: string;
};

function statusLabel(status: string, t: (s: string) => string): string {
  switch (status) {
    case "connected": return t("Connected");
    case "limited": return t("Connected with limits");
    case "reauth_required": return t("Reconnect required");
    case "error": return t("Needs attention");
    default: return t("Not connected");
  }
}

/** Read once at mount: `?storage=<outcome>&provider=<id>` (and the older `?gdrive=<outcome>`). */
function readReturn(): { outcome: string; provider: string } {
  if (typeof window === "undefined") return { outcome: "", provider: "" };
  const params = new URLSearchParams(window.location.search);
  const legacy = (params.get("gdrive") || "").trim();
  const outcome = (params.get("storage") || "").trim() || legacy;
  const provider = (params.get("provider") || "").trim() || (legacy ? "gdrive" : "");
  return { outcome, provider: isStorageProviderId(provider) ? provider : "" };
}

export function StorageIntegrationSection({ workspace, language = "English", focus = "" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();

  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState<StorageStatusResult | null>(null);
  const [busy, setBusy] = useState("");
  const [errorText, setErrorText] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState("");

  const asked = useRef({ companyId: "", seq: 0 });

  const load = useCallback(async () => {
    if (!companyId) return;
    const seq = asked.current.seq + 1;
    asked.current = { companyId, seq };
    setLoading(true);
    try {
      const result = await getStorageStatus(companyId);
      if (asked.current.companyId !== companyId || asked.current.seq !== seq) return;
      setAnswer(result);
      setErrorText("");
    } catch (failure) {
      if (asked.current.companyId !== companyId || asked.current.seq !== seq) return;
      setAnswer(null);
      setErrorText((failure as Error)?.message || "Could not load cloud storage.");
    } finally {
      if (asked.current.companyId === companyId && asked.current.seq === seq) setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setAnswer(null);
    setNotice("");
    setConfirming("");
    void load();
  }, [load]);

  // The consent return, read ONCE in a useState initialiser so no later
  // re-render (the language resolving, the workspace loading) can take the
  // sentence away again — the drive-night lesson.
  const [returned] = useState(readReturn);

  // Then taken out of the address bar, so a refresh does not re-announce it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("storage") && !params.get("gdrive")) return;
    params.delete("storage");
    params.delete("gdrive");
    params.delete("provider");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, []);

  const run = (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setErrorText("");
    setNotice("");
    action()
      .catch((failure) => setErrorText((failure as Error)?.message || "Could not load cloud storage."))
      .finally(() => setBusy(""));
  };

  const connect = (provider: StorageProviderId) => run(`connect:${provider}`, async () => {
    const consent = await beginStorageConnect(companyId, provider);
    if (!consent.consentUrl) throw new Error("Could not start the connection.");
    // The provider's own consent page, in this browser. Never an embedded view.
    window.location.assign(consent.consentUrl);
  });

  const disconnect = (row: StorageConnectionRow) => run(`disconnect:${row.provider}`, async () => {
    await disconnectStorage(companyId, row.connectionId);
    setConfirming("");
    setNotice(t("Disconnected. NivaDesk deleted the access it stored. To remove NivaDesk from your {provider} account too, do it in that account's settings.")
      .replace("{provider}", storageProviderLabel(row.provider)));
    await load();
  });

  const primary = answer?.primary.provider || MANAGED_STORAGE;
  const offers = new Map((answer?.providers || []).map((offer) => [offer.id, offer]));
  const returnLabel = storageProviderLabel(returned.provider || "gdrive");

  return (
    <section className="settings-card" data-storage-card>
      <CardTitle icon="storage" title={t("Cloud storage")} />

      {returned.outcome ? (
        returned.outcome === "connected"
          ? <p className="success-copy" role="status">{t(RETURN_COPY.connected).replace("{provider}", returnLabel)}</p>
          : <p className="layout-error" role="alert">{t(RETURN_COPY[returned.outcome] || RETURN_COPY.error).replace("{provider}", returnLabel)}</p>
      ) : null}
      {errorText ? <p className="layout-error" role="alert">{t(errorText)}</p> : null}
      {notice ? <p className="success-copy" role="status">{notice}</p> : null}
      {loading ? <p className="muted-copy">{t("Loading…")}</p> : null}

      {!loading && answer ? (
        <>
          <p className="muted-copy" data-storage-primary={primary}>
            {t("New files are saved to: {provider}").replace("{provider}", storageProviderLabel(primary))}
          </p>
          <ul style={{ listStyle: "none", margin: "4px 0 12px", padding: 0 }}>
            <li data-storage-row="managed" style={ROW_STYLE}>
              <span>
                <strong>{storageProviderLabel(MANAGED_STORAGE)}</strong>
                <br />
                <span className="muted-copy">{t("Kept by NivaDesk. Nothing to set up.")}</span>
              </span>
              <span className={`studio-pill${primary === MANAGED_STORAGE ? " success" : ""}`}>
                {primary === MANAGED_STORAGE ? t("In use") : t("Default")}
              </span>
            </li>
            {STORAGE_PROVIDER_IDS.map((provider) => {
              const label = storageProviderLabel(provider);
              const offer = offers.get(provider);
              const live = liveStorageConnection(answer.connections, provider);
              const stale = storageConnectionNeedingReconnect(answer.connections, provider);
              const row = live || stale;
              const available = offer?.available === true;
              const highlighted = focus === provider;
              const working = busy.endsWith(`:${provider}`);
              return (
                <li key={provider} data-storage-row={provider} className={highlighted ? "is-highlighted" : undefined}
                  style={{ ...ROW_STYLE, ...(highlighted ? { outline: "2px solid var(--accent, #2563eb)", outlineOffset: 2, borderRadius: 8, paddingInline: 8 } : {}) }}>
                  <span>
                    <strong>{label}</strong>
                    {row?.displayAccountHint ? <><br /><span className="muted-copy">{row.displayAccountHint}</span></> : null}
                    {live && live.status === "limited" ? (
                      <><br /><span className="layout-error">{t("Some permissions were not granted, so uploads may fail. Reconnect to grant them.")}</span></>
                    ) : null}
                    {stale ? (
                      <><br /><span className="layout-error">{t("{provider} ended NivaDesk's access. Reconnect to keep using it.").replace("{provider}", label)}</span></>
                    ) : null}
                  </span>
                  <span style={ACTIONS_STYLE}>
                    <span className={`studio-pill${live ? " success" : ""}`} data-storage-state={row ? row.status : available ? "available" : "unavailable"}>
                      {row ? (live && primary === provider ? t("In use") : statusLabel(row.status, t)) : available ? t("Not connected") : t("Not available yet")}
                    </span>
                    {live && answer.canDisconnect && confirming !== provider ? (
                      <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setConfirming(provider)}>
                        {t("Disconnect")}
                      </button>
                    ) : null}
                    {!live && available && answer.canConnect ? (
                      <button type="button" className="button" disabled={Boolean(busy)} onClick={() => connect(provider)}>
                        {working ? t("Opening…") : stale ? t("Reconnect") : t("Connect")}
                      </button>
                    ) : null}
                  </span>
                  {live && confirming === provider ? (
                    <div style={{ flexBasis: "100%", display: "grid", gap: 8 }} data-storage-confirm={provider}>
                      <p className="muted-copy" style={{ margin: 0 }}>
                        {t("New files will be saved to NivaDesk Cloud. Files already in {provider} stay there.").replace("{provider}", label)}
                      </p>
                      <p className="muted-copy" style={{ margin: 0 }}>
                        {t("NivaDesk deletes the access it stored. It stays listed in your {provider} account's connected apps until you remove it there.").replace("{provider}", label)}
                      </p>
                      <div className="settings-action-row">
                        <button type="button" className="button" disabled={working} onClick={() => disconnect(live)}>
                          {working ? t("Disconnecting…") : t("Disconnect")}
                        </button>
                        <button type="button" className="button secondary" onClick={() => setConfirming("")}>
                          {t("Keep connected")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!answer.canConnect ? <p className="muted-copy">{storageReasonText(answer.reason, t)}</p> : null}
          <p className="muted-copy">
            {t("Your own cloud keeps the files themselves. NivaDesk keeps each file's name, size and which order it belongs to, and opens it for people who may see that order.")}
          </p>
          <p className="muted-copy">
            {t("NivaDesk only sees the files it saves there. It never browses the rest of your storage.")}
          </p>
        </>
      ) : null}
    </section>
  );
}
