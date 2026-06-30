// Anonymous, privacy-light tracking for the /custom-order-management paid-ads
// landing page. Sends only an event name, device class, a normalised source, a
// campaign tuple (utm_*/referrer host) and an anonymous RANDOM visitor id used
// purely to de-duplicate unique counts. No cookies that identify a person, no
// email, no name, no IP, no fingerprinting, no account link. Events are folded
// into daily aggregate counters server-side (recordSiteVisit, kind:"landing");
// the visitor id is only ever stored as an opaque key and is never returned to
// any browser. Attribution from the landing page to a completed signup is kept
// in localStorage (campaign + timestamp) so we never store who the user is.

const BEACON_URL = "https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit";
const ATTRIBUTION_KEY = "nv_co_lp_src";
const ATTRIBUTION_TTL_MS = 24 * 60 * 60 * 1000; // attribution window: 24h
const VISITOR_KEY = "nv_co_vid";                 // anonymous random visitor id (dedup only)
const EXCLUDE_KEY = "nivadesk_ignore_analytics"; // internal/admin opt-out flag
const CTA_TS_KEY = "nv_co_cta_ts";               // last CTA click time (for CTA→signup)
const CTA_DRIVEN_WINDOW_MS = 30 * 60 * 1000;     // "immediately after a CTA click"

export type LandingEvent =
  | "custom_order_landing_view"
  | "custom_order_landing_cta_click"
  | "custom_order_landing_how_it_works_click"
  | "custom_order_landing_signup_visit"
  | "custom_order_landing_signup_completed";

export type LandingCampaign = {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
  referrerHost: string;
};

// Only report from the live site so local/dev/preview traffic never inflates stats.
function isLiveSite(): boolean {
  return typeof window !== "undefined" && window.location.hostname.endsWith("nivadesk.app");
}

function deviceClass(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  return width <= 640 ? "mobile" : width <= 1024 ? "tablet" : "desktop";
}

// Internal/admin opt-out: when set, this browser records no landing analytics.
// Toggled from the admin panel (auto-enabled for admins) or by hand for testing.
export function isAnalyticsExcluded(): boolean {
  try {
    return window.localStorage.getItem(EXCLUDE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setAnalyticsExclusion(on: boolean) {
  try {
    if (on) window.localStorage.setItem(EXCLUDE_KEY, "true");
    else window.localStorage.removeItem(EXCLUDE_KEY);
  } catch {
    // ignore
  }
}

// Opaque random visitor id, created once per browser. Not derived from anything
// about the user — it exists only so the server can count unique visitors.
function getVisitorId(): string {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY) || "";
    if (!/^[a-z0-9]{8,}$/.test(id)) {
      const raw =
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "") ||
        Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      id = raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

// Lowercase + strip to a small, non-identifying label with a clean fallback.
function cleanLabel(value: string | null | undefined, fallback: string, max = 50): string {
  const cleaned = (value || "").trim().toLowerCase().replace(/[^a-z0-9_.\-]+/g, "");
  return cleaned.slice(0, max) || fallback;
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

// Full campaign attribution from the current URL (used on the landing page).
// Unknown fields fall back to clean values: direct / none / unknown.
export function parseLandingCampaign(): LandingCampaign {
  try {
    const params = new URLSearchParams(window.location.search);
    const paidId =
      params.has("gclid") || params.has("gbraid") || params.has("wbraid") || params.has("fbclid") || params.has("msclkid");
    const source = cleanLabel(params.get("utm_source"), parseLandingSource(), 50);
    const medium = cleanLabel(params.get("utm_medium"), paidId ? "cpc" : "none", 30);
    const campaign = cleanLabel(params.get("utm_campaign"), "none", 60);
    const term = cleanLabel(params.get("utm_term"), "none", 60);
    const content = cleanLabel(params.get("utm_content"), "none", 60);
    let referrerHost = "direct";
    try {
      const ref = document.referrer || "";
      if (ref) {
        const host = new URL(ref).hostname.replace(/^www\./, "").toLowerCase();
        referrerHost = host.includes("nivadesk") ? "internal" : cleanLabel(host, "unknown", 60);
      }
    } catch {
      // keep "direct"
    }
    return { source, medium, campaign, term, content, referrerHost };
  } catch {
    return { source: "direct", medium: "none", campaign: "none", term: "none", content: "none", referrerHost: "direct" };
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

// Landing-page events read the campaign from the URL; the later /signup events
// read it back from the attribution marker stored on the CTA click.
function campaignForEvent(event: LandingEvent): LandingCampaign | null {
  if (event === "custom_order_landing_signup_visit" || event === "custom_order_landing_signup_completed") {
    return getLandingAttribution()?.campaign ?? null;
  }
  return parseLandingCampaign();
}

export function trackLandingEvent(event: LandingEvent, source?: string) {
  if (!isLiveSite()) return;
  if (isAnalyticsExcluded()) return; // admin/internal opt-out

  const campaign = campaignForEvent(event);
  const payload: Record<string, unknown> = {
    kind: "landing",
    event,
    device: deviceClass(),
    source: source || campaign?.source || "",
    vid: getVisitorId(),
  };
  if (campaign) payload.campaign = campaign;

  // CTA → signup linkage for the stricter "CTA-driven signup visits" metric.
  if (event === "custom_order_landing_cta_click") {
    try {
      window.localStorage.setItem(CTA_TS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }
  if (event === "custom_order_landing_signup_visit") {
    try {
      const ts = Number(window.localStorage.getItem(CTA_TS_KEY) || 0);
      if (ts && Date.now() - ts <= CTA_DRIVEN_WINDOW_MS) {
        payload.ctaDriven = true;
        window.localStorage.removeItem(CTA_TS_KEY); // count at most once per CTA click
      }
    } catch {
      // ignore
    }
  }

  postBeacon(payload);
}

// Attribution now carries the full campaign tuple (still no PII). Accepts either
// a campaign object or a bare source string for backward compatibility.
export function setLandingAttribution(campaign: LandingCampaign | string) {
  try {
    const tuple: LandingCampaign =
      typeof campaign === "string" ? { ...parseLandingCampaign(), source: campaign || "direct" } : campaign;
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ source: tuple.source, campaign: tuple, ts: Date.now() }));
  } catch {
    // ignore
  }
}

export function getLandingAttribution(): { source: string; campaign: LandingCampaign | null; ts: number } | null {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { source?: string; campaign?: LandingCampaign; ts?: number };
    if (!parsed || typeof parsed.ts !== "number" || Date.now() - parsed.ts > ATTRIBUTION_TTL_MS) {
      window.localStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return {
      source: String(parsed.source || parsed.campaign?.source || "direct"),
      campaign: parsed.campaign ?? null,
      ts: parsed.ts,
    };
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
