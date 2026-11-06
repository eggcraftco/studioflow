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
  ink: { top: "#4a3f3a", left: "#352c28", right: "#251d1a" },
  rose: { top: "#f7d9d2", left: "#ecbcb1", right: "#da9e91" },
  butter: { top: "#fbeec8", left: "#f1da9c", right: "#dfc273" }
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

// The big plate on the home page (owner, 6 Nov 2026: "daha belirgin ana yapılar,
// özellikleri temsil eden alanlar"): the order in the middle of a 3×3 block and
// one readable landmark for each part of NivaDesk around it — shops for the
// sales channels, a house and a phone for the customer and their order link, a
// board and people for production, a shelf and a file cabinet for stock and
// files, a van and a map pin for shipping, a bank and coins for payments. The
// side corners hold trees and the owl. Only what every workspace can use today
// is drawn. The section draws its labels over the picture at TOWN_ANCHORS
// (percentages of the picture), so the words stay text.
const CITY = { s: 4.2, cx: 500, cy: 150 };
export const CITY_SIZE = { w: 1000, h: 600 };

function cityPoint(x: number, y: number, z = 0): Pt {
  return project({ ...CITY, ox: 0, oy: 0, k: 1 }, x, y, z);
}

type P3 = [number, number, number];

function Poly({ f, list, fill }: { f: Frame; list: P3[]; fill: string }) {
  return <polygon points={pts(list.map(([x, y, z]) => project(f, x, y, z)))} fill={fill} />;
}

/** A face on the plane x = X (the right-hand side of a box). */
function FaceX({ f, X, y1, y2, z1, z2, fill }: { f: Frame; X: number; y1: number; y2: number; z1: number; z2: number; fill: string }) {
  return <Poly f={f} list={[[X, y1, z1], [X, y2, z1], [X, y2, z2], [X, y1, z2]]} fill={fill} />;
}

function Person({ f, x, y, c }: { f: Frame; x: number; y: number; c: ShadeName }) {
  const [hx, hy] = project(f, x, y, 19);
  return (
    <g>
      <Cylinder f={f} x={x} y={y} r={5.5} h={13} c={c} />
      <circle cx={hx} cy={hy} r={5.2 * f.k * f.s} fill={SHADES.sand.top} />
    </g>
  );
}

function MapPin({ f, x, y, h, r }: { f: Frame; x: number; y: number; h: number; r: number }) {
  const [bx, by] = project(f, x, y, 0);
  const [hx, hy] = project(f, x, y, h);
  const R = r * f.k * f.s;
  const n = (v: number) => v.toFixed(1);
  return (
    <g>
      <ellipse cx={bx} cy={by} rx={R * 0.7} ry={R * 0.35} fill={INK} opacity="0.18" strokeWidth="0" />
      <path d={`M${n(bx)} ${n(by)}L${n(hx - R * 0.87)} ${n(hy + R * 0.5)}A${n(R)} ${n(R)} 0 1 1 ${n(hx + R * 0.87)} ${n(hy + R * 0.5)}Z`} fill={SHADES.terracotta.top} />
      <circle cx={hx} cy={hy} r={R * 0.42} fill={SHADES.paper.top} />
    </g>
  );
}

/** A striped awning on the front (y = Y) of a shop, from x1 to x2. */
function Awning({ f, x1, x2, Y, z, out, c }: { f: Frame; x1: number; x2: number; Y: number; z: number; out: number; c: ShadeName }) {
  const w = (x2 - x1) / 5;
  return (
    <g>
      {[0, 1, 2, 3, 4].map(i => (
        <Poly key={i} f={f} list={[[x1 + i * w, Y, z], [x1 + (i + 1) * w, Y, z], [x1 + (i + 1) * w, Y + out, z - 5], [x1 + i * w, Y + out, z - 5]]} fill={i % 2 ? SHADES.paper.top : SHADES[c].top} />
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <Face key={`v${i}`} f={f} x1={x1 + i * w} x2={x1 + (i + 1) * w} y={Y + out} z1={z - 8} z2={z - 5} fill={i % 2 ? SHADES.paper.left : SHADES[c].left} />
      ))}
    </g>
  );
}

