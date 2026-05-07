import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("login");

export default function LoginLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
