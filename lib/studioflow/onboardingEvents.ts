// Onboarding telemetry, the sending half (30 Oct 2026): a new account's setup steps,
// sections and errors, for its first 30 days, to recordOnboardingEvents.
//
// It must never cost the person anything: nothing waits on it, a failure is dropped
// rather than retried, and a server that does not know the callable (not deployed yet,
// or rolled back) switches it off for the rest of the tab. What may be sent is decided
// in onboardingEventRules.ts; what may be stored, on the server.

import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";
import { WEB_BUILD_ID } from "@/lib/studioflow/webBuild";
import { inRecordingWindow, onboardingEventKey, type OnboardingEvent, type OnboardingEventName } from "@/lib/studioflow/onboardingEventRules";

const FLUSH_AFTER_MS = 3000;
const MAX_PER_CALL = 25;

let queue: OnboardingEvent[] = [];
const sent = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let listening = false;

type RecordResult = { ok?: boolean; stop?: string };

async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (stopped || !queue.length) return;
  const batch = queue.slice(0, MAX_PER_CALL);
  queue = queue.slice(MAX_PER_CALL);
  try {
    const call = httpsCallable<{ platform: string; appVersion: string; events: OnboardingEvent[] }, RecordResult>(functions, "recordOnboardingEvents");
    const result = await call({ platform: "web", appVersion: WEB_BUILD_ID, events: batch });
    if (result.data?.stop) stopped = true;
  } catch (error) {
    const code = String((error as { code?: unknown })?.code ?? "");
    if (/not-found|unimplemented|permission-denied|unauthenticated/.test(code)) stopped = true;
  }
  if (queue.length && !stopped) void flush();
}

function listenForLeaving() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // A tab being closed is exactly the moment worth keeping, so whatever is queued goes now.
  window.addEventListener("pagehide", () => { void flush(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(); });
}

/** Note that something happened on the way in. Safe to call on every render. */
export function trackOnboarding(name: OnboardingEventName, props: Record<string, string> = {}) {
  if (stopped || typeof window === "undefined") return;
  const user = auth.currentUser;
  if (!user) return;
  const nowMs = Date.now();
  // An older account sends nothing; another account signing in on this tab may still be new.
  if (!inRecordingWindow(user.metadata.creationTime, nowMs)) return;
  const event: OnboardingEvent = { name, props };
  const key = onboardingEventKey(event, nowMs);
  if (sent.has(key)) return;
  sent.add(key);
  queue.push(event);
  listenForLeaving();
  if (!timer) timer = setTimeout(() => { void flush(); }, FLUSH_AFTER_MS);
}
