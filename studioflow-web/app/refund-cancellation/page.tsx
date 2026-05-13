import type { Metadata } from "next";
import { PublicRefundCancellationPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("refundCancellation");

export default function RefundCancellationPage() {
  return <PublicRefundCancellationPage />;
}
