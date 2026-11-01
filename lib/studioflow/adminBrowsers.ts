// Admin Insights ▸ Browsers (1 Nov 2026, owner: "show which browser users connect with, so we see whether they use AI
// browsers or normal ones") — how getSitePresence's browser labels are named on screen. Pure and dependency-free so
// scripts/check-admin-browsers.mts imports the same file the pages use. The labels themselves are decided on the
// server (functions insights/browser.js, from the user agent, the Sec-CH-UA brands and a request signature); this
// file only names, orders and filters them.

export type BrowserKind = "ai_browser" | "ai_agent" | "normal" | "bot" | "unknown" | "app" | "unclassified";

export type BrowserItem = { family: string; major: string; kind: BrowserKind; brand: string; sessions: number; lastSeenMs: number | null };

export type BrowserBucket = { sessions: number; members: number; unidentified: number; people: number };

export type BrowserFamilyRow = BrowserBucket & { family: string; kind: BrowserKind; brand: string; versions: { major: string; sessions: number }[] };

export type BrowserPerson = {
  uid: string;
  browsers: BrowserItem[];
  kinds: BrowserKind[];
  ai: boolean;
  sessions: number;
  lastSeenMs: number | null;
  internal: "" | "staff" | "workspace";
  email: string;
  name: string;
  accountFound: boolean | null;
  workspaceId: string;
  workspace: string;
  workspaceFlag: string;
};

export type BrowserSite = {
  days: string[];
  visits: number;
  labelledVisits: number;
  kinds: Partial<Record<BrowserKind, number>>;
  browsers: Record<string, number>;
  agents: Record<string, number>;
  readable: boolean;
};

export type BrowsersAnswer = {
  view: "business" | "qa";
  period: "today" | "yesterday" | "7d";
  firstDay: string;
  lastDay: string;
  startMs: number;
  endMs: number;
  open: boolean;
  recordedSinceMs: number | null;
  sessions: number;
  members: number;
  unidentifiedSessions: number;
  people: number;
  kinds: Record<BrowserKind, BrowserBucket>;
  families: BrowserFamilyRow[];
  totalPeople: number;
  aiPeople: number;
  limit: number;
  list: BrowserPerson[];
  unidentified: { sessions: number; families: BrowserFamilyRow[] };
  hidden: { people: number; sessions: number };
  site: BrowserSite;
  exclusion?: { view: string; flaggedWorkspaces: number | null; readable: boolean };
  accountsReadable?: boolean;
  workspacesReadable?: boolean;
  truncated?: boolean;
  retentionDays?: number;
};

/** The kinds in the order the page lists them, with the words and colours it uses. */
export const BROWSER_KINDS: { key: BrowserKind; label: string; short: string; color: string; hint: string }[] = [
  { key: "ai_browser", label: "AI browser", short: "AI browser", color: "#bf5af2", hint: "A browser sold as an AI browser that says so in the request (ChatGPT Atlas, Comet on Android, Arc Search, Genspark). Comet on a computer, Dia and Opera Neon do not say so." },
  { key: "ai_agent", label: "AI agent", short: "AI agent", color: "#ff375f", hint: "Software working for a person: an agent driving a browser that signs its requests or names itself (ChatGPT agent, Google-Agent, Manus, Nova Act), or an assistant fetching a page on request." },
  { key: "normal", label: "Normal browser", short: "Normal", color: "#0a84ff", hint: "Chrome, Safari, Edge, Firefox, Brave, Opera, Samsung Internet, in-app browsers …" },
  { key: "unknown", label: "Can't tell", short: "Can't tell", color: "#8e8e93", hint: "A Chromium browser whose client hints name no browser we know — could be an AI browser, could be another Chromium browser. Never guessed." },
  { key: "bot", label: "Bot or automation", short: "Bot", color: "#ff9f0a", hint: "Crawlers (AI crawlers included), link previews, headless browsers." },
  { key: "app", label: "NivaDesk app", short: "App", color: "#34c759", hint: "iPhone, iPad, Mac and Android apps — not a browser." },
  { key: "unclassified", label: "Not checked (before the update)", short: "Not checked", color: "#c7c7cc", hint: "Web sessions recorded before browser detection was switched on; they only have an old coarse name." }
];

