export const FIRST_PROJECT_GUIDE_EVENT =
  "studioflow:first-project-guide-updated";

export type FirstProjectGuideState = {
  step: number;
  orderId?: string;
  workspaceId?: string;
  userId?: string;
  completed?: boolean;
  [key: string]: unknown;
};

const PRIMARY_KEY = "studioflowFirstProjectGuideV1";
const FALLBACK_KEYS = [
  PRIMARY_KEY,
  "studioflow:firstProjectGuide",
  "studioflow:first-project-guide",
  "firstProjectGuideV1",
  "studioflowWebFirstProjectGuideV1",
];

function parseGuideState(raw: string | null): FirstProjectGuideState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FirstProjectGuideState> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.step !== "number") return null;
    return {
      ...parsed,
      step: parsed.step,
      orderId: typeof parsed.orderId === "string" ? parsed.orderId : undefined,
      workspaceId:
        typeof parsed.workspaceId === "string" ? parsed.workspaceId : undefined,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      completed: Boolean(parsed.completed),
    };
  } catch {
    return null;
  }
}

const SIGNUP_PLATFORM_KEY = "studioflowSignupPlatformV1";

// Cached per device after AppShell reads users/{uid}.signupPlatform from
// Firestore. Kept for callers and diagnostics; eligibility no longer depends on
// it — see isFirstProjectGuideDeviceEligible below.
export function rememberSignupPlatformForGuide(platform: string) {
  if (typeof window === "undefined") return;
  const cleaned = platform.trim().toLowerCase();
  if (cleaned) window.localStorage.setItem(SIGNUP_PLATFORM_KEY, cleaned);
  else window.localStorage.removeItem(SIGNUP_PLATFORM_KEY);
}

// The first-project info-card tour points at desktop toolbar controls, so it is
// gated on the device in front of the user right now: never on a phone, and never
// in a window too narrow to place the callouts.
//
// It used to also refuse whenever the account's stored signupPlatform was
// "mobile". That brand is permanent, and it was set from the signup window width,
// so anyone who registered in a half-width desktop window could never see the
// guide again on any device. The live checks below already express the real
// requirement precisely, so the stale brand only produced false negatives.
export function isFirstProjectGuideDeviceEligible(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  if (/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return false;
  return window.innerWidth >= 768;
}

export function getFirstProjectGuideState(): FirstProjectGuideState | null {
  if (typeof window === "undefined") return null;
  if (!isFirstProjectGuideDeviceEligible()) return null;

  for (const key of FALLBACK_KEYS) {
    const parsed = parseGuideState(window.localStorage.getItem(key));
    if (parsed) return parsed;
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const lowerKey = key.toLowerCase();
    if (!lowerKey.includes("guide") || !lowerKey.includes("project")) continue;
    const parsed = parseGuideState(window.localStorage.getItem(key));
    if (parsed) return parsed;
  }

  return null;
}

export function setFirstProjectGuideState(next: FirstProjectGuideState) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(next);
  window.localStorage.setItem(PRIMARY_KEY, payload);
  for (const key of FALLBACK_KEYS) {
    if (key === PRIMARY_KEY) continue;
    if (window.localStorage.getItem(key))
      window.localStorage.setItem(key, payload);
  }
  window.dispatchEvent(
    new CustomEvent<FirstProjectGuideState>(FIRST_PROJECT_GUIDE_EVENT, {
      detail: next,
    }),
  );
}

export function subscribeFirstProjectGuideState(
  callback: (state: FirstProjectGuideState | null) => void,
) {
  if (typeof window === "undefined") return () => undefined;
  function handleGuideEvent(event: Event) {
    const detail = (event as CustomEvent<FirstProjectGuideState>).detail;
    callback(detail ?? getFirstProjectGuideState());
  }
  function handleStorageEvent() {
    callback(getFirstProjectGuideState());
  }
  window.addEventListener(FIRST_PROJECT_GUIDE_EVENT, handleGuideEvent);
  window.addEventListener("storage", handleStorageEvent);
  return () => {
    window.removeEventListener(FIRST_PROJECT_GUIDE_EVENT, handleGuideEvent);
    window.removeEventListener("storage", handleStorageEvent);
  };
}

export function advanceFirstProjectGuideStep(
  step: number,
  patch: Partial<FirstProjectGuideState> = {},
) {
  const current = getFirstProjectGuideState() ?? { step: 1 };
  const next: FirstProjectGuideState = {
    ...current,
    ...patch,
    step,
    completed: false,
  };
  setFirstProjectGuideState(next);
  return next;
}

export function completeFirstProjectGuide(
  patch: Partial<FirstProjectGuideState> = {},
) {
  const current = getFirstProjectGuideState() ?? { step: 1 };
  const next: FirstProjectGuideState = {
    ...current,
    ...patch,
    completed: true,
  };
  setFirstProjectGuideState(next);
  return next;
}

export const readCurrentFirstProjectGuideState = getFirstProjectGuideState;
export const updateFirstProjectGuideState = setFirstProjectGuideState;
