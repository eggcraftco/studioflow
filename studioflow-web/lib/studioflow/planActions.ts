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

export async function getWooCommerceWebhookDeliveryUrl(companyId: string): Promise<string> {
  const callable = httpsCallable<{ companyId: string }, { ok: boolean; deliveryUrl?: string }>(
    functions,
    "getWooCommerceWebhookToken"
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
