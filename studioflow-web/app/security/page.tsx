import type { Metadata } from "next";
import { PublicSecurityPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("security");

export default function SecurityPage() {
  return <PublicSecurityPage />;
}
