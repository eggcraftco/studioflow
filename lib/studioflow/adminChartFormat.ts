// Admin Insights charts — shared number/date formatting and point maths (7 Nov 2026).
// Owner: "when I hover a chart I want to see the numbers at the peaks". Every Insights chart reads its
// tooltip text, its peak/low markers and its screen-reader summary from here, so a count, a share, a
// rank or an amount reads the same everywhere. Pure functions: scripts/check-admin-charts.mts tests them.
//
// Money: the app stores a currency SYMBOL (companySettings.seciliParaBirimi: £ $ € ₺ ¥ A$ C$ CHF د.إ),
// not an ISO code, and "$" / "¥" do not name one currency. So an amount is formatted from the symbol the
// caller already shows — never by guessing an ISO code for Intl's currency style.

const COUNT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const decimals = new Map<number, Intl.NumberFormat>();

function fixed(digits: number) {
  let format = decimals.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    decimals.set(digits, format);
  }
  return format;
}

const MINUS = "−";

function signed(text: string, negative: boolean) {
  return negative ? `${MINUS}${text}` : text;
}

/** 1234 → "1,234" (thousands separator, whole number). */
export function chartCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return signed(COUNT.format(Math.abs(rounded)), rounded < 0);
}

/** 1234.5 → "1,234.5" with a fixed number of decimals. */
export function chartDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const text = fixed(digits).format(Math.abs(value));
  return signed(text, value < 0 && Number(text.replace(/,/g, "")) !== 0);
}

/** A value already in percent units: 12.345 → "12.3%". */
export function chartPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${chartDecimal(value, digits)}%`;
}

/** A 0–1 ratio (Search Console's ctr): 0.0345 → "3.5%". */
export function chartRatioPercent(ratio: number, digits = 1): string {
  return chartPercent(ratio * 100, digits);
}

/** Google's average position, smaller is better: 7.04 → "7.0". */
export function chartPosition(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return chartDecimal(value, 1);
}

/** Seconds → "04:05" under an hour, "1:02:05" from an hour. */
export function chartDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** Symbols that read as words take a space ("CHF 12"); "£12", "A$12" do not. */
const WORD_SYMBOLS = new Set(["CHF", "د.إ"]);

/** An amount in the currency whose SYMBOL the screen already uses: (1234.5, "£") → "£1,234.50". */
export function chartMoney(value: number, symbol: string, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const clean = String(symbol || "").trim();
  const amount = fixed(digits).format(Math.abs(value));
  const body = !clean ? amount : WORD_SYMBOLS.has(clean) ? `${clean} ${amount}` : `${clean}${amount}`;
  return signed(body, value < 0 && Number(amount.replace(/,/g, "")) !== 0);
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-04" → "Wed 4 Nov 2026". Read as a calendar date (no time zone), so it never slips a day. */
export function chartDayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!match) return String(day || "");
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const when = new Date(Date.UTC(year, month - 1, date));
  if (when.getUTCMonth() !== month - 1) return String(day);
  return `${WEEKDAY[when.getUTCDay()]} ${date} ${MONTH[month - 1]} ${year}`;
}

/** Short axis tick: "2026-11-04" → "4 Nov". */
export function chartDayTick(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!match) return String(day || "");
  return `${Number(match[3])} ${MONTH[Number(match[2]) - 1] || ""}`.trim();
}

export type ChartExtremes = { peak: number; low: number } | null;

/**
 * Where the highest and the lowest point are. `better: "lower"` (a rank) swaps the meaning so "peak" is the
 * best point. Ties go to the most recent point. A flat line, or fewer than two numbers, has none.
 */
export function chartExtremes(values: (number | null | undefined)[], better: "higher" | "lower" = "higher"): ChartExtremes {
  let hi = -1;
  let lo = -1;
  let count = 0;
  values.forEach((raw, index) => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return;
    count += 1;
    if (hi === -1 || raw >= (values[hi] as number)) hi = index;
    if (lo === -1 || raw <= (values[lo] as number)) lo = index;
  });
  if (count < 2 || hi === -1 || lo === -1 || values[hi] === values[lo]) return null;
  return better === "lower" ? { peak: lo, low: hi } : { peak: hi, low: lo };
}

/** The point under a pointer: `fraction` 0..1 across the plotted width, `count` points. */
export function chartNearestIndex(fraction: number, count: number): number {
  if (count <= 1 || !Number.isFinite(fraction)) return 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(clamped * (count - 1));
}

/** Where a point sits horizontally, 0..1, matching the SVG x scale the charts use. */
export function chartPointFraction(index: number, count: number): number {
  if (count <= 1) return 0.5;
  return Math.min(1, Math.max(0, index / (count - 1)));
}

/** Keyboard movement on a chart: arrows step, Page keys jump a week, Home/End go to the ends. */
export function chartKeyStep(key: string, index: number, count: number, rowSize = 0): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const at = index < 0 ? last : Math.min(index, last);
  switch (key) {
    case "ArrowRight": return Math.min(last, at + 1);
    case "ArrowLeft": return Math.max(0, at - 1);
    case "ArrowDown": return rowSize > 0 ? Math.min(last, at + rowSize) : Math.max(0, at - 1);
    case "ArrowUp": return rowSize > 0 ? Math.max(0, at - rowSize) : Math.min(last, at + 1);
    case "PageUp": return Math.max(0, at - 7);
    case "PageDown": return Math.min(last, at + 7);
    case "Home": return 0;
    case "End": return last;
    default: return null;
  }
}

export type ChartSummarySeries = { label: string; values: (number | null | undefined)[]; format: (value: number) => string; better?: "higher" | "lower" };

/**
 * The sentence a screen reader hears on focus, e.g.
 * "Visitor sessions, 30 points from Mon 6 Oct 2026 to Wed 5 Nov 2026. Highest 120 on Tue 4 Nov 2026;
 *  lowest 3 on Sun 26 Oct 2026; latest 45. Use the arrow keys to read each point."
 */
export function chartSummary(title: string, labels: string[], series: ChartSummarySeries[]): string {
  if (!labels.length) return `${title}: no data yet.`;
  const parts = [`${title}, ${labels.length} ${labels.length === 1 ? "point" : "points"}${labels.length > 1 ? ` from ${labels[0]} to ${labels[labels.length - 1]}` : ""}.`];
  for (const item of series) {
    const extremes = chartExtremes(item.values, item.better);
    const values = item.values;
    const lastIndex = (() => {
      for (let i = values.length - 1; i >= 0; i -= 1) if (typeof values[i] === "number" && Number.isFinite(values[i] as number)) return i;
      return -1;
    })();
    const lead = series.length > 1 ? `${item.label}: ` : "";
    if (extremes) {
      const best = item.better === "lower" ? "best" : "highest";
      const worst = item.better === "lower" ? "worst" : "lowest";
      parts.push(`${lead}${lead ? best : best.charAt(0).toUpperCase() + best.slice(1)} ${item.format(values[extremes.peak] as number)} on ${labels[extremes.peak]}; ${worst} ${item.format(values[extremes.low] as number)} on ${labels[extremes.low]}${lastIndex >= 0 ? `; latest ${item.format(values[lastIndex] as number)}` : ""}.`);
    } else if (lastIndex >= 0) {
      parts.push(`${lead}${item.format(values[lastIndex] as number)} throughout.`);
    }
  }
  parts.push("Use the arrow keys to read each point.");
  return parts.join(" ");
}
