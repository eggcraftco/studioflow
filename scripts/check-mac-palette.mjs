#!/usr/bin/env node
// "App colours come from the Mac palette" (owner, 6 Nov 2026).
//
//   node scripts/check-mac-palette.mjs [--root <web tree>]
//
// 1. Every role token in scripts/mac-palette/palette.mjs holds the Mac value
//    (light, dark, and the Settings palette the Mac Settings screen uses).
// 2. App CSS rules (app/globals.css outside the public site and customer
//    pages, app CSS modules) carry no cool-tinted grey and no off-Mac blue,
//    other than colours the Mac source itself uses.
// 3. App .tsx inline styles carry no cool-tinted grey.
// 4. Text roles stay at WCAG AA (4.5:1) on the surfaces they sit on.
// 5. The login page (public look) keeps its pre-change tokens.
// The apply script is scripts/mac-palette/apply.mjs; it is re-runnable.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { COLOR_RE, parseMatch, parseColor, contrast, over, toHex } from "./mac-palette/color.mjs";
import { ROLES, AA_PAIRS, LEGACY_TOKENS, LEGACY_TOKENS_DARK, LEGACY_TOKEN_SCOPE } from "./mac-palette/palette.mjs";
import { mapColor } from "./mac-palette/apply.mjs";
import { makeClassIndex, makeFileScope, moduleCssFiles, selectorScope, sourceFiles, SETTINGS_SCOPE } from "./mac-palette/scope.mjs";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argRoot = process.argv.indexOf("--root");
const ROOT = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : here;
const require = createRequire(path.join(here, "package.json"));
const postcss = require("postcss");

const failures = [];
const fail = (msg) => failures.push(msg);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const css = postcss.parse(fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8"));

function readDecl(sel, prop) {
  let value = null;
  css.each((node) => {
    if (value != null || node.type !== "rule" || norm(node.selector) !== norm(sel)) return;
    node.walkDecls(prop, (d) => { if (value == null) value = d.value; });
  });
  return value;
}

// 1. role tokens
let rolesOk = 0;
for (const r of ROLES) {
  const v = readDecl(r.sel, r.prop);
  if (v == null) fail(`role missing: ${r.sel} { ${r.prop} } (Mac: ${r.value}, ${r.mac})`);
  else if (norm(v).toLowerCase() !== norm(r.value).toLowerCase()) fail(`role ${r.theme} ${r.sel} ${r.prop} = ${v}, Mac palette = ${r.value} (${r.mac})`);
  else rolesOk++;
}

// 2. app CSS
const classUse = makeClassIndex(ROOT);
const cssHits = [];
function scanCss(root, label, wholeFileScope) {
  root.walkRules((rule) => {
    const sels = rule.selectors || [rule.selector];
    const appSels = wholeFileScope ? sels : sels.filter((s) => /^(from|to|\d+%)$/.test(s.trim()) || selectorScope(s, classUse) === "app");
    if (!appSels.length) return;
    const settings = appSels.some((s) => SETTINGS_SCOPE.test(s));
    rule.each((d) => {
      if (d.type !== "decl") return;
      for (const m of d.value.matchAll(COLOR_RE)) {
        const c = parseMatch(m);
        const r = mapColor(c, { settings });
        if (r) cssHits.push(`${label}:${d.source?.start?.line} ${norm(appSels[0]).slice(0, 60)} { ${d.prop}: ${m[0]} } -> ${r.kind === "grey" ? "neutral grey" : "Mac blue"} ${toHex(r.next)}`);
      }
    });
  });
}
scanCss(css, "app/globals.css", null);
for (const f of moduleCssFiles(ROOT)) if (f.scope === "app") scanCss(postcss.parse(fs.readFileSync(f.abs, "utf8")), f.rel, "app");
if (cssHits.length) fail(`${cssHits.length} app CSS colour(s) off the Mac palette, e.g.\n    ${cssHits.slice(0, 12).join("\n    ")}`);

// 3. app TSX inline greys
const scopeOf = makeFileScope(ROOT);
const tsxHits = [];
for (const f of sourceFiles(ROOT)) {
  if (!/\.tsx$/.test(f.rel) || !/^(app|components)\//.test(f.rel) || scopeOf(f.rel) !== "app") continue;
  fs.readFileSync(f.abs, "utf8").split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    for (const m of line.matchAll(COLOR_RE)) {
      const r = mapColor(parseMatch(m), { blues: false });
      if (r) tsxHits.push(`${f.rel}:${i + 1} ${m[0]} -> ${toHex(r.next)}`);
    }
  });
}
if (tsxHits.length) fail(`${tsxHits.length} cool-tinted grey(s) in app .tsx, e.g.\n    ${tsxHits.slice(0, 8).join("\n    ")}`);

// 4. contrast
const roleValue = (theme, name) => {
  if (name === "canvas") {
    return theme === "light" ? readDecl("body", "background") : readDecl('body[data-studio-theme="dark"]', "background");
  }
  const sel = theme === "light" ? ":root" : 'body[data-studio-theme="dark"]';
  return readDecl(sel, name);
};
const aaRows = [];
for (const p of AA_PAIRS) {
  const fg = parseColor(roleValue(p.theme, p.fg) || "");
  let bg = parseColor(roleValue(p.theme, p.on) || "");
  const surface = parseColor(roleValue(p.theme, "--surface") || "");
  if (!fg || !bg || !surface) { fail(`contrast: cannot read ${p.theme} ${p.fg} / ${p.on}`); continue; }
  if (bg.a < 1) bg = over(bg, surface);
  const ratio = contrast(fg, bg);
  const open = ratio < 4.5 && p.before != null && ratio >= p.before - 0.005;
  aaRows.push(`${p.theme.padEnd(5)} ${p.fg.padEnd(9)} on ${p.on.padEnd(13)} ${ratio.toFixed(2)}${open ? `  (open: under AA before too, ${p.before})` : ""}`);
  if (ratio < 4.5 && !open) fail(`WCAG AA: ${p.theme} ${p.fg} on ${p.on} is ${ratio.toFixed(2)}:1 (< 4.5)`);
}

// 5. the login page keeps its tokens
for (const [sel, tokens] of [[`html ${LEGACY_TOKEN_SCOPE}`, LEGACY_TOKENS], [`body[data-studio-theme="dark"] ${LEGACY_TOKEN_SCOPE}`, LEGACY_TOKENS_DARK]]) {
  for (const [prop, value] of tokens) {
    const v = readDecl(sel, prop);
    if (v == null || norm(v) !== norm(value)) fail(`login page token ${sel} ${prop} = ${v}, expected its pre-change ${value}`);
  }
}

console.log(`Mac palette: roles ${rolesOk}/${ROLES.length}; app CSS off-palette ${cssHits.length}; app .tsx tinted greys ${tsxHits.length}`);
console.log(`  contrast (WCAG AA 4.5):\n    ${aaRows.join("\n    ")}`);
if (failures.length) {
  console.error(`\nFAIL (${failures.length}) — tree ${ROOT}`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  if (failures.length > 40) console.error(`  … ${failures.length - 40} more`);
  process.exit(1);
}
console.log("PASS: app colours come from the Mac palette");
