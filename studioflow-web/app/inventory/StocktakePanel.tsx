"use client";

// Stocktake: walking the shelves with a clipboard.
//
// The system says 200 spring bars; you count 187. The thirteen are the point —
// breakage, a part used without being logged, a miscount last year. Typing 187
// over the number answers the question and destroys it, so a count is kept as a
// record: what was expected, what was found, when, and by whom.
//
// A count is also an afternoon, not a click. Counts are saved as they are made
// and nothing touches the shelf until the whole thing is committed.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  INVENTORY_CATEGORIES,
  cancelStocktake,
  commitStocktake,
  getStocktake,
  listStocktakes,
  saveStocktakeCounts,
  startStocktake,
  type OverPromised,
  type Stocktake,
  type StocktakeSummary
} from "@/lib/studioflow/inventory";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

function money(symbol: string, value: number) {
  const formatted = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  return `${value < 0 ? "−" : ""}${symbol}${formatted}`;
}

function day(ms: number) {
  return ms > 0 ? new Date(ms).toLocaleDateString() : "—";
}

export function StocktakePanel({
  workspace,
  currencySymbol,
  canEdit,
  onStockChanged
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  canEdit: boolean;
  onStockChanged: () => void;
}) {
  const { language } = useAuth();
  // Stable across renders: an inline arrow here is a new function every time,
  // and putting that in a useCallback's dependencies turns a load into an
  // infinite loop of requests.
  const t = useCallback((text: string) => studioT(text, language), [language]);

  const [list, setList] = useState<StocktakeSummary[]>([]);
  const [open, setOpen] = useState<Stocktake | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [startCategory, setStartCategory] = useState("");
  const [result, setResult] = useState<{ adjusted: number; valueDelta: number; overPromised: OverPromised[] } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await listStocktakes(workspace))?.stocktakes ?? [];
      setList(rows);
      const running = rows.find(row => row.status === "open");
      if (running) {
        const full = (await getStocktake(workspace, running.id))?.stocktake ?? null;
        setOpen(full);
        setCounts(Object.fromEntries(
          (full?.lines ?? [])
            .filter(line => line.counted !== null)
            .map(line => [line.itemId, String(line.counted)])
        ));
      } else {
        setOpen(null);
        setCounts({});
      }
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The counts could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspace, t]);

  useEffect(() => { void reload(); }, [reload]);

  const lines = open?.lines ?? [];
  const countedLines = lines.filter(line => (counts[line.itemId] ?? "").trim() !== "");
  const differences = countedLines.filter(
    line => Number(counts[line.itemId]) !== line.expected
  );
  const valueDelta = differences.reduce(
    (sum, line) => sum + (Number(counts[line.itemId]) - line.expected) * line.unitCost, 0);

  async function begin() {
    setBusy(true);
    setError("");
    try {
      await startStocktake(workspace, { location: startLocation, category: startCategory });
      await reload();
      setResult(null);
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The count could not be started."));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!open) return;
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, number | null> = {};
      lines.forEach(line => {
        const raw = (counts[line.itemId] ?? "").trim();
        payload[line.itemId] = raw === "" ? null : Number(raw);
      });
      await saveStocktakeCounts(workspace, open.id, payload);
      setNotice(t("Counts saved. Nothing has changed on the shelf yet."));
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The counts could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!open) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Save first: what is committed must be what is on screen.
      const payload: Record<string, number | null> = {};
      lines.forEach(line => {
        const raw = (counts[line.itemId] ?? "").trim();
        payload[line.itemId] = raw === "" ? null : Number(raw);
      });
      await saveStocktakeCounts(workspace, open.id, payload);
      const outcome = await commitStocktake(workspace, open.id);
      setResult({
        adjusted: Number(outcome?.adjusted) || 0,
        valueDelta: Number(outcome?.valueDelta) || 0,
        overPromised: outcome?.overPromised ?? []
      });
      await reload();
      onStockChanged();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The count could not be applied."));
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (!open) return;
    if (!window.confirm(t("Abandon this count? Nothing on the shelf will change."))) return;
    setBusy(true);
    try {
      await cancelStocktake(workspace, open.id);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The count could not be cancelled."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inventory-panel">
      <div className="inventory-head">
        <div>
          <h2>{t("Stocktake")}</h2>
          <p className="inventory-panel-hint">
            {t("Count what is actually on the shelf. The difference is the point — nothing is changed until you apply it.")}
          </p>
        </div>
      </div>

      {notice ? <p className="inventory-note">{notice}</p> : null}
      {error ? <p className="inventory-notice">{error}</p> : null}

      {result ? (
        <div className="inventory-totals">
          <div>
            <span>{t("Lines adjusted")}</span>
            <strong>{result.adjusted}</strong>
          </div>
          <div className="inventory-totals-final">
            <span>{t("Change in stock value")}</span>
            <strong>{money(currencySymbol, result.valueDelta)}</strong>
          </div>
          {result.overPromised.length > 0 ? (
            <ul className="inventory-skip-list">
              {result.overPromised.map(row => (
                <li key={row.itemId}>
                  <strong>{row.name}</strong>
                  <span className="inventory-sub">
                    {t("Counted")} {row.counted}, {t("but orders are holding")} {row.reserved}
                    {row.orderIds.length > 0 ? ` · ${row.orderIds.join(", ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="inventory-note">{t("Loading…")}</p>
      ) : open ? (
        <>
          <div className="inventory-stats inventory-stats-slim">
            <div className="inventory-stat">
              <span className="inventory-stat-label">{t("Counted")}</span>
              <strong>{countedLines.length} / {lines.length}</strong>
            </div>
            <div className="inventory-stat" data-tone={differences.length > 0 ? "warn" : undefined}>
              <span className="inventory-stat-label">{t("Differences")}</span>
              <strong>{differences.length}</strong>
            </div>
            <div className="inventory-stat" data-tone="accent">
              <span className="inventory-stat-label">{t("Change in stock value")}</span>
              <strong>{money(currencySymbol, valueDelta)}</strong>
            </div>
          </div>

          <div className="inventory-table-wrap">
            <table className="inventory-table inventory-table-compact">
              <thead>
                <tr>
                  <th>{t("Item")}</th>
                  <th>{t("Location")}</th>
                  <th className="r">{t("Expected")}</th>
                  <th className="r">{t("Counted")}</th>
                  <th className="r">{t("Difference")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => {
                  const raw = (counts[line.itemId] ?? "").trim();
                  const counted = raw === "" ? null : Number(raw);
                  const diff = counted === null ? null : counted - line.expected;
                  return (
                    <tr key={line.itemId}>
                      <td>
                        <strong>{line.name}</strong>
                        <span className="inventory-sub">{line.number}</span>
                      </td>
                      <td>{line.location || "—"}</td>
                      <td className="r">
                        {line.expected}{line.unit ? ` ${line.unit}` : ""}
                      </td>
                      <td className="r">
                        <input
                          className="input inventory-qty-input"
                          inputMode="decimal"
                          disabled={!canEdit}
                          value={counts[line.itemId] ?? ""}
                          placeholder="—"
                          onChange={event => setCounts(current => ({
                            ...current, [line.itemId]: event.target.value
                          }))}
                        />
                      </td>
                      <td className="r">
                        {diff === null ? (
                          <span className="inventory-sub">{t("Not counted")}</span>
                        ) : diff === 0 ? (
                          <span className="inventory-sub">—</span>
                        ) : (
                          <strong className={diff < 0 ? "inventory-diff-down" : "inventory-diff-up"}>
                            {diff > 0 ? "+" : ""}{diff}
                          </strong>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <div className="inventory-modal-foot">
              <button type="button" className="inventory-link inventory-link-danger" disabled={busy} onClick={() => void abandon()}>
                {t("Abandon this count")}
              </button>
              <div className="inventory-modal-actions">
                <button type="button" className="inventory-secondary" disabled={busy} onClick={() => void save()}>
                  {t("Save progress")}
                </button>
                <button
                  type="button"
                  className="inventory-primary"
                  disabled={busy || countedLines.length === 0}
                  onClick={() => void apply()}
                >
                  {busy ? t("Applying…") : `${t("Apply")} ${differences.length} ${t("differences")}`}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {canEdit ? (
            <div className="inventory-section">
              <h3>{t("Start a count")}</h3>
              <p className="inventory-hint">
                {t("Nobody counts a whole workshop at once. Narrow it to a shelf or a category and the expected figures are frozen as you start.")}
              </p>
              <div className="inventory-form">
                <label className="inventory-field">
                  <span>{t("Location")}</span>
                  <input className="input" value={startLocation} placeholder={t("Everything")}
                    onChange={event => setStartLocation(event.target.value)} />
                </label>
                <label className="inventory-field">
                  <span>{t("Category")}</span>
                  <select className="input" value={startCategory} onChange={e => setStartCategory(e.target.value)}>
                    <option value="">{t("All Categories")}</option>
                    {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" className="inventory-primary" disabled={busy} onClick={() => void begin()}>
                {busy ? t("Starting…") : t("Start a count")}
              </button>
            </div>
          ) : null}

          {list.length === 0 ? (
            <div className="inventory-empty">
              <strong>{t("No counts yet")}</strong>
              <p>{t("A count tells you what is really there. The first one usually finds something.")}</p>
            </div>
          ) : (
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>{t("Count")}</th><th>{t("Started")}</th><th>{t("By")}</th>
                    <th className="r">{t("Lines")}</th><th className="r">{t("Adjusted")}</th>
                    <th className="r">{t("Change in stock value")}</th><th>{t("Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(row => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.number}</strong>
                        {row.location || row.category ? (
                          <span className="inventory-sub">
                            {[row.location, row.category].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </td>
                      <td>{day(row.startedAtMs)}</td>
                      <td>{row.startedByEmail || "—"}</td>
                      <td className="r">{row.countedCount} / {row.lineCount}</td>
                      <td className="r">{row.status === "committed" ? row.adjustedLines : "—"}</td>
                      <td className="r">
                        {row.status === "committed" ? money(currencySymbol, row.valueDelta) : "—"}
                      </td>
                      <td>
                        <span className="inventory-chip"
                          data-status={row.status === "committed" ? "available" : row.status === "open" ? "incoming" : undefined}>
                          {row.status === "committed" ? t("Applied")
                            : row.status === "open" ? t("In progress") : t("Abandoned")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
