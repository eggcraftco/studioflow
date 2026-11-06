// Public pages load no app dictionary and one language of public-site text (6 Nov 2026, site speed).
//
// Until 6 Nov every public page — /, /pricing, /features, /de/…, the Google Ads landing page — downloaded the app's
// whole translation table (lib/studioflow/language.ts, ~7 MB raw / ~2 MB gzip, twelve languages) because four hosts in
// the root layout and the public site's provider imported one helper from it each, plus all twelve languages of
// lib/publicSite/translations.ts. Now:
//   - the root layout's hosts translate through lib/studioflow/useStudioT.ts (no import of language.ts);
//   - the public provider imports only PUBLIC_SITE_EN; a language address gets its table from app/[lang]/layout.tsx,
//     a one-address page fetches /api/public-site-text/<code>.
// Second step, same day: the legal and policy texts (lib/publicSite/privacyPolicy.ts, termsPolicy.ts … supportContact.ts,
// ~1 MB raw / ~0.28 MB gzip) were in every public page too, because components/PublicMarketing.tsx imported all ten.
// Their pages now live in components/publicLegal/ — one file per page — so each text loads on its own page only.
// Third step: Firebase (~0.16 MB gzip, and App Check's reCAPTCHA, ~0.36 MB from Google, which starts with it) is no
// longer in a public page's first download: the root layout and the public modules take it from lib/firebase/lazy.ts
// (one dynamic import of lib/firebase/rootKit.ts). Behaviour: scripts/check-firebase-deferred.mts.
//
// Source checks always run. With a build (.next) present — or --require-build — it also reads the built chunks of every
// public route: no app-dictionary canary, no public text of another language, English public text present (positive
// control), the app routes still carry the dictionary (positive control), no legal text outside its own page (and its own
// text on it — positive control), no Firebase in a public route's first download (the app routes keep it — positive
// control; and it is still in the build, for loading on demand), and a gzip budget.
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
// Public route JS, gzip level 9, summed over the layout chain + page. 63b2be578: 3.02 MB; c5f6b3596 (no app dictionary):
// 0.65 MB; with the legal texts on their own pages (ddec6ef2e): 0.376 MB; Firebase on demand: 0.213 MB
// (/custom-order-management 0.218 MB).
const GZIP_BUDGET = 250_000;
// A page that carries its own long text — a legal page (0.235–0.265 MB) or an integration guide (0.28–0.34 MB) — gets
// this one instead. ddec6ef2e had them at 0.40–0.50 MB, c5f6b3596 at 0.65–0.78 MB.
const LONG_TEXT_PAGE_BUDGET = 390_000;

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
  // Code only: a stylesheet (`import "./globals.css"`) carries no imports and no text a canary may hit.
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return /\.(tsx?|m?jsx?)$/.test(base) ? base : null;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  return null;
}
type Parsed = { client: boolean; imports: string[]; packages: string[] };
const parsed = new Map<string, Parsed>();
function parse(file: string): Parsed {
  const known = parsed.get(file);
  if (known) return known;
  const src = fs.readFileSync(file, "utf8");
  const client = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);
  const imports: string[] = [];
  const packages: string[] = [];
  // The clause stops at a ";" — a side-effect import (`import "x";`) must not be read as part of the next import's clause.
  const re = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s*from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
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
    else if (!spec.startsWith(".") && !spec.startsWith("@/")) packages.push(spec);
  }
  const value = { client, imports, packages };
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
// Legal texts: module → the pages (app/…/page.tsx) that show it. legalLanguageNotice.ts is the "English text governs" notice every
// legal page carries.
const LEGAL_PAGES: Record<string, string[]> = {
  privacyPolicy: ["privacy"],
  termsPolicy: ["terms"],
  cookiePolicy: ["cookies"],
  accountDeletionPolicy: ["account-deletion"],
  refundCancellationPolicy: ["refund-cancellation"],
  securityOverview: ["security", "[lang]/security"],
  subprocessors: ["subprocessors"],
  dataProcessingAgreement: ["data-processing-agreement"],
  acceptableUsePolicy: ["acceptable-use"],
  supportContact: ["contact", "[lang]/contact"]
};
LEGAL_PAGES.legalLanguageNotice = [...new Set(Object.values(LEGAL_PAGES).flat())];
const legalModuleFile = (m: string) => path.join(root, "lib/publicSite", `${m}.ts`);
const legalPageDirs = new Set(LEGAL_PAGES.legalLanguageNotice);
const publicEntries = [
  "app/layout.tsx",
  "app/[lang]/layout.tsx",
  ...englishPages.map(p => pageFile(p, false)),
  ...englishPages.map(p => pageFile(p, true)),
  "app/custom-order-management/page.tsx",
  "app/changelog/page.tsx",
  ...[...legalPageDirs].map(d => `app/${d}/page.tsx`)
].filter((f, i, all) => fs.existsSync(path.join(root, f)) && all.indexOf(f) === i);
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

