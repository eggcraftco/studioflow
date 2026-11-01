import type { Metadata } from "next";
import { headers } from "next/headers";
import { paymentReturnDirection, paymentReturnLanguage } from "@/lib/publicSite/paymentReturn";
import { ManageBookingContent } from "./ManageBookingContent";

// The customer's own booking (the link in every booking e-mail: /book/manage#<token>). The token sits after
// the "#", so it never reaches a server log, an analytics tag or a Referer header; the page reads it in the
// browser and asks `bookingPublic` (manage / manageTimes / cancel / reschedule). Never indexed, never framed.
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer"
};

export const dynamic = "force-dynamic";

export default async function ManageBookingPage() {
  const language = paymentReturnLanguage((await headers()).get("accept-language"));
  return <ManageBookingContent initialLanguage={language} initialDirection={paymentReturnDirection(language)} />;
}
