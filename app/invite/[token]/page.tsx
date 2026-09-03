import type { Metadata } from "next";
import { InviteAcceptContent } from "./InviteAcceptContent";

// A link sent to one person's inbox. Never indexed and never listed: the URL is
// the credential, and a search engine holding a copy of it would be a way in.
export const metadata: Metadata = {
  title: "Join a workspace",
  robots: { index: false, follow: false, nocache: true }
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="public-site estimate-page">
      <InviteAcceptContent token={token} />
    </main>
  );
}
