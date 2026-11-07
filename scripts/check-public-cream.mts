// Every public page is in the cream theme (owner, 7 Nov 2026: "tüm site temaya uysun").
//
// The 2 Nov redesign put the public site on the cream palette under `.public-site.public-cream` (PublicShell), but three
// kinds of page kept the older grey-green look: pages with their own CSS module and no cream answer to it
// (/integrations/amazon, /claude, /shopify — sage-green page, green buttons), the Ads landing page outside the cream shell
// (/custom-order-management), and leftovers inside cream pages (the plan comparison table, the /chatgpt closing band, the
// sign-in header, the directory's filter list).
//
// Source checks (always):
//   S1  every public route renders under the cream root: its page component wraps PublicShell or sets `public-cream`;
//   S2  in every public CSS module, each rule that paints a literal non-cream colour has a `:global(.public-cream)` answer
//       for the same class and the same kind of property (background / colour / border / shadow / custom property),
//       except the app's own parts drawn inside the order illustrations (DRAWN below, each with its reason);
//   S3  the cream answers use the cream palette only (no new colours).
// Rendered checks (with --base <url of a running build> and --chrome <chrome-headless-shell>):
//   R1  every public route, English + tr/de/ar on the localized pages, 1440 px and 390 px: a `.public-cream` root holds
//       the page's <main>, and its background is the cream paper;
//   R2  no element paints a colour of the old public palette (OLD below; alpha under 0.2 ignored) outside the drawings
//       that show other products or the app (DRAWING_CONTAINERS).
//
//   npx tsx scripts/check-public-cream.mts [--root <web tree>] [--base http://127.0.0.1:3522 --chrome <path>
//     --puppeteer <dir with node_modules/puppeteer-core>] [--langs en,tr,de,ar] [--only /pricing,/features] [--json out.json]
//
// --root is the SOURCE tree read for S1–S3 (printed). Run it with --root on the 6 Nov tree to see it fail.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import postcss from "postcss";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(arg("--root") ?? scriptRoot);
const base = arg("--base");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- The cream palette: globals.css .public-site.public-cream tokens and the theme's own pairs. ----------------------
const CREAM = new Set([
  "#f8f0e4", "#fdf9f3", "#fffefb", "#fcf6ee", "#251d1a", "#3a2e29", "#6b5d55", "#b0694a", "#8f4f32", "#c17b58",
  "#f3dcb6", "#eed0bf", "#f0b89b", "#eed6c4", "#efcfb8", "#2f6f6d", "#24585a", "#e9ebe4", "#d5d8ca", "#e3b077",
  // the changelog's new / improved tags, the home page's tiles
  "#dce8dd", "#2f5a3a", "#d9e8ee", "#e8e1f2", "#f8e2bf", "#f7dad3", "#d6e8e6", "#e3ead9", "#f6e3b4",
  "#ffffff", "#000000",
  // the 2 Nov directory hero's own edge (integrations.module.css cream block)
  "#f3e9d9"
]);

// ---- The public routes (English addresses; the localized ones also under /tr, /de …). --------------------------------
const LOCALIZED = ["/", "/features", "/pricing", "/chatgpt", "/faq", "/signup", "/contact", "/security",
  "/integrations/amazon", "/integrations/shopify", "/integrations/claude"];
const SINGLE = ["/integrations", "/guide", "/changelog", "/login", "/custom-order-management", "/privacy", "/terms",
  "/cookies", "/account-deletion", "/refund-cancellation", "/subprocessors", "/acceptable-use",
  "/data-processing-agreement"];
// Customer-facing pages that carry a business's own look, not NivaDesk's marketing look (memory: public-site-cream-theme).
const CUSTOMER_PAGES = new Set(["track", "e", "invite", "book", "p", "pay", "f", "auth", "connect", "chatgpt/connect",
  "ebay", "oauth", "pandle", "quickbooks", "xero", "review-demo"]);