const KIND_INDEX = Object.fromEntries(BROWSER_KINDS.map((kind, index) => [kind.key, index])) as Record<BrowserKind, number>;

export function kindInfo(kind: string) {
  return BROWSER_KINDS.find(item => item.key === kind) ?? BROWSER_KINDS[3];
}

export function isAiKind(kind: string): boolean {
  return kind === "ai_browser" || kind === "ai_agent";
}

/** Names of the family keys the server sends (functions insights/browser.js FAMILIES, plus the apps). */
const FAMILY_LABELS: Record<string, string> = {
  // AI browsers (only those that say so in the request)
  chatgpt_atlas: "ChatGPT Atlas",
  comet: "Perplexity Comet (Android)",
  arc_search: "Arc Search",
  genspark: "Genspark browser",
  // AI agents driving a browser, and assistants fetching a page for a person
  chatgpt_agent: "ChatGPT agent",
  google_agent: "Google-Agent",
  manus_agent: "Manus agent",
  nova_act: "Amazon Nova Act agent",
  claude_agent: "Claude agent",
  chatgpt_user: "ChatGPT (page fetched for a user)",
  claude_user: "Claude (page fetched for a user)",
  perplexity_user: "Perplexity (page fetched for a user)",
  mistral_user: "Mistral Le Chat (page fetched for a user)",
  gemini_fetch: "Gemini (page fetched for a user)",
  meta_ai_fetch: "Meta AI (page fetched for a user)",
  amazon_user: "Alexa+ (page fetched for a user)",
  kimi_user: "Kimi (page fetched for a user)",
  duckassistbot: "DuckDuckGo Duck.ai (page fetched for a user)",
  signed_agent: "Signed bot (Web Bot Auth)",
  cloudflare_browser: "Cloudflare Browser Rendering",
  // Normal browsers
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Microsoft Edge",
  opera: "Opera",
  opera_gx: "Opera GX",
  brave: "Brave",
  vivaldi: "Vivaldi",
  yandex: "Yandex Browser",
  samsung: "Samsung Internet",
  duckduckgo: "DuckDuckGo",
  uc: "UC Browser",
  whale: "Naver Whale",
  miui: "Xiaomi browser",
  huawei: "Huawei browser",
  silk: "Amazon Silk",
  avast: "Avast / AVG Secure Browser",
  ie: "Internet Explorer",
  in_app_facebook: "Facebook in-app browser",
  in_app_instagram: "Instagram in-app browser",
  in_app_linkedin: "LinkedIn in-app browser",
  in_app_tiktok: "TikTok in-app browser",
  in_app_snapchat: "Snapchat in-app browser",
  in_app_wechat: "WeChat in-app browser",
  in_app_line: "LINE in-app browser",
  google_app: "Google app",
  android_webview: "Android app's built-in browser",
  ios_webview: "iPhone/iPad app's built-in browser",
  chromium_unknown: "Chromium (unknown)",
  other: "Other",
  none: "No user agent",
  // Bots
  gptbot: "GPTBot (OpenAI crawler)",
  oai_searchbot: "OAI-SearchBot (ChatGPT search)",
  oai_adsbot: "OAI-AdsBot (ChatGPT ads check)",
  claudebot: "ClaudeBot (Anthropic crawler)",
  claude_searchbot: "Claude-SearchBot",
  perplexitybot: "PerplexityBot",
  google_vertexbot: "Google-CloudVertexBot",
  googleother: "GoogleOther",
  meta_ai: "Meta AI crawler",
  bytespider: "Bytespider (ByteDance)",
  ccbot: "CCBot (Common Crawl)",
  amazonbot: "Amazonbot",
  cohere: "Cohere crawler",
  mistralbot: "Mistral crawler",
  ai_crawler_other: "Other AI crawler (Kimi, xAI, DeepSeek)",
  youbot: "YouBot",
  diffbot: "Diffbot",
  timpibot: "Timpibot",
  googlebot: "Googlebot",
  google_fetcher: "Google fetcher (read aloud, messages)",
  bingbot: "Bingbot",
  applebot: "Applebot",
  yandexbot: "YandexBot",
  duckduckbot: "DuckDuckBot",
  baiduspider: "Baiduspider",
  petalbot: "PetalBot",
  seznambot: "SeznamBot",
  bravebot: "Brave Search crawler",
  facebook_preview: "Facebook link preview",
  meta_other: "Meta crawler (ads)",
  twitterbot: "X (Twitter) link preview",
  linkedinbot: "LinkedIn link preview",
  slackbot: "Slack link preview",
  discordbot: "Discord link preview",
  whatsapp_preview: "WhatsApp link preview",
  telegrambot: "Telegram link preview",
  pinterestbot: "Pinterest",
  preview_other: "Other link preview",
  headless: "Headless browser (automation)",
  lighthouse: "Lighthouse / speed test",
  http_client: "Script (curl, Python …)",
  other_bot: "Other bot",
  // NivaDesk apps
  app_ios: "iPhone app",
  app_ipados: "iPad app",
  app_ios_unknown: "iPhone or iPad app (older)",
  app_mac: "Mac app",
  app_android: "Android app"
};

