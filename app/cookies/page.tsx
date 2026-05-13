import type { Metadata } from "next";
import { PublicCookiePage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("cookies");

export default function CookiesPage() {
  return <PublicCookiePage />;
}
