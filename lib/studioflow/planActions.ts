import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

type PlanActionResult = {
  ok?: boolean;
  allowed?: boolean;
  message?: string;
  reason?: string;
  requiredPlan?: string;
  [key: string]: unknown;
};

function callableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Plan check failed. Please try again.";
}

function planGuardMessage(result: PlanActionResult) {
  if (result.message) return result.message;
  switch (result.reason) {
    case "feature_not_in_plan":
      return "Client Files upload is available on Pro Monthly and Team Monthly plans.";
    case "storage_limit_reached":
      return "This upload would exceed the workspace storage limit.";
    case "plan_limit_reached":
      return "This action is blocked by the current plan limit.";
    case "unknown_action":
      return "This plan action is not recognised.";
    default:
      return "This upload is not allowed for the current workspace plan.";
  }
}

export type IntegrationDeliveryLogEntry = {
  atMs: number;
  ok: boolean;
  test: boolean;
  error: string;
  orderId: string;
  source: string;
};

export type IntegrationWebhookInfo = {
  deliveryUrl: string;
  tokenCreatedAtMs: number;
  lastDeliveryAtMs: number;
  lastDeliveryOk: boolean;
  lastDeliveryWasTest: boolean;
  lastDeliveryError: string;
  /** Short delivery log, newest first, capped at nine on the server. */
  recentDeliveries: IntegrationDeliveryLogEntry[];
};

type IntegrationWebhookResponse = {
  ok?: boolean;
  deliveryUrl?: string;
  tokenCreatedAtMs?: number;
  lastDeliveryAtMs?: number;
  lastDeliveryOk?: boolean;
  lastDeliveryWasTest?: boolean;
  lastDeliveryError?: string;
  recentDeliveries?: IntegrationDeliveryLogEntry[];
};

function integrationWebhookInfo(data: IntegrationWebhookResponse | undefined): IntegrationWebhookInfo {
  return {
    deliveryUrl: data?.deliveryUrl || "",
    tokenCreatedAtMs: Number(data?.tokenCreatedAtMs || 0),
    lastDeliveryAtMs: Number(data?.lastDeliveryAtMs || 0),
    lastDeliveryOk: data?.lastDeliveryOk === true,
    lastDeliveryWasTest: data?.lastDeliveryWasTest === true,
    lastDeliveryError: String(data?.lastDeliveryError || ""),
    recentDeliveries: Array.isArray(data?.recentDeliveries)
      ? data.recentDeliveries.map(entry => ({
          atMs: Number(entry?.atMs || 0),
          ok: entry?.ok === true,
          test: entry?.test === true,
          error: String(entry?.error || ""),
          orderId: String(entry?.orderId || ""),
          source: String(entry?.source || "")
        }))
      : []
  };
}

async function integrationWebhookCall(name: string, companyId: string): Promise<IntegrationWebhookInfo> {
  const callable = httpsCallable<{ companyId: string }, IntegrationWebhookResponse>(functions, name);
  const response = await callable({ companyId });
  return integrationWebhookInfo(response.data);
}

export type InboundWebhookTestResult = {
  ok?: boolean;
  status?: number;
  orderCreated?: boolean;
  warnings?: string[];
  message?: string;
};

export type InboundPayloadCheck = {
  ok?: boolean;
  parseError?: string;
  warnings?: string[];
  reads?: {
    orderNumber: string;
    customerName: string;
    designName: string;
    total: number;
    deliveryCost: number;
    taxAmount: number;
    lineItemCount: number;
  } | null;
};

// Presses the workspace's own delivery URL. Proves the endpoint, the companyId
// and the token — not that the URL was pasted into Zapier correctly.
export async function sendTestInboundWebhook(companyId: string): Promise<InboundWebhookTestResult> {
  const callable = httpsCallable<{ companyId: string }, InboundWebhookTestResult>(functions, "sendTestInboundWebhook");
  const response = await callable({ companyId });
  return response.data ?? {};
}

