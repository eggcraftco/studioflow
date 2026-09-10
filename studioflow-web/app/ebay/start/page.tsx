import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { EbayStartContent } from "./EbayStartContent";

// The state in the URL is single-use and bound to one person; a search engine
// holding a copy of the link would be handing out half of a connect flow.
export const metadata: Metadata = {
  title: "Connect eBay",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

export default function EbayStartPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <EbayStartContent />
    </Suspense>
  );
}
