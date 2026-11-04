// Multilingual SEO (4 Nov 2026; owner: "her dilin Google aramasında kendi çevrilmiş NivaDesk sayfasıyla
// bulunması"). The public site's language versions live at their own addresses (/de, /de/pricing, /hi/faq …,
// English unprefixed) and are rendered in that language on the server. This keeps the pieces in step:
//
// 1. Every page in LOCALIZED_PUBLIC_PATHS has an English route and an app/[lang] route, and app/[lang] has no
//    route for a page without language versions (the legal pages, /integrations, /changelog, /guide stay single).
// 2. seoCopy.ts has a title and description for every page in all eleven other languages, none empty, none still
//    the English text, none promising a Free plan (ÜYE-01 replaces it with the trial for new workspaces).
// 3. Each language version's metadata canonicals to itself (never to English), is indexable, and carries the same
//    reciprocal hreflang set (12 languages + x-default → English) as every other version and as the sitemap.
// 4. The sitemap lists every version once, nothing more; robots.txt still blocks /guide and nothing localized.
// 5. The FAQ's structured data is built from exactly the faq.qN keys the FAQ page shows.
// 6. The wiring: middleware (header + /en redirect, no country lookup), <html lang>, metadata in the first <head>
//    for Googlebot too (next.config htmlLimitedBots), the locale-aware Link on the public pages, the footer's
//    language links, and the address helpers themselves.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PUBLIC_LOCALE,
  LOCALIZED_PUBLIC_PAGE_PATHS,
  LOCALIZED_PUBLIC_PATHS,
  localizedPublicHref,
  localizedPublicPath,
  PREFIXED_PUBLIC_LOCALES,
  PUBLIC_SITE_LOCALES,
  publicHreflangAlternates,
  splitPublicLocalePath,
  type LocalizedPublicPage
} from "../lib/publicSite/locales";
import { PUBLIC_SEO_COPY } from "../lib/publicSite/seoCopy";
import { localizedPublicPageMetadata, publicPageMetadata } from "../lib/publicSite/metadata";
import { PUBLIC_SITE_EN } from "../lib/publicSite/translations";
import { SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { NextRequest } from "next/server";
import { middleware as runMiddleware } from "../middleware";
import * as sitemapModule from "../app/sitemap";
import * as robotsModule from "../app/robots";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
let passed = 0;
const failures: string[] = [];
const check = (ok: boolean, label: string) => {
  if (ok) passed += 1;
  else { failures.push(label); console.log(`FAIL ${label}`); }
};
const ORIGIN = "https://nivadesk.app";
// The app files are CommonJS to tsx: their default export can arrive one level down.
type DefaultExport<T> = { default: T | { default: T } };
const unwrap = <T,>(mod: DefaultExport<T>): T => {
  const value = mod.default as T | { default: T };
  return typeof value === "function" ? value : (value as { default: T }).default;
};
const sitemap = unwrap(sitemapModule as unknown as DefaultExport<typeof sitemapModule.default>);
const robots = unwrap(robotsModule as unknown as DefaultExport<typeof robotsModule.default>);
// Google cuts titles and snippets by width: a Han, kana or hangul character is about two Latin ones.
const displayLength = (text: string) => [...text].reduce((n, ch) => n + (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
const pages = Object.keys(LOCALIZED_PUBLIC_PAGE_PATHS) as LocalizedPublicPage[];
const activePages = pages.filter(page => LOCALIZED_PUBLIC_PATHS.includes(LOCALIZED_PUBLIC_PAGE_PATHS[page]));
const routeFile = (prefix: string, p: string) => `${prefix}${p === "/" ? "" : p}/page.tsx`;

// 1. Routes.
check(PUBLIC_SITE_LOCALES.length === SUPPORTED_STUDIO_LANGUAGES.length
  && SUPPORTED_STUDIO_LANGUAGES.every(language => PUBLIC_SITE_LOCALES.some(locale => locale.language === language)),
  "every app language has exactly one public-site locale");
check(new Set(PUBLIC_SITE_LOCALES.map(l => l.code)).size === PUBLIC_SITE_LOCALES.length, "locale codes are unique");
for (const page of pages) {
  const p = LOCALIZED_PUBLIC_PAGE_PATHS[page];
  check(exists(routeFile("app", p)), `English route exists for ${p}`);
  check(exists(routeFile("app/[lang]", p)), `language route exists for ${p}`);
}
const langRoutes: string[] = [];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (entry.name === "page.tsx") langRoutes.push(rel);
  }
};
walk("app/[lang]");
const allowedRoutes = new Set(pages.map(page => routeFile("app/[lang]", LOCALIZED_PUBLIC_PAGE_PATHS[page])));
check(langRoutes.every(r => allowedRoutes.has(r)), `app/[lang] has only routes for localized pages (${langRoutes.length})`);
for (const single of ["/guide", "/privacy", "/terms", "/integrations", "/changelog", "/login"]) {
  check(!LOCALIZED_PUBLIC_PATHS.includes(single), `${single} keeps one address`);
}
const langLayout = read("app/[lang]/layout.tsx");
check(/dynamicParams = false/.test(langLayout) && /notFound\(\)/.test(langLayout), "unknown /xx prefix is a 404");
for (const r of langRoutes) {
  const src = read(r);
  check(/localizedPublicPageMetadata\(/.test(src) && /notFound\(\)/.test(src), `${r}: own metadata and a 404 guard`);
}

// 2. Translated titles and descriptions.
const englishText: Record<LocalizedPublicPage, string> = {
  home: String(publicPageMetadata("home").title), features: String(publicPageMetadata("features").title),
  pricing: String(publicPageMetadata("pricing").title), chatgpt: String(publicPageMetadata("chatgpt").title),
  faq: String(publicPageMetadata("faq").title), signup: String(publicPageMetadata("signup").title),
  contact: String(publicPageMetadata("contact").title), security: String(publicPageMetadata("security").title),
  amazon: read("app/integrations/amazon/page.tsx"), shopify: read("app/integrations/shopify/page.tsx"),
  claude: read("app/integrations/claude/page.tsx")
};
for (const locale of PREFIXED_PUBLIC_LOCALES) {
  const table = PUBLIC_SEO_COPY[locale.language as keyof typeof PUBLIC_SEO_COPY];
  for (const page of pages) {
    const cell = table?.[page];
    const ok = Boolean(cell?.title?.trim() && cell?.description?.trim());
    check(ok, `${locale.code} ${page}: title and description present`);
    if (!ok) continue;
    check(cell.title.includes("NivaDesk") && displayLength(cell.title) <= 72, `${locale.code} ${page}: title names NivaDesk, ≤72 wide (${displayLength(cell.title)})`);
    check(displayLength(cell.description) >= 80 && displayLength(cell.description) <= 260, `${locale.code} ${page}: description 80–260 wide (${displayLength(cell.description)})`);
    check(!englishText[page].includes(cell.title) && !englishText[page].includes(cell.description), `${locale.code} ${page}: not the English text`);
    check(!/\bFree\b/.test(`${cell.title} ${cell.description}`), `${locale.code} ${page}: no Free-plan promise`);
  }
}

// 3. Metadata: canonical to itself, indexable, one reciprocal hreflang set.
for (const page of activePages) {
  const p = LOCALIZED_PUBLIC_PAGE_PATHS[page];
  const set = publicHreflangAlternates(p);
  const versionUrls = PUBLIC_SITE_LOCALES.map(locale => new URL(localizedPublicPath(p, locale.language), ORIGIN).href);
  check(Object.keys(set).length === PUBLIC_SITE_LOCALES.length + 1 && set["x-default"] === set[DEFAULT_PUBLIC_LOCALE.hreflang],
    `${p}: hreflang has 12 languages + x-default → English`);
  check(Object.values(set).every(url => url.startsWith(ORIGIN)), `${p}: hreflang URLs are absolute nivadesk.app`);
  check(versionUrls.every(url => Object.values(set).some(v => new URL(v).href === url)), `${p}: every version is in the set`);
  for (const locale of PREFIXED_PUBLIC_LOCALES) {
    const meta = localizedPublicPageMetadata(page, locale.code);
    const canonical = new URL(String(meta.alternates?.canonical), ORIGIN).href;
    check(canonical === new URL(localizedPublicPath(p, locale.language), ORIGIN).href, `${locale.code}${p}: canonical is itself`);
    check(JSON.stringify(meta.alternates?.languages) === JSON.stringify(set), `${locale.code}${p}: same hreflang set`);
    const robotsMeta = meta.robots as { index?: boolean } | undefined;
    check(robotsMeta?.index === true, `${locale.code}${p}: indexable`);
    check((meta.openGraph as { locale?: string } | undefined)?.locale === locale.ogLocale, `${locale.code}${p}: og:locale ${locale.ogLocale}`);
  }
}
for (const key of ["home", "features", "pricing", "chatgpt", "faq", "signup", "contact", "security"] as const) {
  const meta = publicPageMetadata(key);
  check(JSON.stringify(meta.alternates?.languages) === JSON.stringify(publicHreflangAlternates(LOCALIZED_PUBLIC_PAGE_PATHS[key])),
    `English ${key}: carries the hreflang set`);
}
for (const page of ["amazon", "shopify", "claude"]) {
  check(/publicHreflangMetadata\("/.test(read(`app/integrations/${page}/page.tsx`)), `English ${page}: carries the hreflang set`);
}
const guide = publicPageMetadata("guide");
check(!guide.alternates?.languages && (guide.robots as { index?: boolean }).index === false, "/guide: noindex, no language versions");
check(!publicPageMetadata("privacy").alternates?.languages, "/privacy: no hreflang");

// 4. Sitemap and robots.
const entries = sitemap();
const urls = entries.map(e => e.url);
check(new Set(urls).size === urls.length, `sitemap: no duplicate URL (${urls.length})`);
for (const page of activePages) {
  const p = LOCALIZED_PUBLIC_PAGE_PATHS[page];
  for (const locale of PUBLIC_SITE_LOCALES) {
    const url = `${ORIGIN}${localizedPublicPath(p, locale.language) === "/" ? "/" : localizedPublicPath(p, locale.language)}`;
    const entry = entries.find(e => e.url === url);
    check(Boolean(entry), `sitemap lists ${url}`);
    if (entry) check(JSON.stringify(entry.alternates?.languages) === JSON.stringify(publicHreflangAlternates(p)), `sitemap ${url}: same hreflang set`);
  }
}
check(!urls.some(u => /\/guide(\/|$)/.test(u)), "sitemap: no /guide");
check(urls.every(u => { const { locale, path: rest } = splitPublicLocalePath(new URL(u).pathname); return locale === DEFAULT_PUBLIC_LOCALE || LOCALIZED_PUBLIC_PATHS.includes(rest); }),
  "sitemap: a prefixed URL only for a localized page");
const rules = robots().rules;
const ruleList = Array.isArray(rules) ? rules : [rules];
check(ruleList.every(r => [r.disallow].flat().includes("/guide")), "robots: /guide still blocked for every agent");
check(ruleList.every(r => ![r.disallow].flat().some(d => typeof d === "string" && PREFIXED_PUBLIC_LOCALES.some(l => d === `/${l.code}` || d.startsWith(`/${l.code}/`)))),
  "robots: no language prefix blocked");

// 5. FAQ structured data = the FAQ page's keys.
const marketing = read("components/PublicMarketing.tsx");
const groupsSrc = marketing.slice(marketing.indexOf("const FAQ_GROUPS"), marketing.indexOf("];", marketing.indexOf("const FAQ_GROUPS")));
const pageFaq = [...groupsSrc.matchAll(/"faq\.q(\d+)\.title"/g)].map(m => Number(m[1])).sort((a, b) => a - b);
const dictFaq = Object.keys(PUBLIC_SITE_EN).map(k => k.match(/^faq\.q(\d+)\.title$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
check(pageFaq.length > 10 && JSON.stringify(pageFaq) === JSON.stringify(dictFaq), `FAQ structured data keys = FAQ_GROUPS (${pageFaq.length})`);
const structured = read("lib/publicSite/structuredData.tsx");
check(structured.includes("/^faq\\.q(\\d+)\\.title$/"), "structuredData.tsx builds the FAQ from faq.qN keys");

// 6. Wiring and helpers.
const middleware = read("middleware.ts");
check(/PUBLIC_LOCALE_HEADER/.test(middleware) && /requestHeaders\.delete\(PUBLIC_LOCALE_HEADER\)/.test(middleware), "middleware: sets the language header, drops a client-sent one");
check(/\^\\\/en\(\\\/\.\*\)\?\$/.test(middleware) && /status: 308/.test(middleware) && /Location: `\$\{englishPrefix\[1\] \|\| "\/"\}/.test(middleware),
  "middleware: /en and /en/… → 308 to the English address, relative Location");
check(!/geo|x-vercel-ip-country|cf-ipcountry|accept-language/i.test(middleware), "middleware: no country or Accept-Language redirect");
// The middleware itself, as Cloud Run runs it (its own URL is the container's 0.0.0.0:8080, not nivadesk.app).
const mw = (url: string) => runMiddleware(new NextRequest(`https://0.0.0.0:8080${url}`, { headers: { "x-nivadesk-public-locale": "zz" } }));
for (const [from, to] of [["/en", "/"], ["/en/pricing?ref=x", "/pricing?ref=x"], ["/en/guide", "/guide"]] as const) {
  const res = mw(from);
  check(res.status === 308 && res.headers.get("location") === to, `middleware ${from} → 308 ${to} (got ${res.status} ${res.headers.get("location")})`);
}
for (const [path, code] of [["/de/pricing", "de"], ["/hi", "hi"], ["/pricing", null], ["/enterprise", null], ["/design", null]] as const) {
  const forwarded = mw(path).headers.get("x-middleware-request-x-nivadesk-public-locale");
  check(forwarded === code, `middleware ${path}: language header ${code ?? "absent"} (client's "zz" dropped; got ${forwarded})`);
}
check(/^\s*htmlLimitedBots: \/\.\*\/,/m.test(read("next.config.ts")), "next.config: metadata in <head> for every user agent, Googlebot included");
check(/PUBLIC_LOCALE_HEADER/.test(read("app/layout.tsx")) && /lang=\{publicLocale\?\.htmlLang \?\? "en"\}/.test(read("app/layout.tsx")), "<html lang> follows the language address");
for (const f of ["components/PublicMarketing.tsx", "app/integrations/IntegrationsDirectory.tsx", "app/integrations/amazon/AmazonSellerPage.tsx",
  "app/integrations/shopify/ShopifyHelpPage.tsx", "app/integrations/claude/ClaudeHelpPage.tsx"]) {
  const src = read(f);
  check(src.includes('import Link from "@/lib/publicSite/PublicLink";') && !src.includes('from "next/link"'), `${f}: links follow the reading language`);
}
check(/<PublicLanguageLinks \/>/.test(marketing), "footer renders the language links");
check(/hrefLang=\{locale\.hreflang\}/.test(read("components/PublicLanguageLinks.tsx")), "language links carry hreflang");
const i18n = read("lib/publicSite/i18n.tsx");
check(/useContext\(PublicRouteLanguageContext\)/.test(i18n) && /lockLanguage \?\? routeLanguage \?\? chosenLanguage/.test(i18n), "provider: a language address decides the language");
const cases: Array<[string, string, string]> = [
  ["/pricing", "Deutsch", "/de/pricing"], ["/", "हिन्दी (Hindi)", "/hi"], ["/features#shipping", "Français", "/fr/features#shipping"],
  ["/signup?next=/orders", "Türkçe", "/tr/signup?next=/orders"], ["/privacy", "Deutsch", "/privacy"], ["/guide", "日本語 (Japanese)", "/guide"],
  ["/pricing", "English", "/pricing"], ["mailto:contact@nivadesk.co.uk", "Deutsch", "mailto:contact@nivadesk.co.uk"], ["//example.com/x", "Deutsch", "//example.com/x"],
  ["/integrations/amazon", "中文 (Chinese)", "/zh/integrations/amazon"], ["/orders", "Deutsch", "/orders"]
];
for (const [href, language, expected] of cases) check(localizedPublicHref(href, language) === expected, `href ${href} in ${language} → ${expected}`);
const splits: Array<[string, string, string]> = [["/de/pricing", "de", "/pricing"], ["/de", "de", "/"], ["/design", "en", "/design"],
  ["/en/pricing", "en", "/en/pricing"], ["/xx/pricing", "en", "/xx/pricing"], ["/ar/faq", "ar", "/faq"]];
for (const [p, code, rest] of splits) {
  const r = splitPublicLocalePath(p);
  check(r.locale.code === code && r.path === rest, `split ${p} → ${code} ${rest}`);
}

if (failures.length) {
  console.log(`\nMULTILINGUAL SEO CHECK FAILED: ${failures.length} of ${passed + failures.length} checks.`);
  process.exit(1);
}
console.log(`MULTILINGUAL SEO CHECK OK (${passed} checks; ${activePages.length} pages × ${PUBLIC_SITE_LOCALES.length} languages)`);
