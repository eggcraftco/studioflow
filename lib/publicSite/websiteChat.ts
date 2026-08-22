import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type WebsiteChatMessage = {
  id: string;
  message: string;
  fromVisitor: boolean;
  authorName: string;
  createdAtMillis: number;
};

export type WebsiteChatThread = {
  ok?: boolean;
  ticketId?: string;
  status?: string;
  messages?: WebsiteChatMessage[];
};

const STORAGE_KEY = "nivadesk-website-chat";

export type WebsiteChatSession = { ticketId: string; visitorToken: string };

// The thread lives in the visitor's own browser so they can pick the
// conversation back up; the reply also reaches them by email.
export function readWebsiteChatSession(): WebsiteChatSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WebsiteChatSession>;
    if (!parsed?.ticketId || !parsed?.visitorToken) return null;
    return { ticketId: String(parsed.ticketId), visitorToken: String(parsed.visitorToken) };
  } catch {
    return null;
  }
}

export function writeWebsiteChatSession(session: WebsiteChatSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // A visitor with storage blocked can still send: the thread just won't persist.
  }
}

function chatError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (/resource-exhausted/i.test(raw)) return "Too many messages for now. Please try again later or email contact@nivadesk.co.uk.";
  if (/invalid-argument/i.test(raw)) return "Please add your email address and a message.";
  if (/permission-denied/i.test(raw)) return "This conversation could not be opened. Start a new one below.";
  const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
  // Firebase surfaces bare status codes ("internal", "not-found" when the
  // callable is missing); a visitor should never be shown one of those.
  if (!cleaned || /^(internal|unknown|unavailable|not-found|cancelled|deadline-exceeded|failed-precondition)$/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export async function startWebsiteChat(input: {
  name: string;
  email: string;
  message: string;
  page: string;
  language: string;
  company?: string;
}): Promise<WebsiteChatSession> {
  try {
    const callable = httpsCallable<Record<string, unknown>, { ticketId?: string; visitorToken?: string }>(functions, "createWebsiteChat");
    const result = await callable({
      ...input,
      deviceInfo: typeof navigator === "undefined" ? "Web" : navigator.userAgent || "Web"
    });
    const ticketId = String(result.data?.ticketId || "");
    const visitorToken = String(result.data?.visitorToken || "");
    if (!ticketId || !visitorToken) throw new Error("Message could not be sent.");
    return { ticketId, visitorToken };
  } catch (error) {
    throw new Error(chatError(error, "Message could not be sent right now. Please try again, or email contact@nivadesk.co.uk."));
  }
}

export async function sendWebsiteChatMessage(session: WebsiteChatSession, message: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, { ok?: boolean }>(functions, "postWebsiteChatMessage");
    await callable({ ...session, message });
  } catch (error) {
    throw new Error(chatError(error, "Message could not be sent right now. Please try again, or email contact@nivadesk.co.uk."));
  }
}

export async function loadWebsiteChatThread(session: WebsiteChatSession): Promise<WebsiteChatThread> {
  const callable = httpsCallable<Record<string, unknown>, WebsiteChatThread>(functions, "getWebsiteChatThread");
  const result = await callable({ ...session });
  return result.data || {};
}
