"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BEACON_URL = "https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit";
const SESSION_FLAG = "nv_visit_session";

// Anonymous aggregate page-view beacon for the public marketing site.
// Sends no cookies, no identifiers — only path, device class, UI language and
// (once per session) the referrer host. Skipped entirely outside production.
export function SiteVisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hostname.endsWith("nivadesk.app")) return;

    let newSession = false;
    try {
      if (!window.sessionStorage.getItem(SESSION_FLAG)) {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
        newSession = true;
      }
    } catch {
      // sessionStorage unavailable — count as page view only.
    }

    const width = window.innerWidth;
    const payload = JSON.stringify({
      path: pathname || "/",
      device: width <= 640 ? "mobile" : width <= 1024 ? "tablet" : "desktop",
      language: (navigator.language || "").slice(0, 8),
      newSession,
      referrer: newSession ? document.referrer || "" : ""
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON_URL, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(BEACON_URL, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    } catch {
      // Stats are best-effort; never break the page.
    }
  }, [pathname]);

  return null;
}
