import type { OnboardingAnswers } from "@/lib/studioflow/onboardingWizard";

// Where the setup wizard was when the tab closed.
//
// The wizard held its step in useState and nothing else, so closing the tab
// threw away every answer and every step. Somebody who got three questions in
// and had to go and serve a customer came back to question one — and, because
// nothing was written anywhere, they were indistinguishable from somebody who
// had never opened the app at all.
//
// Deliberately localStorage and nothing else:
//
//   * It is a DRAFT, not an answer. Nothing here has been agreed to; the
//     workspace's real settings are written once, on Finish, by
//     saveOnboardingAnswers. A half-finished draft is not a fact about the
//     workspace and does not belong on it.
//   * No backend field, no new document, no Firestore write per keystroke.
//   * Nothing new is collected: these are the same answers the person is
//     looking at on their own screen, kept on their own device, and removed the
//     moment setup is over.
//
// Scoped per workspace AND per user, because one browser signs in to more than
// one of each: switching account or workspace must never resume somebody else's
// half-finished wizard.
//
// Every read and write is guarded. Private browsing, cleared site data and
// storage-blocking settings all make `localStorage` throw on ACCESS, not just
// on write, so the guard is around the whole operation. With no storage at all
// the wizard behaves exactly as it did before this file existed.

const KEY_PREFIX = "nivadesk-onboarding-progress";

/** Bumped when the stored shape changes; an older record is dropped, not read. */
const VERSION = 1;

/** A draft older than this is not a resume, it is archaeology. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type OnboardingProgress = {
  /** The step KEY the wizard was on, never its index: steps get added,
   *  removed and reordered, and an index survives none of that. */
  step: string;
  answers: Partial<OnboardingAnswers>;
  savedAtMs: number;
};

type StoredProgress = OnboardingProgress & { v: number };

function storageKey(companyId: string, userId: string) {
  return `${KEY_PREFIX}:${companyId}:${userId}`;
}

/** True only when both halves of the scope are known. A draft keyed on a blank
 *  workspace or a blank user is a draft that could be read by the wrong one. */
function scoped(companyId: string, userId: string) {
  return Boolean(String(companyId || "").trim() && String(userId || "").trim());
}

export function readOnboardingProgress(
  companyId: string,
  userId: string,
): OnboardingProgress | null {
  if (typeof window === "undefined") return null;
  if (!scoped(companyId, userId)) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(companyId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProgress> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== VERSION) return null;
    const step = String(parsed.step ?? "").trim();
    if (!step) return null;
    const savedAtMs = Number(parsed.savedAtMs ?? 0);
    if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) return null;
    if (Date.now() - savedAtMs > MAX_AGE_MS) return null;
    const answers = parsed.answers && typeof parsed.answers === "object"
      ? (parsed.answers as Partial<OnboardingAnswers>)
      : {};
    return { step, answers, savedAtMs };
  } catch {
    // Unavailable, blocked, or something else wrote over the key. No resume.
    return null;
  }
}

export function writeOnboardingProgress(
  companyId: string,
  userId: string,
  progress: { step: string; answers: Partial<OnboardingAnswers> },
) {
  if (typeof window === "undefined") return;
  if (!scoped(companyId, userId)) return;
  if (!String(progress.step || "").trim()) return;
  try {
    const record: StoredProgress = {
      v: VERSION,
      step: progress.step,
      answers: progress.answers,
      savedAtMs: Date.now(),
    };
    window.localStorage.setItem(storageKey(companyId, userId), JSON.stringify(record));
  } catch {
    // Quota, private mode, storage off. The wizard keeps working; it just will
    // not survive this tab.
  }
}

/**
 * Forget the draft.
 *
 * Called when setup is over, whichever way it ended — finished, skipped, or
 * re-run from a native app, which clears the workspace's completion stamp and
 * therefore means "start again" rather than "carry on where you were".
 */
export function clearOnboardingProgress(companyId: string, userId: string) {
  if (typeof window === "undefined") return;
  if (!scoped(companyId, userId)) return;
  try {
    window.localStorage.removeItem(storageKey(companyId, userId));
  } catch {
    /* nothing was stored in the first place */
  }
}

/**
 * Which step to reopen at, given the steps the wizard has TODAY.
 *
 * Two things can be wrong with a stored step and both are ordinary:
 *
 *   * The step no longer exists — it was renamed, merged or dropped since the
 *     draft was written. `indexOf` returns -1, and resuming at -1 would render
 *     nothing at all.
 *   * A step was ADDED before the stored one, so the stored step is genuinely
 *     later than anything this person has answered. Reopening there would drop
 *     somebody into a wizard that had silently skipped a question.
 *
 * So the stored step is a ceiling, never a promise: the reader never lands past
 * the first question still unanswered. With an unknown step that first
 * unanswered question IS the answer, which is a step they can act on rather
 * than a restart from the top.
 *
 * @param storedStep  the key that was saved, or "" for no draft
 * @param stepKeys    the wizard's steps, in order, as they are now
 * @param isAnswered  whether the restored answers satisfy a given step
 * @returns a 1-based step number, always inside the wizard
 */
export function resumeStepNumber(
  storedStep: string,
  stepKeys: readonly string[],
  isAnswered: (key: string) => boolean,
): number {
  if (stepKeys.length === 0) return 1;
  const storedIndex = stepKeys.indexOf(String(storedStep || "").trim());
  const firstUnanswered = stepKeys.findIndex((key) => !isAnswered(key));
  let index: number;
  if (storedIndex < 0 && firstUnanswered < 0) index = stepKeys.length - 1;
  else if (storedIndex < 0) index = firstUnanswered;
  else if (firstUnanswered < 0) index = storedIndex;
  else index = Math.min(storedIndex, firstUnanswered);
  return Math.min(stepKeys.length, Math.max(1, index + 1));
}
