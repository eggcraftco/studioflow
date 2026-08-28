"use client";

// Opening stock: how a workshop that already owns two hundred things starts
// using inventory today.
//
// The whole design turns on one idea — an import you cannot see before it
// happens is worse than typing. Two hundred wrong rows take an afternoon to
// undo; five right ones take a minute to type. So nothing is written until the
// person has seen exactly what will be created, and every row that will be
// skipped says so and why.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivateMoney } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  OPENING_STOCK_FIELDS,
  OPENING_STOCK_MAX_ROWS,
  importOpeningStock,
  readOpeningStock,
  type ImportDuplicatePolicy,
  type OpeningStockPreviewItem,
  type OpeningStockSkip,
  type InventoryTrackingType,
  type OpeningStockFieldKey
} from "@/lib/studioflow/inventory";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

type Mapping = Array<OpeningStockFieldKey | "">;

const SAMPLE = `Name\tType\tCategory\tOn hand\tUnit\tPurchase price\tLocation
Rolex 1601 silver dial\tunique\tDials\t1\t\t2300\tSafe A
Dial feet solder\tquantity\tConsumables\t20\tpcs\t5\tDrawer 3`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function OpeningStockModal({
  workspace,
  currencySymbol,
  onClose,
  onImported
}: {
  workspace: WorkspaceContext;
  currencySymbol: string;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const money = usePrivateMoney();
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [raw, setRaw] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [defaultType, setDefaultType] = useState<InventoryTrackingType>("quantity");
  // A real list is mixed: a serialled dial sits next to a tub of solder. The
  // default answers most rows; this holds the ones the person corrects, keyed
  // by their position in the paste so it survives a remap.
  const [typeOverrides, setTypeOverrides] = useState<Record<number, InventoryTrackingType>>({});
  const [openingDate, setOpeningDate] = useState(today());
  const [duplicatePolicy, setDuplicatePolicy] = useState<ImportDuplicatePolicy>("skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Everything the preview shows comes back from the server: the split, the
  // header guess, the built items and the reasons a row is skipped. Debounced,
  // because a paste is one deliberate act and a remap is another.
  const [read, setRead] = useState<{
    grid: string[][];
    mapping: Mapping;
    items: OpeningStockPreviewItem[];
    skipped: OpeningStockSkip[];
    maxRows: number;
  } | null>(null);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (!raw.trim()) { setRead(null); return; }
    let cancelled = false;
    setParsing(true);
    const timer = setTimeout(async () => {
      try {
        const result = await readOpeningStock(workspace, {
          text: raw, hasHeader, defaultType, typeOverrides,
          mapping: mapping.length > 0 ? mapping : undefined
        });
        if (cancelled) return;
        setRead({
          grid: result?.grid ?? [],
          mapping: (result?.mapping ?? []) as Mapping,
          items: result?.items ?? [],
          skipped: result?.skipped ?? [],
          maxRows: Number(result?.maxRows) || OPENING_STOCK_MAX_ROWS
        });
        setError("");
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? t(failure.message) : t("That list could not be read."));
      } finally {
        if (!cancelled) setParsing(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, hasHeader, defaultType, typeOverrides, mapping, workspace]);

  const grid = read?.grid ?? [];
  const headerCells = hasHeader && grid.length > 0 ? grid[0] : [];
  const bodyRows = hasHeader ? grid.slice(1) : grid;
  const effectiveMapping: Mapping = read?.mapping ?? [];

  function setColumn(index: number, key: OpeningStockFieldKey | "") {
    const next = [...effectiveMapping];
    // One field, one column: taking it from another leaves that one unmapped.
    if (key) next.forEach((existing, position) => {
      if (existing === key && position !== index) next[position] = "";
    });
    next[index] = key;
    setMapping(next);
  }

  const nameColumn = effectiveMapping.indexOf("name");

  const usable = read?.items ?? [];
  const skipped = read?.skipped ?? [];
  const maxRows = read?.maxRows ?? OPENING_STOCK_MAX_ROWS;
  const overflow = Math.max(0, usable.length - maxRows);
  const willImport = usable.slice(0, maxRows);
  const duplicates = willImport.filter(item => item.existingItemId).length;
  // The server works out what each line is worth; adding it up here from the
  // parts would be a second opinion nobody asked for.
  const totalValue = willImport.reduce((sum, item) => sum + (item.lineValue || 0), 0);

  const skipReasonText = (reason: OpeningStockSkip["reason"]) =>
    reason === "noName"
      ? t("No name — this row cannot become an item.")
      : t("No amount on hand — a counted item needs one.");

  async function readFile(file: File) {
    setError("");
    try {
      setRaw(await file.text());
      setMapping([]);
      setTypeOverrides({});
    } catch {
      setError(t("That file could not be read."));
    }
  }

  async function submit() {
    if (willImport.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await importOpeningStock(
        workspace,
        willImport,
        openingDate,
        duplicates > 0 ? duplicatePolicy : undefined
      );
      onImported((Number(result?.imported) || 0) + (Number(result?.updated) || 0));
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("The opening stock could not be imported."));
      setBusy(false);
    }
  }

  return (
    <div className="inventory-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inventory-modal inventory-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label={t("Import opening stock")}
        onClick={event => event.stopPropagation()}
      >
        <div className="inventory-modal-head">
          <h2>{t("Import opening stock")}</h2>
          <button type="button" className="inventory-modal-close" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>

        <div className="inventory-modal-body">
          <p className="inventory-hint">
            {t("Paste straight from a spreadsheet, or choose a CSV file. Nothing is created until you have seen the preview below.")}
          </p>

          <div className="inventory-section">
            <div className="inventory-section-head">
              <h3>{t("Your list")}</h3>
              <div className="inventory-inline-actions">
                <button type="button" className="inventory-link" onClick={() => fileInput.current?.click()}>
                  {t("Choose a CSV file")}
                </button>
                <button type="button" className="inventory-link" onClick={() => { setRaw(SAMPLE); setMapping([]); }}>
                  {t("Use an example")}
                </button>
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="inventory-file-input"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
            <textarea
              className="input inventory-paste"
              rows={6}
              value={raw}
              onChange={event => { setRaw(event.target.value); setMapping([]); setTypeOverrides({}); }}
              // Sample data, not UI text. The header aliases the mapper knows are
              // English, so a translated sample would map to nothing if copied.
              placeholder={"Name\tOn hand\tPurchase price\nDial blank\t40\t2.25"}
            />
            {parsing ? <p className="inventory-sub">{t("Reading your list…")}</p> : null}
            {grid.length > 0 ? (
              <label className="inventory-ownership">
                <input type="checkbox" checked={hasHeader} onChange={e => { setHasHeader(e.target.checked); setMapping([]); }} />
                <span>{t("The first row is a header, not an item.")}</span>
              </label>
            ) : null}
          </div>

          {grid.length > 0 ? (
            <div className="inventory-section">
              <h3>{t("Which column is what")}</h3>
              <div className="inventory-map-grid">
                {(grid[0] ?? []).map((_, index) => (
                  <label className="inventory-field" key={index}>
                    <span>{hasHeader ? (headerCells[index] || `#${index + 1}`) : `${t("Column")} ${index + 1}`}</span>
                    <select
                      className="input"
                      value={effectiveMapping[index] ?? ""}
                      onChange={event => setColumn(index, event.target.value as OpeningStockFieldKey | "")}
                    >
                      <option value="">{t("Ignore this column")}</option>
                      {OPENING_STOCK_FIELDS.map(field => (
                        <option key={field.key} value={field.key}>{t(field.label)}</option>
                      ))}
                    </select>
                    <span className="inventory-sub">{(bodyRows[0]?.[index] ?? "").slice(0, 24)}</span>
                  </label>
                ))}
              </div>
              {nameColumn < 0 ? (
                <p className="inventory-error">{t("Point one column at Name — an item without a name cannot exist.")}</p>
              ) : null}
            </div>
          ) : null}

          {nameColumn >= 0 ? (
            <>
              <div className="inventory-section">
                <h3>{t("How to treat these")}</h3>
                <div className="inventory-form">
                  <label className="inventory-field">
                    <span>{t("Rows without a type column are")}</span>
                    <select className="input" value={defaultType} onChange={e => setDefaultType(e.target.value as InventoryTrackingType)}>
                      <option value="quantity">{t("Quantity Items")}</option>
                      <option value="unique">{t("Unique Items")}</option>
                    </select>
                  </label>
                  <label className="inventory-field">
                    <span>{t("Opening date")}</span>
                    <input className="input" type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} />
                  </label>
                </div>
                <p className="inventory-hint">
                  {t("The opening date is when this stock is counted as being on the shelf. A row that carries its own purchase date keeps it.")}
                </p>
              </div>

              <div className="inventory-section">
                <div className="inventory-section-head">
                  <h3>{t("What will be created")}</h3>
                  <span className="inventory-sub">
                    {willImport.length} {t("items")}
                    {totalValue > 0 ? ` · ${money(currencySymbol, totalValue)}` : ""}
                  </span>
                </div>

                {willImport.length === 0 ? (
                  <p className="inventory-note">{t("Nothing here can be imported yet.")}</p>
                ) : (
                  <div className="inventory-table-wrap">
                    <table className="inventory-table inventory-table-compact">
                      <thead>
                        <tr>
                          <th>{t("Name")}</th><th>{t("Type")}</th><th>{t("Category")}</th>
                          <th className="r">{t("On hand")}</th><th className="r">{t("Purchase price")}</th>
                          <th>{t("Location")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {willImport.slice(0, 50).map((item, index) => (
                          <tr key={index}>
                            <td>
                              <strong>{item.name}</strong>
                              {item.existingItemId ? (
                                <span
                                  className="inventory-chip"
                                  data-status="incoming"
                                  title={`${t("Already on the shelf as")} ${item.existingNumber || ""}`}
                                >{t("Already in stock")}</span>
                              ) : null}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="inventory-chip inventory-chip-button"
                                title={t("Switch this row between Unique and Quantity")}
                                onClick={() => setTypeOverrides(current => ({
                                  ...current,
                                  [item.rowIndex]: item.trackingType === "unique" ? "quantity" : "unique"
                                }))}
                              >
                                {item.trackingType === "unique" ? t("Unique") : t("Quantity")}
                              </button>
                            </td>
                            <td>{t(item.category)}</td>
                            <td className="r">
                              {item.onHand}{item.unit ? ` ${item.unit}` : ""}
                            </td>
                            <td className="r">{money(currencySymbol, item.purchasePrice || 0)}</td>
                            <td>{item.location || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {willImport.length > 50 ? (
                  <p className="inventory-sub">
                    {t("Showing the first 50 of")} {willImport.length}.
                  </p>
                ) : null}
              </div>

              {duplicates > 0 ? (
                <div className="inventory-section">
                  <h3>{duplicates} {t("rows match stock you already have")}</h3>
                  <p className="inventory-hint">
                    {t("Matched by SKU or serial number. Choose what the import should do with them.")}
                  </p>
                  <div className="inventory-toggle inventory-toggle-small">
                    <button
                      type="button"
                      data-active={duplicatePolicy === "skip"}
                      onClick={() => setDuplicatePolicy("skip")}
                    >{t("Skip them")}</button>
                    <button
                      type="button"
                      data-active={duplicatePolicy === "update"}
                      onClick={() => setDuplicatePolicy("update")}
                    >{t("Update existing")}</button>
                    <button
                      type="button"
                      data-active={duplicatePolicy === "create"}
                      onClick={() => setDuplicatePolicy("create")}
                    >{t("Create anyway")}</button>
                  </div>
                  <p className="inventory-sub">
                    {duplicatePolicy === "update"
                      ? t("The sheet becomes the truth about what each item is; its number, status and reservations stay untouched.")
                      : duplicatePolicy === "skip"
                        ? t("Matched rows are left out; only new stock is created.")
                        : t("Every row becomes a new item, even the matched ones.")}
                  </p>
                </div>
              ) : null}

              {skipped.length > 0 ? (
                <div className="inventory-section">
                  <h3>{skipped.length} {t("rows will be skipped")}</h3>
                  <ul className="inventory-skip-list">
                    {skipped.slice(0, 8).map((row, index) => (
                      <li key={index}>
                        <strong>{row.name || t("(no name)")}</strong>
                        <span className="inventory-sub">{skipReasonText(row.reason)}</span>
                      </li>
                    ))}
                  </ul>
                  {skipped.length > 8 ? (
                    <p className="inventory-sub">{t("and")} {skipped.length - 8} {t("more")}.</p>
                  ) : null}
                </div>
              ) : null}

              {overflow > 0 ? (
                <p className="inventory-error">
                  {t("One import carries at most 500 items.")} {overflow} {t("rows past that will be left out — import them as a second batch.")}
                </p>
              ) : null}
            </>
          ) : null}

          {error ? <p className="inventory-error">{error}</p> : null}
        </div>

        <div className="inventory-modal-foot">
          <p className="inventory-hint">
            {t("Everything arrives as available stock, valued at what you paid.")}
          </p>
          <div className="inventory-modal-actions">
            <button type="button" className="inventory-secondary" onClick={onClose}>{t("Cancel")}</button>
            <button
              type="button"
              className="inventory-primary"
              disabled={busy || willImport.length === 0}
              onClick={() => void submit()}
            >
              {busy
                ? t("Importing…")
                : `${t("Import")} ${willImport.length} ${t("items")}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
