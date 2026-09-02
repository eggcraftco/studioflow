/**
 * What NivaDesk connects to, and how each one is actually reached.
 *
 * One list, three categories, and a status that is resolved from the workspace
 * rather than written here. The statuses in the design sheet are sample data;
 * a card that says "Connected" when nothing has ever arrived is worse than no
 * card at all, so every live state below comes from a real signal:
 *
 *   Shopify        an installed store from getShopifyIntegrationsForWorkspace
 *   WooCommerce    a real (non-test) delivery on the woocommerce channel
 *   Etsy/Wix/…     a real delivery on the shared inbound channel
 *   Open Banking   a bank connection document in the workspace
 *
 * `kind` is the honest part of the row:
 *   "native"   NivaDesk talks to the provider itself
 *   "webhook"  the provider can post to us, and we document how
 *   "planned"  not built. It carries no button that pretends otherwise —
 *              "Request an integration" opens a support ticket, which is a
 *              real thing that reaches a person.
 */

import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import { getEtsyConnections } from "@/lib/studioflow/etsy";
import { getWooConnections } from "@/lib/studioflow/woocommerce";
import { getSquareConnections } from "@/lib/studioflow/square";
import { getIntegrationWebhookInfo, type IntegrationWebhookInfo } from "@/lib/studioflow/planActions";

export type IntegrationCategory = "commerce" | "banking" | "automation";

export const INTEGRATION_CATEGORIES: { id: IntegrationCategory; title: string }[] = [
  { id: "commerce", title: "Commerce & orders" },
  { id: "banking", title: "Banking & accounting" },
  { id: "automation", title: "Payments, files & automation" },
];

/** Which manage screen a card opens; "" for the ones with nothing to manage. */
export type IntegrationManageTarget = "shopify" | "woocommerce" | "inbound" | "" | "etsy" | "square";

export type IntegrationProvider = {
  id: string;
  name: string;
  category: IntegrationCategory;
  kind: "native" | "webhook" | "planned";
  /** Its own brand file, when we have one we are allowed to use. */
  logo?: string;
  /** A mark for the ones we have no brand file for: initials in the tile. */
  mark?: string;
  blurb: string;
  /** What it brings in — the chips under the name. */
  capabilities: string[];
  manage: IntegrationManageTarget;
};

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: "shopify", name: "Shopify", category: "commerce", kind: "native",
    logo: "/brand/integrations/shopify.svg",
    blurb: "Install the NivaDesk app and orders arrive as they are placed.",
    capabilities: ["Orders", "Customers"], manage: "shopify",
  },
  {
    id: "woocommerce", name: "WooCommerce", category: "commerce", kind: "native",
    logo: "/brand/integrations/woocommerce.svg",
    blurb: "Approve NivaDesk at your store once; orders, customers and status changes sync on their own.",
    capabilities: ["Orders", "Customers"], manage: "woocommerce",
  },
  {
    id: "square", name: "Square", category: "commerce", kind: "native", mark: "S",
    blurb: "Connect your Square account once; POS, Online and Invoice sales, payments and refunds arrive on their own.",
    capabilities: ["Orders", "Payments", "Customers"], manage: "square",
  },
  {
    id: "etsy", name: "Etsy", category: "commerce", kind: "native", mark: "E",
    blurb: "Import orders and customers automatically.",
    capabilities: ["Orders", "Customers"], manage: "etsy",
  },
  {
    id: "wix", name: "Wix", category: "commerce", kind: "webhook", mark: "W",
    blurb: "Post orders to NivaDesk from a Wix store.",
    capabilities: ["Orders"], manage: "inbound",
  },
  {
    id: "squarespace", name: "Squarespace", category: "commerce", kind: "webhook", mark: "S",
    blurb: "Post orders to NivaDesk from a Squarespace store.",
    capabilities: ["Orders"], manage: "inbound",
  },
  {
    id: "amazon", name: "Amazon", category: "commerce", kind: "planned", mark: "A",
    blurb: "", capabilities: [], manage: "",
  },
  {
    id: "openbanking", name: "Open Banking", category: "banking", kind: "native",
    logo: "/brand/integrations/openbanking.svg",
    blurb: "Read-only bank transaction sync.",
    capabilities: ["Transactions", "Receipts"], manage: "",
  },
  {
    id: "pandle", name: "Pandle", category: "banking", kind: "planned", mark: "P",
    blurb: "", capabilities: [], manage: "",
  },
  {
    id: "quickbooks", name: "QuickBooks", category: "banking", kind: "planned", mark: "Q",
    blurb: "", capabilities: [], manage: "",
  },
  {
    id: "xero", name: "Xero", category: "banking", kind: "planned", mark: "X",
    blurb: "", capabilities: [], manage: "",
  },
  {
    id: "zapier", name: "Zapier", category: "automation", kind: "webhook", mark: "Z",
    blurb: "Send anything into NivaDesk from a Zap.",
    capabilities: ["Automation"], manage: "inbound",
  },
  {
    id: "make", name: "Make", category: "automation", kind: "webhook", mark: "M",
    blurb: "Send anything into NivaDesk from a scenario.",
    capabilities: ["Automation"], manage: "inbound",
  },
  {
    id: "stripe", name: "Stripe", category: "automation", kind: "planned", mark: "S",
    blurb: "", capabilities: [], manage: "",
  },
  {
    id: "paypal", name: "PayPal", category: "automation", kind: "planned", mark: "P",
    blurb: "", capabilities: [], manage: "",
  },
  {
    id: "googledrive", name: "Google Drive", category: "automation", kind: "planned", mark: "G",
    blurb: "", capabilities: [], manage: "",
  },
  {
    id: "dropbox", name: "Dropbox", category: "automation", kind: "planned", mark: "D",
    blurb: "", capabilities: [], manage: "",
  },
];

