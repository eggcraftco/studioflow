// Security audit #9, web part (28 Oct 2026): a provider's return is finished by the signed-in person who began it.
//
// 1. lib/studioflow/connectClaim.ts: a ?<provider>=confirm&claim=… return is recognised (Etsy, Square, QuickBooks,
//    Xero, Instagram), taken out of the address (claim + confirm word), kept 15 minutes in sessionStorage; the POST
//    is { data: { claim } } with `Authorization: Bearer <ID token>` to the provider's callback function; the
//    answer's params become the /settings address the panels already read (no claim, no confirm: no loop); each
//    refusal (401/403/400/503/network) has its sentence, and 401/403/503 keep the claim for another try.
//    The older server's returns (?etsy=connected …) are not claims and are left alone.
// 2. app/settings/page.tsx: the claim leaves the address before the sign-in redirect can copy it into ?next=, the
//    panel opens, the exchange runs once signed in, the notice is drawn; the legacy ?etsy= / ?instagram= handling
//    is still there.
//
//   npx tsx scripts/check-sec-connect-claim.mts [--root <dir>]
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

let m: Record<string, any> | null = null;
try {
  m = await import(pathToFileURL(path.join(root, "lib/studioflow/connectClaim.ts")).href);
} catch (error) {
  ok(`lib/studioflow/connectClaim.ts loads (${(error as Error).message.split("\n")[0]})`, false);
}

const SECRET = "A".repeat(20) + "b_-" + "9".repeat(20); // 43 base64url characters
const CLAIM = `${SECRET}.${Buffer.from("state-123", "utf8").toString("base64url")}`;
const NOW = 2_000_000_000_000;

if (m) {
  // ---- recognising a return
  const etsy = m.readConnectClaim(`?section=etsy&etsy=confirm&claim=${encodeURIComponent(CLAIM)}`, NOW);
  ok("Etsy confirm return recognised", etsy?.provider === "etsy" && etsy?.claim === CLAIM && etsy?.section === "etsy");
  for (const provider of ["square", "quickbooks", "xero"]) {
    ok(`${provider} confirm return recognised`, m.readConnectClaim(`?section=${provider}&${provider}=confirm&claim=${CLAIM}`, NOW)?.provider === provider);
  }
  const ig = m.readConnectClaim(`?section=customer-channels&instagram=confirm&claim=${CLAIM}`, NOW);
  ok("Instagram confirm return recognised (section customer-channels)", ig?.provider === "instagram" && ig?.section === "customer-channels");
  ok("older server's ?etsy=connected is not a claim", m.readConnectClaim("?section=etsy&etsy=connected", NOW) === null);
  ok("a claim without a confirm word is ignored", m.readConnectClaim(`?section=etsy&claim=${CLAIM}`, NOW) === null);
  ok("a malformed claim is ignored", m.readConnectClaim("?etsy=confirm&claim=abc.def", NOW) === null && m.readConnectClaim(`?etsy=confirm&claim=${SECRET}`, NOW) === null);
  ok("an unknown provider is ignored", m.readConnectClaim(`?ebay=confirm&claim=${CLAIM}`, NOW) === null);

  const stripped = m.addressWithoutClaim(`https://nivadesk.app/settings?section=etsy&etsy=confirm&claim=${CLAIM}&x=1#top`);
  ok(`the address keeps section and other params, loses claim + confirm (${stripped})`, stripped === "/settings?section=etsy&x=1#top");
  ok("an Instagram address keeps section=customer-channels", m.addressWithoutClaim(`https://nivadesk.app/settings?section=customer-channels&instagram=confirm&claim=${CLAIM}`) === "/settings?section=customer-channels");

  // ---- sessionStorage, 15 minutes
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  m.stashConnectClaim(etsy, storage);
  ok("stashed claim read back within 15 minutes", m.readStashedConnectClaim(storage, NOW + 14 * 60_000)?.claim === CLAIM);
  ok("stashed claim dropped after 15 minutes", m.readStashedConnectClaim(storage, NOW + 16 * 60_000) === null && store.size === 0);
  store.set("nv_connect_claim", "{not json");
  ok("garbage in storage reads as no claim", m.readStashedConnectClaim(storage, NOW) === null);

  // ---- the POST
  const calls: Array<{ url: string; init: any }> = [];
  const reply = (status: number, body: unknown) => async (url: string, init: any) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); };
  const url = m.connectClaimUrl("etsy", "eggcraft-studio", "");
  ok("callback URL for Etsy (project base)", url === "https://europe-west2-eggcraft-studio.cloudfunctions.net/etsyOAuthCallback");
  ok("callback URL for Instagram", m.connectClaimUrl("instagram", "p", "").endsWith("/instagramConnectCallback"));
  ok("an explicit functions base wins", m.connectClaimUrl("xero", "p", "https://fn.example/") === "https://fn.example/xeroOAuthCallback");

  const good = await m.sendConnectClaim(etsy, { idToken: "ID-TOKEN", url, fetchImpl: reply(200, { result: { ok: true, provider: "etsy", outcome: "connected", params: { section: "etsy", etsy: "connected", claim: "leak" } } }) });
  ok("POST body is the callable shape { data: { claim } }", calls[0] && JSON.parse(calls[0].init.body).data.claim === CLAIM && calls[0].init.method === "POST");
  ok("POST carries the ID token as Bearer", calls[0]?.init.headers.Authorization === "Bearer ID-TOKEN");
  ok("a connected answer is a result with its params (claim never echoed)", good.kind === "result" && good.ok === true && good.params.etsy === "connected" && !("claim" in good.params));
  ok("connected → the panel's own address", m.settingsAddressForAnswer(etsy, good.params, good.outcome) === "/settings?section=etsy&etsy=connected");

  const xero = m.readConnectClaim(`?section=xero&xero=confirm&claim=${CLAIM}`, NOW);
  const choose = await m.sendConnectClaim(xero, { idToken: "t", url: "u", fetchImpl: reply(200, { result: { ok: true, outcome: "choose", params: { section: "xero", xero: "choose", state: "st-9" } } }) });
  ok("Xero choose keeps its state for the organisation picker", m.settingsAddressForAnswer(xero, choose.params, choose.outcome) === "/settings?section=xero&xero=choose&state=st-9");
  const failed = await m.sendConnectClaim(etsy, { idToken: "t", url: "u", fetchImpl: reply(200, { result: { ok: false, outcome: "error", params: { etsy: "error", reason: "exchange" } } }) });
  ok("an error outcome keeps its reason, and the section is filled in", m.settingsAddressForAnswer(etsy, failed.params, failed.outcome) === "/settings?etsy=error&reason=exchange&section=etsy");
  ok("no params at all → section + provider=outcome", m.settingsAddressForAnswer(etsy, {}, "failed") === "/settings?section=etsy&etsy=failed");
  ok("a confirm word in params never loops back", !m.settingsAddressForAnswer(etsy, { etsy: "confirm", claim: CLAIM }, "confirm").includes("confirm"));

  const refusals: Array<[number, string, string, boolean]> = [
    [401, "UNAUTHENTICATED", "Sign in to NivaDesk to finish connecting.", true],
    [403, "PERMISSION_DENIED", "This connection was started by a different NivaDesk user. Sign in as that user, or start the connection again.", true],
    [400, "FAILED_PRECONDITION", "This connection link has expired or was already used. Start the connection again.", false],
    [400, "INVALID_ARGUMENT", "This connection link is not valid. Start the connection again.", false],
    [503, "UNAVAILABLE", "The connection could not be finished just now. Try again.", true],
  ];
  for (const [http, status, sentence, keeps] of refusals) {
    const answer = await m.sendConnectClaim(etsy, { idToken: "t", url: "u", fetchImpl: reply(http, { error: { status, message: "x" } }) });
    ok(`${http} ${status} → refused with its sentence; claim ${keeps ? "kept" : "dropped"}`,
      answer.kind === "refused" && answer.status === status && m.connectClaimRefusalSentence(answer.status) === sentence && m.connectClaimRefusalKeepsClaim(answer.status) === keeps);
  }
  const offline = await m.sendConnectClaim(etsy, { idToken: "t", url: "u", fetchImpl: async () => { throw new Error("offline"); } });
  ok("no connection → refused NETWORK, claim kept", offline.kind === "refused" && offline.status === "NETWORK" && m.connectClaimRefusalKeepsClaim("NETWORK"));
  ok("no functions URL → refused, nothing sent", (await m.sendConnectClaim(etsy, { idToken: "t", url: "", fetchImpl: async () => { throw new Error("must not be called"); } })).kind === "refused");
}

