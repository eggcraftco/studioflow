import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClaudeHelpPage from "@/app/integrations/claude/ClaudeHelpPage";
import { isLocalizedPublicPath, LOCALIZED_PUBLIC_PAGE_PATHS, publicLocaleByCode } from "@/lib/publicSite/locales";
import { localizedPublicPageMetadata } from "@/lib/publicSite/metadata";
import { LocalizedPageStructuredData } from "@/lib/publicSite/structuredData";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return localizedPublicPageMetadata("claude", (await params).lang);
}

export default async function LocalizedClaudePage({ params }: Props) {
  const locale = publicLocaleByCode((await params).lang);
  if (!locale) notFound();
  // Like the English page: language versions only while the Claude endpoint's address is published.
  if (!isLocalizedPublicPath(LOCALIZED_PUBLIC_PAGE_PATHS.claude)) notFound();
  return (
    <>
      <LocalizedPageStructuredData page="claude" language={locale.language} />
      <ClaudeHelpPage />
    </>
  );
}