// ---- S1: the cream root ---------------------------------------------------------------------------------------------
type Src = { rel: string; text: string };
const ALIAS = (spec: string, from: string): string | null => {
  let p: string;
  if (spec.startsWith("@/")) p = spec.slice(2);
  else if (spec.startsWith(".")) p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) if (exists(p + ext) && fs.statSync(path.join(root, p + ext)).isFile()) return p + ext;
  return null;
};
function importsOf(src: Src): { names: string[]; rel: string }[] {
  const out: { names: string[]; rel: string }[] = [];
  for (const m of src.text.matchAll(/import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    const rel = ALIAS(m[2], src.rel);
    if (!rel) continue;
    const clause = m[1];
    const names: string[] = [];
    const def = clause.match(/^([A-Za-z_$][\w$]*)/);
    if (def) names.push(def[1]);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) for (const n of named[1].split(",")) { const t = n.trim().split(/\s+as\s+/).pop(); if (t) names.push(t); }
    out.push({ names, rel });
  }
  return out;
}
// The body of a component: from its declaration to the next top-level declaration.
function bodyOf(text: string, name: string): string | null {
  const re = new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, "m");
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + 1);
  const next = rest.search(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+[A-Z]|^const\s+[A-Z][A-Z_]+\s*[:=]/m);
  return next > 0 ? text.slice(m.index, m.index + 1 + next) : text.slice(m.index);
}
const CREAM_ROOT = /<PublicShell[\s>]|["'`][^"'`]*\bpublic-cream\b/;
// Does the component `name` (defined in `rel` or imported there) render under the cream root? Follows the components
// its body renders, three levels down.
function rendersCream(rel: string, name: string, depth = 0, seen = new Set<string>()): boolean {
  const key = `${rel}#${name}`;
  if (seen.has(key) || depth > 4) return false;
  seen.add(key);
  const text = read(rel);
  const body = bodyOf(text, name);
  if (!body) {
    const imp = importsOf({ rel, text }).find(i => i.names.includes(name));
    return imp ? rendersCream(imp.rel, name, depth + 1, seen) : false;
  }
  if (CREAM_ROOT.test(body)) return true;
  // The components the body returns at its top (first JSX element after `return`).
  const tops = [...body.matchAll(/return\s*\(?\s*<([A-Z][\w]*)/g)].map(m => m[1]);
  return tops.some(t => rendersCream(rel, t, depth + 1, seen));
}
function pageRendersCream(pageRel: string): { ok: boolean; via: string } {
  const text = read(pageRel);
  const def = /^export\s+default\s+(?:async\s+)?function\s+(\w+)/m.exec(text);
  const body = (def && bodyOf(text, def[1])) ?? text;
  if (CREAM_ROOT.test(text)) return { ok: true, via: pageRel };
  const imps = importsOf({ rel: pageRel, text });
  // Components rendered by the page (JSX tags), looked up in its imports.
  const tags = [...new Set([...body.matchAll(/<([A-Z][\w]*)/g)].map(m => m[1]))];
  for (const tag of tags) {
    const imp = imps.find(i => i.names.includes(tag));
    if (imp && rendersCream(imp.rel, tag)) return { ok: true, via: `${imp.rel}#${tag}` };
  }
  return { ok: false, via: tags.join(",") };
}
function routeFile(route: string, lang?: string): string {
  const seg = route === "/" ? "" : route;
  return lang ? `app/[lang]${seg}/page.tsx` : `app${seg}/page.tsx`;
}
for (const r of [...LOCALIZED, ...SINGLE]) {
  const f = routeFile(r);
  if (!exists(f)) { check(`S1 ${r}: page file`, false, `${f} missing`); continue; }
  const res = pageRendersCream(f);
  check(`S1 ${r} renders under the cream root`, res.ok, res.ok ? "" : `page renders ${res.via} without PublicShell / public-cream`);
}
for (const r of LOCALIZED) {
  const f = routeFile(r, "lang");
  if (!exists(f)) continue;
  const res = pageRendersCream(f);
  check(`S1 /[lang]${r === "/" ? "" : r} renders under the cream root`, res.ok, res.ok ? "" : `renders ${res.via}`);
}
// Every other page that imports a public-site component is in the lists above (a new public page cannot slip by).
{
  const listed = new Set([...LOCALIZED, ...SINGLE].map(r => routeFile(r)));
  const walk = (dir: string, out: string[]) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "api" && e.name !== "[lang]") walk(rel, out); }
      else if (e.name === "page.tsx") out.push(rel);
    }
    return out;
  };
  const extra: string[] = [];
  for (const f of walk("app", [])) {
    if (listed.has(f)) continue;
    const segs = f.replace(/^app\//, "").replace(/\/?page\.tsx$/, "");
    if ([...CUSTOMER_PAGES].some(c => segs === c || segs.startsWith(`${c}/`))) continue;
    if (/from\s+["']@\/components\/(Public[A-Za-z]*|publicLegal\/[^"']+|CustomOrderLanding)["']|PublicShell/.test(read(f))) extra.push(f);
  }
  check("S1 every page that uses a public-site component is listed here", extra.length === 0, extra.join(", "));
}

