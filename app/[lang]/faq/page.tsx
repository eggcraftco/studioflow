import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFaqPage } from "@/components/PublicMarketing";
import { publicLocaleByCode } from "@/lib/publicSite/locales";
import { localizedPublicPageMetadata } from "@/lib/publicSite/metadata";
import { FaqStructuredData } from "@/lib/publicSite/structuredData";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return localizedPublicPageMetadata("faq", (await params).lang);
}

export default async function LocalizedFaqPage({ params }: Props) {
  const locale = publicLocaleByCode((await params).lang);
  if (!locale) notFound();
  return (
    <>
      <FaqStructuredData language={locale.language} />
      <PublicFaqPage />
    </>
  );
}
