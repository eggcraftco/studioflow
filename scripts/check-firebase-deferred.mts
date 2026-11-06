// Firebase waits on marketing pages for a visitor nobody has signed in as on this device (site speed + NIVADESK_HUKUK.md
// O-01, 6 Nov 2026). Loading lib/firebase/client.ts starts App Check, which downloads Google's reCAPTCHA (≈356 KB gzip,
// an iframe, three IndexedDB databases); Firebase itself is ≈160 KB gzip.
//
//   1. lib/firebase/deferPolicy.ts — which pages may wait, and which devices need Firebase everywhere (vectors).
//   2. lib/firebase/lazy.ts, compiled against a recording stub kit — the drop-ins load Firebase once, on first use;
//      onAuthStateChanged follows Auth from the load on; nothing is loaded before it is asked for.
//   3. Wiring (source) — AuthProvider waits only where the policy says, App Check still starts with Firebase, the
//      sign-in popups stay inside the click, the root-layout hosts take Firebase from the kit.
//
// The bundle half (no Firebase in a public page's first download) is in scripts/check-public-bundle.mts.
//   npx tsx scripts/check-firebase-deferred.mts [--root <web tree>]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};
console.log(`firebase-deferred: source ${root}`);

// ---------------------------------------------------------------- 1. policy
const policyFile = path.join(root, "lib/firebase/deferPolicy.ts");
if (!fs.existsSync(policyFile)) ok("lib/firebase/deferPolicy.ts exists", false);
else {
  const policy = await import(pathToFileURL(policyFile).href) as {
    firebaseCanWait: (p: string | null | undefined) => boolean;
    firebaseNeededOnThisDevice: (s?: unknown) => boolean;
    firebaseMayWait: (p: string | null | undefined, s?: unknown) => boolean;
  };
  const wait = ["/", "/de", "/ar", "/features", "/pricing", "/de/pricing", "/ja/faq", "/chatgpt", "/contact", "/de/contact",
    "/security", "/hi/security", "/integrations", "/integrations/amazon", "/integrations/shopify", "/de/integrations/claude",
    "/privacy", "/terms", "/cookies", "/acceptable-use", "/refund-cancellation", "/account-deletion",
    "/data-processing-agreement", "/subprocessors", "/changelog", "/custom-order-management"];
  const load = ["/login", "/signup", "/de/signup", "/guide", "/orders", "/orders/abc", "/home", "/dashboard", "/settings",
    "/calendar", "/book/studio", "/pay/x", "/e/x", "/p/x", "/f/x", "/track/x", "/invite/x", "/review-demo", "/plan",
    "/integrations/amazon/extra", "/xx/pricing", "/pricing/x", "", null, undefined];
  for (const p of wait) ok(`may wait: ${p}`, policy.firebaseCanWait(p) === true);
  for (const p of load) ok(`loads at once: ${String(p)}`, policy.firebaseCanWait(p as string) === false);
  const store = (entries: Record<string, string>) => {
    const keys = Object.keys(entries);
    return { get length() { return keys.length; }, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
  };
  ok("device: nothing stored → Firebase not needed everywhere", policy.firebaseNeededOnThisDevice(store({})) === false);
  ok("device: unrelated keys → not needed", policy.firebaseNeededOnThisDevice(store({ "studioflow-public-language": "Deutsch", nv_lang: "Türkçe" })) === false);
  ok("device: someone signed in here (nv_ws_ready_<uid>) → needed", policy.firebaseNeededOnThisDevice(store({ nv_ws_ready_u1: "1" })) === true);
  ok("device: a sign-out wipe still pending → needed (loading finishes it)", policy.firebaseNeededOnThisDevice(store({ nv_fs_wipe_pending: "1" })) === true);
  ok("device: no wipe pending (value not 1) → not needed", policy.firebaseNeededOnThisDevice(store({ nv_fs_wipe_pending: "0" })) === false);
  const broken = { get length(): number { throw new Error("SecurityError"); }, key: () => null, getItem: () => { throw new Error("SecurityError"); } };
  ok("device: storage that cannot be read → needed", policy.firebaseNeededOnThisDevice(broken) === true);
  ok("may wait = marketing page AND nobody signed in here", policy.firebaseMayWait("/pricing", store({})) === true
    && policy.firebaseMayWait("/pricing", store({ nv_ws_ready_u1: "1" })) === false
    && policy.firebaseMayWait("/login", store({})) === false);
}

// ---------------------------------------------------------------- 2. lazy.ts against a stub kit
const lazySource = read("lib/firebase/lazy.ts");
if (!lazySource) ok("lib/firebase/lazy.ts exists", false);
else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-lazy-"));
  ok("lazy.ts loads the kit with one dynamic import of lib/firebase/rootKit", (lazySource.match(/(?<!typeof )import\("@\/lib\/firebase\/rootKit"\)/g) ?? []).length === 1);
  let js = ts.transpileModule(lazySource, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/import\("@\/lib\/firebase\/rootKit"\)/g, 'import("./kit-stub.mjs")');
  ok("lazy.ts has no static import left after compiling (types only)", !/^\s*import\s[^(]/m.test(js));
  fs.writeFileSync(path.join(tmp, "lazy.mjs"), js);
  fs.writeFileSync(path.join(tmp, "kit-stub.mjs"), `
globalThis.__kitEvaluations = (globalThis.__kitEvaluations ?? 0) + 1;
export const log = [];
export const auth = { currentUser: { uid: "u1" } };
export const functions = { real: true };
export function httpsCallable(fns, name, options) { log.push(["callable", fns, name, options]); return async data => ({ data: { name, data } }); }
export function onAuthStateChanged(a, next) { log.push(["subscribe", a]); next(a.currentUser); return () => log.push(["unsubscribe"]); }
export async function createUserWithEmailAndPassword(a, email, password) { log.push(["create", a, email, password]); return { user: { uid: "new" } }; }
export async function sendEmailVerification(user, settings) { log.push(["verify", user, settings]); }
export async function updateProfile(user, profile) { log.push(["profile", user, profile]); }
`);
  const lazy = await import(pathToFileURL(path.join(tmp, "lazy.mjs")).href);
  const g = globalThis as { __kitEvaluations?: number };
  ok("before anything asks: Firebase not loaded, not requested", lazy.loadedFirebaseKit() === null && lazy.firebaseKitRequested() === false && !g.__kitEvaluations);
  ok("before the load: auth.currentUser is null", lazy.auth.currentUser === null);
  let threw = false;
  try { lazy.firebaseKit(); } catch { threw = true; }
  ok("firebaseKit() before the load throws (code that needs a user must not run without Firebase)", threw);

  const seen: unknown[] = [];
  const stopEarly = lazy.onAuthStateChanged(lazy.auth, (u: unknown) => seen.push(["early-cancelled", u]));
  stopEarly();
  const stopAuth = lazy.onAuthStateChanged(lazy.auth, (u: unknown) => seen.push(u));
  let notified = 0;
  lazy.whenFirebaseKitLoaded(() => { notified += 1; });
  const cancelled = lazy.whenFirebaseKitLoaded(() => { notified += 100; });
  cancelled();
  ok("onAuthStateChanged before the load subscribes to nothing yet", seen.length === 0 && !g.__kitEvaluations);

  const call = lazy.httpsCallable(lazy.functions, "getUserGuide", { timeout: 5 });
  ok("httpsCallable() itself loads nothing (only the call does)", !g.__kitEvaluations && lazy.firebaseKitRequested() === false);
  const [r1, r2] = await Promise.all([call({ language: "Deutsch" }), lazy.httpsCallable(lazy.functions, "createWebsiteChat")({})]);
  const stub = await import(pathToFileURL(path.join(tmp, "kit-stub.mjs")).href) as { log: unknown[][]; auth: unknown; functions: unknown };
  ok("two calls at once load the kit once", g.__kitEvaluations === 1);
  ok("the call goes to the real httpsCallable with the real functions, name and options",
    stub.log.some(e => e[0] === "callable" && e[1] === stub.functions && e[2] === "getUserGuide" && (e[3] as { timeout?: number })?.timeout === 5)
    && r1?.data?.name === "getUserGuide" && (r1?.data?.data as { language?: string })?.language === "Deutsch" && r2?.data?.name === "createWebsiteChat");
  ok("after the load: loadedFirebaseKit() and firebaseKit() give the kit", lazy.loadedFirebaseKit() !== null && lazy.firebaseKit().auth === stub.auth);
  ok("after the load: auth.currentUser is Auth's", (lazy.auth.currentUser as { uid?: string } | null)?.uid === "u1");
  ok("a waiting listener runs once on the load; a cancelled one never", notified === 1);
  ok("onAuthStateChanged from before the load now follows the real Auth (a cancelled one does not)",
    stub.log.filter(e => e[0] === "subscribe").length === 1 && (seen[0] as { uid?: string })?.uid === "u1" && !seen.some(s => Array.isArray(s)));
  stopAuth();
  ok("its unsubscribe reaches the real one", stub.log.some(e => e[0] === "unsubscribe"));
  let late = 0;
  lazy.whenFirebaseKitLoaded(() => { late += 1; });
  ok("whenFirebaseKitLoaded after the load runs at once", late === 1);
  await lazy.createUserWithEmailAndPassword(lazy.auth, "a@b.test", "pw12345678");
  ok("createUserWithEmailAndPassword uses the real auth", stub.log.some(e => e[0] === "create" && e[1] === stub.auth && e[2] === "a@b.test"));
  await lazy.sendEmailVerification({ uid: "new" }, { url: "https://nivadesk.app/login" });
  await lazy.updateProfile({ uid: "new" }, { displayName: "Ada" });
  ok("sendEmailVerification and updateProfile pass through", stub.log.some(e => e[0] === "verify") && stub.log.some(e => e[0] === "profile" && (e[2] as { displayName?: string }).displayName === "Ada"));
  ok("still one load", g.__kitEvaluations === 1);
}

// ---------------------------------------------------------------- 3. wiring
const rootKit = read("lib/firebase/rootKit.ts");
ok("rootKit.ts takes auth/db/functions from lib/firebase/client.ts (App Check starts with it, unchanged)",
  /export \{[^}]*\bauth\b[^}]*\} from "@\/lib\/firebase\/client";/.test(rootKit));
