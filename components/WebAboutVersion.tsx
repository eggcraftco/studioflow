"use client";

// Settings ▸ About on the web (GN-06): which build this tab is running, a real
// "Check for updates", when it last checked, and what it found. It used to say
// "Up to date" on a pill no check stood behind, next to the version of the
// newest iPhone/Mac release — the web has no version of its own.

import { useState } from "react";
import { checkWebBuild, formatWebBuild, WEB_BUILD_ID, type WebBuildCheck } from "@/lib/studioflow/webBuild";

export default function WebAboutVersion({ t, isLocal }: { t: (text: string) => string; isLocal: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WebBuildCheck | null>(null);

  async function check() {
    setBusy(true);
    try {
      setResult(await checkWebBuild());
    } finally {
      setBusy(false);
    }
  }

  const build = WEB_BUILD_ID ? formatWebBuild(WEB_BUILD_ID) : "";
  const checkedAt = result
    ? new Date(result.checkedAtMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="settings-about-update" data-testid="web-about-version">
      <p className="settings-about-version">
        {build ? t("Web app · build {build}").replace("{build}", build) : t("Web")}
        {isLocal ? ` · ${t("Local")}` : ""}
      </p>
      <p className="muted-copy">{t("The web app updates itself. Reload to get the newest version.")}</p>
      <div className="settings-button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={() => void check()}>
          {busy ? t("Checking…") : t("Check for updates")}
        </button>
        {result?.state === "newer" ? (
          <button type="button" className="button" onClick={() => window.location.reload()}>{t("Reload")}</button>
        ) : null}
      </div>
      {result ? (
        <p className="muted-copy" role="status" data-state={result.state}>
          {result.state === "current" ? t("You have the latest version available to you.")
            : result.state === "newer" ? t("A newer version of NivaDesk is ready. Save anything you have open, then reload.")
            : t("Could not check for updates. Try again later.")}
          {" · "}
          {t("Last checked {time}").replace("{time}", checkedAt)}
        </p>
      ) : null}
    </div>
  );
}