// ---------------------------------------------------------------- legal texts: only on their own pages
check(Object.keys(LEGAL_PAGES).every(m => fs.existsSync(legalModuleFile(m))), "the eleven legal modules exist");
check([...legalPageDirs].every(d => fs.existsSync(path.join(root, "app", d, "page.tsx"))), `the ${legalPageDirs.size} legal page entries exist`);
// Every public entry that is not a legal page: no legal module in its browser code.
const otherPublicEntries = [
  "app/layout.tsx",
  "app/[lang]/layout.tsx",
  ...[...englishPages.map(p => pageFile(p, false)), ...englishPages.map(p => pageFile(p, true))]
    .filter(f => !legalPageDirs.has(f.replace(/^app\//, "").replace(/\/?page\.tsx$/, ""))),
  "app/custom-order-management/page.tsx",
  "app/changelog/page.tsx",
  "app/login/page.tsx",
  "app/signup/page.tsx"
].filter((f, i, all) => fs.existsSync(path.join(root, f)) && all.indexOf(f) === i);
const otherGraph = clientClosure(otherPublicEntries);
for (const m of Object.keys(LEGAL_PAGES)) {
  const f = legalModuleFile(m);
  check(!otherGraph.client.has(f), `no non-legal public page imports lib/publicSite/${m}.ts${otherGraph.client.has(f) ? ` (${otherGraph.chain(f)})` : ""}`);
}
check(!/from "@\/lib\/publicSite\/(privacyPolicy|termsPolicy|cookiePolicy|accountDeletionPolicy|refundCancellationPolicy|securityOverview|subprocessors|dataProcessingAgreement|acceptableUsePolicy|supportContact|legalLanguageNotice)"/
  .test(read("components/PublicMarketing.tsx").replace(/import type [^;]*;/g, "")), "components/PublicMarketing.tsx imports no legal module");
// Each legal page: its own text (and the notice), no other policy's.
for (const dir of legalPageDirs) {
  const graph = clientClosure([`app/${dir}/page.tsx`]);
  const own = Object.keys(LEGAL_PAGES).filter(m => LEGAL_PAGES[m].includes(dir));
  const has = Object.keys(LEGAL_PAGES).filter(m => graph.client.has(legalModuleFile(m)));
  check(JSON.stringify(has.sort()) === JSON.stringify(own.sort()), `app/${dir}/page.tsx loads exactly its own legal text (${own.join(", ")}; got ${has.join(", ") || "none"})`);
}

// ---------------------------------------------------------------- Firebase: not in a public page's first download
// Value imports only (type imports leave nothing); lib/firebase/lazy.ts loads lib/firebase/rootKit.ts with import(),
// which this parser — like the bundler's first download — does not follow.
const firebaseClient = path.join(root, "lib/firebase/client.ts");
const firebaseRootKit = path.join(root, "lib/firebase/rootKit.ts");
const firebaseImporters = (graph: { client: Set<string> }) => [...graph.client].filter(f => {
  const p = parse(f);
  return p.packages.some(spec => /^firebase(\/|$)|^@firebase\//.test(spec)) || p.imports.includes(firebaseClient) || p.imports.includes(firebaseRootKit);
});
const publicFirebase = firebaseImporters(publicGraph);
check(publicFirebase.length === 0,
  `no public page imports Firebase statically${publicFirebase.length ? ` (${publicFirebase.slice(0, 4).map(f => publicGraph.chain(f)).join("; ")})` : ""}`);
check(!publicGraph.client.has(firebaseClient) && !publicGraph.client.has(firebaseRootKit), "lib/firebase/client.ts and rootKit.ts are outside the public pages' static graph");
check(fs.existsSync(firebaseRootKit) && /import\("@\/lib\/firebase\/rootKit"\)/.test(read("lib/firebase/lazy.ts")), "lib/firebase/lazy.ts loads rootKit.ts on demand");
const appGraph = clientClosure(["app/orders/page.tsx", "app/dashboard/page.tsx"].filter(f => fs.existsSync(path.join(root, f))));
check(appGraph.client.has(firebaseClient), "positive control: the app routes still import lib/firebase/client.ts statically");

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

// Legal texts: per module, strings that only that module holds (every exported value, and every language's sections).
const { SUPPORTED_STUDIO_LANGUAGES } = await import(path.join(root, "lib/studioflow/languageCore.ts")) as { SUPPORTED_STUDIO_LANGUAGES: readonly string[] };
const legalStrings = new Map<string, Set<string>>();
const collect = (value: unknown, into: Set<string>, depth = 0) => {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") { into.add(value); return; }
  if (Array.isArray(value)) { for (const v of value) collect(v, into, depth + 1); return; }
  if (typeof value === "object") for (const v of Object.values(value as Record<string, unknown>)) collect(v, into, depth + 1);
};
for (const m of Object.keys(LEGAL_PAGES)) {
  const mod = await import(legalModuleFile(m)) as Record<string, unknown>;
  const into = new Set<string>();
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === "function" && /^get/.test(name)) for (const l of SUPPORTED_STUDIO_LANGUAGES) collect((value as (l: string) => unknown)(l), into);
    else collect(value, into);
  }
  legalStrings.set(m, into);
}
const legalSource = Object.keys(LEGAL_PAGES).map(m => [m, fs.readFileSync(legalModuleFile(m), "utf8")] as const);
// Sources outside the legal modules that a public page or a legal page also loads (a canary must not be in them).
const legalPageGraph = clientClosure([...legalPageDirs].map(d => `app/${d}/page.tsx`));
const nonLegalSource = [...new Set([...publicGraph.client, ...legalPageGraph.client])]
  .filter(f => !Object.keys(LEGAL_PAGES).some(m => f === legalModuleFile(m)))
  .map(f => fs.readFileSync(f, "utf8")).join("\n\u0000\n");
const legalCanaries = new Map<string, string[]>();
for (const [m, strings] of legalStrings) {
  const others = legalSource.filter(([o]) => o !== m).map(([, src]) => src).join("\n");
  const own = legalSource.find(([o]) => o === m)![1];
  // Written out as one literal in the module (so the minifier keeps it whole), and nowhere else a page loads.
  const values = [...strings].filter(plain).filter(v => own.includes(v) && !others.includes(v) && !nonLegalSource.includes(v));
  legalCanaries.set(m, sample(values, 40));
  check(legalCanaries.get(m)!.length >= 12, `${m}: legal-text canaries chosen (${legalCanaries.get(m)!.length})`);
}
console.log(`public-bundle: legal-text canaries ${[...legalCanaries].map(([m, c]) => `${m} ${c.length}`).join(", ")}`);

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
    "/custom-order-management/page", "/changelog/page",
    ...[...legalPageDirs].filter(d => !d.startsWith("[lang]/") && !englishPages.includes(`/${d}`)).map(d => `/${d}/page`)
  ].filter((r, i, all) => pages[r] && all.indexOf(r) === i);
  check(publicRoutes.length >= 2 * englishPages.length + 2 + legalPageDirs.size - 4, `public routes in the build (${publicRoutes.length})`);
  const found = (files: string[], canaries: string[]) => {
    const text = files.map(f => chunk(f).text).join("\n");
    return canaries.filter(c => text.includes(c));
  };
  // Firebase SDK strings (one per part: Auth, Firestore, App Check + its reCAPTCHA, Functions, Storage).
  const FIREBASE_MARKERS = ["identitytoolkit.googleapis.com", "firebaseLocalStorageDb", "firestore.googleapis.com", "@firebase/app-check",
    "firebase-app-check-database", "recaptcha/api.js", "@firebase/functions", "@firebase/storage"];
  const firstDownload = new Set(publicRoutes.flatMap(routeFiles));
  const allChunks = fs.readdirSync(path.join(nextDir, "static/chunks"), { recursive: true }).map(String)
    .filter(f => f.endsWith(".js")).map(f => `static/chunks/${f}`);
  const onDemand = found(allChunks.filter(f => !firstDownload.has(f)), FIREBASE_MARKERS);
  check(onDemand.length === FIREBASE_MARKERS.length, `Firebase is still in the build, outside the public pages' first download (${onDemand.length}/${FIREBASE_MARKERS.length})`);
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
    const legalDir = route.replace(/^\//, "").replace(/\/?page$/, "");
    const ownLegal = Object.keys(LEGAL_PAGES).filter(m => LEGAL_PAGES[m].includes(legalDir));
    const strayLegal: string[] = [];
    for (const [m, canaries] of legalCanaries) {
      const hits = found(files, canaries);
      if (ownLegal.includes(m)) check(hits.length >= 0.9 * canaries.length, `${route}: its own legal text ${m} is in the bundle (${hits.length}/${canaries.length})`);
      else if (hits.length) strayLegal.push(`${m} ${hits.length}/${canaries.length}`);
    }
    check(strayLegal.length === 0, `${route}: no other page's legal text in the bundle${strayLegal.length ? ` (${strayLegal.join(", ")})` : ""}`);
    const firebase = found(files, FIREBASE_MARKERS);
    check(firebase.length === 0, `${route}: no Firebase in the first download${firebase.length ? ` (${firebase.join(", ")})` : ""}`);
    const budget = ownLegal.length || /^(\/\[lang\])?\/integrations\//.test(route) ? LONG_TEXT_PAGE_BUDGET : GZIP_BUDGET;
    check(gz <= budget, `${route}: JS ${gz} bytes gzip ≤ ${budget}`);
    rows.push(`${route.padEnd(36)} ${String(files.length).padStart(3)} js ${(gz / 1e6).toFixed(3)} MB gz  app ${app.length}  other-languages ${strayLanguages.length ? strayLanguages.join("; ") : "0"}  firebase ${firebase.length}  legal ${ownLegal.length ? ownLegal.join("+") : "-"}${strayLegal.length ? ` STRAY ${strayLegal.join("; ")}` : ""}`);
  }
  // Positive controls: an app screen still has the dictionary, so the canaries are real and app pages are unchanged.
  for (const route of ["/orders/page", "/dashboard/page", "/settings/page"].filter(r => pages[r])) {
    const hits = found(routeFiles(route), appCanaries);
    check(hits.length >= 0.95 * appCanaries.length, `${route}: the app dictionary is still there (${hits.length}/${appCanaries.length})`);
    const firebaseHere = found(routeFiles(route), FIREBASE_MARKERS);
    check(firebaseHere.length >= FIREBASE_MARKERS.length - 2, `${route}: Firebase is still in the first download (${firebaseHere.length}/${FIREBASE_MARKERS.length})`);
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
