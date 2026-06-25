"use client";

import { useMemo, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  exportOrders,
  rangeForPreset,
  type ExportRangePreset,
  type ExportTemplate
} from "@/lib/studioflow/exportOrders";

type TemplateOption = {
  id: ExportTemplate;
  title: string;
  description: string;
  finance: boolean;
};

const TEMPLATES: TemplateOption[] = [
  { id: "orders", title: "Orders", description: "One row per order — status, dates, contact and totals.", finance: false },
  { id: "lineItems", title: "Line items", description: "One row per product/service line on each order.", finance: false },
  { id: "payments", title: "Payments", description: "One row per payment received — the cash ledger.", finance: true },
  { id: "finance", title: "Finance", description: "One row per order with accountant columns (revenue, cost, VAT, net profit).", finance: true }
];

const PRESETS: { id: ExportRangePreset; label: string }[] = [
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisQuarter", label: "This quarter" },
  { id: "thisYear", label: "This year" },
  { id: "lastYear", label: "Last year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range…" }
];

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border, #d9d9e3)",
  background: "var(--surface, #fff)",
  color: "var(--text, #111)",
  fontWeight: 600
};

export function ExportOrdersPanel({
  workspace,
  canSeeFinance,
  disabled = false
}: {
  workspace: WorkspaceContext | null;
  canSeeFinance: boolean;
  disabled?: boolean;
}) {
  const templates = useMemo(() => TEMPLATES.filter((tpl) => canSeeFinance || !tpl.finance), [canSeeFinance]);
  const [template, setTemplate] = useState<ExportTemplate>("finance");
  const [preset, setPreset] = useState<ExportRangePreset>("thisMonth");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeTrash, setIncludeTrash] = useState(false);
  const [delimiter, setDelimiter] = useState<"," | ";">(",");
  const [bom, setBom] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If finance access changes (or default isn't allowed), keep the picker valid.
  const activeTemplate = templates.some((tpl) => tpl.id === template) ? template : templates[0]?.id ?? "orders";
  const selected = TEMPLATES.find((tpl) => tpl.id === activeTemplate) ?? TEMPLATES[0];

  async function run() {
    if (!workspace || busy) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const range = rangeForPreset(preset, customFrom, customTo);
      const result = await exportOrders(workspace, {
        template: activeTemplate,
        from: range.from,
        to: range.to,
        includeTrash,
        delimiter,
        bom
      });
      setStatus(
        result.rowCount > 0
          ? `Downloaded ${result.rowCount} row${result.rowCount === 1 ? "" : "s"} — ${result.filename}`
          : "No orders matched this date range."
      );
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="pill">CSV export</div>
      <h2 style={{ margin: "12px 0 4px" }}>Export orders to CSV</h2>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Pick a report and a date range. The file opens cleanly in Excel, Numbers or Google Sheets.
      </p>

      <label style={{ display: "block", fontWeight: 800, margin: "10px 0 6px" }}>Report</label>
      <select
        style={fieldStyle}
        value={activeTemplate}
        onChange={(event) => setTemplate(event.target.value as ExportTemplate)}
        disabled={disabled || busy}
      >
        {templates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.title}
          </option>
        ))}
      </select>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0" }}>{selected.description}</p>

      <label style={{ display: "block", fontWeight: 800, margin: "16px 0 6px" }}>Date range</label>
      <select
        style={fieldStyle}
        value={preset}
        onChange={(event) => setPreset(event.target.value as ExportRangePreset)}
        disabled={disabled || busy}
      >
        {PRESETS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      {preset === "custom" ? (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>From</label>
            <input type="date" style={fieldStyle} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} disabled={busy} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>To</label>
            <input type="date" style={fieldStyle} value={customTo} onChange={(event) => setCustomTo(event.target.value)} disabled={busy} />
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", margin: "16px 0 6px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <input type="checkbox" checked={includeTrash} onChange={(event) => setIncludeTrash(event.target.checked)} disabled={busy} />
          Include trashed orders
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <input type="checkbox" checked={bom} onChange={(event) => setBom(event.target.checked)} disabled={busy} />
          Excel-friendly (UTF-8 BOM)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          Separator
          <select
            style={{ ...fieldStyle, width: "auto", padding: "6px 8px" }}
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value === ";" ? ";" : ",")}
            disabled={busy}
          >
            <option value=",">Comma ( , )</option>
            <option value=";">Semicolon ( ; )</option>
          </select>
        </label>
      </div>

      <button className="button" style={{ width: "100%", marginTop: 10 }} onClick={run} disabled={disabled || busy || !workspace}>
        {busy ? "Preparing…" : "Download CSV"}
      </button>

      {status ? <p style={{ margin: "12px 0 0", color: "var(--muted)", fontWeight: 800 }}>{status}</p> : null}
      {error ? <p style={{ margin: "12px 0 0", color: "var(--danger, #c0392b)", fontWeight: 800 }}>{error}</p> : null}
    </div>
  );
}
