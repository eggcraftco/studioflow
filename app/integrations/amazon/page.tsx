import type { Metadata } from "next";
import AmazonSellerPage from "./AmazonSellerPage";

export const metadata: Metadata = {
  title: "NivaDesk for Amazon sellers: features, pricing and data handling | NivaDesk",
  description: "What the NivaDesk Amazon connection does for Amazon sellers: read-only import of Amazon orders next to your other channels, production tracking, supported marketplaces, pricing on every plan, and how seller data is handled. Access is under review by Amazon.",
  alternates: { canonical: "https://nivadesk.app/integrations/amazon" },
};

export default function AmazonIntegrationPage() {
  return <AmazonSellerPage />;
}
