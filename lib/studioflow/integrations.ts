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
export type IntegrationManageTarget = "shopify" | "woocommerce" | "inbound" | "" | "etsy" | "square" | "paypal" | "quickbooks" | "xero" | "chatgpt";

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
    // Listed at last. The grant lives in a collection no client may read, so
    // for months a workspace that HAD connected ChatGPT was shown nothing at
    // all — and had no way to disconnect it either.
    id: "chatgpt", name: "ChatGPT", category: "automation", kind: "native",
    logo: "/brand/integrations/chatgpt.svg",
    blurb: "Ask ChatGPT about your orders, notes and spending. Access lasts 30 days and you can withdraw it here.",
    capabilities: ["Orders", "Notes", "Banking"], manage: "chatgpt",
  },
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
    id: "quickbooks", name: "QuickBooks Online", category: "banking", kind: "native", mark: "Q",
    blurb: "Official accounting connection: reads your chart of accounts, VAT codes, customers and items, and keeps one set of books.",
    capabilities: ["Chart of accounts", "VAT codes", "Customers & suppliers", "Change tracking"], manage: "quickbooks",
  },
  {
    id: "xero", name: "Xero", category: "banking", kind: "native", mark: "X",
    blurb: "Official accounting connection: reads your organisation, chart of accounts, VAT rates, contacts and items, and keeps one set of books.",
    capabilities: ["Chart of accounts", "VAT rates", "Contacts", "Change tracking"], manage: "xero",
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
    id: "paypal", name: "PayPal", category: "banking", kind: "native", mark: "P",
    blurb: "Sales, fees and refunds from your PayPal account, beside your bank.",
    capabilities: ["Payments received and sent", "Fees beside the gross", "Withdrawals matched to your bank"], manage: "paypal",
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
  /** Connected, but its real-time half has never once fired. Not a failure —
   *  the poll covers it — but a plain green badge would say more than we know. */
  unproven?: boolean;
  /** The workspace is still holding a token for the old pasted-URL webhook.
   *  That address answers 410 now and writes nothing anywhere — it cannot say
   *  so itself without trusting an unauthenticated workspace id — so a shop
   *  still posting to it goes quiet with nothing to show for it. This is the
   *  only place that silence gets a voice. */
  legacyAddress?: boolean;
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
  const [stores, inbound, banks, etsy, woo, square, accounting, chatgpt, retired] = await Promise.allSettled([
    httpsCallable<{ companyId: string }, { stores: { shop: string; status: string }[] }>(
      functions, "getShopifyIntegrationsForWorkspace")({ companyId }),
    getIntegrationWebhookInfo("inbound", companyId),
    getDocs(collection(db, "companies", companyId, "bankConnections")),
    getEtsyConnections(companyId),
    getWooConnections(companyId),
    getSquareConnections(companyId),
    getDocs(collection(db, "companies", companyId, "accountingConnections")),
    // The ChatGPT grant lives in a top-level collection no client may read, so
    // this is the only way a workspace can be told it has one. Owner-only on
    // the server; for anybody else it settles as a rejection and the hub simply
    // shows nothing, which is what it showed before.
    httpsCallable<{ companyId: string }, { connections: ChatGPTConnection[] }>(
      functions, "listChatGPTConnections")({ companyId }),
    // Owner-only, and a rejection is fine: for anybody else the card simply
    // says what it said before.
    httpsCallable<{ companyId: string }, { holds: { kind: string }[] }>(
      functions, "listRetiredIntegrationHolds")({ companyId }),
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
    // A PayPal connection lives in the same collection but is its own card.
    bankConnections: banks.status === "fulfilled" ? banks.value.docs.filter((doc) => doc.data().provider !== "paypal").length : 0,
    paypalConnections: banks.status === "fulfilled"
      ? banks.value.docs.filter((doc) => doc.data().provider === "paypal").map((doc) => ({ status: String(doc.data().status || ""), syncState: String(doc.data().syncState || ""), environment: String(doc.data().environment || "live") }))
      : [],
    wooConnections: woo.status === "fulfilled"
      ? woo.value.map((row) => ({ store: row.storeName || row.host, status: row.status, needsAttention: row.status === "needs_reconnect" || (row.status === "connected" && row.webhooksHealthy === false) }))
      : [],
    squareConnections: square.status === "fulfilled"
      ? square.value.map((row) => ({ merchant: row.merchantName || row.merchantId, status: row.status, needsAttention: row.status === "reconnect_required" || Boolean(row.lastErrorCode) }))
      : [],
    // Accounting providers (QuickBooks Online, Xero): the owner-readable connection projection.
    accountingConnections: accounting.status === "fulfilled"
      ? accounting.value.docs.map((row) => { const d = row.data(); return { provider: String(d.provider || ""), status: String(d.status || ""), mode: String(d.mode || ""), companyName: String(d.companyName || ""), syncState: String(d.syncState || ""), environment: String(d.environment || "production"), lastWebhookAtMs: Number(d.lastWebhookAtMs) || 0, linkedAtMs: Number(d.linkedAtMs) || 0 }; })
      : [],
    chatgptConnections: chatgpt.status === "fulfilled" ? (chatgpt.value.data?.connections ?? []) : [],
    retiredHolds: retired.status === "fulfilled"
      ? (retired.value.data?.holds ?? []).map((row) => (row.kind === "shopify" ? "shopify" : row.kind))
      : [],
  };
}

export type ChatGPTConnection = {
  /** Identifies a grant so it can be withdrawn. Not the token, and useless as one. */
  tokenHash: string;
  clientId: string;
  scope: string;
  grantedByEmail: string;
  grantedByUid: string;
  createdAtMs: number;
  expiresAtMs: number;
};

/** Ends ChatGPT's access. No tokenHash means every grant this workspace has. */
export async function revokeChatGPTConnection(companyId: string, tokenHash = ""): Promise<string> {
  const call = httpsCallable<{ companyId: string; tokenHash?: string }, { message: string }>(
    functions, "revokeChatGPTConnection"
  );
  const response = await call({ companyId, ...(tokenHash ? { tokenHash } : {}) });
  return response.data.message;
}

export const EMPTY_INTEGRATION_SIGNALS: IntegrationSignals = {
  shopifyStores: [], channels: {}, etsyShops: [], bankConnections: 0, wooConnections: [], squareConnections: [], paypalConnections: [], accountingConnections: [], chatgptConnections: [], retiredHolds: [],
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
  /** PayPal money feeds (first-party credentials), and whether one needs the owner's attention. */
  paypalConnections: { status: string; syncState: string; environment: string }[];
  /** Accounting providers (QuickBooks Online, Xero), with the mode the owner chose. */
  accountingConnections: { provider: string; status: string; mode: string; companyName: string; syncState: string; environment: string; lastWebhookAtMs: number; linkedAtMs: number }[];
  /** Live ChatGPT app grants. Empty for anybody but the owner, and when there are none. */
  chatgptConnections: ChatGPTConnection[];
  /** Provider ids whose retired pasted-URL webhook token this workspace still holds. */
  retiredHolds: string[];
};

/**
 * Whatever the provider's own rule decides, a workspace still holding the
 * retired pasted-URL token needs telling — including on a card that is
 * otherwise green, because the green is about the NEW connector while the old
 * address is the one the shop may still be posting to. Wrapping the whole rule
 * rather than editing each of its dozen exits is the point: a branch added
 * later carries the notice without anyone having to remember it.
 */
export function resolveIntegrationState(
  provider: IntegrationProvider,
  signals: IntegrationSignals,
): IntegrationLiveState {
  const live = resolveProviderState(provider, signals);
  return signals.retiredHolds.includes(provider.id) ? { ...live, legacyAddress: true } : live;
}

function resolveProviderState(
  provider: IntegrationProvider,
  signals: IntegrationSignals,
): IntegrationLiveState {
  if (provider.kind === "planned") return { state: "planned" };

  if (provider.id === "shopify") {
    const live = signals.shopifyStores.filter((store) => store.status !== "unlinked");
    if (live.length === 0) return { state: "available" };
    // An uninstalled store keeps its companyId — deliberately, so a re-install
    // resumes — so the server still hands it to us here, and the reconcile
    // skips it while its token is blank. Its orders have stopped arriving. Only
    // "paused" counted as broken, so the card stayed green over a dead store
    // for as long as the doc lived: a silent outage behind a badge whose whole
    // job is to say whether orders are coming in. Pausing is somebody's own
    // decision, so it lowers the card only when every store is paused; an
    // uninstall is a break, and one of them is enough.
    const uninstalled = live.filter((store) => store.status === "uninstalled").length;
    const paused = live.filter((store) => store.status === "paused").length;
    return {
      state: uninstalled > 0 || paused === live.length ? "attention" : "connected",
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

  if (provider.id === "chatgpt") {
    // Only the owner ever gets a non-empty list, so for everybody else this
    // reads "Available" — which is honest: they cannot connect or disconnect it.
    const live = signals.chatgptConnections || [];
    if (live.length === 0) return { state: "available" };
    return {
      state: "connected",
      detail: live.length === 1 ? (live[0].grantedByEmail || "Connected") : `${live.length} connections`,
    };
  }

  if (provider.id === "paypal") {
    const live = (signals.paypalConnections || []).filter((row) => row.status === "linked");
    if (live.length === 0) return { state: "available" };
    const broken = live.filter((row) => row.syncState && row.syncState !== "ok").length;
    return { state: broken === live.length ? "attention" : "connected", detail: live[0].environment === "sandbox" ? "Sandbox" : "PayPal" };
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

  if (provider.id === "quickbooks" || provider.id === "xero") {
    const providerKey = provider.id === "xero" ? "xero" : "quickbooks_online";
    const rows = (signals.accountingConnections || []).filter((row) => row.provider === providerKey && row.status !== "disconnected" && row.status !== "none");
    if (rows.length === 0) return { state: "available" };
    const broken = rows.filter((row) => row.status === "reconnect_required" || (row.syncState && row.syncState !== "ok")).length;
    const first = rows[0];
    const mode = first.mode === "primary_write" ? "Primary" : first.mode === "migration_read" ? "Migration" : "Read-only";
    const environment = first.environment === "sandbox" ? " · Sandbox" : first.environment === "demo" ? " · Demo company" : "";
    if (broken === rows.length) {
      return { state: "attention", detail: `${first.companyName || provider.name} · ${mode}${environment}` };
    }
    // Connected, but the webhook has never fired.
    //
    // The six-hourly poll covers a missing webhook, which is the design — so
    // this is not a failure and must not read as one. But a green badge on a
    // connection whose real-time half has never once worked says more than we
    // know: the card's whole job is to tell somebody whether their data is
    // moving. A day's grace, because a fresh connection has not had a chance.
    const DAY = 24 * 60 * 60 * 1000;
    const unproven = rows.every((row) => !row.lastWebhookAtMs)
      && first.linkedAtMs > 0 && Date.now() - first.linkedAtMs > DAY;
    return {
      state: "connected",
      unproven,
      detail: `${first.companyName || provider.name} · ${mode}${environment}${unproven ? " · webhook unproven" : ""}`
    };
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
