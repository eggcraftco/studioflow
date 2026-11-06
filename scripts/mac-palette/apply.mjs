#!/usr/bin/env node
// Puts the web app on the Mac palette (owner, 6 Nov 2026). Re-runnable: a
// second run changes nothing, so after a merge conflict in app/globals.css
// take the other side and run this again.
//
//   node scripts/mac-palette/apply.mjs [--dry] [--report out.json]
//
// What it does, in app rules only (public site and customer pages are left
// exactly as they are, see scope.mjs):
//   1. cool-tinted greys (slate, Tailwind/Untitled grays, rgba(23,25,35,…))
//      -> the pure grey of the same luminance (contrast unchanged);
//   2. Tailwind blues (OKLCH hue above the Mac band) -> the Mac accent hue at
//      the same luminance (contrast unchanged);
//   3. the role tokens in palette.mjs (:root, dark body, page background);
//   4. inline styles in app .tsx files: step 1 only (blues there are category
//      colours: card / transfer / file types).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { COLOR_RE, parseMatch, hsl, oklch, neutralize, toHue, formatLike } from "./color.mjs";
import { MAC_LITERALS, MAC_BLUE_HUE, MAC_BLUE_BAND, ROLES, LEGACY_TOKENS, LEGACY_TOKENS_DARK, LEGACY_TOKEN_SCOPE, SETTINGS_LITERALS } from "./palette.mjs";
import { makeClassIndex, makeFileScope, moduleCssFiles, selectorScope, sourceFiles, SETTINGS_SCOPE } from "./scope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(ROOT, "package.json"));
const postcss = require("postcss");

const rgbKey = (c) => `${c.r},${c.g},${c.b}`;
const hexKey = (hex) => {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
};
export const MAC_KEYS = new Set(MAC_LITERALS.map(([hex]) => hexKey(hex)));
export const SETTINGS_KEYS = new Set(SETTINGS_LITERALS.map(([hex]) => hexKey(hex)));

export function isCoolGrey(c) {
  const h = hsl(c);
  return h.spread > 0 && h.spread <= 48 && h.s < 0.62 && h.h >= 185 && h.h <= 275;
}
export function isOffMacBlue(c) {
  if (isCoolGrey(c)) return false;
  const o = oklch(c);
  return o.C > 0.03 && o.h > MAC_BLUE_BAND[1] && o.h <= 270;
}

// -> { next, kind } or null when the colour stays.
export function mapColor(c, { settings = false, blues = true } = {}) {
  if (c.a === 0) return null;
  const key = rgbKey(c);
  if (MAC_KEYS.has(key)) return null;
  if (settings && SETTINGS_KEYS.has(key)) return null;
  if (isCoolGrey(c)) return { next: neutralize(c), kind: "grey" };
  if (blues && isOffMacBlue(c)) return { next: toHue(c, MAC_BLUE_HUE), kind: "blue" };
  return null;
}

export function mapValue(value, opts, tally) {
  return value.replace(COLOR_RE, (...m) => {
    const c = parseMatch(m);
    const r = mapColor(c, opts);
    if (!r) return m[0];
    const out = formatLike(c, r.next);
    if (out !== m[0] && tally) tally[r.kind] = (tally[r.kind] || 0) + 1;
    return out;
  });
}

const norm = (s) => s.replace(/\s+/g, " ").trim();

function transformCss(root, { classUse, wholeFileScope = null, tally }) {
  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === "atrule" && /keyframes/i.test(rule.parent.name)) {
      // keyframe steps follow the rule that uses them: treat as app.
    }
    const sels = rule.selectors || [rule.selector];
    const scopes = wholeFileScope
      ? sels.map(() => wholeFileScope)
      : sels.map((s) => (/^(from|to|\d+%)$/.test(s.trim()) ? "app" : selectorScope(s, classUse)));
    if (scopes.every((s) => s === "public")) { tally.publicRules++; return; }
    const settings = sels.some((s) => SETTINGS_SCOPE.test(s));
    const changes = [];
    rule.each((node) => {
      if (node.type !== "decl") return;
      const next = mapValue(node.value, { settings }, null);
      if (next !== node.value) changes.push([node, next]);
    });
    if (!changes.length) return;
    if (scopes.some((s) => s === "public")) {
      // Mixed list: the public selectors keep a copy with the old values.
      const pub = rule.clone({ selectors: sels.filter((_, i) => scopes[i] === "public") });
      rule.selectors = sels.filter((_, i) => scopes[i] !== "public");
      rule.before(pub);
      tally.splitRules++;
    }
    for (const [node] of changes) node.value = mapValue(node.value, { settings }, tally);
  });
}

