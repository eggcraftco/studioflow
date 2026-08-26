"use client";

// Valuation and reporting.
//
// Two different questions, answered from two different places, and the
// difference matters.
//
// "What is my stock worth" comes off the shelf: every item, at what it cost.
// That is the figure an accountant asks for at year end.
//
// "What happened to my stock" can only come from the movement ledger, and only
// for the time the ledger has existed. A workspace that started keeping
// inventory last week cannot be told what moved last year — and saying so is
// the difference between "nothing moved" and "we were not watching yet".

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  getInventoryReport,
  type InventoryReport,
  type MovementKind
} from "@/lib/studioflow/inventory";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

const KIND_LABEL: Record<MovementKind, string> = {
  openingStock: "Opening stock",
  purchase: "Purchases received",
  adjustment: "Corrected by hand",
  stocktake: "Stocktake",
  used: "Used on jobs",
  sold: "Sold",
  removed: "Removed",
  moved: "Moved"
};

const RANGES: Array<{ key: string; label: string; days: number }> = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 }
];

function money(symbol: string, value: number) {
  const formatted = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  return `${value < 0 ? "−" : ""}${symbol}${formatted}`;
}

export function ReportsPanel({
  workspace,
  currencySymbol
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
}) {
  const { language } = useAuth();
  // Stable across renders: an inline arrow here is a new function every time,
  // and putting that in a useCallback's dependencies turns a load into an
  // infinite loop of requests.
  const t = useCallback((text: string) => studioT(text, language), [language]);

  const [range, setRange] = useState("30");
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const days = RANGES.find(entry => entry.key === range)?.days ?? 30;
      const toMs = Date.now();
      const result = await getInventoryReport(workspace, {
        fromMs: toMs - days * 86400000, toMs
      });
      setReport(result ?? null);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The report could not be built."));
    } finally {
      setLoading(false);
    }
  }, [workspace, range, t]);

  useEffect(() => { void reload(); }, [reload]);

  const widest = useMemo(
    () => Math.max(1, ...(report?.valuation.byCategory ?? []).map(row => row.value)),
    [report]
  );

  if (loading && !report) {
    return <div className="inventory-panel"><p className="inventory-note">{t("Loading…")}</p></div>;
  }

  return (
    <div className="inventory-panel">
      <div className="inventory-head">
        <div>
          <h2>{t("Reports")}</h2>
          <p className="inventory-panel-hint">
            {t("What the stock is worth today, and what has moved.")}
          </p>
        </div>
      </div>

      {error ? <p className="inventory-notice">{error}</p> : null}

      {report ? (
        <>
          <div className="inventory-stats">
            <div className="inventory-stat" data-tone="accent">
              <span className="inventory-stat-label">{t("Stock on the shelf")}</span>
              <strong>{money(currencySymbol, report.valuation.totalValue)}</strong>
              <span className="inventory-stat-sub">
                {report.valuation.onShelfCount} {t("items")}
              </span>
            </div>
            <div className="inventory-stat">
              <span className="inventory-stat-label">{t("Came in")}</span>
              <strong>{money(currencySymbol, report.movement.inValue)}</strong>
            </div>
            <div className="inventory-stat">
              <span className="inventory-stat-label">{t("Went out")}</span>
              <strong>{money(currencySymbol, report.movement.outValue)}</strong>
            </div>
            <div className="inventory-stat" data-tone={report.lowStock.length > 0 ? "warn" : undefined}>
              <span className="inventory-stat-label">{t("Low Stock")}</span>
              <strong>{report.lowStock.length}</strong>
            </div>
          </div>

          <div className="inventory-tabs" role="tablist">
            {RANGES.map(entry => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={range === entry.key}
                data-active={range === entry.key}
                onClick={() => setRange(entry.key)}
              >
                {t(entry.label)}
              </button>
            ))}
          </div>

          {!report.movement.coversWholePeriod ? (
            <p className="inventory-hint">
              {report.movement.ledgerStartsMs > 0
                ? `${t("Movements are only recorded from")} ${new Date(report.movement.ledgerStartsMs).toLocaleDateString()}. ${t("Anything before that is not missing — it was never watched.")}`
                : t("No movements have been recorded yet. They start the first time stock changes.")}
            </p>
          ) : null}

          <div className="inventory-report-grid">
            <div className="inventory-section">
              <h3>{t("What it is worth, by category")}</h3>
              {report.valuation.byCategory.length === 0 ? (
                <p className="inventory-note">{t("Nothing on the shelf.")}</p>
              ) : (
                <ul className="inventory-bar-list">
                  {report.valuation.byCategory.map(row => (
                    <li key={row.name}>
                      <span className="inventory-bar-label">{t(row.name)}</span>
                      <span className="inventory-bar-track">
                        <span className="inventory-bar-fill" style={{ width: `${(row.value / widest) * 100}%` }} />
                      </span>
                      <span className="inventory-bar-value">{money(currencySymbol, row.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="inventory-section">
              <h3>{t("What moved")}</h3>
              {report.movement.byKind.length === 0 ? (
                <p className="inventory-note">{t("Nothing moved in this period.")}</p>
              ) : (
                <ul className="inventory-bar-list">
                  {report.movement.byKind.map(row => (
                    <li key={row.kind}>
                      <span className="inventory-bar-label">{t(KIND_LABEL[row.kind] ?? row.kind)}</span>
                      <span className="inventory-bar-value">
                        {/* English needs the plural; Turkish and Japanese do not
                            pluralise after a number, and both keys translate to
                            the same word there. */}
                        {row.lines} {row.lines === 1 ? t("line") : t("lines")} · {money(currencySymbol, row.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {report.movement.truncated ? (
                <p className="inventory-sub">
                  {t("Only the most recent 3,000 movements are counted in this period.")}
                </p>
              ) : null}
            </div>
          </div>

          {report.lowStock.length > 0 ? (
            <div className="inventory-section">
              <h3>{t("Running low")}</h3>
              <div className="inventory-table-wrap">
                <table className="inventory-table inventory-table-compact">
                  <thead>
                    <tr>
                      <th>{t("Item")}</th><th className="r">{t("On hand")}</th>
                      <th className="r">{t("Reorder at")}</th><th>{t("Supplier")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lowStock.map(row => (
                      <tr key={row.itemId}>
                        <td><strong>{row.name}</strong><span className="inventory-sub">{row.number}</span></td>
                        <td className="r">{row.onHand}{row.unit ? ` ${row.unit}` : ""}</td>
                        <td className="r">{row.lowStockAt}</td>
                        <td>{row.supplierName || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {report.deadStock.length > 0 ? (
            <div className="inventory-section">
              <h3>{t("Money sitting still")}</h3>
              <p className="inventory-hint">
                {`${t("Nothing has happened to these for")} ${report.deadStockAfterDays} ${t("days or more.")}`}
              </p>
              <div className="inventory-table-wrap">
                <table className="inventory-table inventory-table-compact">
                  <thead>
                    <tr>
                      <th>{t("Item")}</th><th>{t("Category")}</th>
                      <th className="r">{t("Idle")}</th><th className="r">{t("Value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.deadStock.map(row => (
                      <tr key={row.itemId}>
                        <td><strong>{row.name}</strong><span className="inventory-sub">{row.number}</span></td>
                        <td>{t(row.category)}</td>
                        <td className="r">{row.idleDays} {t("days")}</td>
                        <td className="r">{money(currencySymbol, row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