type TownZone = "channels" | "customers" | "production" | "stock" | "shipping" | "money";

function TownScene({ zone, f }: { zone: TownZone; f: Frame }): ReactNode {
  switch (zone) {
    case "channels":
      return (
        <g>
          <Box f={f} x={8} y={12} w={42} d={30} h={32} c="cream" />
          <Face f={f} x1={13} x2={30} y={42} z1={4} z2={17} fill={SHADES.sky.top} />
          <Face f={f} x1={35} x2={44} y={42} z1={0} z2={17} fill={SHADES.teal.right} />
          <Awning f={f} x1={8} x2={50} Y={42} z={26} out={9} c="terracotta" />
          <Box f={f} x={56} y={30} w={32} d={26} h={26} c="paper" />
          <Face f={f} x1={60} x2={82} y={56} z1={4} z2={13} fill={SHADES.sky.top} />
          <Awning f={f} x1={56} x2={88} Y={56} z={21} out={8} c="teal" />
          <Box f={f} x={62} y={74} w={11} d={11} h={9} c="sand" />
          <Box f={f} x={66} y={74} z={9} w={3} d={11} h={0.6} c="terracotta" />
          <Box f={f} x={80} y={84} w={9} d={9} h={7} c="sand" />
        </g>
      );
    case "customers":
      return (
        <g>
          <Tree f={f} x={84} y={20} h={10} r={7} />
          <Box f={f} x={8} y={30} w={42} d={32} h={24} c="cream" />
          <Poly f={f} list={[[8, 26, 22], [50, 26, 22], [50, 46, 38], [8, 46, 38]]} fill={SHADES.terracotta.top} />
          <Poly f={f} list={[[50, 30, 24], [50, 62, 24], [50, 46, 38]]} fill={SHADES.cream.right} />
          <Poly f={f} list={[[8, 46, 38], [50, 46, 38], [50, 66, 22], [8, 66, 22]]} fill={SHADES.terracotta.left} />
          <Face f={f} x1={14} x2={23} y={62} z1={0} z2={15} fill={SHADES.teal.right} />
          <Face f={f} x1={29} x2={44} y={62} z1={7} z2={16} fill={SHADES.sky.top} />
          <FaceX f={f} X={50} y1={38} y2={52} z1={8} z2={17} fill={SHADES.sky.left} />
          <Box f={f} x={70} y={64} w={18} d={4} h={42} c="ink" />
          <Face f={f} x1={71.8} x2={86.2} y={68} z1={4} z2={38} fill={SHADES.paper.top} />
          <Face f={f} x1={73.5} x2={84.5} y={68} z1={32} z2={35.5} fill={SHADES.teal.left} />
          <Face f={f} x1={73.5} x2={84.5} y={68} z1={17} z2={28} fill={SHADES.sage.left} />
          <Face f={f} x1={73.5} x2={84.5} y={68} z1={10} z2={12.5} fill={SHADES.cream.right} />
          <Face f={f} x1={73.5} x2={80.5} y={68} z1={10} z2={12.5} fill={SHADES.terracotta.left} />
        </g>
      );
    case "production":
      return (
        <g>
          <Box f={f} x={16} y={24} w={3} d={3} h={12} c="ink" />
          <Box f={f} x={70} y={24} w={3} d={3} h={12} c="ink" />
          <Box f={f} x={12} y={22} z={12} w={64} d={4} h={38} c="paper" />
          <Face f={f} x1={15} x2={32} y={26} z1={43} z2={46.5} fill={SHADES.terracotta.top} />
          <Face f={f} x1={35} x2={52} y={26} z1={43} z2={46.5} fill={SHADES.gold.top} />
          <Face f={f} x1={55} x2={72} y={26} z1={43} z2={46.5} fill={SHADES.teal.top} />
          <Face f={f} x1={16} x2={31} y={26} z1={33} z2={40} fill={SHADES.sand.top} />
          <Face f={f} x1={16} x2={31} y={26} z1={24} z2={31} fill={SHADES.sand.top} />
          <Face f={f} x1={36} x2={51} y={26} z1={33} z2={40} fill={SHADES.sky.top} />
          <Face f={f} x1={56} x2={71} y={26} z1={33} z2={40} fill={SHADES.sage.top} />
          <Person f={f} x={28} y={48} c="teal" />
          <Person f={f} x={50} y={60} c="terracotta" />
          <Person f={f} x={70} y={46} c="gold" />
        </g>
      );
    case "stock":
      return (
        <g>
          <Box f={f} x={6} y={28} w={3} d={22} h={46} c="ink" />
          <Box f={f} x={43} y={28} w={3} d={22} h={46} c="ink" />
          {[12, 28, 44].map(z => (
            <Box key={z} f={f} x={6} y={28} z={z} w={40} d={22} h={2} c="cream" />
          ))}
          <Box f={f} x={10} y={33} z={14} w={12} d={12} h={10} c="terracotta" />
          <Box f={f} x={27} y={34} z={14} w={12} d={11} h={8} c="sky" />
          <Box f={f} x={12} y={34} z={30} w={10} d={10} h={10} c="sage" />
          <Box f={f} x={27} y={33} z={30} w={13} d={12} h={7} c="lilac" />
          <Box f={f} x={58} y={34} w={28} d={26} h={38} c="paper" />
          {[13, 25].map(z => (
            <Face key={z} f={f} x1={58} x2={86} y={60} z1={z - 0.5} z2={z + 0.5} fill={SHADES.paper.right} />
          ))}
          {[7, 19, 31].map(z => (
            <Face key={`h${z}`} f={f} x1={67} x2={77} y={60} z1={z - 1.2} z2={z + 1.2} fill={SHADES.ink.left} />
          ))}
          <Box f={f} x={64} y={44} z={38} w={16} d={3} h={9} c="gold" />
        </g>
      );
    case "shipping": {
      const [vx, vy] = [14, 44];
      return (
        <g>
          <MapPin f={f} x={30} y={24} h={40} r={10} />
          <Box f={f} x={vx} y={vy} z={4} w={44} d={24} h={24} c="paper" />
          <Box f={f} x={vx + 44} y={vy + 2} z={4} w={16} d={20} h={16} c="teal" />
          <Face f={f} x1={vx + 47} x2={vx + 56} y={vy + 22} z1={11} z2={17} fill={SHADES.sky.top} />
          <Face f={f} x1={vx + 6} x2={vx + 38} y={vy + 24} z1={11} z2={20} fill={SHADES.terracotta.top} />
          {[[vx + 9, vy + 24], [vx + 36, vy + 24], [vx + 53, vy + 22]].map(([wx, wy]) => {
            const [cx, cy] = project(f, wx, wy, 4);
            return <ellipse key={wx} cx={cx} cy={cy} rx={5 * f.k * f.s} ry={5.5 * f.k * f.s} fill={SHADES.ink.left} />;
          })}
          <Box f={f} x={82} y={78} w={10} d={10} h={8} c="sand" />
        </g>
      );
    }
    case "money":
      return (
        <g>
          <Box f={f} x={12} y={20} w={54} d={46} h={5} c="cream" />
          <Box f={f} x={17} y={25} z={5} w={44} d={28} h={22} c="cream" />
          {[21, 33, 45, 57].map(cx => (
            <Cylinder key={cx} f={f} x={cx} y={60} z={5} r={3.4} h={22} c="paper" />
          ))}
          <Box f={f} x={12} y={20} z={27} w={54} d={46} h={4} c="paper" />
          <Poly f={f} list={[[12, 20, 31], [12, 66, 31], [39, 66, 43], [39, 20, 43]]} fill={SHADES.butter.top} />
          <Poly f={f} list={[[39, 20, 43], [39, 66, 43], [66, 66, 31], [66, 20, 31]]} fill={SHADES.butter.right} />
          <Poly f={f} list={[[12, 66, 31], [66, 66, 31], [39, 66, 43]]} fill={SHADES.paper.left} />
          <Cylinder f={f} x={82} y={34} r={8} h={20} c="gold" rings={3} />
          <Cylinder f={f} x={84} y={60} r={8} h={11} c="gold" rings={1} />
        </g>
      );
  }
}

