import type { Metadata } from "next";
import { PublicSubprocessorsPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("subprocessors");

export default function SubprocessorsPage() {
  return <PublicSubprocessorsPage />;
}
