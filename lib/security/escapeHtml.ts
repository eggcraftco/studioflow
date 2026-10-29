// One HTML escape for every string the app writes into markup by hand: print
// windows, PDF exports, the /f/ file shell (security audit #18, 28 Oct 2026).
// Text and attribute values alike: & < > " ' all become entities.
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
