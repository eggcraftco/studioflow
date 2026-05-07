import type { Metadata } from "next";
import { PublicSignupPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("signup");

export default function SignupPage() {
  return <PublicSignupPage />;
}
