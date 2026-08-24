import type { Metadata } from "next";
import { EstimateApprovalContent } from "./EstimateApprovalContent";

// A private document sent to one customer. Never indexed, never listed in the
// sitemap, and deliberately outside the app shell: whoever opens this has a
// link, not an account.
export const metadata: Metadata = {
  title: "Repair estimate",
  robots: { index: false, follow: false, nocache: true }
};

export default async function EstimateApprovalPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="public-site estimate-page">
      <EstimateApprovalContent token={token} />
    </main>
  );
}
