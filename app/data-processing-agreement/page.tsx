import type { Metadata } from "next";
import { PublicDataProcessingAgreementPage } from "@/components/publicLegal/PublicDataProcessingAgreementPage";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("dataProcessingAgreement");

export default function DataProcessingAgreementPage() {
  return <PublicDataProcessingAgreementPage />;
}
