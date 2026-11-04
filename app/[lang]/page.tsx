import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicHomePage } from "@/components/PublicMarketing";
import { publicLocaleByCode } from "@/lib/publicSite/locales";
import { localizedPublicPageMetadata } from "@/lib/publicSite/metadata";
import { HomeStructuredData } from "@/lib/publicSite/structuredData";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return localizedPublicPageMetadata("home", (await params).lang);
}

export default async function LocalizedHomePage({ params }: Props) {
  const locale = publicLocaleByCode((await params).lang);
  if (!locale) notFound();
  return (
    <>
      <HomeStructuredData language={locale.language} />
      <PublicHomePage />
    </>
  );
}
