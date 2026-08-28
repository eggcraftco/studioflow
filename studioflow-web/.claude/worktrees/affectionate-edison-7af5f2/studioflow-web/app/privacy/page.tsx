import type { Metadata } from "next";
import { PublicPrivacyPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("privacy");

export default function PrivacyPage() {
  return <PublicPrivacyPage />;
}
