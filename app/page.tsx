import type { Metadata } from "next";
import { PublicHomePage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("home");

export default function HomePage() {
  return <PublicHomePage />;
}
