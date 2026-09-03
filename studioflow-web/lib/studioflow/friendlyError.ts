// One place that turns a raw Firebase Auth / Cloud Functions failure into a
// sentence a person can act on. Raw codes such as "auth/invalid-credential" or
// "Firebase: Error (auth/too-many-requests)." used to reach the screen as-is.

const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "No account was found for that email.",
  "auth/invalid-email": "The email address is not valid.",
  "auth/email-already-in-use": "That email address is already in use.",
  "auth/weak-password": "Choose a stronger password (at least 8 characters).",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "Check your internet connection and try again.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/requires-recent-login": "Sign in again to make this change.",
  "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "The sign-in window was closed before finishing.",
  "auth/missing-email": "Enter your email address first."
};

const FUNCTION_MESSAGES: Record<string, string> = {
  "functions/permission-denied": "You don't have permission for this.",
  "functions/resource-exhausted": "Too many requests. Please try again in a moment.",
  "functions/unavailable": "The server is busy. Please try again.",
  "functions/deadline-exceeded": "The server is busy. Please try again.",
  "functions/unauthenticated": "Please sign in again.",
  "functions/internal": "Something went wrong. Please try again."
};

const GENERIC = "Something went wrong. Please try again.";

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code.trim().toLowerCase() : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || "";
  if (typeof error === "string") return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

/** True for the SDK's own wording ("Firebase: Error (auth/…)", "INTERNAL"), which is not for people. */
function looksRaw(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (/^firebase:/i.test(trimmed)) return true;
  if (/^internal$/i.test(trimmed)) return true;
  if (/^(auth|functions|firestore|storage)\/[a-z-]+$/i.test(trimmed)) return true;
  if (/\((auth|functions)\/[a-z-]+\)\.?$/i.test(trimmed)) return true;
  return false;
}

export function friendlyErrorMessage(error: unknown, t: (s: string) => string): string {
  const code = errorCode(error);
  const message = errorMessage(error);
  const lower = message.toLowerCase();

  if (code && AUTH_MESSAGES[code]) return t(AUTH_MESSAGES[code]);
  if (code === "functions/failed-precondition") {
    // The server's own sentence explains plan limits and prerequisites; keep it.
    return looksRaw(message) ? t(GENERIC) : t(message);
  }
  if (code && FUNCTION_MESSAGES[code]) return t(FUNCTION_MESSAGES[code]);

  // The SDK often embeds the code in the message instead: "Firebase: Error (auth/…)".
  for (const [key, text] of Object.entries(AUTH_MESSAGES)) {
    if (lower.includes(key)) return t(text);
  }
  if (lower.includes("missing or insufficient permissions") || lower.includes("permission-denied") || lower.includes("permission denied")) {
    return t("You don't have permission for this.");
  }
  if (lower.includes("failed-precondition")) {
    return looksRaw(message) ? t(GENERIC) : t(message);
  }
  for (const [key, text] of Object.entries(FUNCTION_MESSAGES)) {
    if (lower.includes(key)) return t(text);
  }
  if (lower.includes("unauthenticated")) return t("Please sign in again.");
  if (lower.includes("deadline") || lower.includes("unavailable")) return t("The server is busy. Please try again.");

  return looksRaw(message) ? t(GENERIC) : t(message);
}
