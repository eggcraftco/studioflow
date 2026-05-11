import type { Metadata } from "next";
import { PublicFeaturesPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("features");

export default function FeaturesPage() {
  return <PublicFeaturesPage />;
}
