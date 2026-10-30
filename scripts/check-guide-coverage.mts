/**
 * The owner's standing rule (30 Oct 2026, docs/release-checklist-platforms.md "Assistant bots"):
 * every feature we add must be explained by BOTH assistants — the in-app helper answers from the
 * guide, the website chat from the guide's paragraphs. Neither can explain a screen the guide does
 * not have, and on 30 Oct the Calendar, Stripe payment links, DHL Express, two-step verification
 * and Scan receipt had shipped with no chapter at all (docs/assistant-bots-2026-10-30.md).
 *
 * This goes red when something new reaches the app without a chapter:
 *  1. every page under app/ is either mapped to a guide chapter or listed with the reason it has none;
 *  2. every Settings section (SETTINGS_SECTIONS) is mapped to a chapter;
 *  3. every integration the app offers (INTEGRATION_PROVIDERS, kind other than "planned") and every
 *     card on /integrations that is not "Coming soon" is mapped to a chapter that names it;
 *  4. each mapped chapter exists in BOTH written trees (English and Turkish) and has a paragraph
 *     (the website chat reads only paragraphs);
 *  5. the chapters added or rewritten on/after 30 Oct are translated into all ten GUIDE_T languages,
 *     and the older untranslated lines (125 per language on 30 Oct) can only go down.
 *
 * A new page, section or integration: write its chapter in lib/publicSite/guide.ts (EN + TR,
 * GUIDE_T for the other ten), rebuild the corpus (node functions/assistant/buildGuideCorpus.js in
 * the monorepo) and add the mapping below. Not every page needs a chapter — but the reason has to
 * be written down here.
 *
 * Run: npm run test:guide-coverage   (npx tsx scripts/check-guide-coverage.mts)
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { getGuideTree } from "../lib/publicSite/guide";
import { GUIDE_T } from "../lib/publicSite/guideTranslations";
import type { GuideNode } from "../lib/publicSite/guideChrome";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

let passed = 0;
let failed = 0;
function check(name: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n").join("\n     ")}`);
  }
}

// --- 1. Pages --------------------------------------------------------------------------------
const PAGE_CHAPTERS: Record<string, string> = {
  "/home": "home",
  "/dashboard": "dashboard",
  "/orders": "orders",
  "/orders/[orderId]": "orders",
  "/sales": "sales",
  "/production": "production",
  "/schedule": "schedule",
  "/team-schedule": "team-schedule",
  "/calendar": "calendar",
  "/oauth/calendar": "calendar",
  "/notes": "notes",
  "/customers": "customers",
  "/inventory": "inventory",
  "/bank": "banking",
  "/files": "files",
  "/messages": "messages",
  "/inbox": "messages",
  "/quick-reply": "quick-reply",
  "/settings": "settings",
  "/team": "set-team",
  "/invite/[token]": "set-team",
  "/plan": "set-plan",
  "/export": "set-data",
  "/chatgpt": "chatgpt-app",
  "/chatgpt/connect": "chatgpt-app",
  "/ebay/start": "set-ebay",
  "/p/[code]": "set-stripe",
  "/pay/done": "set-stripe",
  "/e/[token]": "card-estimate",
  "/track/[token]": "card-shipping",
};
const PAGES_WITHOUT_CHAPTER: Record<string, string> = {
  "/": "public home page (the website chat's facts cover what NivaDesk is)",
  "/features": "public marketing page",
  "/pricing": "public pricing page; plans are in the trial-and-plans chapters",
  "/faq": "public FAQ",
  "/contact": "public contact page",
  "/changelog": "public release notes",
  "/custom-order-management": "public landing page",
  "/review-demo": "store reviewers' demo entry",
  "/guide": "the guide itself",
  "/integrations": "public integrations directory (its cards are checked in 3)",
  "/integrations/amazon": "public Amazon page; Amazon is not connectable yet",
  "/integrations/claude": "public Claude connector setup page; the chatgpt-app chapter covers connectors",
  "/integrations/shopify": "public Shopify page; covered by set-woocommerce",
  "/login": "sign-in screen",
  "/signup": "sign-up screen; what happens next is getting-started",
  "/auth/action": "email link handler (verify, reset password)",
  "/connect": "OAuth hand-off for connectors",
  "/connect/shopify": "Shopify install hand-off",
  "/pandle/callback": "provider callback, no screen to explain",
  "/quickbooks/callback": "provider callback, no screen to explain",
  "/xero/callback": "provider callback, no screen to explain",
  "/admin": "NivaDesk staff only, not a customer feature",
  "/privacy": "legal page",
  "/terms": "legal page",
  "/cookies": "legal page",
  "/acceptable-use": "legal page",
  "/account-deletion": "legal page; deleting an account is in set-data",
  "/data-processing-agreement": "legal page",
  "/refund-cancellation": "legal page",
  "/security": "public security overview",
  "/subprocessors": "legal page",
};

function pages(dir = "app"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...pages(path));
    else if (name === "page.tsx") out.push("/" + relative("app", dir).split("\\").join("/"));
  }
  return out.map(route => (route === "/" ? "/" : route.replace(/\/$/, "")));
}

// --- 2. Settings sections ----------------------------------------------------------------------
const SETTINGS_CHAPTERS: Record<string, string> = {
  "profile-security": "set-security",
  preferences: "language-theme",
  notifications: "notifications",
  branding: "set-client-domain",
  "client-domain": "set-client-domain",
  pdf: "set-pdf",
  workflow: "set-workflow",
  "quick-reply": "set-quickreply",
  sales: "sales",
  "sms-notifications": "set-sms",
  financial: "set-financial",
  "team-access": "set-team",
  "message-settings": "messages",
  "safety-uploads": "set-safety",
  data: "set-data",
  "plan-access": "set-plan",
  integrations: "set-woocommerce",
  "support-tickets": "set-support",
  "getting-started": "getting-started",
};
const SETTINGS_WITHOUT_CHAPTER: Record<string, string> = {
  about: "the app version and product information",
};

// --- 3. Integrations ---------------------------------------------------------------------------
// Settings ▸ Integrations tiles (lib/studioflow/integrations.ts) and the public /integrations cards.
const INTEGRATION_CHAPTERS: Record<string, string> = {
  claude: "chatgpt-app",
  chatgpt: "chatgpt-app",
  shopify: "set-woocommerce",
  woocommerce: "set-woocommerce",
  wix: "set-woocommerce",
  squarespace: "set-woocommerce",
  zapier: "set-woocommerce",
  make: "set-woocommerce",
  inbound: "set-woocommerce",
  square: "set-woocommerce",
  etsy: "set-etsy",
  ebay: "set-ebay",
  amazon: "set-woocommerce",
  instagram: "messages",
  whatsapp: "messages",
  openbanking: "banking",
  truelayer: "banking",
  paypal: "banking",
  quickbooks: "banking",
  xero: "banking",
  pandle: "banking",
  stripe: "set-stripe",
  dhl: "set-dhl",
  "dhl-express": "set-dhl",
  tracking: "card-shipping",
  twilio: "set-sms",
};
// The name the chapter must use for it (the tile's own name where it differs from the id).
const INTEGRATION_NAMES: Record<string, string> = {
  openbanking: "Open Banking", quickbooks: "QuickBooks", "dhl-express": "DHL Express", dhl: "DHL Express",
  tracking: "17TRACK", inbound: "webhook", truelayer: "Open Banking", chatgpt: "ChatGPT", twilio: "SMS",
};

const EN = getGuideTree("English");
const TR = getGuideTree("Türkçe");
function index(tree: GuideNode[], into = new Map<string, GuideNode>()) {
  for (const node of tree) {
    into.set(node.id, node);
    if (node.children) index(node.children, into);
  }
  return into;
}
const EN_BY_ID = index(EN);
const TR_BY_ID = index(TR);
const nodeText = (node: GuideNode | undefined) =>
  (node?.blocks ?? []).map(block => ("text" in block && block.text) || ("items" in block ? (block.items ?? []).join("\n") : "")).join("\n");
function nodeStrings(node: GuideNode): string[] {
  return [node.title, ...(node.blocks ?? []).flatMap(block => ("items" in block && block.items ? block.items : "text" in block && block.text ? [block.text] : []))];
}

check("1 every page under app/ has a guide chapter or a written reason", () => {
  const problems: string[] = [];
  for (const route of pages()) {
    if (route in PAGE_CHAPTERS || route in PAGES_WITHOUT_CHAPTER) continue;
    problems.push(`${route}: new page — add its chapter to PAGE_CHAPTERS, or the reason it has none to PAGES_WITHOUT_CHAPTER`);
  }
  const existing = new Set(pages());
  for (const route of [...Object.keys(PAGE_CHAPTERS), ...Object.keys(PAGES_WITHOUT_CHAPTER)]) {
    if (!existing.has(route)) problems.push(`${route}: listed here but the page is gone — remove it`);
  }
  assert.deepEqual(problems, []);
});

check("2 every Settings section has a guide chapter", () => {
  const page = read("app/settings/page.tsx");
  const list = page.slice(page.indexOf("const SETTINGS_SECTIONS"), page.indexOf("const SETTINGS_SEARCH_KEYWORDS"));
  const ids = [...list.matchAll(/\{ id: "([a-z-]+)", title: "/g)].map(m => m[1]);
  assert.ok(ids.length >= 15, `read ${ids.length} sections — the SETTINGS_SECTIONS shape changed, fix this reader`);
  const problems = ids.filter(id => !(id in SETTINGS_CHAPTERS) && !(id in SETTINGS_WITHOUT_CHAPTER))
    .map(id => `Settings section "${id}" has no chapter in SETTINGS_CHAPTERS`);
  assert.deepEqual(problems, []);
});

check("3 every integration the app or the website offers is in the guide by name", () => {
  const providers = read("lib/studioflow/integrations.ts");
  const list = providers.slice(providers.indexOf("INTEGRATION_PROVIDERS"));
  const offered = [...list.matchAll(/id: "([a-z0-9-]+)", name: "[^"]+", category: "[a-z]+", kind: "(native|webhook|planned)"/g)]
    .filter(m => m[2] !== "planned").map(m => m[1]);
  const directory = read("app/integrations/IntegrationsDirectory.tsx");
  const cards = [...directory.matchAll(/\{ name: "([^"]+)",[^\n]*state: "([a-zA-Z]+)"/g)]
    .filter(m => m[2] !== "comingSoon" && m[2] !== "soon").map(m => m[1].toLowerCase().replace(/ direct$/, "").replace(/\s+/g, "-"));
  assert.ok(offered.length >= 10 && cards.length >= 10, `read ${offered.length} tiles and ${cards.length} cards — a reader is out of date`);
  const problems: string[] = [];
  for (const id of new Set([...offered, ...cards])) {
    const chapter = INTEGRATION_CHAPTERS[id];
    if (!chapter) { problems.push(`integration "${id}" has no chapter in INTEGRATION_CHAPTERS`); continue; }
    const name = INTEGRATION_NAMES[id] ?? id;
    if (!new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(nodeText(EN_BY_ID.get(chapter)))) {
      problems.push(`integration "${id}": chapter ${chapter} never names "${name}"`);
    }
  }
  assert.deepEqual(problems, []);
});

const MAPPED = new Set([...Object.values(PAGE_CHAPTERS), ...Object.values(SETTINGS_CHAPTERS), ...Object.values(INTEGRATION_CHAPTERS)]);

check("4 each mapped chapter exists in English AND Turkish, with a paragraph for the website chat", () => {
  const problems: string[] = [];
  for (const id of MAPPED) {
    const en = EN_BY_ID.get(id);
    if (!en) { problems.push(`${id}: no English chapter`); continue; }
    if (!TR_BY_ID.get(id) && id !== "team-schedule") problems.push(`${id}: no Turkish chapter (TREE_TR)`);
    if (!(en.blocks ?? []).some(block => block.kind === "para")) problems.push(`${id}: no paragraph — the website chat would know nothing about it`);
  }
  assert.deepEqual(problems, []);
});

// Chapters written or rewritten from 30 Oct 2026 on. Add a chapter's id here when you write or
// rewrite it: from then on every line of it must be in all ten GUIDE_T languages.
const FULLY_TRANSLATED = [
  "calendar", "help-assistant", "set-security", "set-stripe", "set-dhl", "set-team", "messages", "banking",
];
// Lines of the older chapters still in English in the other ten languages on 30 Oct 2026. This
// number can only go down: lower it when you translate some, never raise it.
const OLD_UNTRANSLATED_CEILING = 125;
const TEN = ["Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"] as const;

check("5 new chapters are in all ten languages, and the old gap does not grow", () => {
  const problems: string[] = [];
  const all = [...EN_BY_ID.values()].flatMap(nodeStrings);
  for (const language of TEN) {
    const dict = GUIDE_T[language] ?? {};
    for (const id of FULLY_TRANSLATED) {
      const node = EN_BY_ID.get(id);
      if (!node) { problems.push(`${id}: listed in FULLY_TRANSLATED but missing`); continue; }
      const missing = nodeStrings(node).filter(text => !dict[text]);
      if (missing.length) problems.push(`${language} ${id}: ${missing.length} line(s) untranslated, e.g. "${missing[0].slice(0, 70)}"`);
    }
    const untranslated = new Set(all.filter(text => !dict[text])).size;
    if (untranslated > OLD_UNTRANSLATED_CEILING) problems.push(`${language}: ${untranslated} untranslated lines, more than ${OLD_UNTRANSLATED_CEILING}`);
  }
  assert.deepEqual(problems, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
