import type { Metadata } from "next";
import { PublicGuidePage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("guide");

export default function GuidePage() {
  return <PublicGuidePage />;
}