// The same round-trip test for the shop webhooks: the handler answers test:true
// and creates nothing.
export async function sendTestIntegrationWebhook(
  companyId: string,
  kind: "woocommerce" | "shopify"
): Promise<InboundWebhookTestResult> {
  const callable = httpsCallable<{ companyId: string; kind: string }, InboundWebhookTestResult>(
    functions,
    "sendTestIntegrationWebhook"
  );
  const response = await callable({ companyId, kind });
  return response.data ?? {};
}

// Runs the real mapper over a pasted payload without sending or writing anything.
export async function validateInboundOrderPayload(companyId: string, payload: string): Promise<InboundPayloadCheck> {
  const callable = httpsCallable<{ companyId: string; payload: string }, InboundPayloadCheck>(
    functions,
    "validateInboundOrderPayload"
  );
  const response = await callable({ companyId, payload });
  return response.data ?? {};
}

export const INTEGRATION_WEBHOOK_CALLABLES = {
  woocommerce: "getWooCommerceWebhookToken",
  shopify: "getShopifyWebhookToken",
  inbound: "getInboundWebhookToken"
} as const;

export type IntegrationWebhookKind = keyof typeof INTEGRATION_WEBHOOK_CALLABLES;

export async function getIntegrationWebhookInfo(
  kind: IntegrationWebhookKind,
  companyId: string
): Promise<IntegrationWebhookInfo> {
  return integrationWebhookCall(INTEGRATION_WEBHOOK_CALLABLES[kind], companyId);
}

// Replaces the token. The previous delivery URL stops working immediately —
// that is the whole point of having a rotate button.
export async function rotateIntegrationWebhookToken(
  kind: IntegrationWebhookKind,
  companyId: string
): Promise<IntegrationWebhookInfo> {
  const callable = httpsCallable<{ companyId: string; integration: string }, IntegrationWebhookResponse>(
    functions,
    "rotateIntegrationWebhookToken"
  );
  const response = await callable({ companyId, integration: kind });
  return integrationWebhookInfo(response.data);
}

export async function getWooCommerceWebhookDeliveryUrl(companyId: string): Promise<string> {
  const callable = httpsCallable<{ companyId: string }, { ok: boolean; deliveryUrl?: string }>(
    functions,
    "getWooCommerceWebhookToken"
  );
  const response = await callable({ companyId });
  return response.data?.deliveryUrl || "";
}

export async function getShopifyWebhookDeliveryUrl(companyId: string): Promise<string> {
  const callable = httpsCallable<{ companyId: string }, { ok: boolean; deliveryUrl?: string }>(
    functions,
    "getShopifyWebhookToken"
  );
  const response = await callable({ companyId });
  return response.data?.deliveryUrl || "";
}

export async function getInboundWebhookDeliveryUrl(companyId: string): Promise<string> {
  const callable = httpsCallable<{ companyId: string }, { ok: boolean; deliveryUrl?: string }>(
    functions,
    "getInboundWebhookToken"
  );
  const response = await callable({ companyId });
  return response.data?.deliveryUrl || "";
}

export async function validateWorkspacePlanAction(
  companyId: string,
  action: string,
  payload: Record<string, unknown> = {}
) {
  try {
    const callable = httpsCallable<Record<string, unknown>, PlanActionResult>(functions, "validateWorkspacePlanAction");
    const response = await callable({ companyId, action, ...payload });
    if (response.data?.ok === false) {
      throw new Error(response.data.message || "Plan action was not allowed.");
    }
    return response.data;
  } catch (error) {
    throw new Error(callableError(error));
  }
}

export async function requireWorkspacePlanAction(
  companyId: string,
  action: string,
  payload: Record<string, unknown> = {}
) {
  const result = await validateWorkspacePlanAction(companyId, action, payload);
  if (!result.allowed) {
    throw new Error(planGuardMessage(result));
  }
  return result;
}
