// Firestore Timestamps arrive over the bridge as {_seconds,_nanoseconds}.
export function formatTimestamp(value: unknown): string {
  const seconds =
    value && typeof value === "object" && "_seconds" in (value as Record<string, unknown>)
      ? Number((value as { _seconds?: unknown })._seconds)
      : null;
  if (!seconds || Number.isNaN(seconds)) return "—";
  return new Date(seconds * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusTone(status: string): "success" | "warning" | "critical" | "info" {
  if (status === "ok") return "success";
  if (status === "failed") return "critical";
  if (status === "skipped") return "warning";
  return "info";
}
