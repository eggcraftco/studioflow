import type { MetadataRoute } from "next";

const BASE_URL = "https://nivadesk.app";

const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/features", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
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

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.map(page => ({
    url: `${BASE_URL}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority
  }));
}