/** Crawlers that collect pages for AI models or AI answers (as opposed to search engines and link previews). */
export const AI_CRAWLERS = new Set([
  "gptbot", "oai_searchbot", "claudebot", "claude_searchbot", "perplexitybot", "google_vertexbot", "googleother",
  "meta_ai", "bytespider", "ccbot", "amazonbot", "cohere", "mistralbot", "ai_crawler_other", "youbot", "diffbot", "timpibot"
]);

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family] || (family ? family.replace(/_/g, " ") : "Other");
}

/**
 * "Chrome 142", "iPhone app 2.4", "Chromium (unknown) 141 · says “Nova”". A brand is only ever sent with an unknown
 * Chromium: it is the name that browser gave itself, shown in quotes because nothing checked it.
 */
export function browserLabel(item: { family: string; major?: string; brand?: string }): string {
  const name = familyLabel(item.family);
  const version = item.major ? ` ${item.major}` : "";
  const brand = item.brand ? ` · says “${item.brand}”` : "";
  return `${name}${version}${brand}`;
}

/** "42%", "<1%", "—" (nothing to divide by). */
export function shareLabel(part: number, total: number): string {
  if (!total || !Number.isFinite(total)) return "—";
  const pct = (Math.max(0, part) / total) * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/** The kind rows with sessions, people and share of sessions, in page order; empty kinds left out unless asked. */
export function kindRows(kinds: Partial<Record<BrowserKind, BrowserBucket>> | null | undefined, options: { keepEmpty?: boolean } = {}) {
  const total = BROWSER_KINDS.reduce((sum, kind) => sum + (kinds?.[kind.key]?.sessions || 0), 0);
  return BROWSER_KINDS
    .map(kind => {
      const bucket = kinds?.[kind.key] ?? { sessions: 0, members: 0, unidentified: 0, people: 0 };
      return { ...kind, ...bucket, share: total ? bucket.sessions / total : 0, shareLabel: shareLabel(bucket.sessions, total) };
    })
    .filter(row => options.keepEmpty || row.sessions > 0);
}

/** Visit counts per kind of the public website (anonymous day counters), with shares of the labelled visits. */
export function siteKindRows(site: BrowserSite | null | undefined) {
  const total = Object.values(site?.kinds ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return BROWSER_KINDS
    .filter(kind => kind.key !== "app" && kind.key !== "unclassified")
    .map(kind => {
      const visits = Number(site?.kinds?.[kind.key]) || 0;
      return { ...kind, visits, share: total ? visits / total : 0, shareLabel: shareLabel(visits, total) };
    })
    .filter(row => row.visits > 0);
}

/** A counter map as rows, most first: [{ family, label, count, shareLabel }]. */
export function counterRows(map: Record<string, number> | null | undefined, limit = 12) {
  const entries = Object.entries(map ?? {}).map(([family, n]) => [family, Number(n) || 0] as const).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([family, count]) => ({ family, label: familyLabel(family), count, shareLabel: shareLabel(count, total), aiCrawler: AI_CRAWLERS.has(family) }));
}

/** "142 ×3, 141" — the versions of a family, most used first. */
export function versionsLabel(versions: { major: string; sessions: number }[] | null | undefined, max = 4): string {
  const list = (versions ?? []).filter(v => v.major);
  if (!list.length) return "—";
  const shown = list.slice(0, max).map(v => (v.sessions > 1 ? `${v.major} ×${v.sessions}` : v.major));
  return list.length > max ? `${shown.join(", ")} …` : shown.join(", ");
}

export type BrowserFilter = "all" | "ai" | "normal" | "apps" | "other";

export const BROWSER_FILTERS: { key: BrowserFilter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "ai", label: "AI browsers & agents" },
  { key: "normal", label: "Normal browsers" },
  { key: "apps", label: "Apps" },
  { key: "other", label: "Can't tell / bots" }
];

