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

export function getFirstProjectGuideState(): FirstProjectGuideState | null {
  if (typeof window === "undefined") return null;

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
