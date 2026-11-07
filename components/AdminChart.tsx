"use client";

// Admin Insights charts — one hover / touch / keyboard behaviour for every chart (7 Nov 2026).
// Owner: "the chart shows ups and downs, but when I move the mouse over the peaks no numbers appear".
// The old charts carried an SVG <title> on 2.5-unit dots: the browser shows that only after a delay and
// only exactly on the dot, and sparklines had nothing at all. Here:
//   - a pointer anywhere over the chart picks the nearest point (lines) or the element under it (columns,
//     heatmap cells, donut slices) and shows its label and values;
//   - a tap does the same on a phone and the value stays until you tap elsewhere; a horizontal drag scrubs;
//   - Tab focuses the chart, arrow keys step through the points (Home/End/PageUp/PageDown jump), Escape
//     closes, and a polite live region reads the point out;
//   - the highest and lowest point of each line carry their value on the chart itself.
// Formatting lives in lib/studioflow/adminChartFormat.ts (tested by scripts/check-admin-charts.mts).

import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { chartCount, chartExtremes, chartKeyStep, chartNearestIndex, chartPercent, chartSummary } from "@/lib/studioflow/adminChartFormat";

export type ChartTipRow = { label: string; value: string; color?: string };
export type ChartTipContent = { title: string; rows: ChartTipRow[]; note?: string };

type CursorOptions = {
  /** How a pointer position becomes an index when it is not over an element carrying data-chart-index. */
  fromFraction?: (fraction: number) => number | null;
  /** Grid charts (heatmap): Up/Down move a whole row. */
  rowSize?: number;
  /** false: no keyboard stop (the donut's legend already lists every number as text). */
  keyboard?: boolean;
};

/** Pointer + keyboard cursor shared by every chart. */
export function useChartCursor(count: number, options: CursorOptions = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const pinnedByTouch = useRef(false);
  // A click focuses the chart too; that focus must not jump the cursor to the last point.
  const pointerDownAt = useRef(0);

  // A tapped value stays until the next tap outside the chart.
  useEffect(() => {
    if (active === null || !pinnedByTouch.current) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      pinnedByTouch.current = false;
      setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);

  // The data can shrink under the cursor (range 90d → 7d).
  useEffect(() => {
    if (active !== null && active >= count) setActive(count > 0 ? count - 1 : null);
  }, [active, count]);

  const locate = (event: PointerEvent<HTMLDivElement>): number | null => {
    const target = event.target instanceof Element ? event.target.closest("[data-chart-index]") : null;
    if (target && ref.current?.contains(target)) {
      const index = Number(target.getAttribute("data-chart-index"));
      return Number.isInteger(index) && index >= 0 && index < count ? index : null;
    }
    if (!options.fromFraction || !ref.current) return null;
    const rect = ref.current.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return options.fromFraction((event.clientX - rect.left) / rect.width);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const index = locate(event);
    if (index === null) {
      if (event.pointerType === "mouse" && !options.fromFraction) setActive(null);
      return;
    }
    setViaKeyboard(false);
    setActive(index);
  };

  const bind = {
    onPointerMove: move,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      pinnedByTouch.current = event.pointerType !== "mouse";
      pointerDownAt.current = Date.now();
      move(event);
    },
    onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && !viaKeyboard) setActive(null);
    },
    ...(options.keyboard === false
      ? {}
      : {
          tabIndex: 0,
          onFocus: () => {
            if (active === null && count > 0 && Date.now() - pointerDownAt.current > 400) {
              setViaKeyboard(true);
              setActive(count - 1);
            }
          },
          onBlur: () => {
            pinnedByTouch.current = false;
            setActive(null);
          },
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Escape") {
              setActive(null);
              return;
            }
            const next = chartKeyStep(event.key, active ?? -1, count, options.rowSize || 0);
            if (next === null) return;
            event.preventDefault();
            setViaKeyboard(true);
            setActive(next);
          }
        })
  };

  return { ref, active, viaKeyboard, bind, clear: () => setActive(null) };
}

/** Where to draw the tip: a point inside the chart box, in % of its width and px or % from its top. */
export type ChartTipAnchor = { xPct: number; top: string; above?: boolean };