/** People who used at least one browser of the filter's kind, and match the search (address, name or workspace). */
export function filterPeople<T extends Pick<BrowserPerson, "kinds" | "email" | "name" | "workspace">>(people: T[], filter: BrowserFilter, query = ""): T[] {
  const q = query.trim().toLowerCase();
  return people.filter(person => {
    const kinds = person.kinds || [];
    const kindOk = filter === "all"
      || (filter === "ai" && kinds.some(isAiKind))
      || (filter === "normal" && kinds.includes("normal"))
      || (filter === "apps" && kinds.includes("app"))
      || (filter === "other" && kinds.some(kind => kind === "unknown" || kind === "bot" || kind === "unclassified"));
    if (!kindOk) return false;
    if (!q) return true;
    return [person.email, person.name, person.workspace].some(value => String(value || "").toLowerCase().includes(q));
  });
}

/** A person's browsers, AI first, then the order the server sent (most recent first). */
export function sortedBrowsers(items: BrowserItem[] | null | undefined): BrowserItem[] {
  return [...(items ?? [])].sort((a, b) => Number(isAiKind(b.kind)) - Number(isAiKind(a.kind)) || 0);
}

/** One line for Online time: "Chrome 142 · ChatGPT agent (AI agent)"; AI kinds named, normal ones not. */
export function browsersLine(items: BrowserItem[] | null | undefined, max = 3): string {
  const list = sortedBrowsers(items);
  if (!list.length) return "";
  const shown = list.slice(0, max).map(item => (isAiKind(item.kind) || item.kind === "unknown" ? `${browserLabel(item)} (${kindInfo(item.kind).short})` : browserLabel(item)));
  return list.length > max ? `${shown.join(" · ")} +${list.length - max}` : shown.join(" · ");
}

/** Sort helper for family tables: AI first, then by sessions. */
export function familyOrder(a: { kind: string; sessions: number }, b: { kind: string; sessions: number }): number {
  return Number(isAiKind(b.kind)) - Number(isAiKind(a.kind)) || b.sessions - a.sessions || (KIND_INDEX[a.kind as BrowserKind] ?? 9) - (KIND_INDEX[b.kind as BrowserKind] ?? 9);
}

/** True when the answer comes from a server that does not know the Browsers summary yet (before the functions deploy). */
export function isLegacyBrowsers(answer: { browsers?: unknown } | null | undefined): boolean {
  return Boolean(answer) && !answer?.browsers;
}

/** When the labels began, if that is inside the period: earlier web sessions of the period are "not checked". */
export function labelsStartInside(answer: Pick<BrowsersAnswer, "recordedSinceMs" | "startMs"> | null | undefined): boolean {
  if (!answer) return false;
  return answer.recordedSinceMs === null || answer.recordedSinceMs === undefined || answer.recordedSinceMs > answer.startMs + 2 * 60000;
}
