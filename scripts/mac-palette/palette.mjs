// The Mac app's palette, role by role (owner, 6 Nov 2026: the web app's
// colours must follow the Mac app; the web "drifts to blue").
//
// Sources, measured on this Mac (macOS 27, AppKit, light "aqua" / dark "darkAqua"):
//   EGGcraft/ContentView.swift      bgMain   Color(white: 0.93) / 0.08
//                                   bgSidebar Color(white: 0.97) / 0.12
//                                   bgHeader  .white / Color(white: 0.10)
//                                   cards     .white / Color(white: 0.12–0.15)
//   NSColor.labelColor            black 84.7 %  -> #272727 on white   / white 84.7 % -> #DDDDDD on #1E1E1E
//   NSColor.secondaryLabelColor   black 49.8 %  -> #808080 on white   / white 54.9 % -> #9A9A9A on #1E1E1E
//   NSColor.separatorColor        black  9.8 %                        / white  9.8 %
//   NSColor.linkColor             #0068DA                             / #419CFF
//   NSColor.controlAccentColor    #007AFF (Mac accent, AccentColor asset is empty)
//   systemRed #FF383C / #FF4245, systemGreen #34C759 / #30D158, systemOrange #FF8D28 / #FF9230
//
// Where the Mac's own value would put text under WCAG AA (4.5:1) the web keeps
// the Mac hue and only goes as dark (light theme) or as light (dark theme) as
// AA needs; each such row says so. The check (scripts/check-mac-palette.mjs)
// measures every text/background pair below.

// OKLCH hue of the Mac accent #007AFF. Blues outside MAC_BLUE_BAND are moved
// onto this hue at unchanged luminance.
export const MAC_BLUE_HUE = 257.42;
export const MAC_BLUE_BAND = [249.5, 259.5]; // #0091FF 251.5 … #007AFF 257.4, #0068DA 257.3

// Colours that appear literally in the Mac source (or are the Mac's own
// systemGray behind SwiftUI `.gray`): the web may use them as they are even
// though they carry a slight tint.
export const MAC_LITERALS = [
  ["#8D939E", "ContentView.swift orderStateStripeColor .cancelled (0.5529, 0.5765, 0.6196)"],
  ["#2F6DF6", "ContentView.swift orderStateStripeColor .active (0.1843, 0.4275, 0.9647)"],
  ["#E5484D", "ContentView.swift orderStateStripeColor .late (0.898, 0.2824, 0.302)"],
  ["#F5A623", "ContentView.swift orderStateStripeColor .waiting (0.9608, 0.651, 0.1373)"],
  ["#30A46C", "ContentView.swift orderStateStripeColor .done (0.1882, 0.6431, 0.4235)"],
  ["#F1F1F3", "ContentView.swift Color(red: 0.945, green: 0.945, blue: 0.955)"],
  ["#2E2E33", "ContentView.swift Color(red: 0.18, green: 0.18, blue: 0.20)"],
  ["#D1D1D6", "ContentView.swift Color(red: 0.82, green: 0.82, blue: 0.84)"],
  ["#8E8E93", "SwiftUI .gray = NSColor.systemGray (light)"],
  ["#98989D", "SwiftUI .gray = NSColor.systemGray (dark)"],
];

// The Settings screen has its own palette on the Mac too
// (EGGcraft/SettingsDesignSystem.swift, the Sept 2026 design handoff); the
// web Settings already used it. Inside .settings-* rules these stay.
export const SETTINGS_LITERALS = [
  ["#F3F5F9", "NDSettings.canvas (light)"], ["#F7F8FB", "NDSettings.panel (light)"],
  ["#E3E6EE", "NDSettings.border (light)"], ["#141827", "NDSettings.text (light)"],
  ["#667085", "NDSettings.muted (light)"], ["#ECEEFC", "NDSettings.rowActive (light)"],
  ["#5865E8", "NDSettings.accent"], ["#2F9A55", "NDSettings.success"],
  ["#D97706", "NDSettings.caution"], ["#D64545", "NDSettings.danger"],
];

