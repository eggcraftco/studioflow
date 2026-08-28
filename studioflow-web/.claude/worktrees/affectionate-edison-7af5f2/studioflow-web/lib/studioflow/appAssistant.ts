import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type AppAssistantAnswer = {
  ok?: boolean;
  answer?: string;
  needsChatGPT?: boolean;
  needsSupport?: boolean;
  sources?: { id: string; path: string }[];
};

export type AppAssistantAvailability = {
  available?: boolean;
  reason?: string;
};

export async function getAppAssistantAvailability(): Promise<AppAssistantAvailability> {
  try {
    const callable = httpsCallable<Record<string, unknown>, AppAssistantAvailability>(functions, "getAppAssistantAvailability");
    const result = await callable({});
    return result.data || {};
  } catch {
    // Never block the app on the helper: if we cannot ask, we simply hide it.
    return { available: false, reason: "error" };
  }
}

export async function askAppAssistant(input: { question: string; language: string; companyId: string }) {
  try {
    const callable = httpsCallable<Record<string, unknown>, AppAssistantAnswer>(functions, "askAppAssistant");
    const result = await callable({ ...input });
    return result.data || {};
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    if (/resource-exhausted/i.test(raw)) {
      throw new Error("You have reached today's limit for the help assistant. Contact NivaDesk Support for anything urgent.");
    }
    if (/failed-precondition/i.test(raw)) {
      throw new Error("The help assistant is not available on this plan.");
    }
    const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
    throw new Error(
      !cleaned || /^(internal|unknown|unavailable|not-found)$/i.test(cleaned)
        ? "The assistant could not answer just now. Please try again, or contact NivaDesk Support."
        : cleaned
    );
  }
}
