import type { Metadata } from "next";
import { PublicTermsPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("terms");

export default function TermsPage() {
  return <PublicTermsPage />;
}
