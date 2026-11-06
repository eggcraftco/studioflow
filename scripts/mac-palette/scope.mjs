// Which source files and CSS rules belong to the app (the Mac palette
// applies) and which to the public site or a customer-facing page (they keep
// their own look: .public-site / .public-cream, the landing page, the login
// page, /track /e /invite /book /p /pay /f).
import fs from "node:fs";
import path from "node:path";

const PUBLIC_TOP_DIRS = new Set(["[lang]", "track", "e", "invite", "book", "p", "pay", "f", "integrations", "login"]);
const PUBLIC_COMPONENTS = /^components\/(Public[A-Za-z]*|CustomOrderLanding|CookieConsent|AuthFeatureRotator|AuthProviders)\.(tsx|ts|module\.css)$/;
const PUBLIC_IMPORT = /from\s+["']@\/components\/(Public[A-Za-z]*|CustomOrderLanding)["']/;
// Class names that are public by their name, wherever they are used (the
// admin insights hub renders a .public-site preview, for example).
export const PUBLIC_CLASS = /^(public-|lp-|login-public)/;
// Selectors the Settings handoff palette owns (Mac: SettingsDesignSystem.swift).
export const SETTINGS_SCOPE = /\.settings-/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

export function sourceFiles(root) {
  const files = [];
  for (const d of ["app", "components", "lib"]) walk(path.join(root, d), files);
  return files
    .map((abs) => ({ abs, rel: path.relative(root, abs).split(path.sep).join("/") }))
    .filter((f) => f.rel !== "app/globals.css");
}

export function publicTopDirs(root) {
  const dirs = new Set(PUBLIC_TOP_DIRS);
  const appDir = path.join(root, "app");
  for (const e of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const page = path.join(appDir, e.name, "page.tsx");
    if (fs.existsSync(page) && PUBLIC_IMPORT.test(fs.readFileSync(page, "utf8"))) dirs.add(e.name);
  }
  return dirs;
}

export function makeFileScope(root) {
  const dirs = publicTopDirs(root);
  const rootPage = path.join(root, "app/page.tsx");
  const rootPagePublic = fs.existsSync(rootPage) && PUBLIC_IMPORT.test(fs.readFileSync(rootPage, "utf8"));
  const direct = (rel) => {
    if (PUBLIC_COMPONENTS.test(rel)) return "public";
    if (rel.startsWith("lib/publicSite/")) return "public";
    if (rel === "app/page.tsx") return rootPagePublic ? "public" : "app";
    const m = rel.match(/^app\/([^/]+)\//);
    if (m && dirs.has(m[1])) return "public";
    return "app";
  };
  // A shared component that only public files import (the site's chat
  // widget, for example) is public too. Fixpoint over the import graph.
  const files = sourceFiles(root).filter((f) => /\.tsx?$/.test(f.rel));
  const texts = new Map(files.map((f) => [f.rel, fs.readFileSync(f.abs, "utf8")]));
  const scope = new Map(files.map((f) => [f.rel, direct(f.rel)]));
  const comps = files.filter((f) => /^components\/[^/]+\.tsx?$/.test(f.rel) && scope.get(f.rel) === "app");
  const importersOf = new Map();
  for (const c of comps) {
    const name = c.rel.replace(/^components\//, "").replace(/\.tsx?$/, "");
    const re = new RegExp(`from\\s+["'](?:@/components/|\\./|\\.\\./components/|\\.\\./\\.\\./components/)${name}["']`);
    importersOf.set(c.rel, [...texts].filter(([rel, t]) => rel !== c.rel && re.test(t)).map(([rel]) => rel));
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const c of comps) {
      if (scope.get(c.rel) === "public") continue;
      const imp = importersOf.get(c.rel);
      if (imp.length && imp.every((r) => scope.get(r) === "public")) { scope.set(c.rel, "public"); changed = true; }
    }
  }
  return (rel) => scope.get(rel) ?? direct(rel);
}

// class token -> { app: bool, public: bool }
export function makeClassIndex(root) {
  const scopeOf = makeFileScope(root);
  const files = sourceFiles(root).filter((f) => /\.(tsx?)$/.test(f.rel));
  const texts = files.map((f) => ({ scope: scopeOf(f.rel), text: fs.readFileSync(f.abs, "utf8") }));
  const tokenSets = texts.map((t) => ({ scope: t.scope, set: new Set(t.text.match(/[A-Za-z_][\w-]*/g) || []) }));
  const cache = new Map();
  return (token) => {
    if (cache.has(token)) return cache.get(token);
    let use = { app: false, public: false, found: false };
    for (const t of tokenSets) if (t.set.has(token)) { use[t.scope] = true; use.found = true; }
    if (!use.found) {
      // Built at runtime (`order-status-${tone}`): look for its stem.
      const parts = token.split("-");
      for (let n = parts.length - 1; n >= 1 && !use.found; n--) {
        const stem = parts.slice(0, n).join("-") + "-";
        if (stem.length < 5) break;
        for (const t of texts) if (t.text.includes(stem)) { use[t.scope] = true; use.found = true; }
      }
    }
    cache.set(token, use);
    return use;
  };
}

export function classTokens(selector) {
  return (selector.match(/\.(-?[_a-zA-Z][\w-]*)/g) || []).map((s) => s.slice(1));
}

// "public" | "app" for one selector (no commas).
export function selectorScope(selector, classUse) {
  for (const tok of classTokens(selector)) {
    if (PUBLIC_CLASS.test(tok)) return "public";
    const use = classUse(tok);
    if (use.found && use.public && !use.app) return "public";
  }
  return "app";
}

// The selector list of the closest rule above a node (at-rules pass through).
export function ruleOf(node) {
  let p = node.parent;
  while (p && p.type !== "rule") p = p.parent;
  return p || null;
}

// For CSS modules: the whole file follows its file scope.
export function moduleCssFiles(root) {
  const scopeOf = makeFileScope(root);
  return sourceFiles(root)
    .filter((f) => f.rel.endsWith(".module.css"))
    .map((f) => ({ ...f, scope: scopeOf(f.rel) }));
}