// ---- S2 / S3: public CSS modules -------------------------------------------------------------------------------------
// The app's own parts drawn inside the order illustrations keep the app's colours (as the ChatGPT window does).
const DRAWN: Record<string, string> = {
  badgeAmazon: "the app's Amazon channel badge, drawn in the order list",
  badgeManual: "the app's Manual channel badge, drawn in the order list",
  badgeShopify: "the app's Shopify channel badge, drawn in the order list",
  toneNew: "the app's New status chip", toneMaking: "the app's In-progress status chip",
  toneCancelled: "the app's Cancelled status chip", toneDispatched: "the app's Dispatched status chip"
};
const COLOUR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;
function hexOf(c: string): { hex: string; a: number } | null {
  c = c.toLowerCase();
  if (c === "white") return { hex: "#ffffff", a: 1 };
  if (c === "black") return { hex: "#000000", a: 1 };
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map(x => x + x).join("");
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return { hex: `#${h.slice(0, 6)}`, a };
  }
  const p = c.replace(/rgba?\(|\)/g, "").split(/[\s,/]+/).filter(Boolean).map(Number);
  if (p.length < 3) return null;
  return { hex: "#" + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, "0")).join(""), a: p.length > 3 ? p[3] : 1 };
}
const family = (prop: string) => prop.startsWith("--") ? prop
  : /^background/.test(prop) ? "bg"
  : /^(border|outline)/.test(prop) ? "border"
  : prop === "box-shadow" ? "shadow"
  : /^(color|fill|stroke|text-decoration-color|caret-color|-webkit-text-fill-color)$/.test(prop) ? "color" : null;
