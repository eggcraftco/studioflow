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
  saveClientPortalBranding,
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
  const [verifyResult, setVerifyResult] = useState<{ host: string; verified: boolean; found: string[]; error?: string; certificate?: { status?: string; error?: string } } | null>(null);
  const [verifyingHost, setVerifyingHost] = useState("");
  const [copiedValue, setCopiedValue] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [showPoweredBy, setShowPoweredBy] = useState(true);

  const copyValue = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue(current => (current === value ? "" : current)), 1600);
    });
  };

  const reload = useCallback(async () => {
    if (!isOwner) { setLoadingConfig(false); return; }
    setLoadingConfig(true);
    try {
      const config = await getClientDomainConfig(workspace);
      setSubdomain(config.subdomain ?? null);
      setCustomDomains(config.customDomains ?? []);
      if (config.cnameTarget) setCnameTarget(config.cnameTarget);
      setSlugDraft(config.subdomain?.host ?? "");
      setAccentColor(config.branding?.accentColor ?? "");
      setShowPoweredBy(config.branding?.showPoweredBy !== false);
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

      {status ? <p style={{ margin: 0, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ {status}</p> : null}
      {error ? <p style={{ margin: 0, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}

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

        {customDomains.length === 0 ? (
          <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>{t("Not configured")}</p>
        ) : null}
        {customDomains.map(domain => {
          const isVerifying = verifyingHost === domain.host;
          const failedCheck = verifyResult && verifyResult.host === domain.host && !verifyResult.verified ? verifyResult : null;
          const certificate = verifyResult && verifyResult.host === domain.host ? verifyResult.certificate : undefined;
          // A fresh page load has no verify result yet — the stored edge state
          // keeps a live domain from greeting its owner with "being issued".
          const certActive = certificate ? certificate.status === "active" : domain.cfSslStatus === "active";
          const statusLabel = domain.status === "active"
            ? certActive ? `🟢 ${t("Live")}` : `🟢 ${t("Domain verified")}`
            : isVerifying ? t("Verifying...") : t("DNS required");
          const steps: { label: string; state: "done" | "current" | "todo" }[] = [
            { label: t("Enter domain"), state: "done" },
            { label: t("Add the DNS record"), state: domain.status === "active" ? "done" : "current" },
            { label: t("Verify ownership"), state: domain.status === "active" ? "done" : failedCheck || isVerifying ? "current" : "todo" },
            { label: t("Certificate"), state: domain.status === "active" ? (certActive ? "done" : "current") : "todo" }
          ];
          return (
            <div key={domain.host} className="mini-panel" style={{ display: "grid", gap: 10, padding: 14, background: "rgba(120,120,140,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{domain.host}</strong>
                <span
                  className="studio-pill"
                  style={domain.status === "active"
                    ? { background: "rgba(22,163,74,0.14)", color: "#16a34a" }
                    : { background: "rgba(234,138,46,0.16)", color: "#b45309" }}
                >
                  {statusLabel}
                </span>
                <span style={{ flex: 1 }} />
                <button className="button secondary" type="button" disabled={busy} onClick={() => void run(async () => {
                  setVerifyingHost(domain.host);
                  try {
                    const result = await verifyClientDomain(workspace, domain.host);
                    setVerifyResult({ host: domain.host, verified: result.verified === true, found: result.found ?? [], error: result.error, certificate: result.certificate });
                  } finally {
                    setVerifyingHost("");
                  }
                }, "Checked.")}>
                  {isVerifying ? t("Verifying...") : t("Check again")}
                </button>
                <button className="button secondary" type="button" disabled={busy} onClick={() => void run(() => removeClientDomain(workspace, domain.host), "Domain removed.")}>
                  {t("Remove")}
                </button>
              </div>

              <ol className="client-domain-steps">
                {steps.map((step, index) => (
                  <li key={step.label} data-state={step.state}>
                    <span className="client-domain-step-dot">{step.state === "done" ? "✓" : index + 1}</span>
                    {step.label}
                  </li>
                ))}
              </ol>

              {domain.status !== "active" ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>{t("Add this DNS record at your domain provider:")}</p>
                  <div className="client-domain-dns-row">
                    <span className="client-domain-dns-cell">CNAME</span>
                    <span className="client-domain-dns-cell">
                      {domain.host.split(".")[0]}
                      <button type="button" className="client-domain-copy" onClick={() => copyValue(domain.host.split(".")[0])}>
                        {copiedValue === domain.host.split(".")[0] ? t("Copied!") : t("Copy")}
                      </button>
                    </span>
                    <span className="client-domain-dns-cell">
                      {cnameTarget}
                      <button type="button" className="client-domain-copy" onClick={() => copyValue(cnameTarget)}>
                        {copiedValue === cnameTarget ? t("Copied!") : t("Copy")}
                      </button>
                    </span>
                  </div>
                </div>
              ) : (
                <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>
                  {certActive
                    ? t("Live — your customer links now open on this domain. Existing nivadesk.app links keep working.")
                    : certificate?.status === "error"
                      ? `${t("Verified. The certificate step reported a problem — press Check again, and contact support if it persists.")} (${certificate.error || ""})`
                      : t("Verified. The security certificate is being issued — usually a few minutes. Press Check again to refresh.")}
                </p>
              )}
              {failedCheck ? (
                <p className="muted-copy" style={{ margin: 0, fontSize: 12.5, color: "#b45309" }}>
                  {failedCheck.found.length > 0
                    ? `${t("Found")}: ${failedCheck.found.join(", ")} — ${t("expected")} ${cnameTarget}. ${t("DNS changes can take up to an hour to spread.")}`
                    : `${t("No CNAME record found yet.")} ${t("DNS changes can take up to an hour to spread.")}`}
                </p>
              ) : null}
            </div>
          );
        })}

        <p className="muted-copy" style={{ margin: 0, fontSize: 12 }}>
          {t("A verified domain serves your customer links with your branding; older nivadesk.app links keep working.")}
        </p>
      </section>

      {/* ---- What the links actually look like --------------------------- */}
      <section className="mini-panel" style={{ display: "grid", gap: 8, padding: 16 }}>
        <strong>{t("Your customer links")}</strong>
        <p className="muted-copy" style={{ margin: 0, fontSize: 13 }}>
          {t("Order tracking and estimate pages ride short links; they follow whichever name you set up here.")}
        </p>
        <code style={{ fontSize: 12.5, background: "rgba(120,120,140,0.1)", borderRadius: 8, padding: "8px 10px" }}>
          https://{customDomains.find(domain => domain.status === "active")?.host ?? (subdomain ? `${subdomain.host}.nivadesk.app` : "nivadesk.app")}/r/a1b2c3…
        </code>
      </section>

      {/* ---- Branding for the customer-facing pages ----------------------- */}
      <section className="mini-panel" style={{ display: "grid", gap: 10, padding: 16 }}>
        <strong>{t("Customer page branding")}</strong>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            {t("Accent colour")}
            <input
              type="color"
              value={accentColor || "#2563eb"}
              onChange={event => setAccentColor(event.target.value)}
              style={{ width: 42, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            />
          </label>
          <input
            className="input"
            style={{ width: 110, fontFamily: "monospace", fontSize: 13 }}
            value={accentColor}
            placeholder="#2563eb"
            maxLength={7}
            onChange={event => {
              const value = event.target.value.trim();
              if (value === "" || /^#[0-9a-fA-F]{0,6}$/.test(value)) setAccentColor(value.toLowerCase());
            }}
            aria-label={t("Hex colour")}
          />
          {accentColor ? (
            <button className="button secondary" type="button" onClick={() => setAccentColor("")}>
              {t("Use the default colour")}
            </button>
          ) : null}
          {/^#[0-9a-f]{6}$/.test(accentColor) && (() => {
            const r = parseInt(accentColor.slice(1, 3), 16), g = parseInt(accentColor.slice(3, 5), 16), b = parseInt(accentColor.slice(5, 7), 16);
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.72;
          })() ? (
            <span style={{ fontSize: 12, color: "#b45309" }}>{t("This colour may be hard to see on a light page.")}</span>
          ) : null}
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showPoweredBy}
              onChange={event => setShowPoweredBy(event.target.checked)}
            />
            {t("Show \u201CPowered by NivaDesk\u201D on customer pages")}
          </label>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void run(() => saveClientPortalBranding(workspace, { accentColor, showPoweredBy }), "Branding saved.")}
          >
            {t("Save")}
          </button>
        </div>
        <p className="muted-copy" style={{ margin: 0, fontSize: 12 }}>
          {t("The accent colours the order tracking page. Hiding the Powered by line is part of the Pro and Team plans.")}
        </p>
      </section>
    </div>
  );
}
