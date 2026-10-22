"use client";

// "A newer version of NivaDesk is ready" (GN-06). Asks the server which build
// it runs when the tab comes back into view (at most every 15 minutes) and
// once an hour while it stays open. On a newer build it offers Reload in the
// app's own toast — once per build — and NEVER reloads by itself: a forced
// reload would throw away a draft being typed or an upload in flight.

import { useEffect, useRef } from "react";
import { dispatchStudioToast } from "@/components/StudioToastHost";
import { checkWebBuild, WEB_BUILD_ID } from "@/lib/studioflow/webBuild";

const MIN_GAP_MS = 15 * 60 * 1000;
const POLL_MS = 60 * 60 * 1000;

export default function WebUpdateNotice({ t }: { t: (text: string) => string }) {
  const lastCheckRef = useRef(0);
  const announcedRef = useRef("");
  // The caller passes a new t() on every render; the timers must not restart with it.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!WEB_BUILD_ID) return;
    let cancelled = false;
    const run = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastCheckRef.current < MIN_GAP_MS) return;
      lastCheckRef.current = now;
      const result = await checkWebBuild();
      if (cancelled || result.state !== "newer" || announcedRef.current === result.serverBuild) return;
      announcedRef.current = result.serverBuild;
      dispatchStudioToast({
        message: tRef.current("A newer version of NivaDesk is ready. Save anything you have open, then reload."),
        actionLabel: tRef.current("Reload"),
        onAction: () => window.location.reload(),
        durationMs: 30000,
      });
    };
    const onVisible = () => { if (document.visibilityState === "visible") void run(); };
    // The first look waits a minute: a tab that has just loaded is current.
    const first = window.setTimeout(() => void run(true), 60 * 1000);
    const poll = window.setInterval(() => void run(true), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
