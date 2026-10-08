"use client";

// The receipt viewer for the Bank page: a waiting receipt (ChatGPT or web
// upload) or the receipt on a transaction. Images zoom, PDFs preview inline,
// an email receipt (HTML/text) renders in a sandboxed frame, anything else is
// download-only. The bytes come through the authorised server door
// (lib/studioflow/bankReceipts.ts) — never a Storage download URL.

import React, { useEffect, useRef, useState } from "react";
import {
  bankReceiptErrorText,
  BankReceiptOpenError,
  downloadOpenedBankReceipt,
  openBankReceiptFile,
  type BankReceiptOpenReason,
  type BankReceiptReference,
  type OpenedBankReceipt
} from "@/lib/studioflow/bankReceipts";

export type BankReceiptViewerRequest = BankReceiptReference & {
  /** The name the row shows — displayed while loading and if the open fails. */
  name: string;
};

type ViewerState =
  | { status: "loading" }
  | { status: "error"; reason: BankReceiptOpenReason; detail: string }
  | { status: "ready"; file: OpenedBankReceipt };

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

function sizeLabel(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function BankReceiptViewer({ request, onClose, t }: {
  request: BankReceiptViewerRequest | null;
  onClose: () => void;
  t: (text: string) => string;
}) {
  const [state, setState] = useState<ViewerState>({ status: "loading" });
  const [zoomIndex, setZoomIndex] = useState(2);
  const [fit, setFit] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const fileRef = useRef<OpenedBankReceipt | null>(null);

  const requestKey = request ? `${request.companyId}|${request.inboxId ?? ""}|${request.transactionId ?? ""}` : "";

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });
    setZoomIndex(2);
    setFit(true);
    openBankReceiptFile(request, controller.signal)
      .then((file) => {
        if (!active) { file.release(); return; }
        fileRef.current = file;
        setState({ status: "ready", file });
      })
      .catch((error: unknown) => {
        if (!active || (error as { name?: string } | null)?.name === "AbortError") return;
        const reason: BankReceiptOpenReason = error instanceof BankReceiptOpenError ? error.reason : "unknown";
        setState({ status: "error", reason, detail: error instanceof Error ? error.message : "" });
      });
    return () => {
      active = false;
      controller.abort();
      if (fileRef.current) { fileRef.current.release(); fileRef.current = null; }
    };
    // The reference, not the object: a re-render with the same row must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retryKey]);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onClose]);

  if (!request) return null;

  const file = state.status === "ready" ? state.file : null;
  const title = file?.name || request.name || t("Receipt");
  const zoom = ZOOM_STEPS[zoomIndex];
  const canZoom = file?.display === "image";
  const canOpenTab = file ? file.display === "image" || file.display === "pdf" : false;

  return (
    <div className="modal-backdrop bank-receipt-backdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="bank-receipt-viewer">
        <header className="bank-receipt-viewer-head">
          <div className="bank-receipt-viewer-title">
            <strong title={title}>{title}</strong>
            <small>
              {file ? [file.contentType, sizeLabel(file.size)].filter(Boolean).join(" · ") : state.status === "loading" ? t("Loading…") : ""}
              {file?.scan === "unscanned" ? ` · ${t("Uploaded before safety scanning")}` : ""}
            </small>
          </div>
          <div className="bank-receipt-viewer-actions">
            {canZoom ? (
              <>
                <button type="button" className="bank-receipt-btn" aria-label={t("Zoom out")} disabled={zoomIndex === 0} onClick={() => { setFit(false); setZoomIndex((index) => Math.max(0, index - 1)); }}>−</button>
                <button type="button" className="bank-receipt-btn" onClick={() => { setFit((value) => !value); setZoomIndex(2); }} aria-pressed={fit}>{fit ? `${Math.round(zoom * 100)}%` : t("Fit")}</button>
                <button type="button" className="bank-receipt-btn" aria-label={t("Zoom in")} disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => { setFit(false); setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1)); }}>+</button>
              </>
            ) : null}
            {file ? <button type="button" className="bank-receipt-btn" onClick={() => downloadOpenedBankReceipt(file)}>⤓ {t("Download")}</button> : null}
            {file && canOpenTab ? <button type="button" className="bank-receipt-btn" onClick={() => window.open(file.objectUrl, "_blank", "noopener")}>↗ {t("Open in new tab")}</button> : null}
            <button type="button" className="bank-receipt-btn bank-receipt-close" onClick={onClose} aria-label={t("Close")}>✕</button>
          </div>
        </header>

        <div className={`bank-receipt-viewer-body${file?.display === "image" && !fit ? " is-zoomed" : ""}`}>
          {state.status === "loading" ? (
            <div className="bank-receipt-viewer-note" aria-live="polite">
              <span className="bank-receipt-spinner" aria-hidden="true" />
              {t("Loading receipt…")}
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="bank-receipt-viewer-note is-error" role="alert">
              <strong>{bankReceiptErrorText(state.reason, t)}</strong>
              {state.reason === "scanning" || state.reason === "network" || state.reason === "unknown" ? (
                <button type="button" className="bank-receipt-btn" onClick={() => setRetryKey((key) => key + 1)}>{t("Try again")}</button>
              ) : null}
            </div>
          ) : null}

          {file?.display === "image" ? (
            <div className="bank-receipt-image-stage" onDoubleClick={() => { setFit((value) => !value); setZoomIndex(fit ? 4 : 2); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.objectUrl}
                alt={file.name}
                draggable={false}
                style={fit ? { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" } : { transform: `scale(${zoom})`, transformOrigin: "top left", maxWidth: "none" }}
              />
            </div>
          ) : null}

          {file?.display === "pdf" ? (
            <iframe className="bank-receipt-frame" src={`${file.objectUrl}#toolbar=1&view=FitH`} title={file.name} />
          ) : null}

          {file?.display === "text" ? (
            // An email saved as a receipt. Sandboxed with no permissions: the
            // frame gets an opaque origin, no script runs, nothing can reach
            // this page or the app's storage.
            <iframe className="bank-receipt-frame" sandbox="" src={file.objectUrl} title={file.name} referrerPolicy="no-referrer" />
          ) : null}

          {file?.display === "download" ? (
            <div className="bank-receipt-viewer-note">
              <strong>{t("This file type cannot be previewed here.")}</strong>
              <span>{[file.contentType, sizeLabel(file.size)].filter(Boolean).join(" · ")}</span>
              <button type="button" className="bank-receipt-btn is-primary" onClick={() => downloadOpenedBankReceipt(file)}>⤓ {t("Download")}</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default BankReceiptViewer;
