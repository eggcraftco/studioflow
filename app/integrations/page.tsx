import type { Metadata } from "next";
import IntegrationsDirectory from "./IntegrationsDirectory";

export const metadata: Metadata = {
  title: "Integrations for your workshop | NivaDesk",
  description: "Explore how NivaDesk connects your shop, accounts and customer communication. Find the right integrations for your workshop and see what is coming next.",
  alternates: { canonical: "https://nivadesk.app/integrations" },
};

export default function IntegrationsPage() {
  return <IntegrationsDirectory />;
}