/**
 * What a card says about itself right now.
 *
 * "connected" is only ever earned. "webhook" means the route exists and this
 * workspace has not used it yet; "available" is the same thing for a provider
 * NivaDesk talks to directly.
 */
export type IntegrationState = "connected" | "attention" | "available" | "webhook" | "planned";

export type IntegrationLiveState = {
  state: IntegrationState;
  /** A line under the name — the store it is connected to, when we know it. */
  detail?: string;
};

/**
 * The five reads that say what is actually connected.
 *
 * They lived inside the Settings hub, which meant the onboarding wizard had no
 * way to know whether the account someone had just connected in another tab had
 * arrived — so its Connect buttons could only ever say "Connect", however many
 * times you pressed them. One loader, two callers, no second source of truth.
 *
 * Each read settles on its own: a slow or refused answer must not blank the
 * others. ChatGPT is deliberately absent — its connection lives in a top-level
 * collection the client cannot read, and a tile that guesses would be worse
 * than one that says nothing.
 */
export async function loadIntegrationSignals(companyId: string): Promise<IntegrationSignals> {
  if (!companyId) return EMPTY_INTEGRATION_SIGNALS;
  const [stores, inbound, banks, etsy, woo, square] = await Promise.allSettled([
    httpsCallable<{ companyId: string }, { stores: { shop: string; status: string }[] }>(
      functions, "getShopifyIntegrationsForWorkspace")({ companyId }),
    getIntegrationWebhookInfo("inbound", companyId),
    getDocs(collection(db, "companies", companyId, "bankConnections")),
    getEtsyConnections(companyId),
    getWooConnections(companyId),
    getSquareConnections(companyId),
  ]);
  const channel = (result: PromiseSettledResult<IntegrationWebhookInfo>) =>
    result.status === "fulfilled"
      ? {
          lastDeliveryAtMs: result.value.lastDeliveryAtMs,
          lastDeliveryOk: result.value.lastDeliveryOk,
          lastDeliveryWasTest: result.value.lastDeliveryWasTest,
        }
      : { lastDeliveryAtMs: 0, lastDeliveryOk: false, lastDeliveryWasTest: false };
  return {
    shopifyStores: stores.status === "fulfilled" ? (stores.value.data?.stores ?? []) : [],
    channels: { inbound: channel(inbound) },
    etsyShops: etsy.status === "fulfilled"
      ? (etsy.value.connections ?? []).map((row) => ({
          shop: row.shopName || row.shopId,
          status: row.status,
          needsReconnect: Boolean(row.needsReconnect),
        }))
      : [],
    bankConnections: banks.status === "fulfilled" ? banks.value.size : 0,
    wooConnections: woo.status === "fulfilled"
      ? woo.value.map((row) => ({ store: row.storeName || row.host, status: row.status, needsAttention: row.status === "needs_reconnect" || (row.status === "connected" && row.webhooksHealthy === false) }))
      : [],
    squareConnections: square.status === "fulfilled"
      ? square.value.map((row) => ({ merchant: row.merchantName || row.merchantId, status: row.status, needsAttention: row.status === "reconnect_required" || Boolean(row.lastErrorCode) }))
      : [],
  };
}

