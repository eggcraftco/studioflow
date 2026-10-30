import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { headers } from "next/headers";
import { paymentReturnDirection, paymentReturnLanguage } from "@/lib/publicSite/paymentReturn";
import { paymentLinkCode } from "@/lib/publicSite/paymentLink";
import { PaymentLinkContent } from "./PaymentLinkContent";

// A business's short payment link: https://pay.<their domain>/p/<code> (or the workspace's client
// domain, or nivadesk.app). Written by functions/paymentConnect.js when the link is made, in place of
// Stripe's 300-character Checkout URL. Outside the app shell like /track and /pay/done: whoever opens
// it has a link, not an account. Never indexed. The language is chosen on the server from the browser's
// Accept-Language, the same way /pay/done chooses it; what the page shows comes from the code alone,
// through two public callables that check the serving host and rate-limit every try.
export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer"
};

export const dynamic = "force-dynamic";

// A business theme may ask for Poppins (EGGcraft's shop font). Not preloaded: the neutral page never downloads it.
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", preload: false, variable: "--font-poppins" });

export default async function PaymentLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const language = paymentReturnLanguage((await headers()).get("accept-language"));
  return (
    <PaymentLinkContent code={paymentLinkCode(code)} language={language} direction={paymentReturnDirection(language)} fontClassName={poppins.variable} />
  );
}
