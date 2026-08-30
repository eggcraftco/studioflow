import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/lib/firebase/client";
import {
  defaultHomeLayout,
  normaliseHomeLayout,
  type HomeLayout,
} from "@/lib/studioflow/homeCards";

/**
 * Where a Home layout lives, and why.
 *
 * personalInterfaceSettings is already the per-workspace, per-user document —
 * the same place language and theme live. That is exactly the scope §16 asks
 * for: one member rearranging their Home must not move anyone else's.
 *
 * Stored as a JSON string rather than a nested map. Firestore's dotted-key
 * merge semantics have bitten this codebase before, and a layout is an ordered
 * list: a merge that reorders or half-writes it is worse than one that replaces
 * it whole.
 */
function homeLayoutRef(companyId: string, userId: string) {
  return doc(db, "companies", companyId, "personalInterfaceSettings", userId);
}

const FIELD = "homeLayout";

function parseStoredLayout(value: unknown): HomeLayout {
  if (typeof value !== "string" || !value.trim()) return defaultHomeLayout();
  try {
    return normaliseHomeLayout(JSON.parse(value));
  } catch {
    // A layout we cannot read is not worth a blank Home screen.
    return defaultHomeLayout();
  }
}

export async function loadHomeLayout(companyId: string): Promise<HomeLayout> {
  const userId = auth.currentUser?.uid ?? "";
  if (!companyId || !userId) return defaultHomeLayout();
  try {
    const snapshot = await getDoc(homeLayoutRef(companyId, userId));
    return parseStoredLayout(snapshot.exists() ? snapshot.data()?.[FIELD] : undefined);
  } catch {
    return defaultHomeLayout();
  }
}

/**
 * Live layout, so a change made on another device lands here too.
 * Returns the unsubscribe.
 */
export function subscribeHomeLayout(
  companyId: string,
  onLayout: (layout: HomeLayout) => void,
): () => void {
  const userId = auth.currentUser?.uid ?? "";
  if (!companyId || !userId) {
    onLayout(defaultHomeLayout());
    return () => {};
  }
  return onSnapshot(
    homeLayoutRef(companyId, userId),
    (snapshot) => onLayout(parseStoredLayout(snapshot.exists() ? snapshot.data()?.[FIELD] : undefined)),
    () => onLayout(defaultHomeLayout()),
  );
}

/**
 * Saved through the callable, not written straight to Firestore.
 *
 * personalInterfaceSettings is read-your-own but write-denied to clients on
 * purpose — the rule routes writes through savePersonalInterfaceSettings so the
 * server checks membership and validates the payload. Writing directly looks
 * like it works, because the SDK applies it locally first, and then the next
 * snapshot quietly replaces it with the server's unchanged copy. That is
 * exactly how this landed the first time: cards resized, then sprang back.
 */
export async function saveHomeLayout(companyId: string, layout: HomeLayout): Promise<void> {
  const userId = auth.currentUser?.uid ?? "";
  if (!companyId || !userId) return;
  const callable = httpsCallable(functions, "savePersonalInterfaceSettings");
  await callable({ settings: { homeLayout: JSON.stringify(layout) } });
}

/**
 * Which Getting started steps this member has waved off.
 *
 * Same document as the layout, and for the same reason: a workshop with no
 * online shop should be able to stop being asked to connect one, without
 * removing the step from a colleague's card. Server-validated like everything
 * else in this document — a direct write applies locally and is then quietly
 * replaced by the server's unchanged copy.
 */
const SKIPPED_FIELD = "setupSkipped";

function parseSkipped(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function subscribeSetupSkipped(
  companyId: string,
  onSkipped: (skipped: string[]) => void,
): () => void {
  const userId = auth.currentUser?.uid ?? "";
  if (!companyId || !userId) {
    onSkipped([]);
    return () => {};
  }
  return onSnapshot(
    homeLayoutRef(companyId, userId),
    (snapshot) => onSkipped(parseSkipped(snapshot.exists() ? snapshot.data()?.[SKIPPED_FIELD] : undefined)),
    () => onSkipped([]),
  );
}

export async function saveSetupSkipped(companyId: string, skipped: string[]): Promise<void> {
  const userId = auth.currentUser?.uid ?? "";
  if (!companyId || !userId) return;
  const callable = httpsCallable(functions, "savePersonalInterfaceSettings");
  await callable({ settings: { setupSkipped: skipped } });
}
