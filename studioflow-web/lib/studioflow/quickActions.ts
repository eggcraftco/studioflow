"use client";

import { useEffect } from "react";

/**
 * Wiring for Home's quick actions.
 *
 * A quick action either belongs to the screen the user is already on, or it
 * lives on another one. Those are different problems and get different answers.
 *
 * Same screen — "New order" is the toolbar's own action and AppShell owns it —
 * so Home raises an event and AppShell does the work. Nothing navigates, which
 * is what §6 asks for: the action opens where you are.
 *
 * Another screen — a note, a customer, a file — needs the target page to open
 * its create form as it mounts. That travels as a query parameter, read once
 * and then stripped from the URL, the same way a scanned inventory label is
 * handled. Stripping matters: a reload should not reopen a form the user has
 * already dismissed, and the parameter must not survive into a shared link.
 */

export const QUICK_ACTION_EVENT = "nivadesk:quick-action";

export type QuickActionEvent = "order";

/**
 * What the raiser wants the opened form to start with. The Schedule board asks
 * for a project due in a fortnight, so its button carries that date rather
 * than keeping its own copy of the create call.
 */
export type QuickActionPayload = {
  /** yyyy-MM-dd, prefilled into the Quick Create due date. */
  deliveryDueDate?: string;
  /** Which surface asked. The Schedule board stays where it is after a create;
   *  everywhere else follows the new project to Orders. */
  origin?: "toolbar" | "home" | "orders" | "schedule";
};

export function dispatchQuickAction(action: QuickActionEvent, payload: QuickActionPayload = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail: { action, payload } }));
}

export function useQuickActionEvent(
  action: QuickActionEvent,
  handler: (payload: QuickActionPayload) => void
) {
  useEffect(() => {
    function onAction(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;
      // A bare string is the older shape; both are read so a raiser that has
      // not been updated still opens the same form.
      if (typeof detail === "string") {
        if (detail === action) handler({});
        return;
      }
      const parsed = detail as { action?: string; payload?: QuickActionPayload } | null;
      if (parsed?.action !== action) return;
      handler(parsed.payload ?? {});
    }
    window.addEventListener(QUICK_ACTION_EVENT, onAction);
    return () => window.removeEventListener(QUICK_ACTION_EVENT, onAction);
  }, [action, handler]);
}

/**
 * Runs `handler` once when the page is opened with `?<param>=1`, then removes
 * the parameter. `ready` holds it back until the page can actually act — firing
 * before the workspace has loaded would open a form with nothing behind it.
 */
export function useQuickActionParam(param: string, ready: boolean, handler: () => void) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(param) !== "1") return;
    const url = new URL(window.location.href);
    url.searchParams.delete(param);
    window.history.replaceState({}, "", url.pathname + url.search);
    handler();
    // Deliberately keyed on readiness alone: this fires once per arrival, and
    // re-running it because a callback identity changed would reopen the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, ready]);
}