// Cell size and the three cell origins along each side of the plate.
const CELL = 29;
const AT = [3.5, 35.5, 67.5];
const ZONES: { zone: TownZone; i: number; j: number; plate: ShadeName }[] = [
  { zone: "channels", i: 0, j: 0, plate: "rose" },
  { zone: "customers", i: 0, j: 1, plate: "sage" },
  { zone: "production", i: 1, j: 0, plate: "lilac" },
  { zone: "stock", i: 1, j: 2, plate: "sand" },
  { zone: "money", i: 2, j: 1, plate: "butter" },
  { zone: "shipping", i: 2, j: 2, plate: "sky" }
];
const cellFrame = (i: number, j: number): Frame => ({ ...CITY, ox: AT[i], oy: AT[j], k: CELL / 100 });
const cellMid = (i: number) => AT[i] + CELL / 2;

export type TownAnchor = TownZone | "order" | "owl";

/** Where each label meets the picture, as % of CITY_SIZE. */
export const TOWN_ANCHORS: Record<TownAnchor, { x: number; y: number }> = (() => {
  const at = (x: number, y: number, z: number) => {
    const [px, py] = cityPoint(x, y, z);
    return { x: +((px / CITY_SIZE.w) * 100).toFixed(2), y: +((py / CITY_SIZE.h) * 100).toFixed(2) };
  };
  return {
    channels: at(cellMid(0), cellMid(0), 13),
    customers: at(cellMid(0), cellMid(1), 12),
    production: at(cellMid(1), cellMid(0), 14),
    order: at(50, 50, 16),
    stock: at(cellMid(1), cellMid(2), 12),
    money: at(cellMid(2), cellMid(1), 12),
    shipping: at(cellMid(2), cellMid(2), 10),
    // The owl stands towards the outer edge of the right-hand corner, so its bubble clears the Production pin.
    owl: at(AT[2] + CELL * 0.7, AT[0] + CELL * 0.36, 0)
  };
})();

