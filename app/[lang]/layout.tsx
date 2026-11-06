import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { PublicRouteLanguage } from "@/lib/publicSite/i18n";
import { PREFIXED_PUBLIC_LOCALES, publicLocaleByCode } from "@/lib/publicSite/locales";
import { PUBLIC_SITE_TRANSLATIONS } from "@/lib/publicSite/translations";

// The public site in one language: /de, /de/pricing, /hi/faq … (lib/publicSite/locales.ts). The pages below are
// the same components as the English ones; this layout pins their language to the address, so the server renders
// German HTML for /de/… whoever asks — no browser language, no country, no JavaScript needed.
// English has no prefix (middleware.ts sends /en/… to the unprefixed page), and any other segment is a 404.
// The layout also hands the page its language's text table — the browser loads that one language, never the other
// eleven (lib/publicSite/i18n.tsx). The table is read here, on the server.
export const dynamicParams = false;

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map(locale => ({ lang: locale.code }));
}

export default async function PublicLanguageLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const locale = publicLocaleByCode((await params).lang);
  if (!locale) notFound();
  return (
    <PublicRouteLanguage language={locale.language} text={PUBLIC_SITE_TRANSLATIONS[locale.language]}>
      {children}
    </PublicRouteLanguage>
  );
}
