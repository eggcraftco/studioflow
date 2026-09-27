"use client";

// One file a customer sent, inside their message.
//
// Nothing is fetched until a person asks. The first press makes the server
// copy the file privately and have it scanned; the bytes come back only once
// the scan says clean, as a Blob that lives in this tab and is released when
// the message leaves the screen. There is never an address to the file on the
// page, so nothing here can be forwarded, bookmarked or opened later without
// going through the same check again.
//
// A file the scan refused, or could not check, stays shut and says which. A
// kind the server does not open (a voice note, a video) is named, not offered.

import { useCallback, useEffect, useRef, useState } from "react";
import { openCustomerInboxMedia, type CustomerInboxMedia } from "@/lib/studioflow/customerInbox";

/** How often, and how many times, "still being checked" asks again on its own. */
const SCAN_POLL_MS = 4000;
const SCAN_POLL_TRIES = 8;

type Phase =
  | { at: "idle" }
  | { at: "opening" }
  | { at: "scanning"; tries: number }
  | { at: "waited" }
  | { at: "ready"; url: string; kind: string }
  | { at: "blocked" }
  | { at: "unverified" }
  | { at: "refused"; reason: string }
  | { at: "failed" };

/** The server's reason words, as sentences. Keys: the caller translates. */
function refusalSentence(reason: string): string {
  switch (reason) {
    case "type_not_allowed": return "This kind of file cannot be opened in NivaDesk yet.";
    case "too_large": return "This file is too large to open here.";
    case "expired": return "WhatsApp no longer keeps this file. Ask the customer to send it again.";
    case "no_provider": return "WhatsApp is not connected, so the file cannot be fetched.";
    case "provider_auth": return "WhatsApp refused the request. Reconnect WhatsApp and try again.";
    case "provider_unavailable": return "WhatsApp did not answer. Try again in a moment.";
    case "no_message": return "This message no longer exists.";
    default: return "The file could not be opened.";
  }
}

/** "340 KB", "1.2 MB"; empty when the provider did not say. */
function sizeLabel(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InboxAttachment({
  companyId,
  conversationId,
  messageId,
  messageType,
  media,
  t
}: {
  companyId: string;
  conversationId: string;
  messageId: string;
  messageType: string;
  media: CustomerInboxMedia;
  t: (text: string) => string;
}) {
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const alive = useRef(true);
  const url = useRef("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
      // The bytes go with the message: nothing of the file outlives the bubble.
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = "";
    };
  }, []);

  const open = useCallback(async (tries: number) => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    setPhase(tries === 0 ? { at: "opening" } : { at: "scanning", tries });
    try {
      const answer = await openCustomerInboxMedia(companyId, conversationId, messageId);
      if (!alive.current) return;
      if (answer.state === "ready") {
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(answer.blob);
        setPhase({ at: "ready", url: url.current, kind: answer.kind });
      } else if (answer.state === "scanning") {
        if (tries < SCAN_POLL_TRIES) {
          setPhase({ at: "scanning", tries });
          timer.current = window.setTimeout(() => { void open(tries + 1); }, SCAN_POLL_MS);
        } else {
          setPhase({ at: "waited" });
        }
      } else if (answer.state === "refused") {
        setPhase({ at: "refused", reason: answer.reason });
      } else {
        setPhase({ at: answer.state });
      }
    } catch {
      if (alive.current) setPhase({ at: "failed" });
    }
  }, [companyId, conversationId, messageId]);

  const isImage = media.kind === "image";
  const name = isImage ? t("Photo") : media.filename || t("PDF document");
  const size = sizeLabel(media.sizeBytes);

  // Opening files is its own release: until the server says a file may be
  // opened, the bubble names it and offers nothing — no button that would
  // only fail.
  if (media.kind !== "unsupported" && media.openable !== true) {
    return (
      <div className="inbox-attachment inbox-attachment-muted" role="note">
        <div className="inbox-attachment-head">
          <bdi className="inbox-attachment-name" dir="auto">{name}</bdi>
          {size ? <span className="inbox-attachment-size">{size}</span> : null}
        </div>
      </div>
    );
  }

  if (media.kind === "unsupported") {
    return (
      <div className="inbox-attachment inbox-attachment-muted" role="note">
        <bdi className="inbox-attachment-name" dir="auto">
          {messageType === "audio" ? t("Voice message") : media.filename || (messageType === "document" ? t("Document") : t("Attachment"))}
        </bdi>
        <span className="inbox-attachment-note">{t("This kind of file cannot be opened in NivaDesk yet.")}</span>
      </div>
    );
  }

  return (
    <div className="inbox-attachment">
      <div className="inbox-attachment-head">
        {/* A customer's filename is their words: kept in its own direction. */}
        <bdi className="inbox-attachment-name" dir="auto">{name}</bdi>
        {size ? <span className="inbox-attachment-size">{size}</span> : null}
      </div>

      {phase.at === "ready" ? (
        phase.kind === "image" ? (
          <a className="inbox-attachment-preview" href={phase.url} target="_blank" rel="noopener noreferrer" title={t("Open full size")}>
            <img src={phase.url} alt={t("Photo the customer sent")} />
          </a>
        ) : (
          <a className="inbox-attachment-action" href={phase.url} target="_blank" rel="noopener noreferrer">
            {t("Open PDF")}
          </a>
        )
      ) : phase.at === "idle" || phase.at === "failed" ? (
        <>
          <button type="button" className="inbox-attachment-action" onClick={() => { void open(0); }}>
            {isImage ? t("View photo") : t("Open PDF")}
          </button>
          {phase.at === "failed" ? <span className="inbox-attachment-note" role="alert">{t("The file could not be opened.")}</span> : null}
        </>
      ) : phase.at === "opening" ? (
        <span className="inbox-attachment-note" role="status">{t("Opening…")}</span>
      ) : phase.at === "scanning" ? (
        <span className="inbox-attachment-note" role="status">{t("Checking the file for viruses…")}</span>
      ) : phase.at === "waited" ? (
        <>
          <span className="inbox-attachment-note" role="status">{t("Still being checked. Try again in a minute.")}</span>
          <button type="button" className="inbox-attachment-action" onClick={() => { void open(1); }}>
            {t("Check again")}
          </button>
        </>
      ) : phase.at === "blocked" ? (
        <span className="inbox-attachment-note inbox-attachment-blocked" role="alert">
          {t("This file was blocked by the virus check and cannot be opened.")}
        </span>
      ) : phase.at === "unverified" ? (
        <span className="inbox-attachment-note inbox-attachment-blocked" role="alert">
          {t("This file could not be checked, so it stays closed.")}
        </span>
      ) : (
        <span className="inbox-attachment-note" role="alert">{t(refusalSentence(phase.reason))}</span>
      )}
    </div>
  );
}
