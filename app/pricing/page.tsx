import type { Metadata } from "next";
import { PublicPricingPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";
import { PricingStructuredData } from "@/lib/publicSite/structuredData";

export const metadata: Metadata = publicPageMetadata("pricing");

export default function PricingPage() {
  return (
    <>
      <PricingStructuredData />
      <PublicPricingPage />
    </>
  );
}
