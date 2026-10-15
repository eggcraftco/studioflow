import type { Metadata } from "next";
import ShopifyHelpPage from "./ShopifyHelpPage";

// Public and indexable on purpose (unlike /guide): this is the Tutorial and FAQ page
// the Shopify App Store listing links to, so a merchant must be able to read it before
// installing, without an account or a paid plan. It is in the sitemap and not in
// robots.ts's disallow list.
export const metadata: Metadata = {
  title: "NivaDesk for Shopify: setup guide, plans and import | NivaDesk",
  description: "How the NivaDesk Order Management app for Shopify works: what it reads (read-only), how to install and connect a store, plans billed by Shopify in US dollars with a free trial, the Free plan's 10 active orders and what happens when it is full, importing past orders, and support.",
  alternates: { canonical: "https://nivadesk.app/integrations/shopify" },
};

export default function ShopifyIntegrationPage() {
  return <ShopifyHelpPage />;
}