// ---------------------------------------------------------------- 2. the settings page
const page = read("app/settings/page.tsx");
const stripAt = page.indexOf("window.history.replaceState(window.history.state, \"\", addressWithoutClaim(window.location.href))");
const loginAt = page.indexOf("router.replace(`/login?next=");
ok("the claim leaves the address bar (replaceState) before the sign-in redirect's effect", stripAt > 0 && loginAt > 0 && stripAt < loginAt);
ok("the claim is stashed in sessionStorage", /stashConnectClaim\(pending, window\.sessionStorage\)/.test(page));
ok("the exchange runs once signed in, from the stash", /if \(loading \|\| !user \|\| connectClaimStartedRef\.current\) return;/.test(page) && /readStashedConnectClaim\(window\.sessionStorage\)/.test(page));
ok("the exchange POSTs with the ID token to the provider's callback", /sendConnectClaim\(pending, \{ idToken, url: connectClaimUrl\(pending\.provider, auth\.app\.options\.projectId\) \}\)/.test(page));
ok("an answer loads the provider panel's own address", /window\.location\.replace\(settingsAddressForAnswer\(pending, answer\.params, answer\.outcome\)\)/.test(page));
ok("a refusal is shown, translated", /connectClaimRefusalSentence\(answer\.status\)/.test(page) && /data-testid="connect-claim-notice"/.test(page) && /\{t\(connectClaimNotice\.text\)\}/.test(page));
ok("a claim return opens the provider's panel", /setIntegrationProvider\(claimReturn\.provider\)/.test(page));
ok("the older server's ?etsy= / ?instagram= returns are still read", /if \(params\.get\("etsy"\)\) \{/.test(page) && /if \(params\.get\("instagram"\)\) \{/.test(page));
const translations = read("lib/studioflow/securityFixTranslations.ts");
for (const key of ["Finishing the connection…", "Sign in to NivaDesk to finish connecting.", "This connection link has expired or was already used. Start the connection again.", "The connection could not be finished just now. Try again."]) {
  const row = translations.split("\n").find(line => line.startsWith(`  "${key}":`)) || "";
  ok(`"${key}" has a cell in all eleven languages`, (row.match(/": "/g) || []).length === 11);
}

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-connect-claim ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-connect-claim ${checks}/${checks} pass; reds: none`);
