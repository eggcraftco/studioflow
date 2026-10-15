// Admin Insights — display rules that are easy to get quietly wrong (15 Oct 2026, review N30–N42).
// Pure and dependency-free so scripts/check-admin-insights-metrics.ts can import the same file the
// page uses.

export type CountryRow = { country: string; impressions: number };

/**
 * N42: "% " next to a country was the row divided by the LARGEST row (United States 6 → 100%),
 * which reads as a share and is not one. Share is now the row over the total of the rows the API
 * returned; the bar keeps its relative-to-largest scale and is labelled as such. When the API
 * returned as many rows as it was asked for, the total is only the listed countries' total.
 */
export function countryShares(rows: CountryRow[], rowLimit = 20) {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.reduce((sum, row) => sum + (Number(row.impressions) || 0), 0);
  const max = list.reduce((m, row) => Math.max(m, Number(row.impressions) || 0), 0);
  return {
    total,
    truncated: list.length >= rowLimit,
    rows: list.map(row => {
      const value = Number(row.impressions) || 0;
      return {
        ...row,
        sharePct: total > 0 ? (value / total) * 100 : 0,
        relativePct: max > 0 ? (value / max) * 100 : 0
      };
    })
  };
}

export type PageRow = { page: string };

/**
 * N42: Top pages showed only the URL path, so https://nivadesk.app/faq and
 * https://www.nivadesk.app/faq/ (or an http:// row) read as the same page twice. The label now
 * keeps the host and the exact path, and rows whose normalised path repeats on another URL are
 * marked rather than merged — merging would hide a real canonical/host question.
 */
export function pageRowLabels<T extends PageRow>(pages: T[]) {
  const parsed = (Array.isArray(pages) ? pages : []).map(row => {
    let host = "";
    let path = row.page;
    let protocol = "";
    try {
      const url = new URL(row.page);
      host = url.host;
      path = `${url.pathname || "/"}${url.search}`;
      protocol = url.protocol.replace(":", "");
    } catch {
      /* keep raw */
    }
    const normalisedPath = (path.split("?")[0].replace(/\/+$/, "") || "/").toLowerCase();
    return { row, host, path, protocol, normalisedPath };
  });
  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(p.normalisedPath, (counts.get(p.normalisedPath) || 0) + 1);
  return parsed.map(p => ({
    ...p.row,
    host: p.host,
    path: p.path,
    label: p.host ? `${p.protocol === "http" ? "http://" : ""}${p.host}${p.path}` : p.path,
    samePathElsewhere: (counts.get(p.normalisedPath) || 0) > 1
  }));
}

export type ExclusionSummary = {
  view: "business" | "qa";
  excludedCount: number;
  excludedByKind?: Record<string, number>;
  flaggedTotal?: number;
  readable?: boolean;
};

/** One line under a section saying what the view left out — never silent. */
export function exclusionLine(summary: ExclusionSummary | null | undefined): string {
  if (!summary) return "";
  if (summary.readable === false) return "Analytics flags could not be read — nothing was left out of these numbers.";
  if (summary.view === "qa") {
    const flagged = Number(summary.flaggedTotal || 0);
    return flagged > 0
      ? `Measurement / QA view: all workspaces counted, including ${flagged} flagged internal / QA / pilot.`
      : "Measurement / QA view: all workspaces counted (none flagged).";
  }
  if (!summary.excludedCount) return "Business view: no flagged workspace in this data.";
  const kinds = Object.entries(summary.excludedByKind || {}).map(([kind, n]) => `${n} ${kind}`).join(", ");
  return `Business view: ${summary.excludedCount} flagged workspace${summary.excludedCount === 1 ? "" : "s"} left out (${kinds}). Switch to the QA view to include ${summary.excludedCount === 1 ? "it" : "them"}.`;
}

export const BILLING_STATE_LABELS: Record<string, string> = {
  free: "Free",
  trial_active: "Trial (running)",
  trial_expired: "Trial ended — now Free",
  paid_provider: "Paid by provider",
  past_due: "Payment failed (past due)",
  manual_comp: "Manual / complimentary",
  cancelled: "Cancelled"
};

/** A value that may be unknown: "—" with its reason, never 0. */
export function unknownOr(value: number | null | undefined, reason?: string, format: (n: number) => string = n => n.toLocaleString()): string {
  if (typeof value === "number" && Number.isFinite(value)) return format(value);
  const why = UNKNOWN_REASONS[String(reason || "")] || (reason ? String(reason).replace(/_/g, " ") : "not available");
  return `— (${why})`;
}

const UNKNOWN_REASONS: Record<string, string> = {
  no_live_orders: "no orders",
  no_order_carries_a_date: "orders carry no date",
  orders_query_failed: "could not be read",
  notes_query_failed: "could not be read",
  memberships_query_failed: "could not be read",
  not_measured_no_payment_ledger: "not measured — no payment ledger is read"
};

export type ActivationEvidence = {
  inferred?: boolean;
  path?: { path: string; from: string; value: string };
  required?: { rule: "all" | "any"; steps: { name: string; done: boolean; firstAtMs: number }[] };
  activeDays?: string[];
  windowDays?: number;
  minActiveDays?: number;
};

const PATH_FROM: Record<string, string> = {
  main_goal: "setup goal",
  start_choice: "how they chose to start",
  business_type: "business type",
  declared_path: "declared path",
  no_answer: "no setup answer"
};

/**
 * N30: why a workspace carries its label, in one line — the path and what set it, which required
 * steps are met (and when), and the UK days with meaningful work in the rhythm window. Inferred
 * from documents, not observed behaviour.
 */
export function activationEvidenceLine(evidence: ActivationEvidence | null | undefined): string {
  if (!evidence || !evidence.path) return "";
  const from = PATH_FROM[evidence.path.from] || evidence.path.from;
  const pathPart = `${evidence.path.path.replace(/_/g, " ")} path (${from}${evidence.path.value ? `: ${evidence.path.value.replace(/_/g, " ")}` : ""})`;
  const steps = evidence.required?.steps || [];
  const stepPart = steps.length
    ? `${evidence.required?.rule === "any" ? "any of" : "all of"}: ${steps.map(s => `${s.name.replace(/_/g, " ")} ${s.done ? `✓ ${new Date(s.firstAtMs).toISOString().slice(0, 10)}` : "✗"}`).join(", ")}`
    : "";
  const days = evidence.activeDays || [];
  const dayPart = `${days.length} active day${days.length === 1 ? "" : "s"} in the last ${evidence.windowDays ?? 7} (needs ${evidence.minActiveDays ?? 2} for "Using it regularly")${days.length ? `: ${days.join(", ")}` : ""}`;
  return [pathPart, stepPart, dayPart].filter(Boolean).join(" · ");
}
