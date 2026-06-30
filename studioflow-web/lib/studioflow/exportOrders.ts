import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// Server-side orders CSV export. One callable (exportOrders) backs web, Mac and
// Android so every platform produces an identical, date-range-filtered file.
export type ExportTemplate = "orders" | "lineItems" | "payments" | "finance";

export type ExportOrdersParams = {
  template: ExportTemplate;
  from?: string | null; // YYYY-MM-DD (inclusive), null = no lower bound
  to?: string | null; // YYYY-MM-DD (inclusive), null = no upper bound
  includeTrash?: boolean;
  delimiter?: "," | ";";
  bom?: boolean;
};

type ExportOrdersResult = {
  ok?: boolean;
  template?: string;
  rowCount?: number;
  filename?: string;
  mimeType?: string;
  base64?: string;
};

export async function exportOrders(
  workspace: WorkspaceContext,
  params: ExportOrdersParams
): Promise<{ filename: string; rowCount: number }> {
  const callable = httpsCallable<Record<string, unknown>, ExportOrdersResult>(functions, "exportOrders");
  const result = await callable({
    companyId: workspace.id,
    template: params.template,
    from: params.from ?? null,
    to: params.to ?? null,
    includeTrash: params.includeTrash === true,
    delimiter: params.delimiter === ";" ? ";" : ",",
    bom: params.bom !== false
  });
  const data = result.data || {};
  if (!data.ok || !data.base64) {
    throw new Error("Export failed. Please try again.");
  }
  downloadBase64File(data.filename || "export.csv", data.base64, data.mimeType || "text/csv");
  return { filename: data.filename || "export.csv", rowCount: data.rowCount ?? 0 };
}

// Decode the base64 CSV into raw bytes so the UTF-8 BOM survives intact (a text
// Blob would re-encode and could drop it), then trigger a browser download.
function downloadBase64File(filename: string, base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- Date-range presets ----------------------------------------------------
export type ExportRangePreset =
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "thisYear"
  | "lastYear"
  | "all"
  | "custom";

function isoDay(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

// Resolve a preset into inclusive from/to ISO days (UTC, matching the server).
export function rangeForPreset(
  preset: ExportRangePreset,
  customFrom?: string | null,
  customTo?: string | null
): { from: string | null; to: string | null } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (preset) {
    case "thisMonth":
      return { from: isoDay(year, month, 1), to: isoDay(year, month + 1, 0) };
    case "lastMonth":
      return { from: isoDay(year, month - 1, 1), to: isoDay(year, month, 0) };
    case "thisQuarter": {
      const qStart = Math.floor(month / 3) * 3;
      return { from: isoDay(year, qStart, 1), to: isoDay(year, qStart + 3, 0) };
    }
    case "thisYear":
      return { from: isoDay(year, 0, 1), to: isoDay(year, 11, 31) };
    case "lastYear":
      return { from: isoDay(year - 1, 0, 1), to: isoDay(year - 1, 11, 31) };
    case "custom":
      return { from: customFrom || null, to: customTo || null };
    case "all":
    default:
      return { from: null, to: null };
  }
}
