// Google Ads (gtag.js) — tag id + signup conversion helper.
//
// Privacy notes:
// - The tag is loaded only on the public marketing site + the landing page +
//   /signup. It is NOT loaded inside the authenticated app, so private app
//   navigation is never sent to Google Ads.
// - The signup conversion sends no personal data (no email, no name, no
//   enhanced conversions) — just the conversion ping. Google attributes it to
//   the ad click via its own gclid cookie set on the landing page.

export const GOOGLE_ADS_ID = "AW-18283866098";

// 👉 Paste the conversion LABEL from Google Ads here — the part AFTER the slash
// in the Google snippet, e.g. send_to "AW-18283866098/AbC-D_efGhIjkLmN" → the
// label is "AbC-D_efGhIjkLmN". Until a real label is set, the conversion is NOT
// fired (so no invalid hits are sent to Google).
export const GOOGLE_ADS_SIGNUP_LABEL = "9ckOCJavycccEPLPto5E";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Fire the Google Ads signup conversion. Called from the same place as the
// internal custom_order_landing_signup_completed event (the landing-page flow),
// so it counts once per completed signup. Beacon transport keeps the hit alive
// across the immediate redirect to /dashboard.
export function fireGoogleAdsSignupConversion() {
  if (typeof window === "undefined") return;
  if (!window.location.hostname.endsWith("nivadesk.app")) return;
  if (!GOOGLE_ADS_SIGNUP_LABEL || GOOGLE_ADS_SIGNUP_LABEL.startsWith("PASTE")) return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_SIGNUP_LABEL}`,
    transport_type: "beacon"
  });
}
