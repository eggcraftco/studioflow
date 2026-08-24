import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { GuideNode } from "@/lib/publicSite/guideChrome";

// The guide is a paid-plan feature, so its content is not in this bundle: it
// comes from the getUserGuide callable, which checks the caller's plan first.
// See lib/publicSite/guide.ts, which the client must never import.

export type UserGuideResult =
  | { status: "ok"; tree: GuideNode[] }
  | { status: "locked" }
  | { status: "error"; message: string };

export async function loadUserGuide(language: string): Promise<UserGuideResult> {
  try {
    const callable = httpsCallable<{ language: string }, { ok?: boolean; tree?: GuideNode[] }>(
      functions,
      "getUserGuide"
    );
    const result = await callable({ language });
    const tree = result.data?.tree;
    if (!Array.isArray(tree) || tree.length === 0) {
      return { status: "error", message: "The guide could not be loaded just now." };
    }
    return { status: "ok", tree };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    // Free plan, or signed out between render and call: both mean "show the
    // upgrade panel" rather than an error the reader can do nothing about.
    if (/failed-precondition|unauthenticated|permission-denied/i.test(raw)) {
      return { status: "locked" };
    }
    return { status: "error", message: "The guide could not be loaded just now. Please try again." };
  }
}
