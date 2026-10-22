// Is this tab running the newest web release? (GN-06)
//
// The web app has no installed version: every deploy replaces it, and a tab
// that stays open keeps running the build it loaded. So the honest answers are
// three, and only a successful check may say "current":
//   - "current": the server answered with the same build this tab loaded;
//   - "newer":   the server is running a different (newer) build — offer a
//                reload, never perform one: a forced reload loses a draft that
//                is being typed or an upload in flight;
//   - "unknown": the check failed or this build carries no stamp.
//
// "NivaDesk updated — see what's new" is NOT shown on the web: a server release
// is not a local app update (GN-06), and the release notes on /changelog are
// per app version.

export const WEB_BUILD_ID: string = process.env.NEXT_PUBLIC_NV_BUILD_ID || "";

export type WebBuildState = "current" | "newer" | "unknown";
export type WebBuildCheck = { state: WebBuildState; serverBuild: string; checkedAtMs: number };

/** The verdict for one answer; pure, so the check script can hold it. */
export function webBuildVerdict(loadedBuild: string, serverBuild: string | null | undefined): WebBuildState {
  const loaded = String(loadedBuild || "").trim();
  const server = String(serverBuild || "").trim();
  if (!loaded || !server) return "unknown";
  return loaded === server ? "current" : "newer";
}

/** Asks the server which build it runs. Never throws; a failure is "unknown". */
export async function checkWebBuild(fetcher: typeof fetch = fetch): Promise<WebBuildCheck> {
  const checkedAtMs = Date.now();
  try {
    const response = await fetcher("/api/app-build", { cache: "no-store", credentials: "omit" });
    if (!response.ok) return { state: "unknown", serverBuild: "", checkedAtMs };
    const body = (await response.json()) as { build?: unknown };
    const serverBuild = typeof body?.build === "string" ? body.build : "";
    return { state: webBuildVerdict(WEB_BUILD_ID, serverBuild), serverBuild, checkedAtMs };
  } catch {
    return { state: "unknown", serverBuild: "", checkedAtMs };
  }
}

/** The build as people read it: "202610220130" → "2026-10-22 01:30 UTC". */
export function formatWebBuild(build: string): string {
  const raw = String(build || "");
  if (/^\d{12}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)} UTC`;
  }
  return raw;
}
