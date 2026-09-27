/**
 * Meta's Embedded Signup, from the browser: the pop-up in which a business
 * signs in to Meta and chooses the WhatsApp number it wants NivaDesk to use.
 *
 * WHAT COMES BACK IS FORWARDED, NOT TRUSTED. The pop-up returns a short-lived
 * code (to the login callback) and, in a separate window message, the chosen
 * phone number id and WhatsApp Business Account id. This file only collects the
 * three and hands them to the server within the code's 30 seconds; the server
 * exchanges the code and checks the number against the account the code opens
 * (functions/inbox/channelSignupFunctions.js). A message is accepted only from
 * an https facebook.com origin, and ids only as digit strings.
 *
 * Facebook's SDK is loaded when an owner presses Connect, not before, and never
 * in an emulator run: NEXT_PUBLIC_FIREBASE_EMULATOR makes `metaSignupConfig()`
 * return null, so an isolated test cannot reach Meta from the page.
 */

export type MetaSignupConfig = { appId: string; configId: string; graphVersion: string };

export type SignupMessage =
  | { kind: "finish"; phoneNumberId: string; wabaId: string }
  | { kind: "finish_without_number" }
  | { kind: "cancel" }
  | { kind: "error" };

export type SignupOutcome =
  | { ok: true; code: string; phoneNumberId: string; wabaId: string }
  | { ok: false; reason: "cancelled" | "finish_without_number" | "popup_failed" | "timed_out" | "not_configured" };

const GRAPH_ID = /^[0-9]{5,25}$/;
const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";

/** The public ids the pop-up needs, or null when this build cannot offer it. */
export function metaSignupConfig(): MetaSignupConfig | null {
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1") return null;
  const appId = String(process.env.NEXT_PUBLIC_META_APP_ID || "").trim();
  const configId = String(process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID || "").trim();
  const graphVersion = String(process.env.NEXT_PUBLIC_META_GRAPH_VERSION || "v25.0").trim();
  if (!GRAPH_ID.test(appId) || !GRAPH_ID.test(configId) || !/^v[0-9]+\.[0-9]+$/.test(graphVersion)) return null;
  return { appId, configId, graphVersion };
}

/** An https origin on facebook.com or one of its subdomains, and nothing else. */
export function isFacebookOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

/** One window message, as far as signup is concerned. Null for anything that is not one of Meta's signup messages. */
export function parseSignupMessage(origin: string, data: unknown): SignupMessage | null {
  if (!isFacebookOrigin(origin)) return null;
  let payload: unknown = data;
  if (typeof data === "string") {
    try { payload = JSON.parse(data); } catch { return null; }
  }
  if (!payload || typeof payload !== "object") return null;
  const message = payload as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (message.type !== "WA_EMBEDDED_SIGNUP") return null;
  const event = String(message.event || "");
  if (event === "FINISH") {
    const phoneNumberId = String((message.data && message.data.phone_number_id) || "");
    const wabaId = String((message.data && message.data.waba_id) || "");
    if (!GRAPH_ID.test(phoneNumberId) || !GRAPH_ID.test(wabaId)) return { kind: "error" };
    return { kind: "finish", phoneNumberId, wabaId };
  }
  if (event === "FINISH_ONLY_WABA") return { kind: "finish_without_number" };
  if (event === "CANCEL") return { kind: "cancel" };
  if (event === "ERROR") return { kind: "error" };
  return null;
}

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>) => void;
};

let sdkLoading: Promise<FacebookSdk> | null = null;

function loadSdk(config: MetaSignupConfig): Promise<FacebookSdk> {
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<FacebookSdk>((resolve, reject) => {
    const w = window as unknown as { FB?: FacebookSdk; fbAsyncInit?: () => void };
    const ready = () => {
      if (!w.FB) { reject(new Error("sdk")); return; }
      // No app-event logging: the page is a settings screen, not an ad funnel.
      w.FB.init({ appId: config.appId, autoLogAppEvents: false, xfbml: false, version: config.graphVersion });
      resolve(w.FB);
    };
    if (w.FB) { ready(); return; }
    w.fbAsyncInit = ready;
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => { sdkLoading = null; reject(new Error("sdk")); };
    document.head.appendChild(script);
  });
  return sdkLoading;
}

/**
 * Run the pop-up and collect what it returns. Resolves once both the code and
 * the chosen number have arrived (in either order), or with the reason it
 * cannot: cancelled, no number chosen, a pop-up that failed, or a wait long
 * enough that the code could no longer be used.
 */
export async function runEmbeddedSignup(config: MetaSignupConfig | null): Promise<SignupOutcome> {
  if (!config) return { ok: false, reason: "not_configured" };
  let sdk: FacebookSdk;
  try { sdk = await loadSdk(config); } catch { return { ok: false, reason: "popup_failed" }; }

  return new Promise<SignupOutcome>((resolve) => {
    let code = "";
    let chosen: { phoneNumberId: string; wabaId: string } | null = null;
    let done = false;
    let timer: number | null = null;
    const finish = (outcome: SignupOutcome) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      if (timer !== null) window.clearTimeout(timer);
      resolve(outcome);
    };
    const settleIfReady = () => {
      if (code && chosen) finish({ ok: true, code, phoneNumberId: chosen.phoneNumberId, wabaId: chosen.wabaId });
    };
    const onMessage = (event: MessageEvent) => {
      const message = parseSignupMessage(event.origin, event.data);
      if (!message) return;
      if (message.kind === "finish") { chosen = { phoneNumberId: message.phoneNumberId, wabaId: message.wabaId }; settleIfReady(); return; }
      if (message.kind === "finish_without_number") { finish({ ok: false, reason: "finish_without_number" }); return; }
      if (message.kind === "cancel") { finish({ ok: false, reason: "cancelled" }); return; }
      finish({ ok: false, reason: "popup_failed" });
    };
    window.addEventListener("message", onMessage);
    try {
      sdk.login((response) => {
        const received = String((response && response.authResponse && response.authResponse.code) || "");
        if (!received) { finish({ ok: false, reason: "cancelled" }); return; }
        code = received;
        settleIfReady();
        // The code lives 30 seconds; if the number never arrives, stop well inside that.
        if (!done) timer = window.setTimeout(() => finish({ ok: false, reason: "timed_out" }), 15_000);
      }, {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} }
      });
    } catch {
      finish({ ok: false, reason: "popup_failed" });
    }
  });
}
