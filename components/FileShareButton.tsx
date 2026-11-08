"use client";

// Share a stored file (8 Nov 2026, the owner). One button for every screen that lists stored files: it is busy while
// the file is fetched, then opens this device's own share sheet with the file (lib/studioflow/fileShare.ts), or
// shares / copies the workspace's file link where the browser cannot share files, and says which happened.
// Callers draw it only where the person may open the file (the screen's own Open gate).
import { useState, type ReactNode } from "react";
import { SHARE_PREPARING_TEXT, shareOutcomeMessage, shareStoredFile, type ShareableFile } from "@/lib/studioflow/fileShare";

type Props = {
  file: ShareableFile;
  brandedHost?: string;
  t: (text: string) => string;
  /** The sentence to show (already a key of the translation table), or null to clear it; `problem` for a failure. */
  onMessage: (text: string | null, problem: boolean) => void;
  className?: string;
  /** The face when not busy; the translated "Share" when omitted. */
  children?: ReactNode;
};

export function FileShareButton({ file, brandedHost, t, onMessage, className = "button secondary", children }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      type="button"
      disabled={busy}
      aria-busy={busy}
      title={t("Share")}
      aria-label={busy ? t(SHARE_PREPARING_TEXT) : t("Share")}
      data-file-share=""
      onClick={() => {
        if (busy) return;
        setBusy(true);
        onMessage(null, false);
        void shareStoredFile(file, brandedHost)
          .then(outcome => {
            const said = shareOutcomeMessage(outcome);
            onMessage(said ? said.text : null, said?.problem ?? false);
          })
          .finally(() => setBusy(false));
      }}
    >
      {busy
        ? (children ? <span className="client-file-action-loading">…</span> : t(SHARE_PREPARING_TEXT))
        : children ?? t("Share")}
    </button>
  );
}
