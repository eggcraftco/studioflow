/**
 * "5 minutes ago", "yesterday", in the reader's language, for anything within
 * the last week — and "" beyond that or where the runtime cannot say, so the
 * caller shows its own date and time instead. `locale` is a BCP 47 tag
 * (`studioLocaleTag`, or `studioLanguageLocale` mapped to `en-GB` for English).
 */
export function relativeTimeLabel(ms: number, nowMs: number, locale: string): string {
  if (!ms) return "";
  const diff = ms - nowMs;
  const span = Math.abs(diff);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  if (span >= 7 * DAY) return "";
  try {
    const format = new Intl.RelativeTimeFormat(locale || "en-GB", { numeric: "auto" });
    if (span < MINUTE) return format.format(0, "second");
    if (span < HOUR) return format.format(Math.round(diff / MINUTE), "minute");
    if (span < DAY) return format.format(Math.round(diff / HOUR), "hour");
    return format.format(Math.round(diff / DAY), "day");
  } catch {
    // An older runtime without RelativeTimeFormat: the caller's date is still true.
    return "";
  }
}
