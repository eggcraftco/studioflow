import type { Metadata } from "next";
import { CustomerPortalContent } from "./CustomerPortalContent";

// The customer's own page for one order. Never indexed, never listed in the
// sitemap, and deliberately outside the app shell: whoever opens this has a
// link, not an account.
export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false, follow: false, nocache: true }
};

export default async function CustomerPortalPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="public-site portal-page">
      <CustomerPortalContent token={token} />
    </main>
  );
}
