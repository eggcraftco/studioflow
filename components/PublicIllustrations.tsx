// Isometric illustrations for the public site (cream redesign, 2 Nov 2026).
// Drawn here from boxes, cylinders and one plate — orders, a workshop, money,
// a stock shelf and a delivery van — so the site has pictures of its own
// subject, not borrowed ones. Everything is decorative (aria-hidden); the words
// that go with a picture live next to it in the page, translated.

import type { ReactNode } from "react";

type Pt = [number, number];
type Shade = { top: string; left: string; right: string };

// Screen placement (s, cx, cy) and a local frame on the plate (ox, oy, k):
// local (x, y, z) in 0..100 maps to plate (ox + x·k, oy + y·k, z·k).
type Frame = { s: number; cx: number; cy: number; ox: number; oy: number; k: number };

const INK = "#251d1a";

const SHADES = {
  sand: { top: "#fbe3bd", left: "#f2c98f", right: "#e3b077" },
  terracotta: { top: "#eaa47c", left: "#d48a62", right: "#bf744e" },
  teal: { top: "#7fb0aa", left: "#4f8a84", right: "#326d67" },
  cream: { top: "#fff8ee", left: "#f3e3cc", right: "#e6d0b2" },
  paper: { top: "#fffdfa", left: "#f1e9dd", right: "#e2d6c5" },
  sage: { top: "#dce6d2", left: "#bfd0b0", right: "#a3b992" },
  lilac: { top: "#e3ddf0", left: "#c9c0e2", right: "#afa4d2" },
  sky: { top: "#d6e7ef", left: "#b4d2df", right: "#8fb8ca" },
  gold: { top: "#f6d88a", left: "#e8be5e", right: "#d2a443" },
  ink: { top: "#4a3f3a", left: "#352c28", right: "#251d1a" }
} satisfies Record<string, Shade>;

type ShadeName = keyof typeof SHADES;

function project(f: Frame, x: number, y: number, z = 0): Pt {
  const px = f.ox + x * f.k;
  const py = f.oy + y * f.k;
  const pz = z * f.k;
  return [f.cx + (px - py) * f.s, f.cy + (px + py) * 0.5 * f.s - pz * f.s];
}

const pts = (list: Pt[]) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

function Box({ f, x, y, z = 0, w, d, h, c }: { f: Frame; x: number; y: number; z?: number; w: number; d: number; h: number; c: ShadeName }) {
  const s = SHADES[c];
  const P = (a: number, b: number, e: number) => project(f, a, b, e);
  return (
    <g>
      <polygon points={pts([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)])} fill={s.left} />
      <polygon points={pts([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)])} fill={s.right} />
      <polygon points={pts([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)])} fill={s.top} />
    </g>
  );
}

function Cylinder({ f, x, y, z = 0, r, h, c, rings = 0 }: { f: Frame; x: number; y: number; z?: number; r: number; h: number; c: ShadeName; rings?: number }) {
  const s = SHADES[c];
  const [bx, by] = project(f, x, y, z);
  const [, ty] = project(f, x, y, z + h);
  const rx = r * f.k * f.s * Math.SQRT2;
  const ry = rx / 2;
  const ringYs = Array.from({ length: rings }, (_, i) => by - ((i + 1) * (by - ty)) / (rings + 1));
  return (
    <g>
      <path d={`M${(bx - rx).toFixed(1)} ${ty.toFixed(1)}L${(bx - rx).toFixed(1)} ${by.toFixed(1)}A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${(bx + rx).toFixed(1)} ${by.toFixed(1)}L${(bx + rx).toFixed(1)} ${ty.toFixed(1)}Z`} fill={s.left} />
      {ringYs.map(yy => (
        <path key={yy} d={`M${(bx - rx).toFixed(1)} ${yy.toFixed(1)}A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${(bx + rx).toFixed(1)} ${yy.toFixed(1)}`} fill="none" strokeWidth="0.8" opacity="0.5" />
      ))}
      <ellipse cx={bx} cy={ty} rx={rx} ry={ry} fill={s.top} />
    </g>
  );
}

function Face({ f, x1, x2, y, z1, z2, fill }: { f: Frame; x1: number; x2: number; y: number; z1: number; z2: number; fill: string }) {
  return <polygon points={pts([project(f, x1, y, z1), project(f, x2, y, z1), project(f, x2, y, z2), project(f, x1, y, z2)])} fill={fill} />;
}

function Tree({ f, x, y, h = 12, r = 9 }: { f: Frame; x: number; y: number; h?: number; r?: number }) {
  const [cx, cy] = project(f, x, y, h + r * 0.7);
  return (
    <g>
      <Cylinder f={f} x={x} y={y} r={1.6} h={h} c="ink" />
      <circle cx={cx} cy={cy} r={r * f.k * f.s * 1.2} fill={SHADES.sage.left} />
      <circle cx={cx - r * f.k * f.s * 0.35} cy={cy - r * f.k * f.s * 0.35} r={r * f.k * f.s * 0.5} fill={SHADES.sage.top} strokeWidth="0" />
    </g>
  );
}