export function PublicIsoTown({ className }: { className?: string }) {
  const base: Frame = { ...CITY, ox: 0, oy: 0, k: 1 };
  const center = cityPoint(50, 50);
  const park = cellFrame(0, 2);
  const corner = cellFrame(2, 0);
  // Back to front: the cells further up the picture are drawn first.
  const drawOrder = [...ZONES].sort((a, b) => a.i + a.j - (b.i + b.j));
  return (
    <svg className={`public-iso public-iso-city${className ? ` ${className}` : ""}`} viewBox={`0 0 ${CITY_SIZE.w} ${CITY_SIZE.h}`} aria-hidden="true" focusable="false">
      <g stroke={INK} strokeWidth="1.3" strokeLinejoin="round">
        <Plate f={base} c="cream" thick={4} grid={false} />
        <Plate f={cellFrame(1, 1)} c="paper" thick={3} />
        {ZONES.map(z => (
          <Plate key={z.zone} f={cellFrame(z.i, z.j)} c={z.plate} thick={3} />
        ))}
        <g stroke={SHADES.terracotta.right} strokeWidth="3" strokeDasharray="10 9" strokeLinecap="round" opacity="0.85">
          {ZONES.map(z => {
            const end = cityPoint(cellMid(z.i), cellMid(z.j));
            return <line key={z.zone} x1={center[0]} y1={center[1]} x2={end[0]} y2={end[1]} />;
          })}
        </g>
        <Tree f={park} x={30} y={30} h={14} r={11} />
        <Tree f={park} x={62} y={40} h={10} r={8} />
        <Tree f={park} x={38} y={70} h={12} r={9} />
        <Tree f={corner} x={30} y={22} h={12} r={9} />
        {drawOrder.filter(z => z.i + z.j < 2).map(z => <TownScene key={z.zone} zone={z.zone} f={cellFrame(z.i, z.j)} />)}
        <Scene scene="order" f={cellFrame(1, 1)} />
        {drawOrder.filter(z => z.i + z.j > 2).map(z => <TownScene key={z.zone} zone={z.zone} f={cellFrame(z.i, z.j)} />)}
      </g>
    </svg>
  );
}
