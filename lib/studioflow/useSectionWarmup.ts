"use client";

// Wires lib/studioflow/sectionWarmup.ts to the app shell (8 Nov 2026, first click on Sales / Inventory / Messages /
// AI Replies). Three moments, each throttled by the module to once per section and WARM_INTERVAL_MS:
//   1. the shell has settled — SETTLE_MS after the menu is known, then the browser's next idle moment, so the screen
//      on view sends its own opening calls first;
//   2. the tab is shown again (an instance started an hour ago is gone by now);
//   3. the pointer or the keyboard focus enters the sidebar — the moment just before a click.
import { useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { createSectionWarmup } from "@/lib/studioflow/sectionWarmup";

const SETTLE_MS = 1500;
const IDLE_TIMEOUT_MS = 3000;
/** The sidebar's nav (components/AppShell.tsx). Matched by id on each event, so a redrawn sidebar keeps working. */
const SIDEBAR_SELECTOR = "#app-sidebar-nav";

type SaveDataNavigator = Navigator & { connection?: { saveData?: boolean } };

let shared: ReturnType<typeof createSectionWarmup> | null = null;
function sectionWarmup() {
  if (!shared) {
    shared = createSectionWarmup({
      call: (name, payload) => httpsCallable(functions, name)(payload),
      now: () => Date.now(),
      read: (key) => window.localStorage.getItem(key),
      write: (key, value) => window.localStorage.setItem(key, value),
      canRun: () =>
        document.visibilityState === "visible" &&
        navigator.onLine !== false &&
        (navigator as SaveDataNavigator).connection?.saveData !== true
    });
  }
  return shared;
}

/**
 * @param companyId the workspace on screen ("" while it loads: nothing is sent)
 * @param menuHrefs the hrefs the sidebar draws for this person, space-separated (only those sections are warmed)
 * @param pathname  the path on screen (its own section is not called again)
 */
export function useSectionWarmup(companyId: string, menuHrefs: string, pathname: string | null) {
  const current = useRef(pathname ?? "");
  current.current = pathname ?? "";

  useEffect(() => {
    if (!companyId || !menuHrefs || typeof window === "undefined") return;
    const hrefs = menuHrefs.split(" ").filter(Boolean);
    const run = () => {
      sectionWarmup().warm(companyId, hrefs, current.current);
    };

    type IdleWindow = Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const idleWindow = window as IdleWindow;
    let idleHandle = 0;
    const settle = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      else run();
    }, SETTLE_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    const onSidebar = (event: Event) => {
      const target = event.target as Element | null;
      if (target && typeof target.closest === "function" && target.closest(SIDEBAR_SELECTOR)) run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerover", onSidebar, { passive: true });
    document.addEventListener("focusin", onSidebar);
    return () => {
      window.clearTimeout(settle);
      if (idleHandle && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleHandle);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerover", onSidebar);
      document.removeEventListener("focusin", onSidebar);
    };
  }, [companyId, menuHrefs]);
}
