import type { Metadata } from "next";
import { PublicFaqPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("faq");

export default function FaqPage() {
  return <PublicFaqPage />;
}
