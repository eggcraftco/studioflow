import type { Metadata } from "next";
import AmazonSellerPage from "./AmazonSellerPage";

export const metadata: Metadata = {
  title: "NivaDesk for Amazon sellers: features, pricing and data handling | NivaDesk",
  description: "The NivaDesk Amazon connection reads your Amazon orders into NivaDesk every 30 minutes, read-only, so made-to-order, handmade and repair sellers can plan and track the work. The exact fields read, how sync and cancellations work, Europe-region marketplaces, pricing on every plan including Free, and current limits. Access is under review by Amazon.",
  alternates: { canonical: "https://nivadesk.app/integrations/amazon" },
};

export default function AmazonIntegrationPage() {
  return <AmazonSellerPage />;
}
