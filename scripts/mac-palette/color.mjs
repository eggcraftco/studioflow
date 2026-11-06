// Colour maths for the Mac palette tools (owner, 6 Nov 2026: "tüm renk ayarları
// mac versiyonu gibi olsun … web versiyonu biraz mavi tonlara kaçıyor").
//
// Two transforms keep every WCAG contrast ratio where it was, because WCAG
// contrast depends only on relative luminance:
//   neutralize(c)  a tinted grey -> the pure grey with the same luminance
//   toHue(c, h)    a blue -> the Mac blue hue with the same luminance
// Alpha is kept as it was.

export const COLOR_RE =
  /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+%?)\s*)?\)/g;

export function parseMatch(m) {
  if (m[1]) {
    let h = m[1];
    const short = h.length === 3 || h.length === 4;
    if (short) h = h.split("").map((c) => c + c).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      kind: "hex",
      short,
      upper: /[A-F]/.test(m[1]),
      alphaHex: h.length === 8 ? h.slice(6, 8) : null,
      text: m[0],
    };
  }
  const a = m[5];
  return {
    r: +m[2],
    g: +m[3],
    b: +m[4],
    a: a == null ? 1 : String(a).endsWith("%") ? parseFloat(a) / 100 : +a,
    kind: "rgb",
    alphaText: a ?? null,
    text: m[0],
  };
}

export function parseColor(text) {
  COLOR_RE.lastIndex = 0;
  const m = COLOR_RE.exec(text);
  COLOR_RE.lastIndex = 0;
  return m && m[0] === text.trim() ? parseMatch(m) : null;
}

const toLin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLin = (l) => {
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

export function luminance({ r, g, b }) {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function over(fg, bg) {
  const a = fg.a ?? 1;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

export function contrast(fg, bg) {
  const solidBg = bg.a != null && bg.a < 1 ? over(bg, { r: 255, g: 255, b: 255 }) : bg;
  const solidFg = fg.a != null && fg.a < 1 ? over(fg, solidBg) : fg;
  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function hsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (mx === R) h = ((G - B) / d) % 6;
    else if (mx === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l, spread: Math.max(r, g, b) - Math.min(r, g, b) };
}

// --- OKLab / OKLCH (Björn Ottosson) -----------------------------------------
function linToOklab(R, G, B) {
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToLin(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
export function oklch({ r, g, b }) {
  const [L, A, B] = linToOklab(toLin(r), toLin(g), toLin(b));
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C: Math.hypot(A, B), h };
}
function fromOklch(L, C, h) {
  const rad = (h * Math.PI) / 180;
  const [R, G, B] = oklabToLin(L, C * Math.cos(rad), C * Math.sin(rad));
  const inGamut = [R, G, B].every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  return { inGamut, rgb: { r: fromLin(Math.max(0, R)), g: fromLin(Math.max(0, G)), b: fromLin(Math.max(0, B)) } };
}

// The pure grey whose relative luminance equals the colour's.
export function neutralize(c) {
  const v = fromLin(luminance(c));
  return { r: v, g: v, b: v, a: c.a };
}

// The colour moved to OKLCH hue `h`, chroma kept (reduced only to stay in
// gamut), lightness solved so the relative luminance is unchanged.
export function toHue(c, h) {
  const target = luminance(c);
  const { C } = oklch(c);
  for (let chroma = C; chroma >= 0; chroma -= 0.002) {
    let lo = 0, hi = 1, best = null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const { inGamut, rgb } = fromOklch(mid, chroma, h);
      const y = luminance(rgb);
      if (y < target) lo = mid; else hi = mid;
      best = { inGamut, rgb };
    }
    if (best && best.inGamut) return { ...best.rgb, a: c.a };
  }
  return neutralize(c);
}

const hex2 = (n) => n.toString(16).padStart(2, "0");

// Writes `next` in the same notation as the original text (hex length/case,
// rgb vs rgba, comma spacing, the alpha written exactly as before).
export function formatLike(orig, next) {
  if (orig.kind === "hex") {
    let h = hex2(next.r) + hex2(next.g) + hex2(next.b);
    if (orig.short && !orig.alphaHex && h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) h = h[0] + h[2] + h[4];
    else if (orig.alphaHex) h += orig.alphaHex.toLowerCase();
    return "#" + (orig.upper ? h.toUpperCase() : h.toLowerCase());
  }
  const spaced = /,\s/.test(orig.text);
  const sep = spaced ? ", " : ",";
  const fn = orig.text.slice(0, orig.text.indexOf("("));
  const parts = [next.r, next.g, next.b];
  if (orig.alphaText != null) parts.push(orig.alphaText);
  return `${fn}(${parts.join(sep)})`;
}

export const toHex = ({ r, g, b }) => "#" + [r, g, b].map(hex2).join("").toUpperCase();
