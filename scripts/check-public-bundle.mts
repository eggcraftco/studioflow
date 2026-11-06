// Public pages load no app dictionary and one language of public-site text (6 Nov 2026, site speed).
//
// Until 6 Nov every public page — /, /pricing, /features, /de/…, the Google Ads landing page — downloaded the app's
// whole translation table (lib/studioflow/language.ts, ~7 MB raw / ~2 MB gzip, twelve languages) because four hosts in
// the root layout and the public site's provider imported one helper from it each, plus all twelve languages of
// lib/publicSite/translations.ts. Now:
//   - the root layout's hosts translate through lib/studioflow/useStudioT.ts (no import of language.ts);
//   - the public provider imports only PUBLIC_SITE_EN; a language address gets its table from app/[lang]/layout.tsx,
//     a one-address page fetches /api/public-site-text/<code>.
//
// Source checks always run. With a build (.next) present — or --require-build — it also reads the built chunks of every
// public route: no app-dictionary canary, no public text of another language, English public text present (positive
// control), the app routes still carry the dictionary (positive control), and a gzip budget.
//
//   npx tsx scripts/check-public-bundle.mts [--root <web tree>] [--next-dir <.next>] [--require-build]
//
// --root picks the SOURCE tree read for canaries and the import graph; --next-dir the build. Both are printed, so a
// run against another tree's build (the negative proof: the 63b2be578 build must fail) says which files it read.
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(arg("--root") ?? scriptRoot);
const nextDir = path.resolve(arg("--next-dir") ?? path.join(root, ".next"));
const requireBuild = args.includes("--require-build");
// Public route JS, gzip level 9, summed over the layout chain + page. 63b2be578: 3.02 MB; after the split: ~0.69 MB.
const GZIP_BUDGET = 950_000;

const failures: string[] = [];
let passed = 0;
const check = (ok: unknown, name: string) => {
  if (ok) passed += 1;
  else failures.push(name);
};
const rel = (f: string) => path.relative(root, f);
console.log(`public-bundle: source ${root}`);

