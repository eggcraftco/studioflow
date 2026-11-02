// Small desk objects scattered around the public site's headings and pictures
// (2 Nov 2026, owner: "cetvel, pergel … çalışma pedinin kenarlarına … el
// işine ve satıcılara uygun objeler"). Two families, because NivaDesk serves
// both: maker tools (ruler, compass, pencil, scissors, craft knife, brush,
// thread, set square, tape measure, button, washi tape) and seller things
// (parcel, shipping label, price tag, receipt, card, coins, stamp, paper clip,
// sticky note). Drawn here as flat-lay line art in the site's palette; no text
// inside, decorative everywhere (aria-hidden). Placement is CSS
// (`.public-desk` + a placement class) so a page only says which object goes
// where.

import type { ReactNode } from "react";

export type DeskObjectKind =
  | "ruler"
  | "pencil"
  | "compass"
  | "scissors"
  | "knife"
  | "brush"
  | "spool"
  | "setSquare"
  | "tapeMeasure"
  | "button"
  | "tape"
  | "tapeTeal"
  | "parcel"
  | "label"
  | "tag"
  | "receipt"
  | "card"
  | "coins"
  | "stamp"
  | "clip"
  | "note";

const INK = "#251d1a";
const WOOD = "#efd3a2";
const METAL = "#dfe3e4";
const TEAL = "#2f6f6d";
const TERRA = "#c17b58";
const SAND = "#f3dcb6";
const PAPER = "#fffefb";

const ticks = (from: number, to: number, step: number, y: number, small: number, big: number, every: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => {
    const x = from + i * step;
    return `M${x} ${y}v${i % every === 0 ? big : small}`;
  }).join("");

