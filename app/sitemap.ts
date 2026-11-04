import type { MetadataRoute } from "next";
import { CLAUDE_CONNECTOR_URL } from "@/lib/studioflow/claudeConnector";
import {
  isLocalizedPublicPath,
  localizedPublicPath,
  PREFIXED_PUBLIC_LOCALES,
  publicHreflangAlternates
} from "@/lib/publicSite/locales";

const BASE_URL = "https://nivadesk.app";

// Marketing and legal pages only. The user guide is deliberately absent: it
// walks through the product menu by menu, and we would rather not hand that to
// search engines. See robots.ts, which blocks it at the crawl level too.
const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/integrations", priority: 0.8, changeFrequency: "monthly" },
  { path: "/integrations/amazon", priority: 0.7, changeFrequency: "monthly" },
  { path: "/integrations/shopify", priority: 0.7, changeFrequency: "monthly" },
  // Listed only once the Claude endpoint's address is published; until then the
  // page is noindex (app/integrations/claude/page.tsx reads the same constant).
  ...(CLAUDE_CONNECTOR_URL ? [{ path: "/integrations/claude", priority: 0.7, changeFrequency: "monthly" as const }] : []),
  { path: "/features", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/chatgpt", priority: 0.9, changeFrequency: "weekly" },
  { path: "/faq", priority: 0.8, changeFrequency: "weekly" },
  { path: "/changelog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/signup", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
  { path: "/security", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refund-cancellation", priority: 0.3, changeFrequency: "yearly" },
  { path: "/account-deletion", priority: 0.3, changeFrequency: "yearly" },
  { path: "/acceptable-use", priority: 0.3, changeFrequency: "yearly" },
  { path: "/subprocessors", priority: 0.3, changeFrequency: "yearly" },
  { path: "/data-processing-agreement", priority: 0.3, changeFrequency: "yearly" }
];

// A page with language versions is listed once per language (/pricing, /de/pricing, … /hi/pricing), and every
// one of those entries carries the same hreflang set as the pages' <head> (lib/publicSite/locales.ts), so the
// sitemap and the HTML never disagree. Twelve languages × the localized pages stay far under the 50,000-URL
// limit of one sitemap, so there is no sitemap index.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.flatMap(page => {
    const entry = {
      url: `${BASE_URL}${page.path}`,
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority
    };
    if (!isLocalizedPublicPath(page.path)) return [entry];
    const alternates = { languages: publicHreflangAlternates(page.path) };
    return [
      { ...entry, alternates },
      ...PREFIXED_PUBLIC_LOCALES.map(locale => ({
        ...entry,
        url: `${BASE_URL}${localizedPublicPath(page.path, locale.language)}`,
        alternates
      }))
    ];
  });
}