// The subject of a selector part: its last class plus any pseudo after it (".card:hover", ".flowArrowLine::after").
function subjectOf(part: string): string | null {
  const s = part.replace(/:global\([^)]*\)/g, " ").trim();
  const m = [...s.matchAll(/\.([A-Za-z_][\w-]*)((?::{1,2}[\w-]+(?:\([^)]*\))?)*)/g)];
  if (!m.length) return null;
  const last = m[m.length - 1];
  const after = s.slice(last.index! + last[0].length);
  const pseudo = (last[2] || "").replace(/:global/g, "");
  return last[1] + pseudo + (/^\s*$/.test(after) ? "" : " " + after.trim().split(/\s+/).pop());
}
const publicModules = (() => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".module.css")) out.push(rel);
    }
  };
  walk("app/integrations");
  for (const f of fs.readdirSync(path.join(root, "components"))) if (/^Public[A-Za-z]*\.module\.css$/.test(f)) out.push(`components/${f}`);
  return out.sort();
})();
check("S2 public CSS modules found", publicModules.length >= 4, publicModules.join(", "));
// Classes a module's components actually use (styles.x / own.x), and subjects a later rule hides: dead rules need no answer.
function usedClasses(mod: string): Set<string> {
  const dir = path.posix.dirname(mod);
  const used = new Set<string>();
  const tsx: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel); else if (/\.tsx$/.test(e.name)) tsx.push(rel);
    }
  };
  walk(mod.startsWith("app/integrations") ? "app/integrations" : "components");
  const file = path.posix.basename(mod);
  for (const t of tsx) {
    const text = read(t);
    for (const m of text.matchAll(new RegExp(`import\\s+(\\w+)\\s+from\\s+["'][^"']*${file.replace(/\./g, "\\.")}["']`, "g")))
      for (const u of text.matchAll(new RegExp(`\\b${m[1]}\\.([A-Za-z_][\\w]*)`, "g"))) used.add(u[1]);
  }
  void dir;
  return used;
}
const creamAnswers = new Map<string, Set<string>>(); // subject -> families answered
const hidden = new Set<string>();
const creamColoursOutside: string[] = [];
const needs: { mod: string; subject: string; fam: string; colour: string; line: number }[] = [];
for (const mod of publicModules) {
  const ast = postcss.parse(read(mod), { from: mod });
  ast.walkRules(rule => {
    if (rule.parent && rule.parent.type === "atrule" && /keyframes/.test((rule.parent as postcss.AtRule).name)) return;
    const parts = rule.selector.split(",").map(s => s.trim());
    const creamRule = /:global\(\.public-cream\)/.test(rule.selector);
    const inMedia = rule.parent && rule.parent.type === "atrule";
    if (!creamRule && !inMedia && rule.nodes.some(n => n.type === "decl" && n.prop === "display" && n.value.trim() === "none"))
      for (const part of parts) { const sub = subjectOf(part); if (sub) hidden.add(`${mod}|${sub}`); }
    rule.walkDecls(decl => {
      const fam = family(decl.prop);
      if (!fam) return;
      const colours = (decl.value.match(COLOUR_RE) || []).map(hexOf).filter((c): c is { hex: string; a: number } => !!c);
      for (const part of parts) {
        const subject = subjectOf(part);
        if (!subject) continue;
        if (creamRule) {
          // CSS modules hash class names per file: only an answer in the same module counts.
          const key = `${mod}|${subject}`;
          if (!creamAnswers.has(key)) creamAnswers.set(key, new Set());
          creamAnswers.get(key)!.add(fam);
          for (const c of colours) {
            // S3: an rgba of a cream colour (or of ink/black for shadows and lines) is fine; a new hue is not.
            if (!CREAM.has(c.hex) && !(c.a < 1 && ["#251d1a", "#14151a", "#ffffff", "#c17b58", "#24585a", "#f8f0e4"].includes(c.hex)))
              creamColoursOutside.push(`${mod}:${decl.source?.start?.line} ${subject} ${decl.prop} ${c.hex}`);
          }
          continue;
        }
        for (const c of colours) {
          if (CREAM.has(c.hex) && !(c.hex === "#ffffff" && fam === "bg")) continue;
          if (c.a < 0.12) continue; // a hairline tint reads as neutral
          if (fam === "color" && c.hex === "#ffffff") continue; // white text on a filled control
          needs.push({ mod, subject, fam, colour: c.hex, line: decl.source?.start?.line ?? 0 });
        }
      }
    });
  });
}
const usedByModule = new Map(publicModules.map(m => [m, usedClasses(m)]));
const unanswered = needs.filter(n => {
  const cls = n.subject.split(/[ :]/)[0];
  if (DRAWN[cls]) return false;
  if (!usedByModule.get(n.mod)?.has(cls)) return false; // no component uses the class
  if (hidden.has(`${n.mod}|${n.subject}`)) return false; // a later rule hides it
  return !(creamAnswers.get(`${n.mod}|${n.subject}`)?.has(n.fam));
});
const byModule = new Map<string, string[]>();
for (const n of unanswered) {
  const k = n.mod;
  if (!byModule.has(k)) byModule.set(k, []);
  byModule.get(k)!.push(`.${n.subject} ${n.fam} ${n.colour} (line ${n.line})`);
}
for (const mod of publicModules) {
  const list = byModule.get(mod) ?? [];
  check(`S2 ${mod}: every old colour has a cream answer`, list.length === 0,
    list.length ? `${list.length} without: ${[...new Set(list)].slice(0, 14).join("; ")}${list.length > 14 ? " …" : ""}` : "");
}
check("S3 the cream answers in the modules use the cream palette only", creamColoursOutside.length === 0, creamColoursOutside.slice(0, 10).join("; "));

