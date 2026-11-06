"use client";

// Settings → Portal address → File link address (6 Nov 2026).
//
// Every customer link used to ride the client domain, so a shared file read track.yourdomain.com/f/… — a
// tracking address on a file. This gives files their own address, such as files.yourdomain.com: one CNAME,
// verified exactly like the client domain and the payment link address (whose words and layout this reuses).
// It is its own registry row on the server (functions/clientDomains.js manageFileLinkDomain), so adding it
// never moves the tracking, estimate or payment links. New file links switch to it only once the DNS record is
// verified and the certificate is active; until then — and if it is removed — they use the client domain, or
// nivadesk.app. Links already sent keep working wherever they were made.

import { useCallback, useEffect, useState } from "react";
import { manageFileLinkDomain, type FileLinkDomainView } from "@/lib/studioflow/clientDomain";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

export function FileLinkDomainBlock({
  workspace,
  t
}: {
  workspace: WorkspaceContext;
  t: (text: string) => string;
}) {
  const [view, setView] = useState<FileLinkDomainView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [lastCheck, setLastCheck] = useState<FileLinkDomainView | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setView(await manageFileLinkDomain(workspace, "get"));
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The file address could not be updated.");
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => { void load(); }, [load]);

  async function run(key: string, action: () => Promise<FileLinkDomainView | void>, doneText: string) {
    setBusy(key);
    setStatus("");
    setError("");
    try {
      const next = await action();
      if (next) setView(next);
      setStatus(doneText);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const copyValue = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(value);
      window.setTimeout(() => setCopied(current => (current === value ? "" : current)), 1600);
    });
  };

  const host = view?.host || "";
  const active = view?.status === "active";
  const live = view?.live === true;
  const certificate = lastCheck?.certificate ?? view?.certificate ?? null;
  const certActive = certificate?.status === "active" || live;
  const failedCheck = lastCheck && lastCheck.verified === false ? lastCheck : null;
  const cnameTarget = view?.cnameTarget || "customers.nivadesk.app";
  const dnsName = view?.record?.name || host.split(".")[0] || "";
  const verifying = busy === "verify";
  const statusLabel = live ? t("Live") : active ? t("Domain verified") : verifying ? t("Verifying...") : t("DNS required");
  const steps: { label: string; state: "done" | "current" | "todo" }[] = [
    { label: t("Enter domain"), state: "done" },
    { label: t("Add the DNS record"), state: active ? "done" : "current" },
    { label: t("Verify ownership"), state: active ? "done" : failedCheck || verifying ? "current" : "todo" },
    { label: t("Certificate"), state: active ? (certActive ? "done" : "current") : "todo" }
  ];

  return (
    <div className="settings-subpanel" style={{ marginTop: 12 }} data-file-link-domain={view ? (live ? "live" : view.status) : "loading"}>
      <div className="settings-subpanel-head">
        <strong>{t("File link address")}</strong>
        <span className="settings-tag">{t("Pro & Team")}</span>
      </div>
      <p className="settings-field-hint">
        {t("The address your shared file links use. A subdomain of your own website, such as files.yourdomain.com, keeps your tracking address for order tracking.")}
      </p>
      {status ? <p className="success-copy">✓ {t(status)}</p> : null}
      {error ? <p className="layout-error">{t(error)}</p> : null}

      {loading ? null : !host ? (
        <>
          <div className="settings-domain-row">
            <input
              className="input settings-domain-host"
              value={draft}
              disabled={Boolean(busy)}
              onChange={event => setDraft(event.target.value)}
              placeholder="files.yourdomain.com"
              maxLength={253}
              aria-label={t("File link address")}
            />
            <button
              className="button secondary"
              type="button"
              disabled={Boolean(busy) || !draft.trim()}
              onClick={() => void run("request", async () => {
                const next = await manageFileLinkDomain(workspace, "request", draft.trim());
                setDraft("");
                setLastCheck(null);
                return next;
              }, "Address added — now create the DNS record below and verify.")}
            >
              {t("Use this address")}
            </button>
          </div>
          <p className="settings-field-hint">{t("Until you add one, file links use your client domain, or nivadesk.app.")}</p>
        </>
      ) : (
        <div className="settings-domain-card">
          <div className="settings-domain-card-head">
            <strong>{host}</strong>
            <span className={live ? "settings-status-pill is-saved" : "settings-status-pill is-dirty"}>
              <span className="settings-status-pill-mark" aria-hidden="true">{live ? "✓" : "●"}</span>
              {statusLabel}
            </span>
            <span className="settings-domain-card-actions">
              <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void run("verify", async () => {
                const result = await manageFileLinkDomain(workspace, "verify");
                setLastCheck(result);
                return result;
              }, "Checked.")}>
                {verifying ? t("Verifying...") : t("Check again")}
              </button>
              <button className="button danger secondary" type="button" disabled={Boolean(busy)} onClick={() => {
                if (!window.confirm(t("Remove {host}? File links already sent on that address stop working. New file links go back to your client domain.").replace("{host}", host))) return;
                void run("remove", async () => {
                  setLastCheck(null);
                  return manageFileLinkDomain(workspace, "remove");
                }, "File address removed.");
              }}>
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

          {!active ? (
            <div className="settings-field-stack">
              <p className="settings-field-hint">{t("Add this DNS record at your domain provider:")}</p>
              <div className="client-domain-dns-row">
                <span className="client-domain-dns-cell">CNAME</span>
                <span className="client-domain-dns-cell">
                  {dnsName}
                  <button type="button" className="client-domain-copy" onClick={() => copyValue(dnsName)}>
                    {copied === dnsName ? t("Copied!") : t("Copy")}
                  </button>
                </span>
                <span className="client-domain-dns-cell">
                  {cnameTarget}
                  <button type="button" className="client-domain-copy" onClick={() => copyValue(cnameTarget)}>
                    {copied === cnameTarget ? t("Copied!") : t("Copy")}
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <p className="settings-field-hint">
              {live
                ? t("Live — new file links use this address. Links already sent keep working.")
                : certificate?.status === "error"
                  ? `${t("Verified. The certificate step reported a problem — press Check again, and contact support if it persists.")} (${certificate.error || ""})`
                  : t("Verified. The security certificate is being issued — usually a few minutes. Press Check again to refresh.")}
            </p>
          )}
          {failedCheck ? (
            <p className="settings-field-hint is-caution">
              {(failedCheck.found ?? []).length > 0
                ? `${t("Found")}: ${(failedCheck.found ?? []).join(", ")} — ${t("expected")} ${cnameTarget}. ${t("DNS changes can take up to an hour to spread.")}`
                : `${t("No CNAME record found yet.")} ${t("DNS changes can take up to an hour to spread.")}`}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
