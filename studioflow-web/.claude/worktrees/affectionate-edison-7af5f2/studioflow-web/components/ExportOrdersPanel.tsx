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
  { id: "orders", title: "Invoices", description: "One row per invoice — status, dates, contact and totals.", finance: false },
  { id: "lineItems", title: "Line items", description: "One row per product/service line on each invoice.", finance: false },
  { id: "payments", title: "Payments", description: "One row per payment received — the cash ledger.", finance: true },
  { id: "finance", title: "Finance", description: "One row per invoice with accountant columns (revenue, cost, VAT, net profit).", finance: true }
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

const labelStyle: React.CSSProperties = { display: "block", fontWeight: 700, fontSize: 13, margin: "0 0 6px" };
const optLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 };

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
          : "No invoices matched this date range."
      );
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft, #eef2ff)", color: "var(--accent, #4f6bed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FileIcon />
        </div>
        <div>
          <h2 style={{ margin: "2px 0 4px" }}>Export invoices to CSV</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Select a report and date range. The file opens cleanly in Excel, Numbers or Google Sheets.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <div>
          <label style={labelStyle}>Report</label>
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
        </div>
        <div>
          <label style={labelStyle}>Date range</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none", display: "flex" }}>
              <CalendarIcon />
            </span>
            <select
              style={{ ...fieldStyle, paddingLeft: 38 }}
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
          </div>
        </div>
      </div>

      <p style={{ color: "var(--muted)", fontSize: 13, margin: "10px 0 0" }}>{selected.description}</p>

      {preset === "custom" ? (
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>From</label>
            <input type="date" style={fieldStyle} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} disabled={busy} />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>To</label>
            <input type="date" style={fieldStyle} value={customTo} onChange={(event) => setCustomTo(event.target.value)} disabled={busy} />
          </div>
        </div>
      ) : null}

      <hr style={{ border: 0, borderTop: "1px solid var(--border, #e6e6ef)", margin: "18px 0" }} />

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <label style={optLabelStyle}>
          <input type="checkbox" checked={includeTrash} onChange={(event) => setIncludeTrash(event.target.checked)} disabled={busy} />
          Include trashed invoices
          <InfoDot text="Also include invoices that are currently in the Trash." />
        </label>
        <label style={optLabelStyle}>
          <input type="checkbox" checked={bom} onChange={(event) => setBom(event.target.checked)} disabled={busy} />
          Excel-friendly (UTF-8 BOM)
          <InfoDot text="Adds a byte-order mark so Excel shows Turkish and other non-Latin characters correctly." />
        </label>
        <label style={{ ...optLabelStyle, gap: 10 }}>
          Separator
          <select
            style={{ ...fieldStyle, width: "auto", padding: "8px 10px" }}
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value === ";" ? ";" : ",")}
            disabled={busy}
          >
            <option value=",">Comma ( , )</option>
            <option value=";">Semicolon ( ; )</option>
          </select>
        </label>
      </div>

      <button
        className="button"
        style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8 }}
        onClick={run}
        disabled={disabled || busy || !workspace}
      >
        <DownloadIcon />
        {busy ? "Preparing…" : "Download CSV"}
      </button>

      {status ? <p style={{ margin: "14px 0 0", color: "var(--muted)", fontWeight: 800 }}>{status}</p> : null}
      {error ? <p style={{ margin: "14px 0 0", color: "var(--danger, #c0392b)", fontWeight: 800 }}>{error}</p> : null}
    </div>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function InfoDot({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} role="img" style={{ display: "inline-flex", color: "var(--muted)", cursor: "help" }}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </span>
  );
}