// ---- R1 / R2: rendered, on a running build -------------------------------------------------------------------------
// The old public palette: the pre-cream tokens of .public-site (globals.css), .lp and .login-public-shell, and the
// literal colours of the integration pages' modules and of the leftovers listed at the top (6 Nov tree).
const OLD = new Set([
  // .public-site / .lp / .login-public-shell tokens before the cream theme
  "#f4f5f3", "#eef0ed", "#171923", "#65706d", "#326d67", "#214f4a", "#f7f4ef", "#f0eee8", "#181b20", "#69716d",
  "#a66a3f", "#9a6445", "#ebece8", "#2563eb", "#667085",
  // integration pages (amazon/claude/shopify modules) and the directory
  "#f7f8f3", "#233c36", "#5f6f67", "#315e4b", "#dce3da", "#eef2ea", "#57715e", "#214934", "#b9c7b4", "#2f7a4c",
  "#a24c3a", "#7a8a80", "#fbfcf8", "#dfe5dc", "#edf0ea", "#fdfdfb", "#fbf6ee", "#ecdfc9", "#8d7353", "#f3e8d6",
  "#c58b2c", "#5b4c33", "#fcf8f6", "#eddcd6", "#4b5c53", "#f1f5ee", "#cfdcc9", "#eef6ef", "#cfe3d3", "#fbf1ee",
  "#eed5cd", "#e4f1e6", "#25603a", "#f0f2ec", "#6b7a71", "#f1f7ef", "#d4e6cf", "#4f7349", "#e2f0de", "#2f5f23",
  "#3f8a3a", "#3d5238", "#23332a", "#2e3a33", "#45584d", "#c9d4c4", "#c96f4a", "#f4f6f1", "#eef1ea", "#f7f9f4",
  "#728669", "#edf0e9", "#6e8367", "#647466", "#6d8467", "#b5c6ad", "#90a08b", "#667660", "#eceeea", "#73846a",
  "#d5e0cd", "#e3ecdd", "#758772", "#68776f", "#e6eddf", "#2c503b", "#eff4eb", "#52694a", "#e7ecdf", "#d9e1d0",
  // plan comparison table, toggle flag, /features story band and panel, /chatgpt closing band
  "#235a4f", "#307062", "#181c20", "#f8f8f6", "#1f4f4d", "#eaf1ef", "#1b2728", "#2f5f58", "#203735"
]);
// Drawings of other products' screens and of the app, which keep their own colours.
const DRAWING_CONTAINERS = [".gpt-win", ".gpt-import", ".track-card", ".public-kanban", ".hero-app-shot", ".lp-hero-shot",
  ".public-order-card", ".public-platform-logo", ".public-appstore-btn", ".public-appstore-qr-trigger", ".lp-demo-frame",
  ".auth-provider-btn", ".login-card-frame [aria-live]", "[class*='mockRow']", "[class*='stripTitle']"];
const DRAWN_CLASS_PREFIXES = Object.keys(DRAWN);

