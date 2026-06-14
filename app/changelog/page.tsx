import type { Metadata } from "next";
import { PublicChangelogPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("changelog");

export default function ChangelogPage() {
  return <PublicChangelogPage />;
}
