import type { Metadata } from "next";
import { PublicAcceptableUsePage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("acceptableUse");

export default function AcceptableUsePage() {
  return <PublicAcceptableUsePage />;
}