function Plate({ f, c, thick = 5, grid = true }: { f: Frame; c: ShadeName; thick?: number; grid?: boolean }) {
  const s = SHADES[c];
  const P = (a: number, b: number, e = 0) => project(f, a, b, e);
  const lines = grid ? [20, 40, 60, 80] : [];
  return (
    <g>
      <polygon points={pts([P(0, 100), P(100, 100), P(100, 100, -thick), P(0, 100, -thick)])} fill={s.left} />
      <polygon points={pts([P(100, 0), P(100, 100), P(100, 100, -thick), P(100, 0, -thick)])} fill={s.right} />
      <polygon points={pts([P(0, 0), P(100, 0), P(100, 100), P(0, 100)])} fill={s.top} />
      <g stroke={INK} strokeWidth="0.7" opacity="0.14">
        {lines.map(n => (
          <g key={n}>
            <line x1={P(n, 0)[0]} y1={P(n, 0)[1]} x2={P(n, 100)[0]} y2={P(n, 100)[1]} />
            <line x1={P(0, n)[0]} y1={P(0, n)[1]} x2={P(100, n)[0]} y2={P(100, n)[1]} />
          </g>
        ))}
      </g>
    </g>
  );
}

export type IsoScene = "order" | "customer" | "work" | "money" | "items" | "shipping";

// Each scene is drawn back to front in its own 0..100 frame.
function Scene({ scene, f }: { scene: IsoScene; f: Frame }): ReactNode {
  switch (scene) {
    case "order":
      return (
        <g>
          <Box f={f} x={70} y={22} w={3} d={22} h={30} c="paper" />
          <Box f={f} x={80} y={30} w={3} d={22} h={24} c="paper" />
          <Box f={f} x={24} y={28} w={42} h={30} d={42} c="sand" />
          <Box f={f} x={42} y={28} z={30} w={6} d={42} h={0.6} c="terracotta" />
          <Box f={f} x={32} y={36} z={30} w={26} d={26} h={18} c="paper" />
          <Box f={f} x={42} y={36} z={48} w={6} d={26} h={0.6} c="terracotta" />
          <Face f={f} x1={28} x2={42} y={70} z1={8} z2={18} fill="#ffffff" />
        </g>
      );
    case "customer":
      return (
        <g>
          <Box f={f} x={18} y={26} w={46} d={40} h={30} c="cream" />
          <Box f={f} x={14} y={22} z={30} w={54} d={48} h={4} c="terracotta" />
          <Face f={f} x1={26} x2={36} y={66} z1={0} z2={17} fill={SHADES.teal.right} />
          <Face f={f} x1={44} x2={58} y={66} z1={8} z2={20} fill={SHADES.sky.top} />
          <Box f={f} x={18} y={66} z={20} w={46} d={8} h={2} c="teal" />
          <Tree f={f} x={84} y={78} />
          <Tree f={f} x={78} y={24} h={10} r={7} />
        </g>
      );
    case "work":
      return (
        <g>
          {[[20, 30], [68, 30], [20, 54], [68, 54]].map(([lx, ly]) => (
            <Box key={`${lx}-${ly}`} f={f} x={lx} y={ly} w={3} d={3} h={20} c="ink" />
          ))}
          <Box f={f} x={18} y={28} z={20} w={56} d={32} h={4} c="terracotta" />
          <Box f={f} x={26} y={34} z={24} w={14} d={14} h={10} c="sand" />
          <Box f={f} x={46} y={32} z={24} w={10} d={16} h={0.8} c="paper" />
          <Cylinder f={f} x={62} y={46} z={24} r={5} h={9} c="teal" rings={2} />
          <Cylinder f={f} x={52} y={80} r={7} h={12} c="sand" />
        </g>
      );
    case "money":
      return (
        <g>
          <Cylinder f={f} x={52} y={26} r={9} h={34} c="gold" rings={5} />
          <Cylinder f={f} x={28} y={42} r={9} h={22} c="gold" rings={3} />
          <Cylinder f={f} x={48} y={56} r={9} h={12} c="gold" rings={1} />
          <Box f={f} x={64} y={54} w={26} d={32} h={2} c="teal" />
          <Box f={f} x={65} y={55} z={2} w={24} d={30} h={4} c="paper" />
          <Box f={f} x={64} y={54} z={6} w={26} d={32} h={2} c="teal" />
        </g>
      );
    case "items":
      return (
        <g>
          <Box f={f} x={18} y={40} w={3} d={24} h={48} c="ink" />
          <Box f={f} x={70} y={40} w={3} d={24} h={48} c="ink" />
          {[14, 30, 46].map(z => (
            <Box key={z} f={f} x={18} y={40} z={z} w={55} d={24} h={2} c="cream" />
          ))}
          <Box f={f} x={24} y={44} z={16} w={12} d={12} h={10} c="sand" />
          <Box f={f} x={40} y={46} z={16} w={10} d={10} h={8} c="lilac" />
          <Box f={f} x={54} y={44} z={16} w={12} d={12} h={12} c="sky" />
          <Box f={f} x={28} y={46} z={32} w={10} d={10} h={10} c="sage" />
          <Box f={f} x={46} y={44} z={32} w={14} d={14} h={8} c="terracotta" />
          <Box f={f} x={80} y={70} w={12} d={12} h={10} c="sand" />
        </g>
      );
    case "shipping":
      return (
        <g>
          <Box f={f} x={16} y={38} z={4} w={52} d={26} h={26} c="paper" />
          <Box f={f} x={68} y={40} z={4} w={18} d={22} h={17} c="teal" />
          <Face f={f} x1={72} x2={82} y={62} z1={12} z2={19} fill={SHADES.sky.top} />
          <Face f={f} x1={24} x2={58} y={64} z1={12} z2={22} fill={SHADES.terracotta.top} />
          {[[26, 64], [58, 64], [78, 62]].map(([wx, wy]) => {
            const [cx, cy] = project(f, wx, wy, 4);
            return <ellipse key={wx} cx={cx} cy={cy} rx={5.5 * f.k * f.s} ry={6 * f.k * f.s} fill={SHADES.ink.left} />;
          })}
        </g>
      );
  }
}

