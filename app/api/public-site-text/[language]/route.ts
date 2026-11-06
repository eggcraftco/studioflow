import { gzipSync } from "node:zlib";
import { publicLocaleByCode } from "@/lib/publicSite/locales";
import { PUBLIC_SITE_TRANSLATIONS } from "@/lib/publicSite/translations";

// One language's public-site text, for a page with one address (/privacy, /changelog, /login …) read in another
// language: the browser bundle carries English only (lib/publicSite/i18n.tsx), and a language address
// (/de/pricing) gets its table from app/[lang]/layout.tsx instead.
//
// Next sends a route handler's body as it is — no gzip, unlike its pages (measured 6 Nov: Arabic 121 KB, Hindi
// 172 KB). So the handler compresses it itself, once per language, for a browser that accepts gzip (all do; ~30 KB).
export const dynamic = "force-dynamic";

const gzipped = new Map<string, Buffer>();

export async function GET(request: Request, { params }: { params: Promise<{ language: string }> }) {
  const locale = publicLocaleByCode((await params).language);
  if (!locale) return new Response("Not found", { status: 404 });
  const headers = { "Content-Type": "application/json; charset=utf-8", Vary: "Accept-Encoding" };
  const json = JSON.stringify(PUBLIC_SITE_TRANSLATIONS[locale.language]);
  if (!/\bgzip\b/i.test(request.headers.get("accept-encoding") ?? "")) return new Response(json, { headers });
  let body = gzipped.get(locale.code);
  if (!body) {
    body = gzipSync(json);
    gzipped.set(locale.code, body);
  }
  return new Response(new Uint8Array(body), { headers: { ...headers, "Content-Encoding": "gzip" } });
}
