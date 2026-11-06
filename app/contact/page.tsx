import type { Metadata } from "next";
import { PublicContactPage } from "@/components/publicLegal/PublicContactPage";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("contact");

export default function ContactPage() {
  return <PublicContactPage />;
}