// ---------------------------------------------------------------- source: the import graph of the public pages
const EXTS = [".ts", ".tsx", ".js", ".mjs", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  return null;
}
type Parsed = { client: boolean; imports: string[] };
const parsed = new Map<string, Parsed>();
function parse(file: string): Parsed {
  const known = parsed.get(file);
  if (known) return known;
  const src = fs.readFileSync(file, "utf8");
  const client = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);
  const imports: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+([\s\S]*?)\s*from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[3] ?? m[4];
    const clause = (m[2] ?? "").trim();
    // A type-only import or export leaves nothing in the bundle.
    if (/^type\s/.test(clause)) continue;
    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named && named[1].split(",").map(s => s.trim()).filter(Boolean).every(s => /^type\s/.test(s))) continue;
    const target = resolveImport(file, spec);
    if (target) imports.push(target);
  }
  const value = { client, imports };
  parsed.set(file, value);
  return value;
}
/** Every module that ends up in the browser for these server entries, and one import chain per module. */
function clientClosure(entries: string[]) {
  const via = new Map<string, string | null>();
  const client = new Set<string>();
  const queue: Array<[string, boolean, string | null]> = entries.map(e => [path.join(root, e), false, null]);
  const seen = new Set<string>();
  while (queue.length) {
    const [file, inClient, from] = queue.shift()!;
    const key = `${file}|${inClient}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = parse(file);
    const isClient = inClient || p.client;
    if (isClient && !client.has(file)) {
      client.add(file);
      via.set(file, from);
    }
    for (const next of p.imports) queue.push([next, isClient, file]);
  }
  const chain = (file: string) => {
    const out = [rel(file)];
    let at = via.get(file) ?? null;
    while (at) {
      out.unshift(rel(at));
      at = via.get(at) ?? null;
    }
    return out.join(" → ");
  };
  return { client, chain };
}

const { LOCALIZED_PUBLIC_PAGE_PATHS } = await import(path.join(root, "lib/publicSite/locales.ts")) as {
  LOCALIZED_PUBLIC_PAGE_PATHS: Record<string, string>;
};
const englishPages = Object.values(LOCALIZED_PUBLIC_PAGE_PATHS);
const pageFile = (p: string, prefixed: boolean) => `app/${prefixed ? "[lang]/" : ""}${p === "/" ? "" : `${p.slice(1)}/`}page.tsx`;
const publicEntries = [
  "app/layout.tsx",
  "app/[lang]/layout.tsx",
  ...englishPages.map(p => pageFile(p, false)),
  ...englishPages.map(p => pageFile(p, true)),
  "app/custom-order-management/page.tsx",
  "app/privacy/page.tsx",
  "app/changelog/page.tsx"
].filter(f => fs.existsSync(path.join(root, f)));
check(publicEntries.length >= 2 * englishPages.length + 3, `public entries found (${publicEntries.length})`);
const publicGraph = clientClosure(publicEntries);
const appDictionary = path.join(root, "lib/studioflow/language.ts");
check(!publicGraph.client.has(appDictionary),
  `no public page imports lib/studioflow/language.ts${publicGraph.client.has(appDictionary) ? ` (${publicGraph.chain(appDictionary)})` : ""}`);
const STUDIO_TABLE_FILES = fs.readdirSync(path.join(root, "lib/studioflow")).filter(f => /Translations\.ts$/.test(f) || f === "macTranslations.ts");
for (const f of STUDIO_TABLE_FILES) {
  const abs = path.join(root, "lib/studioflow", f);
  check(!publicGraph.client.has(abs), `no public page imports lib/studioflow/${f}${publicGraph.client.has(abs) ? ` (${publicGraph.chain(abs)})` : ""}`);
}
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
const i18n = read("lib/publicSite/i18n.tsx");
check(!/PUBLIC_SITE_TRANSLATIONS/.test(i18n.replace(/\/\/[^\n]*/g, "")), "i18n.tsx (browser) does not read the twelve-language table");
check(/PUBLIC_SITE_EN/.test(i18n), "i18n.tsx carries the English table");
const translationsSource = read("lib/publicSite/translations.ts");
const builtTable = translationsSource.slice(translationsSource.indexOf("export const PUBLIC_SITE_TRANSLATIONS"));
check(/^export const PUBLIC_SITE_TRANSLATIONS: PublicSiteTranslationTable = \/\*#__PURE__\*\/ \(\(\) => \(\{$/m.test(builtTable)
  && (builtTable.match(/: mergeFill\(/g) ?? []).length === 11 && /\}\)\)\(\);\s*$/.test(builtTable),
  "translations.ts: the twelve-language table is built in one pure call (the browser bundle drops it)");
check(/text=\{PUBLIC_SITE_TRANSLATIONS\[locale\.language\]\}/.test(read("app/[lang]/layout.tsx")), "app/[lang]/layout.tsx hands the page its one table");
for (const host of ["components/StudioToastHost.tsx", "components/SecondFactorPromptHost.tsx", "components/SessionAutoLock.tsx"]) {
  const src = read(host);
  check(/useStudioT\(language\)/.test(src) && !/from "@\/lib\/studioflow\/language"/.test(src), `${host} translates through useStudioT`);
}
check(/^registerStudioTranslate\(studioT\);\s*$/m.test(read("lib/studioflow/language.ts")) && /^import \{ registerStudioTranslate \} from "\.\/studioTranslateRegistry";$/m.test(read("lib/studioflow/language.ts")),
  "language.ts registers studioT for the root-layout hosts");

// ---------------------------------------------------------------- canaries (strings that identify a table in a chunk)
const publicSources = [...publicGraph.client].map(f => fs.readFileSync(f, "utf8"));
const outsideTranslations = [...publicGraph.client].filter(f => !f.endsWith(path.join("lib", "publicSite", "translations.ts")))
  .map(f => fs.readFileSync(f, "utf8")).join("\n\u0000\n");
const allPublicSource = publicSources.join("\n\u0000\n");
const plain = (s: unknown): s is string => typeof s === "string" && s.length >= 28 && !/["'`\\\n$]/.test(s);
const sample = <T,>(items: T[], n: number) => items.filter((_, i) => i % Math.max(1, Math.floor(items.length / n)) === 0).slice(0, n);

// App dictionary: keys and German rows of studioT that no public module contains.
const studio = await import(path.join(root, "lib/studioflow/language.ts")) as {
  studioTranslationKeys: () => string[];
  studioTranslationRow: (k: string) => Record<string, string> | undefined;
};
const appCanaries = sample(studio.studioTranslationKeys().flatMap(k => [k, studio.studioTranslationRow(k)?.Deutsch])
  .filter(plain).filter(s => !allPublicSource.includes(s)), 300);
check(appCanaries.length >= 200, `app-dictionary canaries chosen (${appCanaries.length})`);

// Public text: per language, values only translations.ts holds (no other public module repeats them).
const site = await import(path.join(root, "lib/publicSite/translations.ts")) as {
  PUBLIC_SITE_EN: Record<string, string>;
  PUBLIC_SITE_TRANSLATIONS: Record<string, Record<string, string | undefined>>;
};
const english = site.PUBLIC_SITE_EN;
const languageCanaries = new Map<string, string[]>();
const otherValues = (lang: string) => new Set(Object.entries(site.PUBLIC_SITE_TRANSLATIONS).filter(([l]) => l !== lang)
  .flatMap(([, t]) => Object.values(t)));
for (const [lang, table] of Object.entries(site.PUBLIC_SITE_TRANSLATIONS)) {
  const others = otherValues(lang);
  const values = Object.entries(table).filter(([k, v]) => plain(v) && (lang === "English" || v !== english[k]) && !others.has(v))
    .map(([, v]) => v as string).filter(v => !outsideTranslations.includes(v));
  languageCanaries.set(lang, sample(values, 80));
  check(languageCanaries.get(lang)!.length >= 40, `${lang}: public-text canaries chosen (${languageCanaries.get(lang)!.length})`);
}

// ---------------------------------------------------------------- the build
const manifestFile = path.join(nextDir, "app-build-manifest.json");
if (!fs.existsSync(manifestFile)) {
  check(!requireBuild, `a build is present (${manifestFile})`);
  if (!requireBuild) console.log("public-bundle: no build here — source checks only");
} else {
  console.log(`public-bundle: build  ${nextDir}`);
  const pages = (JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { pages: Record<string, string[]> }).pages;
  const decoded = new Map<string, { text: string; gz: number }>();
  const chunk = (f: string) => {
    let c = decoded.get(f);
    if (!c) {
      const raw = fs.readFileSync(path.join(nextDir, f));
      // The minifier writes Latin-1 letters as \xNN and some others as \uNNNN; read them back before searching.
      const text = raw.toString("utf8")
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      c = { text, gz: zlib.gzipSync(raw, { level: 9 }).length };
      decoded.set(f, c);
    }
    return c;
  };
  const routeFiles = (route: string) => {
    const keys = ["/layout", ...(route.startsWith("/[lang]") ? ["/[lang]/layout"] : []), route];
    return [...new Set(keys.flatMap(k => pages[k] ?? []))].filter(f => f.endsWith(".js") && !f.includes("polyfills"));
  };
  const routeKey = (p: string, prefixed: boolean) => `${prefixed ? "/[lang]" : ""}${p === "/" ? "" : p}/page`;
  const publicRoutes = [
    ...englishPages.map(p => routeKey(p, false)),
    ...englishPages.map(p => routeKey(p, true)),
    "/custom-order-management/page", "/privacy/page", "/changelog/page"
  ].filter(r => pages[r]);
  check(publicRoutes.length >= 2 * englishPages.length + 3, `public routes in the build (${publicRoutes.length})`);
  const found = (files: string[], canaries: string[]) => {
    const text = files.map(f => chunk(f).text).join("\n");
    return canaries.filter(c => text.includes(c));
  };
  const rows: string[] = [];
  for (const route of publicRoutes) {
    const files = routeFiles(route);
    const gz = files.reduce((s, f) => s + chunk(f).gz, 0);
    const app = found(files, appCanaries);
    check(app.length === 0, `${route}: no app-dictionary text (${app.length}/${appCanaries.length}${app.length ? `, e.g. ${JSON.stringify(app[0])}` : ""})`);
    const strayLanguages: string[] = [];
    for (const [lang, canaries] of languageCanaries) {
      if (lang === "English") continue;
      const hits = found(files, canaries);
      if (hits.length) strayLanguages.push(`${lang} ${hits.length}/${canaries.length}`);
    }
    check(strayLanguages.length === 0, `${route}: no public text in another language in the bundle${strayLanguages.length ? ` (${strayLanguages.join(", ")})` : ""}`);
    const en = found(files, languageCanaries.get("English")!);
    check(en.length >= 0.9 * languageCanaries.get("English")!.length, `${route}: the English public text is in the bundle (${en.length}/${languageCanaries.get("English")!.length})`);
    check(gz <= GZIP_BUDGET, `${route}: JS ${gz} bytes gzip ≤ ${GZIP_BUDGET}`);
    rows.push(`${route.padEnd(36)} ${String(files.length).padStart(3)} js ${(gz / 1e6).toFixed(2)} MB gz  app ${app.length}  other-languages ${strayLanguages.length ? strayLanguages.join("; ") : "0"}`);
  }
  // Positive controls: an app screen still has the dictionary, so the canaries are real and app pages are unchanged.
  for (const route of ["/orders/page", "/dashboard/page", "/settings/page"].filter(r => pages[r])) {
    const hits = found(routeFiles(route), appCanaries);
    check(hits.length >= 0.95 * appCanaries.length, `${route}: the app dictionary is still there (${hits.length}/${appCanaries.length})`);
  }
  console.log(rows.join("\n"));
}

if (failures.length) {
  console.log(`\nPUBLIC BUNDLE CHECK FAILED: ${failures.length} of ${passed + failures.length} checks.`);
  for (const f of failures.slice(0, 60)) console.log(`  ✗ ${f}`);
  if (failures.length > 60) console.log(`  … ${failures.length - 60} more`);
  process.exit(1);
}
console.log(`PUBLIC BUNDLE CHECK OK (${passed} checks)`);