const client = read("lib/firebase/client.ts");
ok("client.ts still starts App Check (reCAPTCHA) when Firebase is loaded", /initializeAppCheck\(app, \{/.test(client) && /new ReCaptchaV3Provider\(APP_CHECK_SITE_KEY\)/.test(client));
const provider = read("lib/auth/AuthProvider.tsx");
const staticFirebase = (src: string) => /^import\s+(?!type\b)[^;]*from\s+"(firebase\/[^"]+|@\/lib\/firebase\/client|@\/lib\/firebase\/rootKit)";/m.test(src);
ok("AuthProvider imports no Firebase value statically", provider !== "" && !staticFirebase(provider));
ok("AuthProvider waits only where firebaseMayWait says, and then knows at once that nobody is signed in",
  /if \(!firebaseKitRequested\(\) && firebaseMayWait\(pathname\)\) \{[\s\S]{0,160}setLoading\(false\);/.test(provider));
ok("AuthProvider starts the download before hydration on a page that needs it",
  /if \(typeof window !== "undefined" && !firebaseMayWait\(window\.location\.pathname\)\) \{\s*void loadFirebaseKit\(\)/.test(provider));
ok("AuthProvider follows Auth once Firebase is loaded (by anyone)",
  /whenFirebaseKitLoaded\(\(\) => setFirebaseReady\(true\)\)/.test(provider) && /if \(!firebaseReady\) return;\s*const \{ auth, onAuthStateChanged \} = firebaseKit\(\);/.test(provider)
  && /onAuthStateChanged\(auth, currentUser =>/.test(provider));
ok("AuthProvider: from a marketing page to one that needs the session, the state is 'not known yet' again",
  /if \(waitedForFirebase\.current\) \{\s*waitedForFirebase\.current = false;\s*setLoading\(true\);/.test(provider));
const buttons = read("components/AuthProviders.tsx");
ok("Google/Apple buttons load Firebase when they appear and open the popup from the loaded kit (inside the click)",
  !staticFirebase(buttons) && /useEffect\(\(\) => \{[\s\S]{0,120}void loadFirebaseKit\(\)/.test(buttons) && /= loadedFirebaseKit\(\) \?\? await loadFirebaseKit\(\);\s*await withSecondFactor\(auth, \(\) => signInWithPopup\(/.test(buttons));
const lock = read("components/SessionAutoLock.tsx");
ok("SessionAutoLock: no static Firebase; the unlock popup comes from the loaded kit first",
  !staticFirebase(lock) && /const kit = loadedFirebaseKit\(\) \?\? await loadFirebaseKit\(\);/.test(lock) && /reauthenticateWithPopup\(user, provider\)/.test(lock));
const host = read("components/SecondFactorPromptHost.tsx");
ok("SecondFactorPromptHost registers the code prompt when Firebase is loaded",
  !/from "@\/lib\/auth\/secondFactor";/.test(host.replace(/import type [^;]*;/g, "")) && /whenFirebaseKitLoaded\(kit => \{\s*registerSecondFactorPresenter = kit\.registerSecondFactorPresenter;/.test(host));
for (const rel of ["components/PublicMarketing.tsx", "components/SupportChatWidget.tsx", "lib/publicSite/websiteChat.ts", "lib/publicSite/userGuide.ts",
  "lib/studioflow/billingActions.ts", "lib/studioflow/onboardingEvents.ts", "lib/auth/recentAuth.ts"]) {
  ok(`${rel}: no static Firebase import`, read(rel) !== "" && !staticFirebase(read(rel)));
}

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`firebase-deferred ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`firebase-deferred ${checks}/${checks} pass; reds: none`);
