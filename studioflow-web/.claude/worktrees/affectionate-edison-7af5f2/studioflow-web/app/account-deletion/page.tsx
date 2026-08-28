import type { Metadata } from "next";
import { PublicAccountDeletionPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("accountDeletion");

export default function AccountDeletionPage() {
  return <PublicAccountDeletionPage />;
}
