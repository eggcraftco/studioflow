// A date typed into an <input type="date"> is "yyyy-mm-dd" and means THAT day
// in the person's own time zone. `new Date("2026-03-01")` is UTC midnight, which
// in any zone east of Greenwich is still the previous evening — the source of
// every "the date I picked moved back a day" report.

export function parseLocalDateInput(value: string, at: "noon" | "start" | "end" = "noon"): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = at === "end"
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : at === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The "yyyy-mm-dd" of a Date in local time — never toISOString(), which shifts by the zone offset. */
export function formatLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The last millisecond of the local day that contains `millis`. */
export function endOfLocalDayMillis(millis: number): number {
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return millis;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * True when a stored millisecond value carries no time of day — the shape a
 * date-only reminder is saved in (UTC midnight). A reminder the user gave a
 * time to is due at that time and must not be pushed to the end of the day.
 */
export function isStoredAsPlainDate(millis: number): boolean {
  const date = new Date(millis);
  return date.getUTCHours() === 0
    && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0
    && date.getUTCMilliseconds() === 0;
}
