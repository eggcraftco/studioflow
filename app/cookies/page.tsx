import type { Metadata } from "next";
import { PublicCookiePage } from "@/components/publicLegal/PublicCookiePage";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("cookies");

export default function CookiesPage() {
  return <PublicCookiePage />;
}
