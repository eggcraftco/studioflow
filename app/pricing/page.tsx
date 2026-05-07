import type { Metadata } from "next";
import { PublicPricingPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("pricing");

export default function PricingPage() {
  return <PublicPricingPage />;
}
