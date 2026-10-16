// Getting started, as one behaviour on every screen that shows it (16 Oct 2026).
//
// The owner's report: on Home ▸ Getting started, "Import your first order" sent
// people to Settings ▸ Integrations without a word about why, "View checklist"
// opened Profile & Security, and "Skip for now" appeared to do nothing — it
// waved off ONE step, and the server only keeps skips for the six fallback ids,
// so a skip of any step the server named ("external_order_imported", …) was
// dropped on save and the step came straight back with the next snapshot.
//
// What this module decides, and the Home card, the Settings checklist and the
// Dashboard card all read from it:
//   - every step's words, its button and the exact place that button opens;
//   - "Bring in your first order" (the server's external_order_imported) opens
//     the "Bring in your orders" sheet, and is done once the workspace has ANY
//     order — imported from a shop or added by hand;
//   - "View checklist" opens Settings ▸ Getting started, the full checklist;
//   - "Skip for now" hides the whole card for this member in this workspace,
//     through the Home layout every platform already syncs (homeLayout.hidden
//     in companies/{id}/personalInterfaceSettings/{uid}), with Undo.
//
// Pure: no Firebase here, so scripts/check-getting-started.mts can run it.
// Android (features/home/GettingStarted.kt) and Apple (GettingStarted.swift)
// carry the same tables; keep the three in step.

import { hideHomeCard, showHomeCard, type HomeLayout } from "@/lib/studioflow/homeCards";

/** Settings ▸ Getting started: the full checklist, and the way back after a skip. */
export const GETTING_STARTED_SECTION = "getting-started";
export const GETTING_STARTED_HREF = `/settings?section=${GETTING_STARTED_SECTION}`;
/** The checklist with the "Bring in your orders" sheet already open. */
export const BRING_IN_ORDERS_HREF = `${GETTING_STARTED_HREF}&sheet=orders`;
/** The step the sheet completes (the server's key). */
export const BRING_IN_ORDERS_STEP = "external_order_imported";

/** The Integrations hub, led by the shops, as the old "connect a shop" step opened it. */
const CONNECT_SHOP_HREF = "/settings?section=integrations&category=commerce&intent=connect-shop";

export type GettingStartedStep = {
  id: string;
  label: string;
  blurb: string;
  /** Where the step's button goes; "" for a step that is a statement. */
  href: string;
  /** True when the button opens the "Bring in your orders" sheet rather than a page. */
  opensBringIn: boolean;
  cta: string;
  done: boolean;
};

/** What the server sends for one step (lib/studioflow/setupChecklist.ts). */
export type ServerSetupStep = {
  key: string;
  title: string;
  detail: string;
  action: string;
  done: boolean;
  target?: { orderId?: string };
};

type StepCopy = { label?: string; blurb?: string; href: string; cta: string; opensBringIn?: boolean };

/**
 * Every step the server can name (functions/lifecycle/checklist.js: STEP_COPY,
 * PRELUDE_COPY and the "onboarding" line), by KEY rather than by action: the
 * server sends "integrations" for three different steps, and one of them —
 * importing the first order — is not something the Integrations hub explains.
 *
 * `label`/`blurb` replace the server's words only where the step changed
 * meaning; otherwise the server's (already translated) words stand.
 */
const SERVER_STEPS: Record<string, StepCopy> = {
  onboarding: { href: "", cta: "" },
  integration_connected: { href: CONNECT_SHOP_HREF, cta: "Connect shop" },
  external_order_imported: {
    label: "Bring in your first order",
    blurb: "Connect your shop, or add an order by hand.",
    href: BRING_IN_ORDERS_HREF,
    cta: "Choose how",
    opensBringIn: true,
  },
  order_created: { href: "/orders?new=1", cta: "Create order" },
  customer_created: { href: "/customers?new=1", cta: "Add customer" },
  bank_connected: { href: "/bank", cta: "Connect bank" },
  bank_match_completed: { href: "/bank", cta: "Continue" },
  inventory_item_created: { href: "/inventory?new=1", cta: "Add item" },
  inventory_consumed_by_order: { href: "/inventory", cta: "Continue" },
  grounded_ai_answer: { href: "/chatgpt", cta: "Continue" },
  ai_business_data_connected: { href: "/chatgpt", cta: "Continue" },
  // QuickBooks and Xero live under Banking & accounting, not under the shops.
  accounting_connected: { href: "/settings?section=integrations&category=banking", cta: "Connect" },
};

/** Every step key the server can send. The test holds the server's list against this. */
export const SERVER_STEP_KEYS = Object.keys(SERVER_STEPS);

/**
 * The list for a checklist call that has not answered or could not: the same six
 * for everybody, which is why it is only the fallback.
 */
export const SETUP_STEPS = [
  { id: "profile", label: "Set up business profile", blurb: "Name, currency and tax so every document reads right.", href: "/settings?section=branding", cta: "Open settings" },
  { id: "customer", label: "Add your first customer", blurb: "Orders, notes and files all hang off a customer.", href: "/customers?new=1", cta: "Add customer" },
  { id: "order", label: "Create your first order", blurb: "The record everything else in NivaDesk attaches to.", href: "/orders?new=1", cta: "Create order" },
  { id: "shop", label: "Connect your shop", blurb: "Import orders automatically from Shopify or WooCommerce.", href: CONNECT_SHOP_HREF, cta: "Connect shop" },
  { id: "inventory", label: "Add an inventory item", blurb: "Track what you own, what is reserved and what is low.", href: "/inventory?new=1", cta: "Add item" },
  { id: "bank", label: "Connect your bank", blurb: "Read-only. Spending arrives and you categorise it.", href: "/bank", cta: "Connect bank" },
] as const;

