"use client";

// The Preview as a list to choose from (1 Oct 2026). Preview writes nothing; this
// list shows what it found — the eBay order number, the date, the amount and the
// order's states, never the buyer — and imports only the rows the owner ticks.
// An order already in NivaDesk is shown but cannot be ticked: it keeps updating
// by itself. Everything the server says about the choice comes back as counts.
import { useMemo, useState } from "react";
import { importChosenEbayOrders, refreshEbayOrderByEbayId, ebaySyncT } from "@/lib/studioflow/ebaySync";
import { ebayCallableErrorText } from "@/lib/studioflow/ebayScreenRules";
import {
  chosenInOrder, fillCounts, landedIds, previewOmittedOf, previewRowsOf, refreshOutcomeSentence, rowStatusWords, selectableIds, toggleChosen,
  type EbayChosenImportResult, type EbayPreviewRow
} from "@/lib/studioflow/ebaySyncRules";

type Props = {
  companyId: string;
  connectionId: string;
  preview: unknown;
  includeUnpaid: boolean;
  includeCancelled: boolean;
  language: string;
  disabled?: boolean;
  onImported?: (result: EbayChosenImportResult) => void | Promise<void>;
};

function shortDate(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : "—";
}

export function EbayPreviewList({ companyId, connectionId, preview, includeUnpaid, includeCancelled, language, disabled = false, onImported }: Props) {
  const t = (sentence: string) => ebaySyncT(sentence, language);
  const initialRows = useMemo(() => previewRowsOf(preview), [preview]);
  const [landed, setLanded] = useState<string[]>([]);
  const rows: EbayPreviewRow[] = useMemo(
    () => initialRows.map((row) => (landed.includes(row.orderId) ? { ...row, alreadyImported: true } : row)),
    [initialRows, landed]
  );
  const omitted = previewOmittedOf(preview);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EbayChosenImportResult | null>(null);
  // A row already in NivaDesk is not offered for import; it offers Refresh instead, which fetches it fresh and
  // applies NivaDesk's current mapping to it (the order keeps its place; nothing is created).
  const [refreshing, setRefreshing] = useState("");
  const [refreshed, setRefreshed] = useState<Record<string, string>>({});
  async function refreshRow(orderId: string) {
    setRefreshing(orderId);
    try {
      const answer = await refreshEbayOrderByEbayId(companyId, connectionId, orderId);
      setRefreshed((current) => ({ ...current, [orderId]: t(refreshOutcomeSentence(answer.result)) }));
    } catch (err) {
      setRefreshed((current) => ({ ...current, [orderId]: t(ebayCallableErrorText(err, "This order could not be refreshed.")) }));
    } finally {
      setRefreshing("");
    }
  }
  const choosable = selectableIds(rows);
  const picked = chosenInOrder(chosen, rows);

  async function importPicked() {
    if (!picked.length) { setError(t("Choose at least one order.")); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const answer = await importChosenEbayOrders(companyId, connectionId, picked, { includeUnpaid, includeCancelled });
      setResult(answer);
      setLanded((current) => [...current, ...landedIds(picked, answer)]);
      setChosen([]);
      if (onImported) await onImported(answer);
    } catch (err) {
      setError(t(ebayCallableErrorText(err, "Could not load.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ebay-preview-list" data-testid="ebay-preview-list" style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <h4 style={{ margin: 0 }}>{t("Choose the orders to bring in")}</h4>
      {rows.length === 0 ? (
        <p className="muted-copy">{t("No orders in this period.")}</p>
      ) : (
        <>
          <div className="settings-action-row" style={{ alignItems: "center" }}>
            <button type="button" className="button secondary" disabled={busy || disabled || choosable.length === 0}
              onClick={() => setChosen(choosable)}>{t("Select all")}</button>
            <button type="button" className="button secondary" disabled={busy || disabled || picked.length === 0}
              onClick={() => setChosen([])}>{t("Clear selection")}</button>
            <span className="muted-copy" data-testid="ebay-preview-count">{fillCounts(t("{count} selected"), { count: picked.length })}</span>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "start" }}>
                  <th style={{ padding: "8px 10px", width: 36 }} aria-label={t("Select all")} />
                  <th style={{ padding: "8px 10px", textAlign: "start" }}>{t("Order")}</th>
                  <th style={{ padding: "8px 10px", textAlign: "start" }}>{t("Date")}</th>
                  <th style={{ padding: "8px 10px", textAlign: "end" }}>{t("Amount")}</th>
                  <th style={{ padding: "8px 10px", textAlign: "start" }}>{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const canChoose = !row.alreadyImported;
                  const checked = canChoose && picked.includes(row.orderId);
                  return (
                    <tr key={row.orderId} data-order-id={row.orderId} style={{ borderTop: "1px solid var(--border)", opacity: canChoose ? 1 : 0.65 }}>
                      <td style={{ padding: "6px 10px" }}>
                        <input type="checkbox" aria-label={`${t("Order")} ${row.orderNumber}`} checked={checked} disabled={!canChoose || busy || disabled}
                          onChange={() => setChosen((current) => toggleChosen(current, row.orderId, rows))} />
                      </td>
                      <td style={{ padding: "6px 10px", fontVariantNumeric: "tabular-nums" }}>{row.orderNumber}</td>
                      <td style={{ padding: "6px 10px" }}>{shortDate(row.createdAt)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "end", fontVariantNumeric: "tabular-nums" }}>{row.total ? `${row.total} ${row.currency}`.trim() : "—"}</td>
                      <td style={{ padding: "6px 10px" }}>
                        {rowStatusWords(row).map((word) => t(word)).join(" · ")}
                        {row.alreadyImported ? (
                          <>
                            {" "}
                            <button type="button" className="link-button" data-testid="ebay-preview-refresh" disabled={busy || disabled || refreshing === row.orderId}
                              onClick={() => void refreshRow(row.orderId)}>
                              {refreshing === row.orderId ? t("Refreshing…") : t("Refresh from eBay")}
                            </button>
                            {refreshed[row.orderId] ? <span className="muted-copy" data-testid="ebay-preview-refresh-result"> · {refreshed[row.orderId]}</span> : null}
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {omitted > 0 ? <p className="muted-copy">{fillCounts(t("{count} more orders are not listed. Choose a shorter period to see them."), { count: omitted })}</p> : null}
          <div className="settings-action-row">
            <button type="button" className="button" data-testid="ebay-import-selected" disabled={busy || disabled || picked.length === 0} onClick={() => void importPicked()}>
              {busy ? t("Importing…") : t("Import selected")}
            </button>
          </div>
        </>
      )}
      {error ? <p className="layout-error">{error}</p> : null}
      {result ? (
        <p className="success-copy" data-testid="ebay-import-selected-result">
          {fillCounts(t("Imported {created} · Updated {updated} · Already here {noop} · Skipped {skipped} · Failed {failed}"), {
            created: result.outcome.created, updated: result.outcome.updated, noop: result.outcome.noop, skipped: result.outcome.skipped, failed: result.outcome.failed + result.outcome.held
          })}
          {result.notFound.length ? ` · ${fillCounts(t("{count} chosen orders were not found on eBay."), { count: result.notFound.length })}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export default EbayPreviewList;
