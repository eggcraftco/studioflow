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
import { nextScanPollDelay } from "@/lib/studioflow/scanPollSchedule";

// "Still being checked" keeps asking on its own: the verdict is written where
// only the server reads it and nothing tells the page when it lands, so the
// photo appears only if the page asks again. How often, and for how long, is
// lib/studioflow/scanPollSchedule.ts (330 s: past the scanner's own limit).

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
function refusalSentence(reason: string, channel = ""): string {
  // GN-07: an Instagram photo names Instagram, not WhatsApp.
  if (channel === "instagram") {
    switch (reason) {
      case "expired": return "Instagram no longer serves this photo. Ask the customer to send it again.";
      case "no_provider": return "Instagram is not connected, so the photo cannot be fetched.";
      case "provider_auth": return "Instagram refused the request. Try again later.";
      case "provider_unavailable": return "Instagram did not answer. Try again in a moment.";
      default: break;
    }
  }
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
  channel = "",
  t
}: {
  companyId: string;
  conversationId: string;
  messageId: string;
  messageType: string;
  media: CustomerInboxMedia;
  /** The conversation's medium ("whatsapp" | "instagram"), for the refusal's wording (GN-07). */
  channel?: string;
  t: (text: string) => string;
}) {
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const phaseNow = useRef<Phase>({ at: "idle" });
  const alive = useRef(true);
  const url = useRef("");
  const timer = useRef<number | null>(null);
  /** An ask on its way to the server: a second one would only duplicate it. */
  const asking = useRef(false);
  /** Bumped when the message changes or the bubble goes: a late answer for the old one is dropped. */
  const round = useRef(0);
  /** When this round of asking began, and how many "still scanning" answers it has had. */
  const startedAt = useRef(0);
  const scanTries = useRef(0);

  const show = useCallback((next: Phase) => {
    phaseNow.current = next;
    setPhase(next);
  }, []);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      round.current += 1;
      stopTimer();
      // The bytes go with the message: nothing of the file outlives the bubble.
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = "";
    };
  }, [stopTimer]);

  // Another message in the same bubble starts from nothing: no timer, no
  // answer, no bytes of the one before.
  useEffect(() => {
    return () => {
      round.current += 1;
      stopTimer();
      asking.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = "";
      show({ at: "idle" });
    };
  }, [companyId, conversationId, messageId, show, stopTimer]);

  /** Ask the server for the file. `fresh` starts a new round (a press, or after "still being checked"). */
  const open = useCallback(async (fresh: boolean) => {
    stopTimer();
    if (asking.current) return;
    if (fresh) { startedAt.current = Date.now(); scanTries.current = 0; }
    const mine = round.current;
    const before = phaseNow.current.at;
    show(before === "idle" || before === "failed" ? { at: "opening" } : { at: "scanning", tries: scanTries.current });
    asking.current = true;
    try {
      const answer = await openCustomerInboxMedia(companyId, conversationId, messageId);
      if (!alive.current || mine !== round.current) return;
      if (answer.state === "ready") {
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(answer.blob);
        show({ at: "ready", url: url.current, kind: answer.kind });
      } else if (answer.state === "scanning") {
        scanTries.current += 1;
        const wait = nextScanPollDelay(Date.now() - startedAt.current, scanTries.current);
        if (wait === null) {
          show({ at: "waited" });
        } else {
          show({ at: "scanning", tries: scanTries.current });
          // A hidden tab does not ask: coming back asks at once instead.
          if (!document.hidden) {
            timer.current = window.setTimeout(() => {
              timer.current = null;
              if (document.hidden) return;
              void open(false);
            }, wait);
          }
        }
      } else if (answer.state === "refused") {
        show({ at: "refused", reason: answer.reason });
      } else {
        show({ at: answer.state });
      }
    } catch {
      if (alive.current && mine === round.current) show({ at: "failed" });
    } finally {
      if (mine === round.current) asking.current = false;
    }
  }, [companyId, conversationId, messageId, show, stopTimer]);

  // Back to the tab (or the window): a file still being checked is asked
  // about at once, not after the rest of a wait that was paused.
  useEffect(() => {
    const recheck = () => {
      if (document.hidden) { stopTimer(); return; }
      const at = phaseNow.current.at;
      if ((at === "scanning" || at === "waited") && timer.current === null && !asking.current) {
        void open(at === "waited");
      }
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [open, stopTimer]);

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
          <button type="button" className="inbox-attachment-action" onClick={() => { void open(true); }}>
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
          <button type="button" className="inbox-attachment-action" onClick={() => { void open(true); }}>
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
        <span className="inbox-attachment-note" role="alert">{t(refusalSentence(phase.reason, channel))}</span>
      )}
    </div>
  );
}
