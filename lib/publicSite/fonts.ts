import { Fraunces, Inter_Tight } from "next/font/google";

// The public site's two typefaces (cream redesign, 2 Nov 2026). next/font
// downloads the files at build time and serves them from our own origin, so a
// visitor's browser never asks Google for a font. Both are SIL Open Font
// Licence. Inter Tight carries the headings and the body; Fraunces italic is
// the accent voice (eyebrows, the mascot's lines). Arabic, Hindi, Japanese and
// Chinese have no glyphs here and fall through to the system font stack.
export const publicSans = Inter_Tight({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-public-sans",
  display: "swap"
});

export const publicSerif = Fraunces({
  subsets: ["latin", "latin-ext"],
  style: ["italic"],
  variable: "--font-public-serif",
  display: "swap"
});

export const PUBLIC_FONT_CLASSES = `${publicSans.variable} ${publicSerif.variable}`;
