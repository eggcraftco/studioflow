// Sign-in and navigation timings (15 Oct 2026, private-window "Login"/loading hang). Each stage leaves a mark in the
// browser's own Performance timeline ("nv:<stage>") and a row in window.__nvBoot — nothing is sent anywhere, nothing
// is stored. The console snippet in docs/web-login-hang-2026-10-15.md prints them as a table:
//   auth:*  — the Firebase session (onAuthStateChanged, the first-sign-in workspace check)
//   ws:*    — the workspace and membership read (loadWorkspaceContext)
//   page:*  — a screen waiting for its own data (LoadingScreen on and off)
//   nav:*   — a menu click and the route it lands on
export type BootTraceRow = { name: string; t: number; path: string; detail: string };

const MAX_ROWS = 400;
let marksLeft = 2000;

export function bootMark(name: string, detail = ""): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { __nvBoot?: BootTraceRow[] };
    const rows = (w.__nvBoot ||= []);
    if (rows.length >= MAX_ROWS) rows.splice(0, rows.length - MAX_ROWS + 1);
    rows.push({ name, t: Math.round(performance.now()), path: window.location.pathname, detail });
    // The timeline keeps every mark for the life of the page; a long session stops adding them, the rows go on.
    if (marksLeft > 0) {
      marksLeft -= 1;
      performance.mark(`nv:${name}`);
    }
  } catch {
    // Timing only: a browser without the Performance timeline simply has no rows.
  }
}
