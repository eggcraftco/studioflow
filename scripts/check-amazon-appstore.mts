// AMZ-3 (30 Oct 2026): a seller who presses "Authorize" in Amazon's Appstore lands on the zone's
// /oauth/appstore, which sends them to /settings?section=integrations&amazon=appstore to sign in.
//
// 1. lib/studioflow/amazonAppstore.ts: amazonStartUrl adds appstore=1 only for a seller who came from the
//    Appstore, only to an https /oauth/start URL, and keeps the intent untouched; anything else is returned as is.
// 2. AmazonIntegrationSection.tsx: ?amazon=appstore is not an error — it sets the Appstore notice, and Connect
//    navigates through amazonStartUrl. The sealed, owner-gated flow is unchanged (seal before navigating).
// 3. amazon.ts: the zone's refusal word `appstore` has a sentence, so it never falls to the generic one.
// 4. Both new sentences are translated in every supported language.
//
//   npx tsx scripts/check-amazon-appstore.mts [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const NOTICE = "Amazon sent you here to finish connecting your seller account. Check this is the right workspace, then press Connect Amazon.";
const REFUSAL = "That Amazon Appstore link could not be used. Press Connect Amazon below to connect from here instead.";

// 1. the start URL
let m: Record<string, any> | null = null;
try {
  m = await import(pathToFileURL(path.join(root, "lib/studioflow/amazonAppstore.ts")).href);
} catch (error) {
  ok(`lib/studioflow/amazonAppstore.ts loads (${(error as Error).message.split("\n")[0]})`, false);
}
if (m) {
  const start = "https://amazon.nivadesk.app/oauth/start?intent=eyJ2Ijoy.c2ln";
  const withFlag = new URL(m.amazonStartUrl(start, true));
  ok("from the Appstore: appstore=1 is added", withFlag.searchParams.get("appstore") === "1");
  ok("from the Appstore: the intent is untouched", withFlag.searchParams.get("intent") === "eyJ2Ijoy.c2ln");
  ok("from the Appstore: same host and path", `${withFlag.origin}${withFlag.pathname}` === "https://amazon.nivadesk.app/oauth/start");
  ok("not from the Appstore: the URL is returned exactly", m.amazonStartUrl(start, false) === start);
  ok("a non-start path is never given the flag", m.amazonStartUrl("https://amazon.nivadesk.app/oauth/seal", true) === "https://amazon.nivadesk.app/oauth/seal");
  ok("an http URL is never given the flag", m.amazonStartUrl("http://amazon.nivadesk.app/oauth/start?intent=x", true) === "http://amazon.nivadesk.app/oauth/start?intent=x");
  ok("garbage is returned as is", m.amazonStartUrl("not a url", true) === "not a url");
  ok("an existing appstore value is not duplicated", new URL(m.amazonStartUrl(`${start}&appstore=0`, true)).searchParams.getAll("appstore").join() === "1");

  // /login forwarder: Developer Central still names /login as the Login URI.
  const cb = "https://amazon.com/apps/authorize/confirm/amzn1.sp.solution.0993d5c7-fba1-4fb7-9541-2ceeb8222bfd";
  const arrival = new URLSearchParams({ amazon_callback_uri: cb, amazon_state: "abc~1", selling_partner_id: "A3EXAMPLE", version: "beta", next: "https://evil.example", other: "x" });
  const fwd = m.amazonAppstoreForward(`?${arrival}`);
  const fwdUrl = fwd ? new URL(fwd) : null;
  ok("forward: goes to the zone's fixed Login URI", fwdUrl && `${fwdUrl.origin}${fwdUrl.pathname}` === "https://amazon.nivadesk.app/oauth/appstore");
  ok("forward: Amazon's values travel unchanged", fwdUrl && fwdUrl.searchParams.get("amazon_callback_uri") === cb && fwdUrl.searchParams.get("amazon_state") === "abc~1"
    && fwdUrl.searchParams.get("selling_partner_id") === "A3EXAMPLE" && fwdUrl.searchParams.get("version") === "beta");
  ok("forward: nothing else travels", fwdUrl && !fwdUrl.searchParams.has("next") && !fwdUrl.searchParams.has("other"));
  ok("forward: an ordinary /login (or ?next=) is left alone", m.amazonAppstoreForward("") === null && m.amazonAppstoreForward("?next=%2Fsettings") === null);
  ok("forward: both Amazon values are required", m.amazonAppstoreForward(`?amazon_state=x`) === null && m.amazonAppstoreForward(`?amazon_callback_uri=${encodeURIComponent(cb)}`) === null);
}

const login = read("app/login/page.tsx");
ok("login: imports the forwarder", /import \{ amazonAppstoreForward \} from "@\/lib\/studioflow\/amazonAppstore";/.test(login));
ok("login: forwards with location.replace", /if \(appstoreForward\) window\.location\.replace\(appstoreForward\);/.test(login));
ok("login: the signed-in redirect waits for the forward", /if \(appstoreForward\) return;\s*\n\s*if \(!loading && user\) router\.replace/.test(login));

// 2. the panel
const section = read("app/settings/AmazonIntegrationSection.tsx");
ok("panel: imports amazonStartUrl from the Firebase-free module", /import \{ amazonStartUrl \} from "@\/lib\/studioflow\/amazonAppstore";/.test(section));
ok("panel: ?amazon=appstore is handled before the error branch", /outcome === "connected"[\s\S]{0,120}else if \(outcome === "appstore"\) setFromAppstore\(true\);[\s\S]{0,40}else setError/.test(section));
ok("panel: Connect navigates through amazonStartUrl", /window\.location\.href = amazonStartUrl\(result\.url, fromAppstore\);/.test(section));
ok("panel: the bare result.url navigation is gone", !/window\.location\.href = result\.url;/.test(section));
const sealAt = section.indexOf("sealAmazonTicket(result.sealUrl, result.ticket)");
const navAt = section.indexOf("window.location.href = amazonStartUrl");
ok("panel: the ticket is still sealed before the browser leaves", sealAt > 0 && navAt > sealAt);
ok("panel: the notice is drawn through t()", section.includes(`t("${NOTICE}")`));
ok("panel: Connect still requires a published application", /disabled=\{busy === "connect" \|\| mode !== "published"\}/.test(section) && /if \(mode !== "published"\)/.test(section));

// 3. the refusal word
const lib = read("lib/studioflow/amazon.ts");
ok("amazon.ts: the appstore reason has its sentence", lib.includes(`appstore: "${REFUSAL}"`));

// 4. translations
let lang: Record<string, any> | null = null;
try {
  lang = await import(pathToFileURL(path.join(root, "lib/studioflow/language.ts")).href);
} catch (error) {
  ok(`lib/studioflow/language.ts loads (${(error as Error).message.split("\n")[0]})`, false);
}
if (lang) {
  const languages: string[] = (lang.SUPPORTED_STUDIO_LANGUAGES || []).filter((l: string) => l !== "English");
  ok("there are languages to check", languages.length >= 10);
  for (const sentence of [NOTICE, REFUSAL]) {
    for (const language of languages) {
      const out = lang.studioT(sentence, language);
      ok(`${language}: "${sentence.slice(0, 40)}…" is translated`, typeof out === "string" && out.length > 10 && out !== sentence);
    }
  }
}

if (failures.length) {
  console.error(`AMAZON APPSTORE CHECK FAILED (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`AMAZON APPSTORE CHECK OK (${checks} checks)`);