const TILE_PLATES: Record<IsoScene, ShadeName> = {
  order: "cream",
  customer: "sage",
  work: "sand",
  money: "cream",
  items: "lilac",
  shipping: "sky"
};

/** One plate with one scene on it. */
export function PublicIsoTile({ scene, className }: { scene: IsoScene; className?: string }) {
  const f: Frame = { s: 1.2, cx: 120, cy: 70, ox: 0, oy: 0, k: 1 };
  return (
    <svg className={`public-iso${className ? ` ${className}` : ""}`} viewBox="0 0 240 206" aria-hidden="true" focusable="false">
      <g stroke={INK} strokeWidth="1.1" strokeLinejoin="round">
        <Plate f={f} c={TILE_PLATES[scene]} thick={7} />
        <Scene scene={scene} f={f} />
      </g>
    </svg>
  );
}

// The big plate on the home page: the order in the middle, the four parts of
// the studio around it, joined by dashed paths. The section draws its labels
// over it at CITY_ANCHORS (percentages of the picture), so the words stay text.
const CITY = { s: 4.2, cx: 500, cy: 150 };
const CITY_PARTS: { scene: IsoScene; ox: number; oy: number; k: number; plate: ShadeName }[] = [
  { scene: "work", ox: 6, oy: 6, k: 0.36, plate: "sand" },
  { scene: "money", ox: 58, oy: 6, k: 0.36, plate: "cream" },
  { scene: "customer", ox: 6, oy: 58, k: 0.36, plate: "sage" },
  { scene: "order", ox: 34, oy: 34, k: 0.32, plate: "paper" },
  { scene: "items", ox: 58, oy: 58, k: 0.36, plate: "lilac" }
];
export const CITY_SIZE = { w: 1000, h: 600 };

function cityPoint(x: number, y: number, z = 0): Pt {
  return project({ ...CITY, ox: 0, oy: 0, k: 1 }, x, y, z);
}

/** Where each part's label line meets the picture, as % of CITY_SIZE. */
export const CITY_ANCHORS: Record<"work" | "money" | "customer" | "items" | "order", { x: number; y: number }> = (() => {
  const at = (x: number, y: number, z: number) => {
    const [px, py] = cityPoint(x, y, z);
    return { x: (px / CITY_SIZE.w) * 100, y: (py / CITY_SIZE.h) * 100 };
  };
  return {
    work: at(24, 24, 14),
    money: at(76, 24, 14),
    customer: at(24, 76, 14),
    items: at(76, 76, 18),
    order: at(50, 50, 18)
  };
})();

export function PublicIsoCity({ className }: { className?: string }) {
  const base: Frame = { ...CITY, ox: 0, oy: 0, k: 1 };
  const road = (a: Pt, b: Pt) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
  return (
    <svg className={`public-iso public-iso-city${className ? ` ${className}` : ""}`} viewBox={`0 0 ${CITY_SIZE.w} ${CITY_SIZE.h}`} aria-hidden="true" focusable="false">
      <g stroke={INK} strokeWidth="1.3" strokeLinejoin="round">
        <Plate f={base} c="cream" thick={4} grid={false} />
        <g stroke={SHADES.terracotta.right} strokeWidth="3" strokeDasharray="10 9" strokeLinecap="round" opacity="0.8">
          {road(cityPoint(50, 3), cityPoint(50, 97))}
          {road(cityPoint(3, 50), cityPoint(97, 50))}
        </g>
        {CITY_PARTS.map(part => {
          const f: Frame = { ...CITY, ox: part.ox, oy: part.oy, k: part.k };
          return (
            <g key={part.scene}>
              <Plate f={f} c={part.plate} thick={3} />
              <Scene scene={part.scene} f={f} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
