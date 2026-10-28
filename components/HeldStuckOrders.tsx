"use client";

// Stuck store orders inside the "store orders are waiting" banner (capacity
// stage 1, CAP-K12 candidate). Renders nothing unless the server marked a row
// stuck — so against today's live list (no queueState) it is invisible.

import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import {
  canRetryStuckOrders,
  stuckHeldCount,
  stuckHeldRows,
  stuckProviderLabel,
  stuckReasonDetail,
  stuckReasonSentence,
  type HeldQueueList
} from "@/lib/studioflow/heldQueue";

export function HeldStuckOrders({
  list,
  role,
  language,
  busy,
  onRetry
}: {
  list: HeldQueueList | null | undefined;
  role: string | null | undefined;
  language: string | null | undefined;
  busy: boolean;
  onRetry: (ids: string[]) => void;
}) {
  const rows = stuckHeldRows(list);
  if (rows.length === 0) return null;
  const t = (text: string) => studioT(text, language);
  const total = stuckHeldCount(list);
  const canRetry = canRetryStuckOrders(role);
  const when = (ms: number | null | undefined) => {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "—";
    try {
      return new Intl.DateTimeFormat(studioLocaleTag(language), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(n));
    } catch {
      return new Date(n).toISOString().slice(0, 16).replace("T", " ");
    }
  };

  return (
    <div className="orders-held-stuck" data-testid="held-stuck">
      <strong>
        {total === 1 ? t("1 store order is stuck") : t("{count} store orders are stuck").replace("{count}", String(total))}
      </strong>
      <span>
        {t("These orders failed to import several times. They are kept safe and nothing is deleted, but they no longer hold the queue: the orders behind them can be imported.")}
      </span>
      <ul>
        {rows.map(row => {
          const detail = stuckReasonDetail(row.stuckReason);
          return (
            <li key={row.id} data-testid={`held-stuck-row-${row.id}`}>
              <div className="orders-held-stuck-title">
                <b>{t(stuckProviderLabel(row.provider))}</b>
                {row.externalId ? <span>#{row.externalId}</span> : null}
              </div>
              <p>{t(stuckReasonSentence(row.stuckReason))}</p>
              <small>
                {t("Waiting since")} {when(row.heldAtMs)} · {t("Stuck since")} {when(row.stuckAtMs)}
                {Number(row.failedImports) > 0 ? ` · ${t("Failed imports")}: ${Number(row.failedImports)}` : ""}
              </small>
              {detail ? <small className="orders-held-stuck-detail" title={detail}>{t("Details")}: {detail}</small> : null}
              {canRetry ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  data-testid={`held-stuck-retry-${row.id}`}
                  disabled={busy}
                  onClick={() => onRetry([row.id])}
                >
                  {t("Try again")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <span>
        {canRetry
          ? t("Try again puts the order back in its old place in the queue and imports it when there is room. If it fails again, it is marked stuck again straight away.")
          : t("Only the workspace owner or an admin can try a stuck order again.")}
      </span>
    </div>
  );
}
