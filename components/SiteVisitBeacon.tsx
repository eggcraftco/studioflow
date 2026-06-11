"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BEACON_URL = "https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit";
const SESSION_FLAG = "nv_visit_session";
const VIEW_COUNT_KEY = "nv_visit_views";
const SESSION_ID_KEY = "nv_visit_id";
const HEARTBEAT_MS = 30000;

function sessionId(): string {
  try {
    let id = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).toLowerCase();
      window.sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function sendBeaconPayload(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    // text/plain keeps this a "simple" request (no CORS preflight), which is
    // required for sendBeacon to work in Safari. The server parses the string.
    let sent = false;
    if (navigator.sendBeacon) {
      sent = navigator.sendBeacon(BEACON_URL, new Blob([body], { type: "text/plain" }));
    }
    if (!sent) {
      void fetch(BEACON_URL, { method: "POST", body, headers: { "Content-Type": "text/plain" }, keepalive: true });
    }
  } catch {
    // Stats are best-effort; never break the page.
  }
}

function browserCountry(): string {
  try {
    const locale = new Intl.Locale(navigator.language || "");
    return (locale.region || "").toUpperCase();
  } catch {
    return "";
  }
}

// Anonymous aggregate page-view beacon for the public marketing site.
// Sends no cookies, no identifiers — only path, device class, UI language,
// browser-locale country and (once per session) the referrer host. A second
// page view marks the session "engaged" (for bounce rate), and time-on-page
// seconds are reported when the tab is hidden. Skipped outside production.
export function SiteVisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hostname.endsWith("nivadesk.app")) return;

    let newSession = false;
    let secondView = false;
    try {
      if (!window.sessionStorage.getItem(SESSION_FLAG)) {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
        newSession = true;
      }
      const views = Number(window.sessionStorage.getItem(VIEW_COUNT_KEY) || "0") + 1;
      window.sessionStorage.setItem(VIEW_COUNT_KEY, String(views));
      secondView = views === 2;
    } catch {
      // sessionStorage unavailable — count as page view only.
    }

    const width = window.innerWidth;
    sendBeaconPayload({
      path: pathname || "/",
      device: width <= 640 ? "mobile" : width <= 1024 ? "tablet" : "desktop",
      language: (navigator.language || "").slice(0, 8),
      country: newSession ? browserCountry() : "",
      newSession,
      secondView,
      sessionId: sessionId(),
      referrer: newSession ? document.referrer || "" : ""
    });
  }, [pathname]);

  // Presence heartbeat: while the tab is visible, ping every 30s so the
  // "on site now" panel stays accurate. Stops when the tab is hidden.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hostname.endsWith("nivadesk.app")) return;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      const id = sessionId();
      if (id) sendBeaconPayload({ kind: "heartbeat", sessionId: id, path: window.location.pathname });
    };

    const interval = window.setInterval(ping, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hostname.endsWith("nivadesk.app")) return;

    let shownAt = Date.now();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const seconds = Math.round((Date.now() - shownAt) / 1000);
        if (seconds >= 2) {
          sendBeaconPayload({ kind: "duration", seconds });
        }
      } else {
        shownAt = Date.now();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return null;
}
