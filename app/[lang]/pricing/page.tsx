import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPricingPage } from "@/components/PublicMarketing";
import { publicLocaleByCode } from "@/lib/publicSite/locales";
import { localizedPublicPageMetadata } from "@/lib/publicSite/metadata";
import { PricingStructuredData } from "@/lib/publicSite/structuredData";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return localizedPublicPageMetadata("pricing", (await params).lang);
}

export default async function LocalizedPricingPage({ params }: Props) {
  const locale = publicLocaleByCode((await params).lang);
  if (!locale) notFound();
  return (
    <>
      <PricingStructuredData language={locale.language} />
      <PublicPricingPage />
    </>
  );
}
