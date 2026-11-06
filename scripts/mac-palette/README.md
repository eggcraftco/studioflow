# Mac palette for the web app

Owner, 6 Nov 2026: the web app's colours must match the Mac app's; the web
"drifted to blue" (slate / Tailwind greys, an indigo-leaning accent).

- `palette.mjs` — the Mac values role by role, where each comes from
  (EGGcraft/*.swift and AppKit's system colours on macOS 27), the WCAG pairs.
- `apply.mjs` — puts app CSS and app `.tsx` inline styles on the palette.
  Re-runnable: a second run changes nothing. **After a merge conflict in
  `app/globals.css`, take the other side and run `node scripts/mac-palette/apply.mjs`
  again**, then `npm run test:mac-palette`.
- `scope.mjs` — what is app and what is the public site / customer pages
  (`.public-site`, `.public-cream`, landing, login, /track /e /invite /book /p
  /pay /f, and components only those import). The site is never touched.
- `scripts/check-mac-palette.mjs` (`npm run test:mac-palette`) — the gate.

Rules the transform follows:

1. A blue-tinted grey becomes the pure grey with the same luminance, so every
   contrast ratio stays where it was.
2. A Tailwind blue (OKLCH hue above the Mac band) moves to the Mac accent hue
   (#007AFF) at the same luminance. Blues in `.tsx` are left alone: there they
   are category colours (card / transfer / file type).
3. The role tokens (`:root`, dark body, page background) take the Mac values.
   Where a Mac value would put text under AA, the hue is kept and only the
   lightness moves (muted text #6B6B6B, danger #C92C2F light / #FF5B5D dark).
4. The Settings screen keeps its handoff palette — the Mac Settings screen uses
   the same one (SettingsDesignSystem.swift); its dark mode follows the Mac's
   neutral dark greys.
5. Colours the Mac source uses literally (order stripe colours, systemGray) stay.