export function ChartTip({ anchor, content }: { anchor: ChartTipAnchor; content: ChartTipContent }) {
  // Near an edge the box hangs inward so it never leaves the card.
  const align = anchor.xPct < 22 ? "start" : anchor.xPct > 78 ? "end" : "middle";
  const style: CSSProperties = {
    left: `${anchor.xPct}%`,
    top: anchor.top,
    transform: `translate(${align === "start" ? "-12px" : align === "end" ? "calc(-100% + 12px)" : "-50%"}, ${anchor.above ? "calc(-100% - 10px)" : "12px"})`
  };
  return (
    <div className="admin-chart-tip" style={style} aria-hidden="true">
      <div className="admin-chart-tip-title">{content.title}</div>
      {content.rows.map(row => (
        <div key={row.label} className="admin-chart-tip-row">
          {row.color ? <span className="admin-chart-tip-swatch" style={{ background: row.color }} /> : null}
          <span className="admin-chart-tip-label">{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      {content.note ? <div className="admin-chart-tip-note">{content.note}</div> : null}
    </div>
  );
}

/** What a screen reader hears while stepping with the keyboard (mouse movement stays silent). */
export function ChartLiveText({ content, enabled }: { content: ChartTipContent | null; enabled: boolean }) {
  const text = enabled && content ? `${content.title}: ${content.rows.map(row => `${row.label} ${row.value}`).join(", ")}${content.note ? `. ${content.note}` : ""}` : "";
  return <span className="visually-hidden" aria-live="polite">{text}</span>;
}

/** The centre of the element carrying data-chart-index={index}, as an anchor inside the chart box. */
export function useElementAnchor(container: RefObject<HTMLDivElement | null>, index: number | null, above = true): ChartTipAnchor | null {
  const [anchor, setAnchor] = useState<ChartTipAnchor | null>(null);
  useEffect(() => {
    const box = container.current;
    if (index === null || !box) {
      setAnchor(null);
      return;
    }
    const el = box.querySelector(`[data-chart-index="${index}"]`);
    if (!el) {
      setAnchor(null);
      return;
    }
    const outer = box.getBoundingClientRect();
    const inner = el.getBoundingClientRect();
    if (outer.width <= 0) return;
    setAnchor({
      xPct: ((inner.left + inner.width / 2 - outer.left) / outer.width) * 100,
      top: `${(above ? inner.top : inner.bottom) - outer.top}px`,
      above
    });
  }, [container, index, above]);
  return anchor;
}

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  /** null = no value that day (a gap in the line, skipped by the cursor's rows). */
  values: (number | null)[];
  format: (value: number) => string;
  /** "lower" for a rank: the line is drawn upside down (1 at the top) and "best" means smallest. */
  better?: "higher" | "lower";
  /** Fill under this series. */
  area?: boolean;
  /** Mark its highest and lowest point with their values (default: only the first series). */
  marks?: boolean;
};

type LineChartProps = {
  /** What the chart is, for the screen-reader summary ("Visitor sessions"). */
  title: string;
  /** One full label per point, shown in the tip ("Wed 4 Nov 2026"). */
  labels: string[];
  /** Optional short labels for the x axis ("4 Nov"); first / middle / last are drawn. */
  ticks?: string[];
  series: LineSeries[];
  width?: number;
  height?: number;
  /** Sparkline: fixed 30 px high, stretched to the card, peak/low as dots without labels. */
  compact?: boolean;
  /** Extra line in the tip for a point (for example "3 of 30 days"). */
  noteFor?: (index: number) => string | undefined;
  /** Extra rows in the tip that are not drawn as lines (for example page views beside sessions). */
  extraRows?: (index: number) => ChartTipRow[];
};

/** A line chart (one or more series, each on its own scale) with the shared cursor. */
export function AdminLineChart({ title, labels, ticks, series, width = 600, height = 200, compact = false, noteFor, extraRows }: LineChartProps) {
  const count = labels.length;
  const pad = compact ? 3 : 10;
  const plotW = width - pad * 2;
  const fractionToIndex = (fraction: number) => chartNearestIndex((fraction * width - pad) / plotW, count);
  const cursor = useChartCursor(count, { fromFraction: fractionToIndex });

  const scales = series.map(item => {
    const nums = item.values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const max = nums.length ? Math.max(...nums) : 1;
    const min = nums.length ? Math.min(...nums) : 0;
    if (item.better === "lower") {
      // A rank: best (smallest) at the top, its own span so small moves are visible.
      const span = Math.max(max - min, 1);
      return (v: number) => pad + ((v - min) / span) * (height - pad * 2);
    }
    const floor = Math.min(min, 0);
    const span = Math.max(max - floor, 1e-9) || 1;
    return (v: number) => height - pad - ((v - floor) / (max > floor ? span : 1)) * (height - pad * 2);
  });
  const x = (index: number) => pad + (count <= 1 ? plotW / 2 : (index / (count - 1)) * plotW);
  const xPct = (index: number) => (x(index) / width) * 100;
  const yPct = (s: number, v: number) => (scales[s](v) / height) * 100;

  const segments = (s: number) => {
    const out: string[] = [];
    let run: string[] = [];
    series[s].values.forEach((value, index) => {
      if (typeof value === "number" && Number.isFinite(value)) run.push(`${x(index)},${scales[s](value)}`);
      else if (run.length) {
        out.push(run.join(" "));
        run = [];
      }
    });
    if (run.length) out.push(run.join(" "));
    return out;
  };

  const extremes = series.map((item, s) => ((item.marks ?? s === 0) ? chartExtremes(item.values, item.better) : null));
  const summary = chartSummary(title, labels, series.map(item => ({ label: item.label, values: item.values, format: item.format, better: item.better })));

  const active = cursor.active;
  const tip: ChartTipContent | null = active === null ? null : {
    title: labels[active] ?? "",
    rows: series
      .filter(item => typeof item.values[active] === "number")
      .map((item): ChartTipRow => ({ label: item.label, value: item.format(item.values[active] as number), color: item.color }))
      .concat(extraRows ? extraRows(active) : []),
    note: [
      ...series.map((item, s) => {
        const e = extremes[s] ?? chartExtremes(item.values, item.better);
        if (!e) return "";
        const lead = series.length > 1 ? `${item.label}: ` : "";
        if (e.peak === active) return `${lead}${item.better === "lower" ? "best" : "highest"} in this range`;
        if (e.low === active) return `${lead}${item.better === "lower" ? "worst" : "lowest"} in this range`;
        return "";
      }),
      noteFor?.(active) || ""
    ].filter(Boolean).join(" · ").replace(/^./, c => c.toUpperCase()) || undefined
  };
  if (tip && !tip.rows.length) tip.rows.push({ label: series[0]?.label || "Value", value: "no data" });

  // Peak/low value labels: stacked when two fall close together so they never overlap.
  const markLabels: { key: string; xPct: number; yPct: number; text: string; color: string; up: boolean; stack: number }[] = [];
  if (!compact) {
    extremes.forEach((e, s) => {
      if (!e) return;
      const item = series[s];
      ([["peak", e.peak, true], ["low", e.low, false]] as const).forEach(([kind, index, up]) => {
        const value = item.values[index];
        if (typeof value !== "number") return;
        const at = xPct(index);
        const stack = markLabels.filter(m => m.up === up && Math.abs(m.xPct - at) < 12).length;
        markLabels.push({ key: `${item.key}-${kind}`, xPct: at, yPct: yPct(s, value), text: item.format(value), color: item.color, up, stack });
      });
    });
  }

  // The tip sits beside the point, on the side away from it: below a high point, above a low one.
  const tipAnchor = (index: number): ChartTipAnchor => {
    if (compact) return { xPct: xPct(index), top: "0px", above: true };
    const s = series.findIndex(item => typeof item.values[index] === "number");
    const at = s >= 0 ? yPct(s, series[s].values[index] as number) : 50;
    return { xPct: xPct(index), top: `${at}%`, above: at > 50 };
  };

  const tickRow = !compact && ticks && ticks.length > 1 ? [0, Math.floor((ticks.length - 1) / 2), ticks.length - 1].filter((v, i, a) => a.indexOf(v) === i) : [];

  return (
    <div className={compact ? "admin-chart is-compact" : "admin-chart"}>
      <div
        ref={cursor.ref}
        className="admin-chart-plot"
        role="group"
        aria-roledescription="chart"
        aria-label={summary}
        {...cursor.bind}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio={compact ? "none" : undefined}
          className="admin-chart-svg"
          style={compact ? { height: 30 } : undefined}
          aria-hidden="true"
          focusable="false"
        >
          {series.map((item, s) => (item.area ? segments(s).map((points, k) => {
            const first = points.split(" ")[0].split(",")[0];
            const last = points.split(" ").slice(-1)[0].split(",")[0];
            return <polygon key={`${item.key}-area-${k}`} points={`${first},${height - pad} ${points} ${last},${height - pad}`} fill={item.color} fillOpacity={0.14} />;
          }) : null))}
          {series.map((item, s) => segments(s).map((points, k) => (
            <polyline
              key={`${item.key}-${k}`}
              points={points}
              fill="none"
              stroke={item.color}
              strokeWidth={compact ? 1.8 : 2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )))}
        </svg>
        {/* Dots and labels are HTML so they keep their real size however wide the card is. */}
        {extremes.map((e, s) => (e ? [e.peak, e.low].map((index, k) => {
          const value = series[s].values[index];
          if (typeof value !== "number") return null;
          return <span key={`${series[s].key}-x${k}`} className={k === 0 ? "admin-chart-mark is-peak" : "admin-chart-mark is-low"} style={{ left: `${xPct(index)}%`, top: `${yPct(s, value)}%`, borderColor: series[s].color }} aria-hidden="true" />;
        }) : null))}
        {markLabels.map(mark => (
          <span
            key={mark.key}
            className={mark.up ? "admin-chart-mark-label is-up" : "admin-chart-mark-label is-down"}
            style={{
              left: `${mark.xPct}%`,
              top: `${mark.yPct}%`,
              transform: `translate(${mark.xPct < 8 ? "0" : mark.xPct > 92 ? "-100%" : "-50%"}, ${mark.up ? `calc(-100% - ${7 + mark.stack * 15}px)` : `${7 + mark.stack * 15}px`})`
            }}
            aria-hidden="true"
          >
            <span style={{ color: mark.color }}>{mark.up ? "▲" : "▼"}</span> {mark.text}
          </span>
        ))}
        {active !== null ? (
          <>
            <span className="admin-chart-guide" style={{ left: `${xPct(active)}%` }} aria-hidden="true" />
            {series.map((item, s) => {
              const value = item.values[active];
              return typeof value === "number" ? (
                <span key={item.key} className="admin-chart-dot" style={{ left: `${xPct(active)}%`, top: `${yPct(s, value)}%`, background: item.color }} aria-hidden="true" />
              ) : null;
            })}
            {tip ? <ChartTip anchor={tipAnchor(active)} content={tip} /> : null}
          </>
        ) : null}
        <ChartLiveText content={tip} enabled={cursor.viaKeyboard} />
      </div>
      {tickRow.length ? (
        <div className="admin-chart-ticks" aria-hidden="true">
          {tickRow.map(index => <span key={index} style={{ left: `${xPct(index)}%` }} className={index === 0 ? "is-first" : index === (ticks?.length ?? 0) - 1 ? "is-last" : ""}>{ticks?.[index]}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/** Legend chips for a multi-series chart. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }): ReactNode {
  return (
    <div className="admin-chart-legend" aria-hidden="true">
      {items.map(item => (
        <span key={item.label}><span className="admin-chart-tip-swatch" style={{ background: item.color }} />{item.label}</span>
      ))}
    </div>
  );
}

/** Ring of shares with a legend; hover or tap a slice for its value (moved here from AdminInsightsHub, 7 Nov 2026). */
export function StatsDonut({ slices, centerLabel, format = chartCount, centerFormat }: {
  slices: { label: string; value: number; color: string }[];
  centerLabel: string;
  /** How a slice value reads (default a count; "£/month" passes money). */
  format?: (value: number) => string;
  /** A shorter form for the ring's centre when `format` is long ("8h 48m" for "8 h 48 min"). */
  centerFormat?: (value: number) => string;
}) {
  const total = Math.max(slices.reduce((acc, slice) => acc + slice.value, 0), 1);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  // Hovering or tapping a slice shows its value; the legend beside it already lists every number as text,
  // so the ring itself is not a keyboard stop.
  const cursor = useChartCursor(slices.length, { keyboard: false });
  const anchor = useElementAnchor(cursor.ref, cursor.active, true);
  const active = cursor.active !== null ? slices[cursor.active] : null;
  let offset = 0;
  return (
    <div className="site-stats-donut-row">
      <div ref={cursor.ref} className="admin-chart-donut" style={{ position: "relative", width: 116, height: 116, flex: "0 0 auto" }} {...cursor.bind}>
        <svg viewBox="0 0 116 116" style={{ width: 116, height: 116, transform: "rotate(-90deg)" }} aria-hidden="true" focusable="false">
          {slices.map((slice, index) => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const el = (
              <circle
                key={slice.label}
                data-chart-index={index}
                cx="58"
                cy="58"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={cursor.active === index ? 18 : 14}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                style={{ cursor: "default", transition: "stroke-width 120ms ease" }}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{centerLabel}</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{(centerFormat || format)(total)}</div>
          </div>
        </div>
        {active && anchor ? (
          <ChartTip
            anchor={{ xPct: 50, top: "0px", above: true }}
            content={{
              title: active.label,
              rows: [
                { label: /\d/.test(centerLabel) || centerLabel === "Total" ? "Count" : centerLabel, value: format(active.value), color: active.color },
                { label: "Share", value: chartPercent((active.value / total) * 100) }
              ],
              note: `of ${format(total)} in all`
            }}
          />
        ) : null}
      </div>
      <div style={{ display: "grid", gap: 7, minWidth: 0, flex: 1 }}>
        {slices.map(slice => (
          <div key={slice.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: slice.color, flex: "0 0 auto" }} />
            <span style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slice.label}</span>
            <span style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 700 }}>{chartPercent((slice.value / total) * 100)}</span>
            <strong style={{ minWidth: 40, textAlign: "right" }}>{format(slice.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday × hour grid (UK time); hover, tap or arrow keys read each hour. */
export function ActivityHeatmap({ heatmap, caption, unit = "items" }: { heatmap: number[][]; caption: string; unit?: string }) {
  const max = Math.max(...heatmap.flat(), 1);
  const cells = heatmap.flatMap((row, day) => row.map((value, hour) => ({ day, hour, value })));
  const cursor = useChartCursor(cells.length, { rowSize: 24 });
  const anchor = useElementAnchor(cursor.ref, cursor.active, true);
  const busiest = cells.reduce<{ day: number; hour: number; value: number } | null>((best, cell) => (!best || cell.value > best.value ? cell : best), null);
  const hourText = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
  const tip: ChartTipContent | null = cursor.active === null || !cells[cursor.active] ? null : (() => {
    const cell = cells[cursor.active as number];
    return {
      title: `${HEATMAP_DAYS[cell.day]} ${hourText(cell.hour)}`,
      rows: [{ label: unit.charAt(0).toUpperCase() + unit.slice(1), value: chartCount(cell.value), color: "#8a5cf6" }],
      note: busiest && cell.value === busiest.value && cell.value > 0 ? "Busiest hour" : undefined
    };
  })();
  const summary = busiest && busiest.value > 0
    ? `${caption} Busiest: ${HEATMAP_DAYS[busiest.day]} ${hourText(busiest.hour)} with ${chartCount(busiest.value)} ${unit}. Use the arrow keys to read each hour; up and down change the day.`
    : `${caption} Nothing recorded yet.`;
  return (
    <div style={{ overflowX: "auto" }}>
      <div
        ref={cursor.ref}
        className="admin-chart-heatmap"
        role="group"
        aria-roledescription="chart"
        aria-label={summary}
        style={{ position: "relative", display: "grid", gridTemplateColumns: "34px repeat(24, 1fr)", gap: 2, minWidth: 560 }}
        {...cursor.bind}
      >
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} aria-hidden="true" style={{ fontSize: 8.5, color: "var(--muted)", textAlign: "center" }}>{hour % 3 === 0 ? hour : ""}</span>
        ))}
        {heatmap.map((row, day) => (
          <Fragment key={HEATMAP_DAYS[day]}>
            <span aria-hidden="true" style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", alignSelf: "center" }}>{HEATMAP_DAYS[day]}</span>
            {row.map((value, hour) => (
              <span
                key={hour}
                aria-hidden="true"
                data-chart-index={day * 24 + hour}
                className={cursor.active === day * 24 + hour ? "admin-chart-cell is-active" : "admin-chart-cell"}
                style={{
                  aspectRatio: "1",
                  borderRadius: 3,
                  background: value === 0 ? "var(--admin-chip-bg)" : `rgba(138, 92, 246, ${0.25 + (value / max) * 0.75})`
                }}
              />
            ))}
          </Fragment>
        ))}
        {tip && anchor ? <ChartTip anchor={anchor} content={tip} /> : null}
        <ChartLiveText content={tip} enabled={cursor.viaKeyboard} />
      </div>
      <p className="muted-copy" style={{ marginTop: 8 }}>{caption}</p>
    </div>
  );
}
