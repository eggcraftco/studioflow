// Anonymous, privacy-light tracking for the /custom-order-management paid-ads
// landing page. Sends only an event name, device class and (for the view) a
// normalised source — no cookies, no identifiers, no PII. Events are folded
// into daily aggregate counters server-side (recordSiteVisit, kind:"landing").
// Attribution from the landing page to a completed signup is kept in
// localStorage (source + timestamp) so we never store who the user is.

const BEACON_URL = "https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit";
const ATTRIBUTION_KEY = "nv_co_lp_src";
const ATTRIBUTION_TTL_MS = 24 * 60 * 60 * 1000; // attribution window: 24h

export type LandingEvent =
  | "custom_order_landing_view"
  | "custom_order_landing_cta_click"
  | "custom_order_landing_how_it_works_click"
  | "custom_order_landing_signup_visit"
  | "custom_order_landing_signup_completed";

// Only report from the live site so local/dev/preview traffic never inflates stats.
function isLiveSite(): boolean {
  return typeof window !== "undefined" && window.location.hostname.endsWith("nivadesk.app");
}

function deviceClass(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  return width <= 640 ? "mobile" : width <= 1024 ? "tablet" : "desktop";
}

// Normalise the traffic source to a small, non-identifying label.
export function parseLandingSource(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = (params.get("utm_source") || "").trim().toLowerCase();
    if (utm) {
      if (/google|adwords|gads/.test(utm)) return "google";
      if (/meta|facebook|fb|instagram|^ig$/.test(utm)) return "meta";
      if (/bing/.test(utm)) return "bing";
      return utm.replace(/[^a-z0-9_-]+/g, "").slice(0, 30) || "other";
    }
    // Paid-click IDs survive even when the ad platform strips the referrer.
    if (params.has("gclid") || params.has("gbraid") || params.has("wbraid")) return "google";
    if (params.has("fbclid")) return "meta";
    if (params.has("ttclid")) return "tiktok";
    if (params.has("msclkid")) return "bing";
    const referrer = document.referrer || "";
    if (!referrer) return "direct";
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("nivadesk")) return "internal";
    if (/google\./.test(host)) return "google";
    if (/(facebook|instagram|fbcdn|fb\.|meta\.)/.test(host)) return "meta";
    if (/(t\.co|twitter|x\.com)/.test(host)) return "twitter";
    if (/bing\./.test(host)) return "bing";
    if (/duckduckgo/.test(host)) return "duckduckgo";
    return host.replace(/[^a-z0-9.-]+/g, "").slice(0, 40) || "other";
  } catch {
    return "direct";
  }
}

function postBeacon(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    let sent = false;
    if (navigator.sendBeacon) {
      // text/plain keeps this a "simple" request (no CORS preflight) so the
      // beacon survives navigation, including in Safari.
      sent = navigator.sendBeacon(BEACON_URL, new Blob([body], { type: "text/plain" }));
    }
    if (!sent) {
      void fetch(BEACON_URL, { method: "POST", body, headers: { "Content-Type": "text/plain" }, keepalive: true });
    }
  } catch {
    // Best-effort analytics — never break the page.
  }
}

export function trackLandingEvent(event: LandingEvent, source?: string) {
  if (!isLiveSite()) return;
  postBeacon({ kind: "landing", event, device: deviceClass(), source: source || "" });
}

export function setLandingAttribution(source: string) {
  try {
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ source: source || "direct", ts: Date.now() }));
  } catch {
    // ignore
  }
}

export function getLandingAttribution(): { source: string; ts: number } | null {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { source?: string; ts?: number };
    if (!parsed || typeof parsed.ts !== "number" || Date.now() - parsed.ts > ATTRIBUTION_TTL_MS) {
      window.localStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return { source: String(parsed.source || "direct"), ts: parsed.ts };
  } catch {
    return null;
  }
}

export function clearLandingAttribution() {
  try {
    window.localStorage.removeItem(ATTRIBUTION_KEY);
  } catch {
    // ignore
  }
}
