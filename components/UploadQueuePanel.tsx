"use client";

// One row per file being uploaded: the stage, the measured percentage and
// bytes while the transfer runs, and the per-file controls (cancel, retry,
// remove). Shared by the Files page, the order's Client Files card and the
// file library. Styles: .upload-queue* in globals.css.

import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  isUploadActive,
  summarizeUploadQueue,
  uploadBytesLabel,
  uploadPercent,
  uploadStageLabel,
  type UploadQueueItem
} from "@/lib/studioflow/uploadProgress";

export function UploadQueuePanel({
  items,
  onCancel,
  onRetry,
  onRemove,
  onClearFinished
}: {
  items: UploadQueueItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  if (items.length === 0) return null;
  const summary = summarizeUploadQueue(items);

  return (
    <div className="upload-queue" aria-live="polite">
      <div className="upload-queue-head">
        <strong>{t("Uploads")} · {summary.done}/{summary.total}</strong>
        {summary.done + summary.cancelled > 0 ? (
          <button type="button" className="upload-queue-link" onClick={onClearFinished}>{t("Clear finished")}</button>
        ) : null}
      </div>
      <ul className="upload-queue-list">
        {items.map(item => {
          const percent = uploadPercent(item);
          const active = isUploadActive(item);
          const stageClass = item.stage === "error" ? "is-error" : item.stage === "done" ? "is-done" : item.stage === "cancelled" ? "is-cancelled" : "is-active";
          return (
            <li key={item.id} className={`upload-queue-item ${stageClass}`}>
              <div className="upload-queue-row">
                <span className="upload-queue-name" title={item.fileName}>{item.fileName}</span>
                <span className="upload-queue-meta">
                  {percent !== null && item.stage === "uploading" ? <b>{percent}%</b> : null}
                  <span>{uploadBytesLabel(item)}</span>
                </span>
              </div>
              <div className="upload-queue-row">
                <span className={`upload-queue-stage ${item.paused ? "is-paused" : ""}`}>
                  {active && item.stage !== "uploading" ? <span className="upload-queue-dot" aria-hidden="true" /> : null}
                  {t(uploadStageLabel(item))}
                  {item.attempt > 1 && active ? ` · ${t("Retry")} ${item.attempt - 1}` : ""}
                </span>
                <span className="upload-queue-actions">
                  {item.stage === "queued" || item.stage === "preparing" || item.stage === "uploading" ? (
                    <button type="button" className="upload-queue-link" onClick={() => onCancel(item.id)}>{t("Cancel")}</button>
                  ) : null}
                  {(item.stage === "error" || item.stage === "cancelled") && item.retryable ? (
                    <button type="button" className="upload-queue-link" onClick={() => onRetry(item.id)}>{t("Retry")}</button>
                  ) : null}
                  {!active ? (
                    <button type="button" className="upload-queue-link" onClick={() => onRemove(item.id)}>{t("Remove")}</button>
                  ) : null}
                </span>
              </div>
              {item.stage === "uploading" && percent !== null ? (
                <div className="progress-track upload-queue-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <div className="progress-fill" style={{ width: `${percent}%` }} />
                </div>
              ) : null}
              {item.stage === "error" && item.error ? <p className="upload-queue-error">{t(item.error)}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
