import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

// The steps between signing up and NivaDesk being useful, for THIS workspace.
//
// The server builds the list (functions/lifecycle/checklist.js) from the goal
// the workspace chose during setup and from the same requirements table
// activation is measured against, so the list and the measurement cannot drift
// apart — and a jeweller doing bespoke commissions is not told to connect the
// online shop they do not have.
//
// One module rather than a copy per screen: the Dashboard card and the Home
// card were about to hold two copies of the same action→route map, which is
// how a step goes dead on one screen and not the other.

export type SetupChecklistStep = {
  /** The server's own name for the step ("order_created", not "order"). */
  key: string;
  title: string;
  detail: string;
  /** What the step opens, in the server's words ("bank", "inventory", …).
   *  Empty means the step is a statement rather than somewhere to go. */
  action: string;
  done: boolean;
};

export type SetupChecklist = {
  path: string;
  /** The workspace has been served — §115's "and then it finishes". */
  complete: boolean;
  steps: SetupChecklistStep[];
  headline: string;
};

/**
 * Where a server-named step sends somebody on the web.
 *
 * The server names the ACTION rather than a screen, because the four clients do
 * not share one. These are the web routes; Android's `setupStepDestination`
 * maps the same six actions onto its own sections.
 *
 * An action with no route here resolves to "" and the step stays a statement —
 * it never becomes a button that goes nowhere.
 */
export const SETUP_STEP_HREFS: Record<string, string> = {
  integrations: "/settings?section=integrations&category=commerce&intent=connect-shop",
  new_order: "/orders",
  new_customer: "/customers",
  bank: "/bank",
  inventory: "/inventory",
  assistant: "/chatgpt",
};

export function setupStepHref(action: string) {
  return SETUP_STEP_HREFS[String(action || "").trim()] || "";
}

/**
 * The one step to push somebody at next.
 *
 * It has to be one they can GET to. The server's own first line ("Tell us what
 * you'd like help with") is a statement with no action, and it is not-done for
 * every workspace that has not finished the wizard — which is precisely the
 * population a setup checklist exists for. Picking `first not done` therefore
 * handed those workspaces a step with no destination, and on a 1x1 card that
 * step IS the card. So a step with somewhere to go wins; a destination-less one
 * is only chosen when it is all that is left. Mirrors Android.
 */
export function nextSetupStep<T extends { done: boolean; href: string }>(steps: T[]) {
  return steps.find((step) => !step.done && Boolean(step.href))
    ?? steps.find((step) => !step.done);
}

type SetupChecklistResponse = {
  ok?: boolean;
  path?: string;
  complete?: boolean;
  steps?: Partial<SetupChecklistStep>[];
  doneCount?: number;
  headline?: string;
};

/**
 * This workspace's checklist, or null.
 *
 * `companyId` is passed on purpose. Without it the server falls back to the
 * caller's "active" workspace, which for anybody who belongs to more than one
 * is not necessarily the workspace on screen — the card would then report
 * somebody else's progress. Every other callable in this client passes it.
 *
 * Null on any failure, and null for an answer with no steps in it: a checklist
 * with nothing on it is not an answer, and the caller's own fallback list is
 * better than an empty card. The caller decides what to draw; nobody opening
 * Home should be shown an error about a checklist.
 */
export async function loadSetupChecklist(companyId: string): Promise<SetupChecklist | null> {
  const id = String(companyId || "").trim();
  if (!id) return null;
  try {
    const callable = httpsCallable<Record<string, unknown>, SetupChecklistResponse>(
      functions,
      "getSetupChecklist",
    );
    const result = await callable({ companyId: id });
    const raw = result.data;
    if (!raw || typeof raw !== "object") return null;
    const steps = (Array.isArray(raw.steps) ? raw.steps : [])
      .map((step) => {
        const title = String(step?.title ?? "").trim();
        // A step with no words is not a step somebody can follow.
        if (!title) return null;
        const key = String(step?.key ?? "").trim() || title;
        return {
          key,
          title,
          detail: String(step?.detail ?? ""),
          action: String(step?.action ?? ""),
          done: step?.done === true,
        } satisfies SetupChecklistStep;
      })
      .filter((step): step is SetupChecklistStep => step !== null);
    if (steps.length === 0) return null;
    return {
      path: String(raw.path ?? ""),
      complete: raw.complete === true,
      steps,
      headline: String(raw.headline ?? ""),
    };
  } catch {
    return null;
  }
}
