import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AmazonSellerPage from "@/app/integrations/amazon/AmazonSellerPage";
import { publicLocaleByCode } from "@/lib/publicSite/locales";
import { localizedPublicPageMetadata } from "@/lib/publicSite/metadata";
import { LocalizedPageStructuredData } from "@/lib/publicSite/structuredData";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return localizedPublicPageMetadata("amazon", (await params).lang);
}

export default async function LocalizedAmazonPage({ params }: Props) {
  const locale = publicLocaleByCode((await params).lang);
  if (!locale) notFound();
  return (
    <>
      <LocalizedPageStructuredData page="amazon" language={locale.language} />
      <AmazonSellerPage />
    </>
  );
}
