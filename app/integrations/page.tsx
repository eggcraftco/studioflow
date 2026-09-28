import type { Metadata } from "next";
import IntegrationsDirectory from "./IntegrationsDirectory";

export const metadata: Metadata = {
  title: "Integrations for your workshop | NivaDesk",
  description: "Explore how NivaDesk connects your shop, accounts and customer communication. Every integration is labelled live, limited access or coming soon, as measured against what is running today.",
  alternates: { canonical: "https://nivadesk.app/integrations" },
};

export default function IntegrationsPage() {
  return <IntegrationsDirectory />;
}
