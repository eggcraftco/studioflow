import type { Metadata } from "next";
import { headers } from "next/headers";
import { paymentReturnDirection, paymentReturnLanguage } from "@/lib/publicSite/paymentReturn";
import { bookingSlug } from "@/lib/publicSite/onlineBooking";
import { BookingPageContent } from "./BookingPageContent";

// A business's online booking page: https://nivadesk.app/book/<slug> (functions/booking/bookingFunctions.js,
// 1 Nov 2026). Outside the app shell like /p and /track: whoever opens it has a link, not an account. Never
// indexed. The language is chosen on the server from Accept-Language (the customer can switch it); what the
// page shows comes from the `bookingPublic` callable, which checks the serving host and rate-limits every try.
// `?embed=1` is the same page without its own background, for the business's website (iframe); only this
// route may be framed (next.config.ts), never the manage page.
export const metadata: Metadata = {
  title: "Book",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer"
};

export const dynamic = "force-dynamic";

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  const language = paymentReturnLanguage((await headers()).get("accept-language"));
  return (
    <BookingPageContent
      slug={bookingSlug(slug)}
      initialLanguage={language}
      initialDirection={paymentReturnDirection(language)}
      embed={query.embed === "1"}
    />
  );
}