const OBJECTS: Record<DeskObjectKind, { box: string; art: ReactNode }> = {
  ruler: {
    box: "0 0 300 46",
    art: (
      <>
        <rect x="2" y="3" width="296" height="40" rx="4" fill={WOOD} />
        <path d={ticks(14, 286, 9, 3, 7, 15, 5)} strokeWidth="1.4" />
        <circle cx="282" cy="32" r="3.5" fill={PAPER} strokeWidth="1.4" />
      </>
    )
  },
  pencil: {
    box: "0 0 222 30",
    art: (
      <>
        <path d="M32 5h150v20H32z" fill="#f2c94c" />
        <path d="M32 11.5h150M32 18.5h150" strokeWidth="1" opacity="0.45" />
        <path d="M182 5h15v20h-15z" fill={METAL} />
        <path d="M187 5v20M192 5v20" strokeWidth="1" opacity="0.6" />
        <rect x="197" y="5" width="21" height="20" rx="5" fill="#eaa4a4" />
        <path d="M32 5L6 15l26 10z" fill="#fbe3bd" />
        <path d="M13 12.3L6 15l7 2.7z" fill={INK} stroke="none" />
      </>
    )
  },
  compass: {
    box: "0 0 104 156",
    art: (
      <>
        <path d="M8 146A86 86 0 0 1 96 130" stroke={TERRA} strokeWidth="1.8" strokeDasharray="5 5" />
        <rect x="47" y="2" width="10" height="16" rx="3" fill={TEAL} />
        <path d="M47 36L19 140l7 2 29-104zM57 36l28 92 7-2-27-92z" fill={METAL} />
        <path d="M20 140l1 9" strokeWidth="2" />
        <path d="M84 126l8 4-2 9-8-4z" fill="#f2c94c" strokeWidth="1.6" />
        <circle cx="52" cy="30" r="11" fill={METAL} />
        <circle cx="52" cy="30" r="3.5" fill={INK} stroke="none" />
      </>
    )
  },
  scissors: {
    box: "0 0 156 96",
    art: (
      <>
        <path d="M62 46L150 22l3 7-85 22z" fill={METAL} />
        <path d="M62 50l88 24-3 7-85-25z" fill={METAL} />
        <ellipse cx="32" cy="27" rx="21" ry="14" strokeWidth="11" />
        <ellipse cx="32" cy="27" rx="21" ry="14" stroke={TERRA} strokeWidth="7" />
        <ellipse cx="32" cy="70" rx="21" ry="14" strokeWidth="11" />
        <ellipse cx="32" cy="70" rx="21" ry="14" stroke={TERRA} strokeWidth="7" />
        <path d="M50 34l14 10M50 63l14-11" strokeWidth="6" />
        <circle cx="64" cy="48" r="4.5" fill={INK} stroke="none" />
      </>
    )
  },
  knife: {
    box: "0 0 204 28",
    art: (
      <>
        <rect x="44" y="6" width="156" height="16" rx="8" fill={TEAL} />
        <path d="M70 6v16M78 6v16M86 6v16" stroke={PAPER} strokeWidth="1.6" opacity="0.5" />
        <path d="M32 4h14v20H32z" fill={METAL} />
        <path d="M32 7v14H4z" fill="#eef1f2" />
      </>
    )
  },
  brush: {
    box: "0 0 224 30",
    art: (
      <>
        <path d="M74 9l146 3c3 0 3 6 0 6L74 21z" fill={TERRA} />
        <path d="M48 7h28v16H48z" fill={METAL} />
        <path d="M48 7C30 6 12 10 4 15c8 5 26 9 44 8z" fill={SAND} />
        <path d="M4 15c6-3 12-4 18-4 0 3 0 6 0 8-6 0-12-1-18-4z" fill={TEAL} stroke="none" />
      </>
    )
  },
  spool: {
    box: "0 0 84 96",
    art: (
      <>
        <rect x="12" y="18" width="52" height="58" fill={TERRA} />
        <path d="M12 28h52M12 38h52M12 48h52M12 58h52M12 68h52" stroke="#9a5a3d" strokeWidth="1.4" />
        <rect x="6" y="8" width="64" height="12" rx="3" fill={WOOD} />
        <rect x="6" y="74" width="64" height="12" rx="3" fill={WOOD} />
        <path d="M64 44c10 4 14 16 8 30" stroke={TERRA} strokeWidth="2" />
        <path d="M74 4l6 36" stroke="#9aa3a6" strokeWidth="2.2" />
        <ellipse cx="74.8" cy="9" rx="1.2" ry="2.6" fill={PAPER} strokeWidth="1" />
      </>
    )
  },
  setSquare: {
    box: "0 0 136 124",
    art: (
      <>
        <path d="M6 118V6l124 112zM26 98h50L26 52z" fill="rgba(143, 184, 202, 0.45)" fillRule="evenodd" />
        <path d={ticks(14, 118, 8, 118, -5, -9, 5)} strokeWidth="1.2" />
      </>
    )
  },
  tapeMeasure: {
    box: "0 0 150 84",
    art: (
      <>
        <path d="M66 54h80v16H66z" fill={SAND} />
        <path d={ticks(72, 140, 6, 54, 4, 8, 5)} strokeWidth="1.1" />
        <path d="M146 50v24" strokeWidth="3" />
        <circle cx="40" cy="42" r="36" fill={TEAL} />
        <circle cx="40" cy="42" r="12" fill={PAPER} />
        <circle cx="40" cy="42" r="3" fill={INK} stroke="none" />
      </>
    )
  },
  button: {
    box: "0 0 40 40",
    art: (
      <>
        <circle cx="20" cy="20" r="17" fill={TERRA} />
        <circle cx="20" cy="20" r="11" strokeWidth="1.4" opacity="0.5" />
        <circle cx="16" cy="16" r="2" fill={INK} stroke="none" />
        <circle cx="24" cy="16" r="2" fill={INK} stroke="none" />
        <circle cx="16" cy="24" r="2" fill={INK} stroke="none" />
        <circle cx="24" cy="24" r="2" fill={INK} stroke="none" />
      </>
    )
  },
  tape: {
    box: "0 0 116 34",
    art: (
      <path
        d="M6 4h104l-4 5 4 5-4 5 4 5-4 5 4 1H6l4-5-4-5 4-5-4-5 4-5z"
        fill="rgba(193, 123, 88, 0.55)"
        stroke="rgba(37, 29, 26, 0.35)"
        strokeWidth="1"
      />
    )
  },
  tapeTeal: {
    box: "0 0 116 34",
    art: (
      <>
        <path
          d="M6 4h104l-4 5 4 5-4 5 4 5-4 5 4 1H6l4-5-4-5 4-5-4-5 4-5z"
          fill="rgba(127, 176, 170, 0.6)"
          stroke="rgba(37, 29, 26, 0.35)"
          strokeWidth="1"
        />
        <path d="M22 4l-8 26M42 4l-8 26M62 4l-8 26M82 4l-8 26M102 4l-8 26" stroke="rgba(255, 255, 255, 0.55)" strokeWidth="5" />
      </>
    )
  },
  parcel: {
    box: "0 0 124 112",
    art: (
      <>
        <path d="M6 34l56 28v46L6 80z" fill="#f2c98f" />
        <path d="M62 62l56-28v46l-56 28z" fill="#e3b077" />
        <path d="M6 34L62 6l56 28-56 28z" fill="#fbe3bd" />
        <path d="M34 20l56 28v12" stroke={TERRA} strokeWidth="7" opacity="0.75" />
        <path d="M18 56l26 13v14L18 70z" fill={PAPER} strokeWidth="1.6" />
      </>
    )
  },
  label: {
    box: "0 0 136 92",
    art: (
      <>
        <rect x="4" y="4" width="128" height="84" rx="6" fill={PAPER} />
        <path d="M16 18h56M16 28h44M16 38h50" strokeWidth="2.4" opacity="0.55" />
        <rect x="100" y="14" width="22" height="22" fill="none" strokeWidth="1.6" />
        <path d="M104 18h5v5h-5zM113 27h5v5h-5zM104 27h5v5h-5z" fill={INK} stroke="none" />
        <path
          d="M16 52v26M20 52v26M23 52v26M28 52v26M31 52v26M36 52v26M41 52v26M44 52v26M48 52v26M53 52v26M56 52v26M61 52v26M66 52v26M69 52v26M74 52v26M77 52v26M82 52v26M87 52v26M90 52v26M95 52v26M100 52v26M103 52v26M108 52v26M113 52v26M118 52v26"
          strokeWidth="2"
        />
      </>
    )
  },
  tag: {
    box: "0 0 120 78",
    art: (
      <>
        <path d="M26 39C14 30 8 14 18 6" stroke={INK} strokeWidth="1.4" fill="none" />
        <path d="M38 12h70a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H38L16 39z" fill={SAND} />
        <circle cx="30" cy="39" r="4.5" fill={PAPER} />
        <path d="M50 32h44M50 44h28" strokeWidth="3" opacity="0.55" />
      </>
    )
  },
  receipt: {
    box: "0 0 82 128",
    art: (
      <>
        <path d="M4 4h74v110l-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-4 6z" fill={PAPER} />
        <path d="M16 18h50M16 30h34M16 42h44M16 54h28M16 66h40" strokeWidth="2" opacity="0.5" />
        <path d="M16 84h50" strokeWidth="1.2" strokeDasharray="3 3" />
        <path d="M16 96h22M48 96h18" strokeWidth="3.2" />
      </>
    )
  },
  card: {
    box: "0 0 128 84",
    art: (
      <>
        <rect x="4" y="4" width="120" height="76" rx="9" fill={TEAL} />
        <rect x="18" y="24" width="22" height="17" rx="3" fill="#f2c94c" strokeWidth="1.6" />
        <path d="M18 58h52M18 66h30" stroke={PAPER} strokeWidth="3" opacity="0.65" />
        <circle cx="96" cy="60" r="9" fill={TERRA} strokeWidth="1.6" />
        <circle cx="108" cy="60" r="9" fill={SAND} strokeWidth="1.6" opacity="0.9" />
      </>
    )
  },
  coins: {
    box: "0 0 92 74",
    art: (
      <>
        {[54, 44, 34, 24].map(y => (
          <g key={y}>
            <path d={`M10 ${y}v8a26 9 0 0 0 52 0v-8`} fill="#e8be5e" />
            <ellipse cx="36" cy={y} rx="26" ry="9" fill="#f6d88a" />
          </g>
        ))}
        <ellipse cx="70" cy="60" rx="17" ry="6" fill="#f6d88a" />
        <path d="M53 60v4a17 6 0 0 0 34 0v-4" fill="#e8be5e" />
      </>
    )
  },
  stamp: {
    box: "0 0 84 104",
    art: (
      <>
        <circle cx="42" cy="16" r="12" fill={TERRA} />
        <path d="M34 26h16v26H34z" fill={WOOD} />
        <rect x="12" y="52" width="60" height="18" rx="4" fill="#3a2e29" />
        <path d="M15 70h54v8H15z" fill={TERRA} />
        <path d="M14 92h56" stroke={TERRA} strokeWidth="5" opacity="0.45" />
      </>
    )
  },
  clip: {
    box: "0 0 34 86",
    art: (
      <path d="M11 70V18a8 8 0 0 1 16 0v52a13 13 0 0 1-26 0V26" stroke="#8e989b" strokeWidth="3.6" fill="none" />
    )
  },
  note: {
    box: "0 0 96 96",
    art: (
      <>
        <path d="M6 6h84v62L68 90H6z" fill="#f6dd8a" />
        <path d="M68 90V68h22z" fill="#e8c768" />
        <path d="M18 26q8-5 16 0t16 0 16 0M18 42q8-5 16 0t16 0M18 58q8-5 16 0" strokeWidth="2" opacity="0.6" />
      </>
    )
  }
};

export function DeskObject({ kind, className }: { kind: DeskObjectKind; className?: string }) {
  const object = OBJECTS[kind];
  return (
    <svg
      className={`public-desk public-desk-${kind}${className ? ` ${className}` : ""}`}
      viewBox={object.box}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {object.art}
      </g>
    </svg>
  );
}

// The ruler printed along a cutting mat's edge: a tick every 12px, a long one
// and a number every 60px (five small squares of the mat's grid).
export function MatRuler({ edge }: { edge: "top" | "bottom" }) {
  return (
    <div className={`public-mat-ruler public-mat-ruler-${edge}`} aria-hidden="true">
      {Array.from({ length: 30 }, (_, i) => (
        <span key={i}>{i}</span>
      ))}
    </div>
  );
}
