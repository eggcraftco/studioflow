"use client";

import Script from "next/script";
import { GOOGLE_ADS_ID } from "@/lib/googleAds";

// Loads the Google tag (gtag.js) for Google Ads conversion tracking.
// Rendered on the public marketing site, the landing page and /signup only —
// never inside the authenticated app. The tag is configured only on the live
// host so local/preview traffic never pollutes Ads data. next/script dedupes by
// id, so rendering this in more than one wrapper still loads the tag once.
export function GoogleAdsTag() {
  return (
    <>
      <Script
        id="google-ads-gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag-init" strategy="afterInteractive">
        {`
          if (location.hostname.endsWith('nivadesk.app')) {
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
            window.gtag('js', new Date());
            window.gtag('config', '${GOOGLE_ADS_ID}');
          }
        `}
      </Script>
    </>
  );
}