// Role tokens. `sel` is the exact selector of the block that defines the
// value in app/globals.css; `mac` says where the value comes from.
export const ROLES = [
  // ---- light ---------------------------------------------------------------
  { theme: "light", sel: ":root", prop: "--background", value: "#f7f7f7", mac: "bgSidebar Color(white: 0.97)" },
  { theme: "light", sel: ":root", prop: "--surface", value: "#ffffff", mac: "cards .white" },
  { theme: "light", sel: ":root", prop: "--surface-strong", value: "#ffffff", mac: "cards .white" },
  { theme: "light", sel: ":root", prop: "--panel", value: "rgba(247, 247, 247, 0.84)", mac: "bgSidebar Color(white: 0.97)" },
  { theme: "light", sel: ":root", prop: "--text", value: "#272727", mac: "labelColor (black 84.7 %) on white" },
  { theme: "light", sel: ":root", prop: "--muted", value: "#6b6b6b", mac: "secondaryLabelColor, neutral grey; #808080 is 3.9:1, so as dark as AA needs on #EDEDED" },
  { theme: "light", sel: ":root", prop: "--border", value: "rgba(0, 0, 0, 0.10)", mac: "separatorColor (black 9.8 %)" },
  { theme: "light", sel: ":root", prop: "--accent", value: "#0068da", mac: "linkColor" },
  { theme: "light", sel: ":root", prop: "--accent-soft", value: "rgba(0, 122, 255, 0.10)", mac: "controlAccentColor #007AFF at 10 % (Color.blue.opacity(0.1))" },
  { theme: "light", sel: ":root", prop: "--success", value: "#34c759", mac: "systemGreen" },
  { theme: "light", sel: ":root", prop: "--success-soft", value: "rgba(52, 199, 89, 0.14)", mac: "systemGreen at 14 %" },
  { theme: "light", sel: ":root", prop: "--warning", value: "#ff8d28", mac: "systemOrange" },
  { theme: "light", sel: ":root", prop: "--warning-rgb", value: "255, 141, 40", mac: "systemOrange" },
  { theme: "light", sel: ":root", prop: "--warning-soft", value: "rgba(255, 141, 40, 0.14)", mac: "systemOrange at 14 %" },
  { theme: "light", sel: ":root", prop: "--danger", value: "#c92c2f", mac: "systemRed hue, as dark as AA needs on white and on --danger-soft" },
  { theme: "light", sel: ":root", prop: "--danger-soft", value: "rgba(255, 56, 60, 0.12)", mac: "systemRed at 12 %" },
  { theme: "light", sel: 'html[data-studio-theme="light"]', prop: "background", value: "#ededed", mac: "bgMain Color(white: 0.93)" },
  { theme: "light", sel: "body", prop: "background", value: "#ededed", mac: "bgMain Color(white: 0.93)" },
  { theme: "light", sel: 'body[data-studio-theme="light"]', prop: "background", value: "#ededed", mac: "bgMain Color(white: 0.93)" },
  // ---- dark ----------------------------------------------------------------
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--background", value: "#141414", mac: "bgMain Color(white: 0.08)" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--surface", value: "#1f1f1f", mac: "bgSidebar / cards Color(white: 0.12)" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--surface-strong", value: "#262626", mac: "cards Color(white: 0.15)" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--panel", value: "rgba(255, 255, 255, 0.06)", mac: "white 6 % fill" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--text", value: "#dddddd", mac: "labelColor (white 84.7 %) on #1E1E1E" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--muted", value: "#9a9a9a", mac: "secondaryLabelColor (white 54.9 %) on #1E1E1E" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--border", value: "rgba(255, 255, 255, 0.10)", mac: "separatorColor (white 9.8 %)" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--accent", value: "#0a84ff", mac: "systemBlue (dark); kept so white text on blue buttons does not lose contrast" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--accent-soft", value: "rgba(10, 132, 255, 0.18)", mac: "systemBlue at 18 %" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--success", value: "#30d158", mac: "systemGreen (dark)" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--success-soft", value: "rgba(48, 209, 88, 0.16)", mac: "systemGreen (dark) at 16 %" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--warning", value: "#ff9230", mac: "systemOrange (dark)" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--warning-rgb", value: "255, 146, 48", mac: "systemOrange (dark)" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--warning-soft", value: "rgba(255, 146, 48, 0.16)", mac: "systemOrange (dark) at 16 %" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--danger", value: "#ff5b5d", mac: "systemRed (dark) hue, as light as AA needs on --surface and --danger-soft" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "--danger-soft", value: "rgba(255, 66, 69, 0.16)", mac: "systemRed (dark) at 16 %" },
  { theme: "dark", sel: 'body[data-studio-theme="dark"]', prop: "background", value: "#141414", mac: "bgMain Color(white: 0.08)" },
  // ---- Settings (SettingsDesignSystem.swift) ---------------------------------
  { theme: "light", scope: "settings", sel: ".settings-workspace", prop: "--settings-canvas", value: "#f3f5f9", mac: "NDSettings.canvas" },
  { theme: "light", scope: "settings", sel: ".settings-workspace", prop: "--text", value: "#141827", mac: "NDSettings.text" },
  { theme: "light", scope: "settings", sel: ".settings-workspace", prop: "--muted", value: "#667085", mac: "NDSettings.muted" },
  { theme: "light", scope: "settings", sel: ".settings-workspace", prop: "--surface", value: "#ffffff", mac: "NDSettings.surface" },
  { theme: "light", scope: "settings", sel: ".settings-workspace", prop: "--accent", value: "#5865e8", mac: "NDSettings.accent" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--settings-canvas", value: "#141414", mac: "NDSettings.canvas (dark) Color(white: 0.08)" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--settings-surface", value: "#202020", mac: "NDSettings.surface (dark) Color(white: 0.125)" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--settings-border", value: "rgba(255, 255, 255, 0.10)", mac: "NDSettings.border (dark) white 10 %" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--text", value: "#f0f0f0", mac: "NDSettings.text (dark) Color(white: 0.94)" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--muted", value: "#a3a3a3", mac: "NDSettings.muted (dark) Color(white: 0.64)" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--border", value: "rgba(255, 255, 255, 0.10)", mac: "NDSettings.border (dark) white 10 %" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--surface", value: "#202020", mac: "NDSettings.surface (dark) Color(white: 0.125)" },
  { theme: "dark", scope: "settings", sel: 'body[data-studio-theme="dark"] .settings-workspace', prop: "--panel", value: "#292929", mac: "NDSettings.panel (dark) Color(white: 0.16)" },
];

// Text-on-background pairs that must stay at WCAG AA (4.5:1). `on` may be a
// role name or "canvas" (the page background); soft fills are laid over the
// theme's surface. A pair that was already under AA before this change carries
// `before`: it may not get worse, and it is listed as open in the check output.
export const AA_PAIRS = [
  ...["light", "dark"].flatMap((theme) => [
    ["--text", "--surface"], ["--text", "--background"], ["--text", "canvas"],
    ["--muted", "--surface"], ["--muted", "--background"], ["--muted", "canvas"],
    ["--accent", "--surface"], ["--accent", "--accent-soft"],
    ["--danger", "--surface"], ["--danger", "--danger-soft"],
  ].map(([fg, on]) => ({ theme, fg, on }))),
].map((p) =>
  // Dark blue text on the dark blue tint: 3.65 on the live tree too. A lighter
  // blue (Mac linkColor #419CFF) would fix it but drop white text on blue
  // buttons from 3.65 to 2.83, so the value stays and the pair stays open.
  p.theme === "dark" && p.fg === "--accent" && p.on === "--accent-soft" ? { ...p, before: 3.65 } : p,
);

// Wrappers whose subtree is the public site (or the login page that wears
// its look): they keep the app tokens they had before this change.
export const LEGACY_TOKEN_SCOPE = ".login-public-shell";
export const LEGACY_TOKENS = [
  ["--text", "#171923"], ["--muted", "#667085"], ["--border", "rgba(23, 25, 35, 0.10)"],
  ["--accent", "#2563eb"], ["--accent-soft", "rgba(37, 99, 235, 0.10)"], ["--success", "#34c759"],
  ["--success-soft", "rgba(52, 199, 89, 0.14)"], ["--warning", "#ff9500"], ["--warning-rgb", "255, 149, 0"],
  ["--warning-soft", "rgba(255, 149, 0, 0.14)"], ["--danger", "#9f2d2d"], ["--danger-soft", "rgba(255, 59, 48, 0.12)"],
  ["--background", "#f7f8fb"], ["--panel", "rgba(248, 250, 252, 0.84)"],
];
export const LEGACY_TOKENS_DARK = [
  ["--text", "#f4f5f7"], ["--muted", "#a3a3a3"], ["--border", "rgba(255, 255, 255, 0.12)"],
  ["--accent", "#0a84ff"], ["--accent-soft", "rgba(10, 132, 255, 0.18)"], ["--success", "#34c759"],
  ["--success-soft", "rgba(52, 199, 89, 0.16)"], ["--warning", "#ff9500"], ["--warning-rgb", "255, 149, 0"],
  ["--warning-soft", "rgba(255, 149, 0, 0.16)"], ["--danger", "#ff8a8a"], ["--danger-soft", "rgba(255, 138, 138, 0.16)"],
  ["--background", "#141414"], ["--panel", "rgba(255, 255, 255, 0.06)"],
];