// The rendered probe, run inside each page (plain JavaScript).
const PROBE_SOURCE = String.raw`function (OLDS, CONTAINERS, DRAWN_PREFIXES) {
  var old = new Set(OLDS);
  var rootEl = document.querySelector(".public-cream");
  var main = document.querySelector("main");
  function hex(c) {
    var m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    var p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { h: "#" + p.slice(0, 3).map(function (v) { return Math.round(v).toString(16).padStart(2, "0"); }).join(""), a: p.length > 3 ? p[3] : 1 };
  }
  function inDrawing(el) {
    return CONTAINERS.some(function (s) { return el.closest(s); }) ||
      Array.prototype.some.call(el.classList, function (c) { return DRAWN_PREFIXES.some(function (p) { return c.indexOf("_" + p + "__") >= 0; }); });
  }
  var hits = new Map();
  document.body.querySelectorAll("*").forEach(function (el) {
    var r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    var s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") return;
    if (inDrawing(el)) return;
    var cols = [["bg", s.backgroundColor]];
    if (Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && (n.textContent || "").trim(); })) cols.push(["text", s.color]);
    if (parseFloat(s.borderTopWidth) > 0) cols.push(["border", s.borderTopColor]);
    if (parseFloat(s.borderBottomWidth) > 0) cols.push(["border", s.borderBottomColor]);
    if (s.backgroundImage.indexOf("gradient") >= 0) (s.backgroundImage.match(/rgba?\([^)]+\)/g) || []).forEach(function (g) { cols.push(["gradient", g]); });
    cols.forEach(function (kc) {
      var x = hex(kc[1]); if (!x || x.a < 0.2 || !old.has(x.h)) return;
      var where = [el, el.parentElement].map(function (e) { return e && typeof e.className === "string" ? e.className.split(/\s+/)[0] : (e ? e.tagName : ""); }).join("<");
      var k = kc[0] + " " + x.h;
      var prev = hits.get(k); if (prev) prev.n++; else hits.set(k, { n: 1, where: where });
    });
  });
  var out = [];
  hits.forEach(function (v, k) { out.push({ colour: k, where: v.where, n: v.n }); });
  return {
    creamRoot: !!rootEl, mainInCream: !!(rootEl && main && (rootEl === main || rootEl.contains(main))),
    rootBg: rootEl ? getComputedStyle(rootEl).backgroundColor : null, old: out
  };
}`;
type Result = { route: string; vp: string; status: number; creamRoot: boolean; mainInCream: boolean; rootBg: string | null; old: { colour: string; where: string; n: number }[] };
const results: Result[] = [];
if (base) {
  const chrome = arg("--chrome");
  const ppDir = arg("--puppeteer") ?? process.env.PUPPETEER_CORE_DIR;
  if (!chrome || !ppDir) { console.error("--base needs --chrome <chrome-headless-shell> and --puppeteer <dir>"); process.exit(2); }
  const req = createRequire(import.meta.url);
  const puppeteer = req(req.resolve("puppeteer-core", { paths: [ppDir] }));
  const langs = (arg("--langs") ?? "en,tr,de,ar").split(",");
  const jobs: string[] = [...LOCALIZED, ...SINGLE];
  for (const l of langs.filter(x => x !== "en")) for (const r of LOCALIZED) jobs.push(r === "/" ? `/${l}` : `/${l}${r}`);
  const only = arg("--only")?.split(",");
  if (only) jobs.splice(0, jobs.length, ...jobs.filter(j => only.some(o => j === o || j.endsWith(o))));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--force-color-profile=srgb", "--lang=en-GB"] });
  const offsite = new Map<string, number>();
  for (const [vp, view] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }]] as const) {
    const ctx = await browser.createBrowserContext();
    for (const route of jobs) {
      const page = await ctx.newPage();
      await page.setRequestInterception(true);
      page.on("request", (r: { url(): string; continue(): void; abort(): void }) => {
        const u = new URL(r.url());
        if (["127.0.0.1", "localhost"].includes(u.hostname) || u.protocol === "data:" || u.protocol === "blob:") return r.continue();
        offsite.set(u.hostname, (offsite.get(u.hostname) ?? 0) + 1);
        return r.abort();
      });
      await page.setViewport(view);
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      let status = 0;
      try { status = (await page.goto(base + route, { waitUntil: "networkidle2", timeout: 120000 }))?.status() ?? 0; } catch { status = 0; }
      await new Promise(r => setTimeout(r, 600));
      // Browser code goes over as plain text: tsx's keep-names helper (__name) does not exist in the page.
      const probe = await page.evaluate(`(${PROBE_SOURCE})(${JSON.stringify([...OLD])}, ${JSON.stringify(DRAWING_CONTAINERS)}, ${JSON.stringify(DRAWN_CLASS_PREFIXES)})`) as {
        creamRoot: boolean; mainInCream: boolean; rootBg: string | null; old: { colour: string; where: string; n: number }[];
      };
      results.push({ route, vp, status, ...probe });
      check(`R1 ${vp} ${route} (${status}) under a cream root holding <main>`, status === 200 && probe.creamRoot && probe.mainInCream,
        `cream root ${probe.creamRoot}, main inside ${probe.mainInCream}`);
      check(`R1 ${vp} ${route} cream paper`, probe.rootBg === "rgb(248, 240, 228)", `root background ${probe.rootBg}`);
      check(`R2 ${vp} ${route} paints no old-palette colour`, probe.old.length === 0,
        probe.old.slice(0, 6).map(o => `${o.colour}×${o.n} at ${o.where}`).join("; "));
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`offsite requests aborted: ${JSON.stringify(Object.fromEntries(offsite))}`);
}
if (arg("--json")) fs.writeFileSync(arg("--json")!, JSON.stringify({ root, base, results, fails }, null, 1));

console.log(`source tree: ${root}${base ? `\nrendered: ${base}` : ""}`);
for (const f of fails) console.log(`FAIL ${f}`);
console.log(`public-cream: ${pass}/${pass + fails.length} pass${base ? "" : " (source only; pass --base … for the rendered pages)"}`);
process.exit(fails.length ? 1 : 0);
