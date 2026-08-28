import type { Metadata } from "next";
import { PublicFaqPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";
import { FaqStructuredData } from "@/lib/publicSite/structuredData";

export const metadata: Metadata = publicPageMetadata("faq");

export default function FaqPage() {
  return (
    <>
      <FaqStructuredData />
      <PublicFaqPage />
    </>
  );
}