/** Where a server step's button goes on the web. */
export function serverStepHref(key: string, action: string, target?: { orderId?: string }): string {
  // A started-but-empty first order: that order, or nothing to open.
  if (action === "open_order") {
    const orderId = String(target?.orderId || "").trim();
    return orderId ? `/orders?orderId=${encodeURIComponent(orderId)}` : "";
  }
  const copy = SERVER_STEPS[key];
  if (copy) return copy.href;
  // A step this build has not met: the server's action, mapped the old way.
  return LEGACY_ACTION_HREFS[String(action || "").trim()] || "";
}

const LEGACY_ACTION_HREFS: Record<string, string> = {
  integrations: CONNECT_SHOP_HREF,
  new_order: "/orders?new=1",
  new_customer: "/customers?new=1",
  bank: "/bank",
  inventory: "/inventory",
  assistant: "/chatgpt",
};

/** A server step's words on this build: ours where the step changed meaning, the server's otherwise. */
export function serverStepLabel(key: string, action: string, title: string): string {
  const copy = SERVER_STEPS[key];
  return action !== "open_order" && copy?.label ? copy.label : title;
}

/** A server step's doneness on this build (see resolveGettingStartedSteps). */
export function serverStepDone(key: string, serverDone: boolean, hasOrder: boolean): boolean {
  return key === BRING_IN_ORDERS_STEP ? (serverDone || hasOrder) : serverDone;
}

export type FallbackFacts = {
  setupFinished: boolean;
  hasCustomer: boolean;
  hasOrder: boolean;
  hasStoreOrder: boolean;
  hasInventory: boolean;
  hasBankTransaction: boolean;
};

/**
 * The steps to draw, from the server's list when it answered and the fallback
 * otherwise. `hasOrder` is "this workspace has at least one order that is not
 * in Trash" — the same list Home reads.
 */
export function resolveGettingStartedSteps(
  serverSteps: ServerSetupStep[] | null | undefined,
  facts: FallbackFacts,
): GettingStartedStep[] {
  if (serverSteps && serverSteps.length > 0) {
    return serverSteps.map((step) => {
      const copy = SERVER_STEPS[step.key];
      const shell = step.action === "open_order";
      return {
        id: step.key,
        label: (!shell && copy?.label) || step.title,
        blurb: (!shell && copy?.blurb) || step.detail,
        href: serverStepHref(step.key, step.action, step.target),
        opensBringIn: !shell && copy?.opensBringIn === true,
        cta: shell ? "Continue" : (copy?.cta || "Continue"),
        // Bringing in the first order is done by ANY order — imported or typed
        // in — which is what the sheet offers. The server's own tick (an
        // imported order) still counts.
        done: serverStepDone(step.key, step.done, facts.hasOrder),
      };
    });
  }
  return SETUP_STEPS.map((step) => ({
    ...step,
    opensBringIn: false,
    done:
      step.id === "profile" ? facts.setupFinished :
      step.id === "customer" ? facts.hasCustomer :
      step.id === "order" ? facts.hasOrder :
      step.id === "shop" ? facts.hasStoreOrder :
      step.id === "inventory" ? facts.hasInventory :
      facts.hasBankTransaction,
  }));
}

/**
 * The one step to push somebody at next — one they can GET to. The server's
 * first line ("Tell us what you'd like help with") has nowhere to go and is
 * only chosen when it is all that is left.
 */
export function nextGettingStartedStep<T extends { done: boolean; href: string }>(steps: T[]): T | undefined {
  return steps.find((step) => !step.done && Boolean(step.href)) ?? steps.find((step) => !step.done);
}

/** "Skip for now": the card leaves this member's Home, everywhere they sign in. */
export function skipGettingStarted(layout: HomeLayout): HomeLayout {
  return hideHomeCard(layout, "gettingStarted");
}

/** Settings ▸ Getting started ▸ Show on Home: back at the end of the grid. */
export function showGettingStarted(layout: HomeLayout): HomeLayout {
  return showHomeCard(layout, "gettingStarted");
}

export function gettingStartedHidden(layout: HomeLayout): boolean {
  return layout.hidden.includes("gettingStarted") || !layout.cards.some((card) => card.id === "gettingStarted");
}

/**
 * The shops the "Bring in your orders" sheet offers, in this order — the five the
 * owner named. Square is a till, not a shop the orders come in from; Wix and
 * Squarespace post through the webhook and have their own Integrations tiles.
 */
export const BRING_IN_STORE_IDS = ["shopify", "etsy", "woocommerce", "amazon", "ebay"] as const;

/**
 * Whether a shop belongs in the sheet, from the state the Integrations hub
 * itself resolved for this workspace. "Coming soon" is never offered, and
 * neither is a state the hub could not decide ("Checking…", "Could not check").
 */
export function bringInOffers(state: string): boolean {
  return state === "available" || state === "connected" || state === "attention";
}
