// Translation gaps on the web, per language, in three categories (9 Oct 2026, owner item 6).
//   npx tsx scripts/i18n-gap-report.ts [--json OUT.json] [--functions <studioflow-app>/functions]
//
// (a) truly missing   a literal key passed to t()/studioT() in a file a page imports has no
//                     row for the language (runtime probe through the merged table).
// (b) falls back to English
//       b1 same        the row exists but the value equals English (cognates/brands that are
//                      right as-is: scripts/i18n-same-as-english-ok.json)
//       b2 hardcoded   JSX text / placeholder / title / aria-label / alt drawn without t()
//       b2 label       a label-map or status/error literal (object `label:`/`title:`…,
//                      setError("…")) with no row — English whether or not it is wrapped
//       b3 server      a user-facing Cloud Functions HttpsError text with no row
// (c) unused          a table key that no source file (web or functions/) names as a literal.
//                     Listed only — never deleted.
// Parsed with the TypeScript compiler, so JSX text and attributes are exact; keys built at
// run time are still not seen. "Reachable" = imported (transitively) by an app/ page or layout.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { studioT, SUPPORTED_STUDIO_LANGUAGES, studioTranslationKeys, studioTranslationRow } from "../lib/studioflow/language";
import { ebayInventoryText } from "../lib/studioflow/ebayInventoryRules";
import { ebaySyncText } from "../lib/studioflow/ebaySyncRules";

const root = path.resolve(__dirname, "..");
const LANGS = SUPPORTED_STUDIO_LANGUAGES.filter((l) => l !== "English");
const argAfter = (flag: string) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : undefined; };