export const EMPTY_INTEGRATION_SIGNALS: IntegrationSignals = {
  shopifyStores: [], channels: {}, etsyShops: [], bankConnections: 0, wooConnections: [], squareConnections: [],
};

export type IntegrationSignals = {
  /** Installed Shopify stores that are not unlinked. */
  shopifyStores: { shop: string; status: string }[];
  /** Real deliveries per webhook channel, and whether the last one failed. */
  channels: Record<string, { lastDeliveryAtMs: number; lastDeliveryOk: boolean; lastDeliveryWasTest: boolean }>;
  /** Connected Etsy shops, and whether each still holds a working authorisation. */
  etsyShops: { shop: string; status: string; needsReconnect: boolean }[];
  bankConnections: number;
  /** Connected WooCommerce stores, and whether one needs the owner's attention. */
  wooConnections: { store: string; status: string; needsAttention: boolean }[];
  /** Connected Square merchants, and whether one needs the owner's attention. */
  squareConnections: { merchant: string; status: string; needsAttention: boolean }[];
};

export function resolveIntegrationState(
  provider: IntegrationProvider,
  signals: IntegrationSignals,
): IntegrationLiveState {
  if (provider.kind === "planned") return { state: "planned" };

  if (provider.id === "shopify") {
    const live = signals.shopifyStores.filter((store) => store.status !== "unlinked");
    if (live.length === 0) return { state: "available" };
    const paused = live.filter((store) => store.status === "paused").length;
    return {
      state: paused === live.length ? "attention" : "connected",
      detail: live.length === 1 ? live[0].shop : `${live.length} stores`,
    };
  }

  // Etsy is a native connection, not a webhook channel. Without this branch it
  // fell through to the generic case below and read the INBOUND channel — a
  // completely unrelated route — so a workspace with a live Etsy shop showed
  // "Available", and one that had never touched Etsy but had taken a single
  // inbound delivery showed Etsy as "Connected". Wrong in both directions, on
  // the card whose whole job is to say whether the shop is connected.
  if (provider.id === "etsy") {
    const live = signals.etsyShops.filter((shop) => shop.status !== "disconnected");
    if (live.length === 0) return { state: "available" };
    const broken = live.filter((shop) => shop.needsReconnect || shop.status === "error").length;
    return {
      state: broken === live.length ? "attention" : "connected",
      detail: live.length === 1 ? live[0].shop : `${live.length} shops`,
    };
  }

  if (provider.id === "woocommerce") {
    const live = (signals.wooConnections || []).filter((row) => row.status !== "disconnected");
    if (live.length === 0) return { state: "available" };
    const broken = live.filter((row) => row.needsAttention).length;
    return { state: broken === live.length ? "attention" : "connected", detail: live.length === 1 ? live[0].store : `${live.length} stores` };
  }

  if (provider.id === "square") {
    const live = (signals.squareConnections || []).filter((row) => row.status !== "disconnected");
    if (live.length === 0) return { state: "available" };
    const broken = live.filter((row) => row.needsAttention).length;
    return { state: broken === live.length ? "attention" : "connected", detail: live.length === 1 ? live[0].merchant : `${live.length} accounts` };
  }

  if (provider.id === "openbanking") {
    return signals.bankConnections > 0 ? { state: "connected" } : { state: "available" };
  }

  // Everything else arrives over a webhook channel. A test delivery proves the
  // wiring, not the connection — the card only turns green for a real order.
  const channel = signals.channels.inbound;
  if (!channel || channel.lastDeliveryAtMs <= 0 || channel.lastDeliveryWasTest) {
    return { state: provider.kind === "webhook" && provider.manage === "inbound" ? "webhook" : "available" };
  }
  return { state: channel.lastDeliveryOk ? "connected" : "attention" };
}

export const INTEGRATION_STATE_LABELS: Record<IntegrationState, string> = {
  connected: "Connected",
  attention: "Needs attention",
  available: "Available",
  webhook: "Via webhook",
  planned: "Coming soon",
};
