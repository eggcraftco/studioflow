export type FirstProjectGuideStep = 1 | 2 | 3 | 4 | 5 | 6;

export type FirstProjectGuideState = {
  step: FirstProjectGuideStep;
  orderId?: string;
  completed?: boolean;
};

export const FIRST_PROJECT_GUIDE_EVENT = "studioflow-web-first-project-guide-updated";

const ACTIVE_KEY = "studioflow-web-first-project-guide-active-key";
const PREFIX = "studioflow-web-first-project-guide-v1:";

function currentStorageKey() {
  if (typeof window === "undefined") return "";
  try {
    const activeKey = window.localStorage.getItem(ACTIVE_KEY);
    if (activeKey?.startsWith(PREFIX)) return activeKey;
    return Object.keys(window.localStorage).find(k => k.startsWith(PREFIX)) ?? "";
  } catch {
    return "";
  }
}

export function readCurrentFirstProjectGuideState(): FirstProjectGuideState | null {
  if (typeof window === "undefined") return null;
  try {
    const key = currentStorageKey();
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as FirstProjectGuideState;
  } catch {
    return null;
  }
}

export function broadcastFirstProjectGuideState(next: FirstProjectGuideState) {
  if (typeof window === "undefined") return;
  try {
    const key = currentStorageKey();
    if (key) window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(FIRST_PROJECT_GUIDE_EVENT, { detail: next }));
}