const AREAS: Array<[string, RegExp]> = [
  ["Upload dialogs", /upload/i],
  ["Order detail", /app\/orders\/(?!page\.tsx)|OrderPaymentLinks/i],
  ["Orders", /app\/orders\/page|OrderList|OrderQuickFilter|QuickCreateProject|orderFilters/i],
  ["Home", /app\/home\/|components\/home\//i],
  ["Customers", /app\/customers\//i],
  ["Schedule", /app\/schedule\/|app\/team-schedule\//i],
  ["Messages", /app\/messages\/|app\/inbox\/|MessagesTabs|app\/quick-reply\//i],
  ["Files", /app\/files\//i],
  ["Team", /app\/team\/|MemberAccess|TeamMember|CustomRoleManager|TeamActionNotice/i],
  ["Notes", /app\/notes\//i],
  ["Inventory", /app\/inventory\//i],
  ["Bank", /app\/bank\/|BankReceipt/i],
  ["Settings", /app\/settings\//i],
  ["Shell", /AppShell|NotificationsDrawer|StudioToastHost|AppRouteFrame|SessionAutoLock|VerifyEmailGate|LoadingScreen/i],
];
const IN_USE = new Set(AREAS.map(([a]) => a));
const areaOf = (rel: string) => AREAS.find(([, rx]) => rx.test(rel))?.[0] ?? "Other";

const BRAND = new Set("nivadesk etsy shopify ebay amazon whatsapp instagram paypal square xero quickbooks stripe dhl google apple woocommerce pandle truelayer firebase chatgpt openai sms pdf csv url id ok api qr sku ios android mac macos iphone ipad 17track meta twilio gmail icloud faq".split(" "));
const brandish = (s: string) => { const w = s.match(/[A-Za-z0-9]+/g) ?? []; return !w.length || w.every((x) => BRAND.has(x.toLowerCase()) || /^\d+$/.test(x)); };
const looksLikeUi = (s: string) => {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2,}/.test(t)) return false;
  if (/^[a-z0-9_.\-/:]+$/.test(t)) return false;
  if (/^[a-z]+[A-Z][A-Za-z]*$/.test(t)) return false;
  if (/https?:\/\/|\.com\b|\.png|\.jpg|^#|^\$|var\(--/.test(t)) return false;
  return !brandish(t);
};

let okSame: Record<string, string[]> = {};
try { okSame = JSON.parse(fs.readFileSync(path.join(root, "scripts/i18n-same-as-english-ok.json"), "utf8")); } catch { /* none yet */ }

// ---------------------------------------------------------------- files and imports
const files: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".next", "publicSite"].includes(e.name)) walk(p); continue; }
    if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);
  }
};
["app", "components", "lib"].forEach((d) => walk(path.join(root, d)));
const isTable = (p: string) => /lib\/studioflow\/(language|macTranslations|\w+Translations)\.ts$/.test(p) || /Rules\.ts$/.test(p) && /ebay/.test(p);

const resolveImport = (from: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
};
const sources = new Map<string, ts.SourceFile>();
for (const f of files) sources.set(f, ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
const imports = new Map<string, string[]>();
for (const [f, sf] of sources) {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const r = resolveImport(f, n.moduleSpecifier.text); if (r) out.push(r);
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const r = resolveImport(f, n.arguments[0].text); if (r) out.push(r);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  imports.set(f, out);
}
const reachable = new Set<string>();
const stack = files.filter((f) => /app\/.*\/(page|layout)\.tsx$|app\/(page|layout)\.tsx$/.test(f));
while (stack.length) { const f = stack.pop()!; if (reachable.has(f)) continue; reachable.add(f); stack.push(...(imports.get(f) ?? [])); }

// ---------------------------------------------------------------- collect
type Site = { at: string; area: string; fn: string };
const uses = new Map<string, Site[]>();
const hard = new Map<string, Site[]>();
const labels = new Map<string, Site[]>();
const literals = new Set<string>();
const add = (m: Map<string, Site[]>, k: string, s: Site) => { const a = m.get(k) ?? []; a.push(s); m.set(k, a); };
const LABEL_PROPS = new Set(["label", "title", "description", "heading", "placeholder", "message", "subtitle", "hint", "helper", "body", "cta", "emptyText", "tooltip"]);
const ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label"]);
const textOf = (n: ts.Node): string | null => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

for (const [f, sf] of sources) {
  if (isTable(f)) continue;
  const rel = path.relative(root, f);
  const area = areaOf(rel);
  const src = sf.getFullText();
  const fileFn = /=\s*useCallback\(\(sentence: string\) => ebayInventoryT|=\s*\(sentence: string\) => ebayInventoryT/.test(src) ? "ebayInventory"
    : /=\s*\(sentence: string\) => ebaySyncT/.test(src) ? "ebaySync" : "studio";
  const live = reachable.has(f);
  const site = (n: ts.Node, fn = fileFn): Site => ({ at: `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`, area: live ? area : "Unreachable", fn });
  const visit = (n: ts.Node) => {
    const lit = textOf(n);
    if (lit !== null) literals.add(lit);
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.arguments.length >= 1) {
      const name = n.expression.text;
      const a0 = textOf(n.arguments[0]);
      if (a0 !== null && ["t", "studioT", "tr", "ebayInventoryT", "ebaySyncT"].includes(name) && a0.trim() && !/^[\W\d_]+$/.test(a0)) {
        add(uses, a0, site(n, name === "ebayInventoryT" ? "ebayInventory" : name === "ebaySyncT" ? "ebaySync" : name === "studioT" ? "studio" : fileFn));
      }
      if (a0 !== null && /^set\w*(Error|Message|Notice|Status|Toast|Feedback)$|^(toast|showToast|notify|pushToast)$/.test(name) && looksLikeUi(a0)) add(labels, a0, site(n));
    }
    if (ts.isJsxText(n) && !(ts.isJsxElement(n.parent) && /^(style|script|code|pre)$/.test(n.parent.openingElement.tagName.getText(sf)))) {
      const t = n.text.replace(/\s+/g, " ").trim();
      if (looksLikeUi(t)) add(hard, t, site(n));
    }
    if (ts.isJsxAttribute(n) && n.initializer && ATTRS.has(n.name.getText(sf))) {
      const t = ts.isStringLiteral(n.initializer) ? n.initializer.text : null;
      if (t && looksLikeUi(t)) add(hard, t, site(n));
    }
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxAttribute(n.parent) && ATTRS.has(n.parent.name.getText(sf)))) {
      // {"Text"}, {busy ? "Saving…" : "Save"}, {value || "Fallback"} drawn straight into the page
      const lits: ts.Node[] = [];
      const collect = (e: ts.Expression) => {
        const x = ts.isParenthesizedExpression(e) ? e.expression : e;
        if (textOf(x) !== null) lits.push(x);
        else if (ts.isConditionalExpression(x)) { collect(x.whenTrue); collect(x.whenFalse); }
        else if (ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.BarBarToken || x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) collect(x.right);
      };
      collect(n.expression);
      for (const l of lits) { const t = textOf(l)!; if (looksLikeUi(t)) add(hard, t, site(l)); }
    }
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && LABEL_PROPS.has(n.name.text)) {
      const t = textOf(n.initializer);
      if (t && looksLikeUi(t) && /[a-z]/.test(t)) add(labels, t, site(n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// Cloud Functions texts (user-facing HttpsError messages).
const server = new Map<string, string>();
const fnDir = argAfter("--functions");
if (fnDir && fs.existsSync(fnDir)) {
  for (const e of fs.readdirSync(fnDir)) {
    if (!e.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(fnDir, e), "utf8");
    for (const m of src.matchAll(/HttpsError\(\s*["']([a-z-]+)["']\s*,\s*(["'])((?:(?!\2)[^\\\n]|\\.)*)\2/g)) {
      const [, code, , text] = m;
      if (["internal", "unknown", "unimplemented", "cancelled", "data-loss"].includes(code)) continue;
      if (/\b[a-z]+[A-Z]\w*\b/.test(text) || !looksLikeUi(text)) continue;
      literals.add(text);
      if (!server.has(text)) server.set(text, `functions/${e}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
}

// ---------------------------------------------------------------- classify
const look = (k: string, lang: string, fn: string) => {
  if (fn === "ebayInventory") { const v = ebayInventoryText(k, lang); if (v) return v; }
  if (fn === "ebaySync") { const v = ebaySyncText(k, lang); if (v) return v; }
  return studioT(k, lang);
};
const keyCache = new Set(studioTranslationKeys());
type Row = { areas: string[]; at: string[] };
const row = (sites: Site[]): Row => ({ areas: [...new Set(sites.map((s) => s.area))].sort(), at: sites.slice(0, 3).map((s) => s.at) });
const result: Record<string, { a: Record<string, Row>; b1: Record<string, Row>; b2: Record<string, Row>; b2label: Record<string, Row>; b3: Record<string, Row> }> = {};
for (const lang of LANGS) {
  const r = { a: {} as Record<string, Row>, b1: {} as Record<string, Row>, b2: {} as Record<string, Row>, b2label: {} as Record<string, Row>, b3: {} as Record<string, Row> };
  for (const [k, sites] of uses) {
    const live = sites.filter((s) => s.area !== "Unreachable");
    if (!live.length) continue;
    const v = look(k, lang, live[0].fn);
    if (v === k) {
      // studioT returns the key both for "no row" and for "row equal to English".
      const cell = studioTranslationRow(k)?.[lang as keyof ReturnType<typeof studioTranslationRow>];
      if (cell === undefined) r.a[k] = row(live);
      else if (!brandish(k) && !(okSame[k] ?? []).includes(lang)) r.b1[k] = row(live);
    }
  }
  for (const [k, sites] of hard) { const live = sites.filter((s) => s.area !== "Unreachable"); if (live.length) r.b2[k] = row(live); }
  for (const [k, sites] of labels) {
    const live = sites.filter((s) => s.area !== "Unreachable");
    if (live.length && !uses.has(k) && studioT(k, lang) === k && !(okSame[k] ?? []).includes(lang)) r.b2label[k] = row(live);
  }
  for (const [k, at] of server) if (studioT(k, lang) === k) r.b3[k] = { areas: ["Server"], at: [at] };
  result[lang] = r;
}
const unused = [...keyCache].filter((k) => !literals.has(k)).sort();

// Placeholders: every translation keeps the key's {name} tokens.
const PH = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const placeholderProblems: Array<{ key: string; lang: string; want: string[]; got: string[] }> = [];
for (const k of keyCache) {
  const want = (k.match(PH) ?? []).sort();
  for (const lang of LANGS) {
    const v = studioT(k, lang);
    const got = (v.match(PH) ?? []).sort();
    if (want.join("|") !== got.join("|")) placeholderProblems.push({ key: k, lang, want, got });
  }
}

const counts: Record<string, Record<string, number>> = {};
console.log(`== web: ${uses.size} call-site keys (${reachable.size} reachable files), ${keyCache.size} table keys, ${hard.size} hardcoded, ${labels.size} label/status literals, ${server.size} server texts, unused ${unused.length}, placeholder mismatches ${placeholderProblems.length}`);
console.log(`  ${"language".padEnd(22)} ${["a", "a@use", "b1", "b2", "b2lab", "b3", "b@use"].map((s) => s.padStart(6)).join("")}`);
for (const lang of LANGS) {
  const r = result[lang];
  const inUse = (m: Record<string, Row>) => Object.values(m).filter((v) => v.areas.some((a) => IN_USE.has(a))).length;
  counts[lang] = { a: Object.keys(r.a).length, a_inuse: inUse(r.a), b1: Object.keys(r.b1).length, b2: Object.keys(r.b2).length, b2label: Object.keys(r.b2label).length, b3: Object.keys(r.b3).length, b_inuse: inUse(r.b1) + inUse(r.b2) + inUse(r.b2label) };
  const c = counts[lang];
  console.log(`  ${lang.padEnd(22)} ${[c.a, c.a_inuse, c.b1, c.b2, c.b2label, c.b3, c.b_inuse].map((n) => String(n).padStart(6)).join("")}`);
}
const out = argAfter("--json");
if (out) { fs.writeFileSync(out, JSON.stringify({ web: { langs: result, c: unused, counts, placeholderProblems, callSiteKeys: uses.size, tableKeys: keyCache.size } }, null, 1)); console.log("wrote", out); }
if (process.argv.includes("--fail-on-placeholders") && placeholderProblems.length) { console.error(JSON.stringify(placeholderProblems.slice(0, 20), null, 1)); process.exit(1); }
