import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { serverStepHref } from "@/lib/studioflow/gettingStarted";

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
  /** Where an `open_order` step points: the order the person started and left
   *  (functions/lifecycle/substantiveOrder.js decides which). Absent otherwise. */
  target?: { orderId?: string; transactionId?: string };
  /** What has to come first, when the server looked (GN-05); see gettingStarted.ts. */
  need?: string;
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
  // Opens the create form on arrival (review N08): the step says "add", so the
  // page should not open on an empty list and wait for a second press.
  new_order: "/orders?new=1",
  new_customer: "/customers?new=1",
  // GN-05: the transactions with the newest unmatched one open, the orders
  // (stock is used from an order's Materials card), and the in-app help
  // assistant — /chatgpt was the public ChatGPT marketing page.
  bank: "/bank?tab=transactions&match=next",
  inventory: "/orders",
  assistant: "/home?help=open",
  setup: "/home?setup=continue",
  // The way back to a started-but-empty first order. The orders page reads
  // `orderId` from the query and opens that order; without an id there is
  // nothing to open, so the step stays a statement rather than a dead button.
  open_order: "/orders",
};

export function setupStepHref(action: string, target?: { orderId?: string; transactionId?: string }, stepKey?: string, need?: string) {
  // By the step's own key when the caller has it (16 Oct 2026): the server says
  // "integrations" for importing the first order too, and that step now opens
  // the "Bring in your orders" sheet rather than the Integrations hub.
  if (stepKey) return serverStepHref(stepKey, action, target, need);
  const key = String(action || "").trim();
  if (key === "open_order") {
    const orderId = String(target?.orderId || "").trim();
    return orderId ? `/orders?orderId=${encodeURIComponent(orderId)}` : "";
  }
  return SETUP_STEP_HREFS[key] || "";
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
        const mapped: SetupChecklistStep = {
          key,
          title,
          detail: String(step?.detail ?? ""),
          action: String(step?.action ?? ""),
          done: step?.done === true,
        };
        // The id of the order a shell step points back at, when the server sent one.
        const orderId = String(step?.target?.orderId ?? "").trim();
        const transactionId = String(step?.target?.transactionId ?? "").trim();
        if (orderId || transactionId) {
          mapped.target = {};
          if (orderId) mapped.target.orderId = orderId;
          if (transactionId) mapped.target.transactionId = transactionId;
        }
        // GN-05: what has to come first. Only a plain word; anything else is dropped.
        const need = String(step?.need ?? "").trim();
        if (/^[a-z_]{1,40}$/.test(need)) mapped.need = need;
        return mapped;
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
