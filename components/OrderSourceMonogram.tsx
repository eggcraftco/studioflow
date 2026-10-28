// UX-010 / UX-006 (28 Oct 2026): a platform's monogram — a small rounded square with OUR OWN letters
// (lib/studioflow/orderFilters.ts ORDER_SOURCE_MONOGRAMS) in the platform's palette colour on its 14 %
// tint (app/globals.css, the --order-source-* tokens). No third-party logo, ever. The public order form
// gets a globe drawn here (a plain globe, not anyone's brand mark). The full name is always the
// accessible name and the tooltip; the letters and the colour only repeat it.
import { ORDER_SOURCE_MONOGRAMS, orderSourceChipLabel, type OrderPlatformId } from "@/lib/studioflow/orderFilters";

export function OrderSourceMonogram({
  source,
  t,
  title,
  decorative = false,
  className = ""
}: {
  source: OrderPlatformId;
  /** The screen's own studioT for its language ("Website" goes through it). */
  t: (text: string) => string;
  /** The tooltip; the full name when left out. */
  title?: string;
  /** Inside a control that already carries the name (the platform bar's button): hidden from assistive tech. */
  decorative?: boolean;
  className?: string;
}) {
  const mark = ORDER_SOURCE_MONOGRAMS[source];
  const name = orderSourceChipLabel(source, t);
  const label = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": name, title: title ?? name };
  return (
    <span
      className={["order-source-monogram", `is-${source}`, mark.glyph ? "is-glyph" : "", className].filter(Boolean).join(" ")}
      data-source-monogram={source}
      {...label}
    >
      {mark.glyph === "globe" ? <GlobeGlyph /> : mark.letters}
    </span>
  );
}

/** A plain globe (circle, one meridian, the equator), drawn in the text colour. */
function GlobeGlyph() {
  return (
    <svg className="order-source-monogram-glyph" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="8" cy="8" rx="2.7" ry="6.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.9 8h12.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
