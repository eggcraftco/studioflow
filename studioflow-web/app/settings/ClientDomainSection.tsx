"use client";

// Settings → Customer Portal Domain.
//
// Two levels, per the domain-link plan: every workspace claims a subdomain
// (eggcraft → eggcraft.nivadesk.app); Pro and Team can connect their own
// hostname (track.eggcraft.co.uk) with one CNAME. A customer who taps
// track.eggcraft.co.uk/r/… sees the workspace's own brand in the address bar —
// not somebody else's software.

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { SettingsCardHead } from "./pageHeader";
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

  const activeCustom = customDomains.find(domain => domain.status === "active");
  const portalHost = activeCustom?.host ?? (subdomain ? `${subdomain.host}.nivadesk.app` : "nivadesk.app");
  const portalRoot = `https://${portalHost}/`;
  const accentPreview = /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : "#2563eb";
  const accentTooLight = /^#[0-9a-f]{6}$/.test(accentColor) && (() => {
    const r = parseInt(accentColor.slice(1, 3), 16), g = parseInt(accentColor.slice(3, 5), 16), b = parseInt(accentColor.slice(5, 7), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.72;
  })();

  return (
    <div className="settings-card-stack settings-domain-page">
      {status ? <p className="success-copy">✓ {t(status)}</p> : null}
      {error ? <p className="layout-error">{t(error)}</p> : null}

      {/* ---- Where customer links live: the free subdomain, then a domain of their own ---- */}
      <section className="card app-card">
        <SettingsCardHead title={t("Portal address")} subtitle={t("Choose the address customers see when they open tracking and estimate pages.")} />
        <div className="settings-subpanel-stack">
          <div className="settings-subpanel">
            <div className="settings-subpanel-head">
              <strong>{t("NivaDesk subdomain")}</strong>
              <span className="settings-tag">{t("Included")}</span>
            </div>
            <p className="settings-field-hint">{t("Included on every plan. Pick a name and your customer links become name.nivadesk.app.")}</p>
            <div className="settings-domain-row">
              <div className="settings-domain-input">
                <input
                  className="input"
                  value={slugDraft}
                  disabled={busy || loadingConfig}
                  onChange={event => setSlugDraft(event.target.value)}
                  placeholder={t("your-studio")}
                  maxLength={40}
                  aria-label={t("NivaDesk subdomain")}
                />
                <span className="settings-domain-suffix">.nivadesk.app</span>
              </div>
              <button
                className="button secondary"
                type="button"
                disabled={busy || loadingConfig || !slugDraft.trim() || slugDraft.trim() === (subdomain?.host ?? "")}
                onClick={() => void run(() => setClientSubdomain(workspace, slugDraft.trim()), "Subdomain saved.")}
              >
                {t("Save subdomain")}
              </button>
              {subdomain ? (
                <span className="settings-status-pill is-saved">
                  <span className="settings-status-pill-mark" aria-hidden="true">✓</span>
                  {subdomain.host}.nivadesk.app {t("is yours.")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="settings-subpanel">
            <div className="settings-subpanel-head">
              <strong>{t("Custom domain")}</strong>
              <span className="settings-tag">{t("Pro & Team")}</span>
            </div>
            <p className="settings-field-hint">{t("Use a subdomain from your own website.")}</p>
            <div className="settings-domain-row">
              <input
                className="input settings-domain-host"
                value={hostDraft}
                disabled={busy || loadingConfig}
                onChange={event => setHostDraft(event.target.value)}
                placeholder="track.yourdomain.com"
                maxLength={253}
                aria-label={t("Custom domain")}
              />
              <button
                className="button secondary"
                type="button"
                disabled={busy || loadingConfig || !hostDraft.trim()}
                onClick={() => void run(async () => {
                  await requestClientDomain(workspace, hostDraft.trim());
                  setHostDraft("");
                }, "Domain added — now create the DNS record below and verify.")}
              >
                {t("Connect domain")}
              </button>
              {customDomains.length === 0 ? (
                <span className="settings-status-pill is-readonly">
                  <span className="settings-status-pill-mark" aria-hidden="true">○</span>
                  {t("Not configured")}
                </span>
              ) : null}
            </div>

            {customDomains.map(domain => {
              const isVerifying = verifyingHost === domain.host;
              const failedCheck = verifyResult && verifyResult.host === domain.host && !verifyResult.verified ? verifyResult : null;
              const certificate = verifyResult && verifyResult.host === domain.host ? verifyResult.certificate : undefined;
              // A fresh page load has no verify result yet — the stored edge state
              // keeps a live domain from greeting its owner with "being issued".
              const certActive = certificate ? certificate.status === "active" : domain.cfSslStatus === "active";
              const statusLabel = domain.status === "active"
                ? certActive ? t("Live") : t("Domain verified")
                : isVerifying ? t("Verifying...") : t("DNS required");
              const steps: { label: string; state: "done" | "current" | "todo" }[] = [
                { label: t("Enter domain"), state: "done" },
                { label: t("Add the DNS record"), state: domain.status === "active" ? "done" : "current" },
                { label: t("Verify ownership"), state: domain.status === "active" ? "done" : failedCheck || isVerifying ? "current" : "todo" },
                { label: t("Certificate"), state: domain.status === "active" ? (certActive ? "done" : "current") : "todo" }
              ];
              const dnsName = domain.host.split(".")[0];
              return (
                <div key={domain.host} className="settings-domain-card">
                  <div className="settings-domain-card-head">
                    <strong>{domain.host}</strong>
                    <span className={domain.status === "active" ? "settings-status-pill is-saved" : "settings-status-pill is-dirty"}>
                      <span className="settings-status-pill-mark" aria-hidden="true">{domain.status === "active" ? "✓" : "●"}</span>
                      {statusLabel}
                    </span>
                    <span className="settings-domain-card-actions">
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
                      <button className="button danger secondary" type="button" disabled={busy} onClick={() => void run(() => removeClientDomain(workspace, domain.host), "Domain removed.")}>
                        {t("Remove")}
                      </button>
                    </span>
                  </div>

                  <ol className="settings-steps">
                    {steps.map((step, index) => (
                      <li key={step.label} data-state={step.state}>
                        <span className="settings-step-dot">{step.state === "done" ? "✓" : index + 1}</span>
                        <span>{step.label}</span>
                      </li>
                    ))}
                  </ol>

                  {domain.status !== "active" ? (
                    <div className="settings-field-stack">
                      <p className="settings-field-hint">{t("Add this DNS record at your domain provider:")}</p>
                      <div className="client-domain-dns-row">
                        <span className="client-domain-dns-cell">CNAME</span>
                        <span className="client-domain-dns-cell">
                          {dnsName}
                          <button type="button" className="client-domain-copy" onClick={() => copyValue(dnsName)}>
                            {copiedValue === dnsName ? t("Copied!") : t("Copy")}
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
                    <p className="settings-field-hint">
                      {certActive
                        ? t("Live — your customer links now open on this domain. Existing nivadesk.app links keep working.")
                        : certificate?.status === "error"
                          ? `${t("Verified. The certificate step reported a problem — press Check again, and contact support if it persists.")} (${certificate.error || ""})`
                          : t("Verified. The security certificate is being issued — usually a few minutes. Press Check again to refresh.")}
                    </p>
                  )}
                  {failedCheck ? (
                    <p className="settings-field-hint is-caution">
                      {failedCheck.found.length > 0
                        ? `${t("Found")}: ${failedCheck.found.join(", ")} — ${t("expected")} ${cnameTarget}. ${t("DNS changes can take up to an hour to spread.")}`
                        : `${t("No CNAME record found yet.")} ${t("DNS changes can take up to an hour to spread.")}`}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <p className="settings-field-hint">{t("A verified domain serves your customer links with your branding; older nivadesk.app links keep working.")}</p>
          </div>
        </div>
      </section>

      {/* ---- What the links actually look like ---- */}
      <section className="card app-card">
        <SettingsCardHead title={t("Customer link preview")} />
        <div className="settings-link-row">
          <code className="settings-link-box">{portalRoot}r/a1b2c3…</code>
          <button className="button secondary" type="button" onClick={() => copyValue(portalRoot)}>
            {copiedValue === portalRoot ? t("Copied!") : t("Copy")}
          </button>
        </div>
        <p className="settings-field-hint">{t("Order tracking and estimate pages ride short links; they follow whichever name you set up here.")}</p>
      </section>

      {/* ---- Branding for the customer-facing pages, with the page it colours ---- */}
      <section className="card app-card">
        <div className="settings-two-col">
          <div>
            <SettingsCardHead title={t("Customer page appearance")} />
            <div className="settings-field-stack">
              <div className="settings-field">
                <span className="settings-field-label">{t("Accent colour")}</span>
                <div className="settings-colour-row">
                  <input
                    type="color"
                    className="settings-colour-swatch"
                    value={accentPreview}
                    onChange={event => setAccentColor(event.target.value)}
                    aria-label={t("Accent colour")}
                  />
                  <input
                    className="input settings-colour-hex"
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
                </div>
                {accentTooLight ? <span className="settings-field-hint is-caution">{t("This colour may be hard to see on a light page.")}</span> : null}
              </div>
              <label className="settings-switch-row">
                <input
                  type="checkbox"
                  className="settings-switch"
                  checked={showPoweredBy}
                  onChange={event => setShowPoweredBy(event.target.checked)}
                />
                <span>{t("Show \u201CPowered by NivaDesk\u201D on customer pages")}</span>
              </label>
              <p className="settings-field-hint">{t("The accent colours the order tracking page. Hiding the Powered by line is part of the Pro and Team plans.")}</p>
              <div className="settings-action-row">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => saveClientPortalBranding(workspace, { accentColor, showPoweredBy }), "Branding saved.")}
                >
                  {t("Save appearance")}
                </button>
              </div>
            </div>
          </div>
          <div className="settings-portal-preview">
            <div className="settings-branding-preview-head">
              <span className="settings-field-label">{t("Live preview")}</span>
            </div>
            <div className="settings-portal-mock" style={{ "--portal-accent": accentPreview } as CSSProperties} aria-hidden="true">
              <div className="settings-portal-mock-bar">
                <span>{workspace.name}</span>
                <span>{t("Order")} #12345</span>
              </div>
              <ol className="settings-portal-mock-steps">
                {[t("Received"), t("In Progress"), t("Ready"), t("Delivered")].map((label, index) => (
                  <li key={label} data-state={index === 0 ? "done" : index === 1 ? "current" : "todo"}>
                    <span>{index === 0 ? "✓" : index + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
              <div className="settings-portal-mock-card">
                <strong>{t("In Progress")}</strong>
                <span />
                <span />
              </div>
              {showPoweredBy ? <p className="settings-portal-mock-powered">Powered by NivaDesk</p> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
