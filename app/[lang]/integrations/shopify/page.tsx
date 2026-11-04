import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShopifyHelpPage from "@/app/integrations/shopify/ShopifyHelpPage";
import { publicLocaleByCode } from "@/lib/publicSite/locales";
import { localizedPublicPageMetadata } from "@/lib/publicSite/metadata";
import { LocalizedPageStructuredData } from "@/lib/publicSite/structuredData";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return localizedPublicPageMetadata("shopify", (await params).lang);
}

export default async function LocalizedShopifyPage({ params }: Props) {
  const locale = publicLocaleByCode((await params).lang);
  if (!locale) notFound();
  return (
    <>
      <LocalizedPageStructuredData page="shopify" language={locale.language} />
      <ShopifyHelpPage />
    </>
  );
}
