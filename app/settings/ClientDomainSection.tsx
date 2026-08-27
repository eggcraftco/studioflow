"use client";

// Settings → Customer Portal Domain.
//
// Two levels, per the domain-link plan: every workspace claims a subdomain
// (eggcraft → eggcraft.nivadesk.app); Pro and Team can connect their own
// hostname (track.eggcraft.co.uk) with one CNAME. A customer who taps
// track.eggcraft.co.uk/r/… sees the workspace's own brand in the address bar —
// not somebody else's software.

import { useCallback, useEffect, useState } from "react";
import {
  getClientDomainConfig,
  removeClientDomain,
  requestClientDomain,
  setClientSubdomain,
  verifyClientDomain,
  type ClientDomainRow
} from "@/lib/studioflow/clientDomain";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

export function ClientDomainSection({
  workspace,
  language
}: {
  workspace: WorkspaceContext;
  language: string;
}) {
  const t = (text: string) => studioT(text, language);
  const isOwner = workspace.role === "owner";

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [subdomain, setSubdomain] = useState<ClientDomainRow | null>(null);
  const [customDomains, setCustomDomains] = useState<ClientDomainRow[]>([]);
  const [cnameTarget, setCnameTarget] = useState("customers.nivadesk.app");
  const [slugDraft, setSlugDraft] = useState("");
  const [hostDraft, setHostDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ host: string; verified: boolean; found: string[]; error?: string } | null>(null);

  const reload = useCallback(async () => {
    if (!isOwner) { setLoadingConfig(false); return; }
    setLoadingConfig(true);
    try {
      const config = await getClientDomainConfig(workspace);
      setSubdomain(config.subdomain ?? null);
      setCustomDomains(config.customDomains ?? []);
      if (config.cnameTarget) setCnameTarget(config.cnameTarget);
      setSlugDraft(config.subdomain?.host ?? "");
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The domain settings could not be loaded."));
    } finally {
      setLoadingConfig(false);
    }
  }, [workspace, isOwner]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>, doneText: string) {
    setBusy(true);
    setStatus("");
    setError("");
    try {
      await action();
      await reload();
      setStatus(t(doneText));
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return <p className="muted-copy">{t("The client domain is managed by the workspace owner.")}</p>;
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <p className="muted-copy" style={{ margin: 0 }}>
        {t("Your customers' links — order tracking, estimates and every future customer page — can carry YOUR name instead of ours.")}
      </p>

      {/* ---- Level 1: the free subdomain --------------------------------- */}
      <section className="mini-panel" style={{ display: "grid", gap: 10, padding: 16 }}>
        <strong>{t("Your NivaDesk subdomain")}</strong>
        <p className="muted-copy" style={{ margin: 0, fontSize: 13 }}>
          {t("Included on every plan. Pick a name and your customer links become name.nivadesk.app.")}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ maxWidth: 220 }}
            value={slugDraft}
            onChange={event => setSlugDraft(event.target.value)}
            placeholder={t("your-studio")}
            maxLength={40}
          />
          <span className="muted-copy" style={{ fontSize: 13 }}>.nivadesk.app</span>
          <button
            className="button"
            type="button"
            disabled={busy || !slugDraft.trim()}
            onClick={() => void run(() => setClientSubdomain(workspace, slugDraft.trim()), "Subdomain saved.")}
          >
            {t("Save")}
          </button>
        </div>
        {subdomain ? (
          <p className="muted-copy" style={{ margin: 0, fontSize: 13 }}>
            ✅ {subdomain.host}.nivadesk.app {t("is yours.")}
          </p>
        ) : null}
      </section>

      {/* ---- Level 2: the custom domain ----------------------------------- */}
      <section className="mini-panel" style={{ display: "grid", gap: 10, padding: 16 }}>
        <strong>{t("Your own domain")}</strong>
        <p className="muted-copy" style={{ margin: 0, fontSize: 13 }}>
          {t("Pro and Team: connect a subdomain of your own website — track.yourdomain.com — and customer links carry your brand end to end.")}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            value={hostDraft}
            onChange={event => setHostDraft(event.target.value)}
            placeholder="track.yourdomain.com"
            maxLength={253}
          />
          <button
            className="button"
            type="button"
            disabled={busy || !hostDraft.trim()}
            onClick={() => void run(async () => {
              await requestClientDomain(workspace, hostDraft.trim());
              setHostDraft("");
            }, "Domain added — now create the DNS record below and verify.")}
          >
            {t("Connect")}
          </button>
        </div>

        {customDomains.map(domain => (
          <div key={domain.host} className="mini-panel" style={{ display: "grid", gap: 8, padding: 12, background: "rgba(120,120,140,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{domain.host}</strong>
              <span
                className="studio-pill"
                style={domain.status === "active"
                  ? { background: "rgba(22,163,74,0.14)", color: "#16a34a" }
                  : { background: "rgba(234,138,46,0.16)", color: "#b45309" }}
              >
                {domain.status === "active" ? `🟢 ${t("Domain verified")}` : t("Waiting for DNS")}
              </span>
              <span style={{ flex: 1 }} />
              <button className="button secondary" type="button" disabled={busy} onClick={() => void run(async () => {
                const result = await verifyClientDomain(workspace, domain.host);
                setVerifyResult({ host: domain.host, verified: result.verified === true, found: result.found ?? [], error: result.error });
              }, "Checked.")}>
                {t("Verify")}
              </button>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void run(() => removeClientDomain(workspace, domain.host), "Domain removed.")}>
                {t("Remove")}
              </button>
            </div>
            {domain.status !== "active" ? (
              <div style={{ display: "grid", gap: 4 }}>
                <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>{t("Add this DNS record at your domain provider:")}</p>
                <code style={{ fontSize: 12.5, background: "rgba(120,120,140,0.1)", borderRadius: 8, padding: "8px 10px" }}>
                  CNAME&nbsp;&nbsp;{domain.host.split(".")[0]}&nbsp;&nbsp;→&nbsp;&nbsp;{cnameTarget}
                </code>
              </div>
            ) : null}
            {verifyResult && verifyResult.host === domain.host && !verifyResult.verified ? (
              <p className="muted-copy" style={{ margin: 0, fontSize: 12.5, color: "#b45309" }}>
                {verifyResult.found.length > 0
                  ? `${t("Found")}: ${verifyResult.found.join(", ")} — ${t("expected")} ${cnameTarget}. ${t("DNS changes can take up to an hour to spread.")}`
                  : `${t("No CNAME record found yet.")} ${t("DNS changes can take up to an hour to spread.")}`}
              </p>
            ) : null}
          </div>
        ))}

        <p className="muted-copy" style={{ margin: 0, fontSize: 12 }}>
          {t("A verified domain is reserved for your workspace; serving your links on it is being rolled out and older nivadesk.app links keep working.")}
        </p>
      </section>
    </div>
  );
}