function setRoles(root, tally) {
  for (const role of ROLES) {
    let done = false;
    root.each((node) => {
      if (done || node.type !== "rule" || norm(node.selector) !== norm(role.sel)) return;
      node.walkDecls(role.prop, (d) => {
        if (done) return;
        if (d.value !== role.value) { d.value = role.value; tally.roles++; }
        done = true;
      });
    });
    if (!done) throw new Error(`role not found: ${role.sel} { ${role.prop} }`);
  }
}

function pinLegacy(root, tally) {
  // `html …` because the login page already has a plain .login-public-shell rule.
  const blocks = [
    [`html ${LEGACY_TOKEN_SCOPE}`, LEGACY_TOKENS],
    [`body[data-studio-theme="dark"] ${LEGACY_TOKEN_SCOPE}`, LEGACY_TOKENS_DARK],
  ];
  let anchor = root.nodes.find((n) => n.type === "rule" && norm(n.selector) === 'body[data-studio-theme="dark"]');
  for (const [i, [sel, tokens]] of blocks.entries()) {
    const existing = root.nodes.find((n) => n.type === "rule" && norm(n.selector) === norm(sel));
    if (existing) { anchor = existing; continue; }
    const rule = postcss.rule({ selector: sel, raws: { before: "\n\n", between: " ", after: "\n" } });
    for (const [prop, value] of tokens) rule.append(postcss.decl({ prop, value, raws: { before: "\n  ", between: ": " } }));
    if (i === 0) {
      const note = postcss.comment({
        text: "The login page wears the public site's look: it keeps the app tokens it had\n   before the Mac palette (6 Nov 2026), so the site does not change.",
        raws: { before: "\n\n" },
      });
      anchor.after(note);
      anchor = note;
    }
    anchor.after(rule);
    anchor = rule;
    tally.legacyBlocks++;
  }
}

function transformTsx(text, tally) {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return line;
      return mapValue(line, { blues: false }, tally);
    })
    .join("\n");
}

export function run({ dry = false } = {}) {
  const tally = { grey: 0, blue: 0, roles: 0, publicRules: 0, splitRules: 0, legacyBlocks: 0, files: [] };
  const classUse = makeClassIndex(ROOT);

  const gPath = path.join(ROOT, "app/globals.css");
  const before = fs.readFileSync(gPath, "utf8");
  const root = postcss.parse(before, { from: gPath });
  transformCss(root, { classUse, tally });
  setRoles(root, tally);
  pinLegacy(root, tally);
  const after = root.toString();
  if (after !== before) { tally.files.push("app/globals.css"); if (!dry) fs.writeFileSync(gPath, after); }

  for (const f of moduleCssFiles(ROOT)) {
    if (f.scope !== "app") continue;
    const src = fs.readFileSync(f.abs, "utf8");
    const r = postcss.parse(src, { from: f.abs });
    transformCss(r, { classUse, wholeFileScope: "app", tally });
    const out = r.toString();
    if (out !== src) { tally.files.push(f.rel); if (!dry) fs.writeFileSync(f.abs, out); }
  }

  const scopeOf = makeFileScope(ROOT);
  for (const f of sourceFiles(ROOT)) {
    if (!/\.tsx$/.test(f.rel) || !/^(app|components)\//.test(f.rel) || scopeOf(f.rel) !== "app") continue;
    const src = fs.readFileSync(f.abs, "utf8");
    const out = transformTsx(src, tally);
    if (out !== src) { tally.files.push(f.rel); if (!dry) fs.writeFileSync(f.abs, out); }
  }
  return tally;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes("--dry");
  const t = run({ dry });
  console.log(JSON.stringify({ ...t, files: t.files.length, fileList: t.files }, null, 1));
}
