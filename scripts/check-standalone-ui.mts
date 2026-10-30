// Order-less payment links and the Free plan gate, the web half (STRIPE-LINKS SL-23/SL-24, 30 Oct 2026).
//   npm run test:standalone-ui
//
// Contract: getStripePaymentConnection's summary gains `planAllowed` (Free = false); the callable
// `createStandalonePaymentRequest` takes { companyId, title, amountMinor, customerName?, customerEmail?,
// collectPhone, collectAddress, clientRequestId } and refuses a Free workspace with details.reason
// "stripe_plan_required"; request summaries gain `kind` ("order" | "standalone") and `title`; the visitor view
// gains `title`. Every new field is OPTIONAL on the client: an older server sends none, and the screens are
// then exactly what they were (no new button).
//
//   1. the client (lib/studioflow/stripeConnect.ts), loaded from source with the callable stubbed: the exact
//      payload, planAllowed read only as a boolean, one read for the pilot gate and the plan, the refusals, the
//      form's own checks, the id
//   2. Banking's panel (components/PaymentLinksPanel.tsx), from source: no New payment link on Free (exactly
//      false), the order-less form only on exactly true, today's button otherwise; the form's fields; the amount
//      read like the order link form; one id per submit, kept for a retry, new after a definite refusal; the
//      row's title and its order once paid
//   3. the order card hides New payment link on Free; Settings ▸ Stripe shows the paid-plan block and a plan
//      link instead of Connect; /p/<code> shows the title when there is no order reference (one render path
//      for the neutral and the themed page); the public /integrations note names the paid plans
//   4. every new sentence in twelve languages, placeholders kept, in one block right after the refund block —
//      never at the end of language.ts (the tail is the 2FA table and, last, the calendar one)
//
// The source rules run first against known-bad mutants, so a rule that cannot fail is itself a failure.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

let checks = 0;
let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}
// STANDALONE_UI_VERBOSE=1 prints why each mutant was caught.
const verbose = (problems: string[]) => { if (process.env.STANDALONE_UI_VERBOSE) console.log(`       ${problems.join("; ")}`); };

const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)",
  "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];

const libSource = read("lib/studioflow/stripeConnect.ts");
const hookSource = read("lib/studioflow/usePaymentLinksAvailable.ts");
const panelSource = read("components/PaymentLinksPanel.tsx");
const cardSource = read("components/OrderPaymentLinks.tsx");
const settingsSource = read("app/settings/StripeIntegrationSection.tsx");
const payPageSource = read("app/p/[code]/PaymentLinkContent.tsx");
const payLinkLib = read("lib/publicSite/paymentLink.ts");
const languageSource = read("lib/studioflow/language.ts");

function region(source: string, start: string, end: string) {
  const a = source.indexOf(start);
  const b = a >= 0 ? source.indexOf(end, a + start.length) : -1;
  return a >= 0 && b > a ? source.slice(a, b) : "";
}

// ---- 1. the client, from source ---------------------------------------------------------------------------
type Call = { name: string; data: Record<string, unknown> };
type Stub = { calls: Call[]; setAnswer: (next: unknown) => void };
type Lib = {
  createStandalonePaymentRequest: (input: Record<string, unknown>) => Promise<{ ok: boolean; request: unknown }>;
  getStripeConnection: (companyId: string, purpose?: string) => Promise<{ configured: boolean; planAllowed: boolean | null }>;
  paymentLinksAccess: (companyId: string) => Promise<{ available: boolean; planAllowed: boolean | null }>;
  paymentLinksAvailable: (companyId: string) => Promise<boolean>;
  paymentLinkRefusal: (error: unknown) => { reason: string; retry: boolean; definite: boolean; text: string };
  paymentLinkRefusalText: (reason: string, code?: string, message?: string) => string;
  orderLinkRefusalText: (error: unknown) => string;
  standaloneFormProblem: (fields: { title: string; customerEmail: string }) => string;
  newClientRequestId: () => string;
  isStandaloneRow: (row: unknown) => boolean;
  orderReferenceOfRow: (row: unknown) => string;
  STANDALONE_TITLE_MAX: number;
};
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-standalone-ui-"));
writeFileSync(path.join(outDir, "io-stub.mjs"), [
  "export const functions = null;",
  "export const calls = [];",
  "let answer = null;",
  "export function setAnswer(next) { answer = next; }",
  "export function httpsCallable(_functions, name) {",
  "  return async (data) => {",
  "    calls.push({ name, data });",
  "    if (answer instanceof Error) throw answer;",
  "    return { data: answer };",
  "  };",
  "}",
  "",
].join("\n"));
let loads = 0;
async function loadLib(source: string): Promise<{ lib: Lib; stub: Stub }> {
  // A fresh copy each time (its own module, so its own cache), with the two client imports pointed at the stub.
  loads += 1;
  const file = path.join(outDir, `stripeConnect-${loads}.mts`);
  writeFileSync(file, source
    .replace(/from\s+["']firebase\/functions["']/g, 'from "./io-stub.mjs"')
    .replace(/from\s+["']@\/lib\/firebase\/client["']/g, 'from "./io-stub.mjs"')
    .replace(/^import\s+type[^;]+;\n?/gm, ""));
  const stub = await import(pathToFileURL(path.join(outDir, "io-stub.mjs")).href) as Stub;
  const lib = await import(pathToFileURL(file).href) as Lib;
  return { lib, stub };
}
const callableError = (code: string, details?: Record<string, unknown>, message = "internal") =>
  Object.assign(new Error(message), { code: `functions/${code}`, ...(details ? { details } : {}) });

/** What the client must do, as a list of what it got wrong (empty = right). */
async function clientProblems(source: string): Promise<string[]> {
  const out: string[] = [];
  let loaded: { lib: Lib; stub: Stub };
  try { loaded = await loadLib(source); } catch (error) { return [`does not load: ${(error as Error).message}`]; }
  const { lib, stub } = loaded;
  for (const fn of ["createStandalonePaymentRequest", "getStripeConnection", "paymentLinksAccess", "paymentLinksAvailable", "paymentLinkRefusal",
    "paymentLinkRefusalText", "orderLinkRefusalText", "standaloneFormProblem", "newClientRequestId", "isStandaloneRow", "orderReferenceOfRow"] as const) {
    if (typeof lib[fn] !== "function") out.push(`no ${fn}()`);
  }
  if (out.length) return out;
  if (lib.STANDALONE_TITLE_MAX !== 120) out.push("the title limit is not the server's 120");

  // The payload: the contract's fields, the two optional ones only when typed, no currency (the server's).
  let before = stub.calls.length;
  stub.setAnswer({ ok: true, request: { paymentRequestId: "pr9", kind: "standalone", title: "Cake topper", amountMinor: 4500, currency: "gbp" } });
  const full = { companyId: "ws1", title: "  Cake topper  ", amountMinor: 4500, customerName: " Ada ", customerEmail: " ada@example.com ",
    collectPhone: true, collectAddress: true, clientRequestId: "abcDEF12345", currency: "usd", orderId: "o1" };
  const made = await lib.createStandalonePaymentRequest(full);
  let sent = stub.calls[before];
  if (stub.calls.length !== before + 1 || sent?.name !== "createStandalonePaymentRequest") out.push("does not call the createStandalonePaymentRequest callable once");
  const keys = Object.keys(sent?.data ?? {}).sort().join(",");
  if (keys !== "amountMinor,clientRequestId,collectAddress,collectPhone,companyId,customerEmail,customerName,title") out.push(`payload fields are ${keys}`);
  if (sent?.data?.title !== "Cake topper" || sent?.data?.customerName !== "Ada" || sent?.data?.customerEmail !== "ada@example.com") out.push("typed text is not trimmed");
  if (sent?.data?.amountMinor !== 4500 || sent?.data?.clientRequestId !== "abcDEF12345" || sent?.data?.collectPhone !== true || sent?.data?.collectAddress !== true) out.push("payload values changed on the way");
  if (made.ok !== true || (made.request as { paymentRequestId?: string } | null)?.paymentRequestId !== "pr9") out.push("the answer is not passed back");
  before = stub.calls.length;
  await lib.createStandalonePaymentRequest({ companyId: "ws1", title: "Deposit", amountMinor: 100, customerName: "  ", customerEmail: "",
    collectPhone: "yes", collectAddress: 1, clientRequestId: "abcDEF12346" });
  sent = stub.calls[before];
  const bare = Object.keys(sent?.data ?? {}).sort().join(",");
  if (bare !== "amountMinor,clientRequestId,collectAddress,collectPhone,companyId,title") out.push(`an empty name or email is still sent (${bare})`);
  if (sent?.data?.collectPhone !== false || sent?.data?.collectAddress !== false) out.push("collectPhone / collectAddress are not strictly true");
  stub.setAnswer({});
  const empty = await lib.createStandalonePaymentRequest({ ...full });
  if (empty.ok !== false || empty.request !== null) out.push("an empty answer is not read as not ok");

  // planAllowed: a boolean from the connection summary (or beside it), anything else is "not said" (null).
  const planOf = async (answer: unknown) => { stub.setAnswer(answer); return (await lib.getStripeConnection("ws-plan")).planAllowed; };
  if (await planOf({ ok: true, configured: true, connection: { status: "ready", planAllowed: false } }) !== false) out.push("connection.planAllowed false is not read");
  if (await planOf({ ok: true, configured: true, connection: { status: "ready" }, planAllowed: true }) !== true) out.push("a top-level planAllowed true is not read");
  if (await planOf({ ok: true, configured: true, connection: { status: "ready" } }) !== null) out.push("an older server (no planAllowed) is not read as null");
  if (await planOf({ ok: true, configured: true, connection: { status: "ready", planAllowed: "false" } }) !== null) out.push("a planAllowed that is not a boolean is believed");

  // One read answers the pilot gate and the plan; a failure is not remembered and says nothing about the plan.
  stub.setAnswer({ ok: true, configured: true, connection: { status: "ready", planAllowed: false } });
  before = stub.calls.length;
  const access = await lib.paymentLinksAccess("ws-free");
  const again = await lib.paymentLinksAvailable("ws-free");
  if (access.available !== true || access.planAllowed !== false || again !== true) out.push("the shared read does not carry available + planAllowed");
  if (stub.calls.length !== before + 1) out.push(`the pilot gate and the plan are ${stub.calls.length - before} reads, not one`);
  stub.setAnswer(callableError("unavailable"));
  const failed = await lib.paymentLinksAccess("ws-flaky");
  if (failed.available !== false || failed.planAllowed !== null) out.push("a failed read is not { available: false, planAllowed: null }");
  stub.setAnswer({ ok: true, configured: true, connection: { status: "ready", planAllowed: true } });
  if ((await lib.paymentLinksAccess("ws-flaky")).planAllowed !== true) out.push("a failed read is remembered");

  // Refusals.
  const plan = lib.paymentLinkRefusal(callableError("failed-precondition", { reason: "stripe_plan_required" }, "Stripe needs a paid plan"));
  if (plan.reason !== "stripe_plan_required" || !plan.definite || !/paid plans/.test(plan.text) || plan.text === "Stripe needs a paid plan") out.push("stripe_plan_required does not have its own sentence");
  if (lib.orderLinkRefusalText(callableError("failed-precondition", { reason: "stripe_plan_required" }, "raw")) !== plan.text) out.push("the order forms do not say the plan sentence");
  if (lib.orderLinkRefusalText(callableError("failed-precondition", undefined, "Another payment link is already open for this order. Cancel it, or ask for less.")) !== "Another payment link is already open for this order. Cancel it, or ask for less.") out.push("the order forms lost the server's own sentence");
  if (lib.orderLinkRefusalText(Object.assign(new Error(""), { code: "functions/internal" })) !== "That payment link cannot be created.") out.push("the order forms lost their fallback");
  const lost = lib.paymentLinkRefusal(callableError("unavailable"));
  if (lost.definite || lost.reason !== "" || !/not be made twice/.test(lost.text)) out.push("a lost answer is called definite, or not said to be safe to retry");
  if (lib.paymentLinkRefusal(callableError("internal")).definite) out.push("internal is called definite");
  const retry = lib.paymentLinkRefusal(callableError("failed-precondition", { reason: "provider_error", retry: true }));
  if (retry.definite || retry.retry !== true) out.push("details.retry does not keep the id");
  const said = lib.paymentLinkRefusal(callableError("invalid-argument", undefined, "That is more than this order still owes."));
  if (!said.definite || said.text !== "That is more than this order still owes.") out.push("the server's own sentence is not shown, or not definite");
  if (lib.paymentLinkRefusal(callableError("invalid-argument", undefined, "invalid-argument")).text !== "That payment link cannot be created.") out.push("a bare code is shown as a sentence");
  if (!lib.paymentLinkRefusal(callableError("permission-denied")).definite || !/workspace access/.test(lib.paymentLinkRefusal(callableError("permission-denied")).text)) out.push("permission-denied is not its own definite sentence");
  const texts = [plan.text, lost.text, lib.paymentLinkRefusal(callableError("permission-denied")).text, lib.paymentLinkRefusal(callableError("resource-exhausted")).text];
  if (new Set(texts).size !== texts.length) out.push("two refusals share a sentence");

  // The form's own checks, before anything is sent.
  if (!lib.standaloneFormProblem({ title: "   ", customerEmail: "" })) out.push("an empty title is accepted");
  if (!lib.standaloneFormProblem({ title: "x".repeat(121), customerEmail: "" })) out.push("a title over 120 is accepted");
  if (lib.standaloneFormProblem({ title: "x".repeat(120), customerEmail: "" })) out.push("a 120-character title is refused");
  if (!lib.standaloneFormProblem({ title: "Topper", customerEmail: "ada@example" })) out.push("an email without a domain is accepted");
  if (lib.standaloneFormProblem({ title: "Topper", customerEmail: " ada@example.com " }) || lib.standaloneFormProblem({ title: "Topper", customerEmail: "" })) out.push("a good or empty email is refused");

  // Rows: only an exact "standalone" is order-less; the order is named by number when the row carries one.
  if (!lib.isStandaloneRow({ kind: "standalone" }) || lib.isStandaloneRow({ kind: "order" }) || lib.isStandaloneRow({}) || lib.isStandaloneRow(null)) out.push("isStandaloneRow is not exact");
  if (lib.orderReferenceOfRow({ projectNumber: 1042 }) !== "#1042" || lib.orderReferenceOfRow({ orderReference: " #77 " }) !== "#77"
    || lib.orderReferenceOfRow({ projectNumber: -3 }) !== "" || lib.orderReferenceOfRow({}) !== "") out.push("the order reference is not read as #N / the server's reference / nothing");

  // The id: the server's pattern, and a new one each time.
  const ids = [lib.newClientRequestId(), lib.newClientRequestId()];
  if (!ids.every((id) => /^[A-Za-z0-9_-]{8,64}$/.test(id)) || ids[0] === ids[1]) out.push(`ids ${ids.join(" ")} do not fit ^[A-Za-z0-9_-]{8,64}$ or repeat`);
  return out;
}

const clientMutants: Array<[string, string]> = [
  ["the id is not sent", libSource.replace("    clientRequestId: input.clientRequestId,\n  })).data;", "  })).data;")],
  ["an empty email is sent", libSource.replace("...(customerEmail ? { customerEmail } : {}),", "customerEmail,")],
  ["the client picks a currency", libSource.replace("    collectAddress: input.collectAddress === true,\n", "    collectAddress: input.collectAddress === true,\n    currency: \"GBP\",\n")],
  ["a truthy collectPhone is sent as is", libSource.replace("collectPhone: input.collectPhone === true,", "collectPhone: Boolean(input.collectPhone),")],
  ["planAllowed believed when not a boolean", libSource.replace('planAllowed: typeof plan === "boolean" ? plan : null,', "planAllowed: plan == null ? null : Boolean(plan),")],
  ["the plan is a second read", libSource.replace("export function paymentLinksAvailable(companyId: string): Promise<boolean> {\n  return paymentLinksAccess(companyId).then((answer) => answer.available);", "export function paymentLinksAvailable(companyId: string): Promise<boolean> {\n  return getStripeConnection(companyId).then((view) => view.configured === true).catch(() => false);")],
  ["the plan refusal shows the raw message", libSource.replace('if (reason === "stripe_plan_required") return', 'if (reason === "stripe_plan_required_x") return')],
  ["a lost answer is definite", libSource.replace('definite: !retry && (reason !== "" || ANSWERED_CODES.test(code)),', "definite: !retry,")],
  ["retry ignored", libSource.replace('definite: !retry && (reason !== ""', 'definite: (reason !== ""')],
  ["an email typo passes", libSource.replace("if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))", "if (false)")],
  ["the same id every time", libSource.replace("export function newClientRequestId(): string {\n  return newClientRefundId();", 'export function newClientRequestId(): string {\n  return "sameid1234";')],
];
for (const [name, mutant] of clientMutants) {
  const problems = mutant === libSource ? [] : await clientProblems(mutant);
  expect(`client rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const clientReal = await clientProblems(libSource);
expect("the client meets the contract", clientReal.length === 0, clientReal.join("; "));
expect("the new summary fields are optional (an older server sends none)",
  /kind\?: "order" \| "standalone";/.test(libSource) && /title\?: string;/.test(libSource) && /planAllowed: boolean \| null;/.test(libSource)
  && /kind\?: "order" \| "standalone";/.test(panelSource) && /title\?: string;/.test(panelSource) && /title\?: string;/.test(payLinkLib));
expect("the order-less block sits above the refunds block (check-refund-ui reads every sentence below its marker)",
  libSource.indexOf("// ---- Order-less payment links") > 0 && libSource.indexOf("// ---- Order-less payment links") < libSource.indexOf("// ---- Refunds from NivaDesk"));
expect("the lib imports nothing from components (check-payment-links-pilot compiles it alone)", !/from "@\/components/.test(libSource));
expect("the plan hook answers from the same read as the pilot gate",
  /export function usePaymentLinksPlan\(companyId: string\): boolean \| null/.test(hookSource)
  && /void paymentLinksAccess\(id\)\.then\(\(answer\) => \{ if \(active\) setPlan\(answer\.planAllowed\); \}\);/.test(hookSource)
  && /const id = String\(companyId \|\| ""\)\.trim\(\);\s*if \(!id\) return \(\) => \{ active = false; \};\s*void paymentLinksAccess/.test(hookSource));

// ---- 2. Banking's panel, from source ------------------------------------------------------------------------
function panelProblems(panel: string): string[] {
  const out: string[] = [];
  const submit = region(panel, "const createStandalone = async () => {", "/** \"Order #1042\"");
  if (!submit) return ["no order-less submit"];
  const buttons = region(panel, '<section style={{ display: "grid", gap: 14 }}>', "{standaloneNotice ?");
  // The gate: Free (exactly false) first and with no button; the order-less form only on exactly true; otherwise
  // today's single New payment link (the order picker).
  const freeAt = buttons.indexOf("{planAllowed === false ? (");
  const trueAt = buttons.indexOf(") : planAllowed === true ? (");
  const elseAt = buttons.indexOf(") : (", trueAt + 1);
  if (freeAt < 0 || trueAt < freeAt || elseAt < trueAt) out.push("the buttons are not gated false / true / not said");
  const free = freeAt >= 0 && trueAt > freeAt ? buttons.slice(freeAt, trueAt) : "";
  if (/<button/.test(free) || !/t\("Stripe payments are part of the paid plans\."\)/.test(free) || !/href="\/settings\?section=plan-access"/.test(free)) out.push("Free shows a button, or does not say why and where the plans are");
  const onTrue = trueAt >= 0 && elseAt > trueAt ? buttons.slice(trueAt, elseAt) : "";
  if (!/openStandalone\(\)/.test(onTrue) || !/t\("New payment link"\)/.test(onTrue) || !/t\("Link for an order"\)/.test(onTrue)) out.push("on a paid plan there is no order-less New payment link beside the order one");
  const notSaid = elseAt > 0 ? buttons.slice(elseAt) : "";
  if (/openStandalone|Link for an order/.test(notSaid) || !/setCreateOpen\(\(open\) => !open\); setCreateError\(""\);/.test(notSaid) || !/t\("New payment link"\)/.test(notSaid)) out.push("an older server does not get today's button");
  if ((panel.match(/openStandalone\(\)/g) || []).length !== 1) out.push("the order-less form opens from somewhere else");
  if (!/\{standaloneOpen && planAllowed === true \? \(/.test(panel)) out.push("the order-less form is not bound to planAllowed === true");
  if (!/\{createOpen && planAllowed !== false \? \(/.test(panel)) out.push("the order picker still opens on Free");
  if (!/const planAllowed = usePaymentLinksPlan\(companyId\);/.test(panel)) out.push("the panel does not ask the plan");
  // The form.
  const form = region(panel, '<div\n          id="standalone-link-form"', ") : null}\n\n      {createOpen");
  if (!form) return [...out, "no order-less form"];
  for (const label of ["What is this payment for?", "Customer name (optional)", "Customer email (optional)"]) {
    if (!new RegExp(`<label[^>]*>\\s*\\{t\\(${JSON.stringify(label).replace(/[?()]/g, "\\$&")}\\)\\}\\s*<input`).test(form)) out.push(`no labelled field: ${label}`);
  }
  if (!/<label[^>]*>\s*\{standaloneCurrency \? `\$\{t\("Amount"\)\} \(\$\{standaloneCurrency\}\)` : t\("Amount"\)\}\s*<input\s[^<]*?inputMode="decimal"[^<]*?\/>\s*<\/label>/.test(form)) out.push("the amount is not a labelled decimal field naming its currency");
  if (!/<input type="checkbox" checked=\{standalonePhone\}[^<]*?\/>\s*\{t\("Ask for phone number"\)\}\s*<\/label>/.test(form)) out.push("no Ask for phone number");
  if (!/<input type="checkbox" checked=\{standaloneAddress\}[^<]*?\/>\s*\{t\("Ask for delivery address"\)\}\s*<\/label>/.test(form)) out.push("no Ask for delivery address");
  if (!/maxLength=\{STANDALONE_TITLE_MAX\}/.test(form)) out.push("the title is not capped at the server's limit");
  if (!/role="dialog"/.test(form) || !/aria-labelledby="standalone-link-form-title"/.test(form) || !/aria-describedby="standalone-link-form-note"/.test(form)) out.push("the form is not a labelled dialog");
  if (!/onKeyDown=\{\(e\) => \{ if \(e\.key === "Escape"\) \{ e\.stopPropagation\(\); closeStandalone\(\); \} \}\}/.test(form)) out.push("Escape does not close the form");
  if (!/ref=\{standaloneFieldRef\}/.test(form) || !/if \(standaloneOpen\) standaloneFieldRef\.current\?\.focus\(\);/.test(panel)) out.push("focus does not move into the form");
  if ((form.match(/disabled=\{standaloneBusy/g) || []).length < 7) out.push("the fields and buttons are not all disabled while creating");
  if (!/disabled=\{standaloneBusy \|\| standaloneCurrency === null\}/.test(form)) out.push("Create can be pressed before the currency is known");
  if (!/const closeStandalone = \(\) => \{\s*if \(standaloneBusy\) return;/.test(panel)) out.push("the form closes while creating");
  // The amount: the currency read first, then the comma reading the order form uses.
  if (!/const codes = workspaceCurrencyCodes\(\{ selectedCurrency: overview\.selectedCurrency \}\);\s*if \(active\) setStandaloneCurrency\(codes\.length === 1 \? codes\[0\] : ""\);/.test(panel)) out.push("the workspace currency is not read, or a symbol with several codes is guessed");
  const problemAt = submit.indexOf("const problem = standaloneFormProblem(");
  const parseAt = submit.indexOf('const parsed = parseRequestAmount(standaloneAmount, standaloneCurrency ?? "", locale);');
  const callAt = submit.indexOf("await createStandalonePaymentRequest(");
  if (problemAt < 0 || parseAt < problemAt || callAt < parseAt) out.push("the form's checks and the amount reading do not come before the call");
  if (!/if \(!parsed\.ok\) \{ setStandaloneError\(t\(requestAmountMessage\(parsed\.reason\)\)\); return; \}/.test(submit)) out.push("a refused amount does not say why");
  // The id: kept while the same submit is retried, new for a different one, dropped after success or a definite no.
  if (!/const attempt: StandaloneAttempt = previous && sameStandaloneSubmit\(previous, submit\)\s*\? previous\s*: \{ \.\.\.submit, clientRequestId: newClientRequestId\(\) \};/.test(submit)) out.push("the id is not kept for a retried submit");
  const same = region(panel, "function sameStandaloneSubmit(", "\n}\n");
  for (const field of ["title", "amountMinor", "customerName", "customerEmail", "collectPhone", "collectAddress"]) {
    if (!new RegExp(`a\\.${field} === b\\.${field}`).test(same)) out.push(`a changed ${field} keeps the old id`);
  }
  if ((panel.match(/newClientRequestId\(\)/g) || []).length !== 1) out.push("ids are made in more than one place");
  const catchPart = region(submit, "} catch (e) {", "} finally {");
  if (!/const refusal = paymentLinkRefusal\(e\);[\s\S]*if \(refusal\.definite\) standaloneAttempt\.current = null;/.test(catchPart)) out.push("a definite refusal does not start a new id");
  if ((submit.match(/standaloneAttempt\.current = null;/g) || []).length !== 2) out.push("the id is dropped somewhere other than after success or a definite no");
  const okClear = submit.indexOf("standaloneAttempt.current = null;");
  if (okClear < callAt || okClear > submit.indexOf("} catch (e) {")) out.push("the id is dropped before the link is confirmed");
  if (!/if \(!result\.ok\) throw/.test(submit)) out.push("an empty answer counts as created");
  if (/\.message/.test(catchPart) || !/setStandaloneError\(t\(refusal\.text\)\);/.test(catchPart)) out.push("a refusal is not read through paymentLinkRefusal");
  for (const field of ["title", "amountMinor", "customerName", "customerEmail", "collectPhone", "collectAddress", "clientRequestId"]) {
    if (!new RegExp(`${field}: attempt\\.${field},`).test(submit)) out.push(`the call does not send the attempt's ${field}`);
  }
  if (!/await load\(\);\s*\} catch \(e\) \{/.test(submit)) out.push("the list is not read again after a new link");
  // The list: the title, and the order once the paid link has opened one.
  const cell = region(panel, "{isStandaloneRow(row) ? (", ") : onOpenOrder ? (");
  if (!/\{row\.title \|\| t\("Payment"\)\}/.test(cell)) out.push("a standalone row does not show its title");
  if (!/\{row\.orderId \? \(\s*onOpenOrder \? \(\s*<button type="button" onClick=\{\(\) => onOpenOrder\(row\.orderId\)\}/.test(cell)) out.push("a paid standalone row does not link to its order");
  if (!/return reference \? t\("Order \{reference\}"\)\.replace\("\{reference\}", reference\) : t\("Open order"\);/.test(panel)) out.push("the order is not named Order #N");
  // Refunds are made from this panel since 31 Oct 2026, but by components/RefundPaymentDialog.tsx (check-refund-ui
  // pins it and which rows offer it): the panel itself never calls the refund or makes a refund id.
  if (/refundOrderPayment|clientRefundId|newClientRefundId/.test(panel)) out.push("the panel makes a refund itself instead of through RefundPaymentDialog");
  return out;
}

const panelMutants: Array<[string, string]> = [
  ["the order-less form on a server that did not say", panelSource.replace(") : planAllowed === true ? (", ") : planAllowed !== false ? (")],
  ["Free keeps a button", panelSource.replace('{t("Stripe payments are part of the paid plans.")}{" "}', '{t("Stripe payments are part of the paid plans.")}{" "}<button type="button">x</button>')],
  ["the order picker opens on Free", panelSource.replace("{createOpen && planAllowed !== false ? (", "{createOpen ? (")],
  ["no phone option", panelSource.replace('{t("Ask for phone number")}', "")],
  ["the amount loses its comma reading", panelSource.replace('const parsed = parseRequestAmount(standaloneAmount, standaloneCurrency ?? "", locale);', "const parsed = { ok: true as const, amountMinor: Math.round(Number(standaloneAmount) * 100) };")],
  ["a symbol with several codes is guessed", panelSource.replace('setStandaloneCurrency(codes.length === 1 ? codes[0] : "")', 'setStandaloneCurrency(codes[0] ?? "")')],
  ["a new id on every submit", panelSource.replace("previous && sameStandaloneSubmit(previous, submit)\n      ? previous", "previous && sameStandaloneSubmit(previous, submit) && false\n      ? previous")],
  ["a changed amount keeps the id", panelSource.replace(" && a.amountMinor === b.amountMinor", "")],
  ["a definite refusal keeps the id", panelSource.replace("      if (refusal.definite) standaloneAttempt.current = null;\n", "")],
  ["the id dropped on any failure", panelSource.replace("      const refusal = paymentLinkRefusal(e);\n", "      standaloneAttempt.current = null;\n      const refusal = paymentLinkRefusal(e);\n")],
  ["the call sends the typed title, not the attempt's", panelSource.replace("        title: attempt.title,\n", "        title: standaloneTitle,\n")],
  ["the raw message shown", panelSource.replace("setStandaloneError(t(refusal.text));", "setStandaloneError((e as Error).message || t(refusal.text));")],
  ["Escape ignored", panelSource.replace('onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeStandalone(); } }}', "")],
  ["Create before the currency is read", panelSource.replace("disabled={standaloneBusy || standaloneCurrency === null}", "disabled={standaloneBusy}")],
  ["no order link once paid", panelSource.replace("onClick={() => onOpenOrder(row.orderId)}\n                                style", "onClick={() => undefined}\n                                style")],
];
for (const [name, mutant] of panelMutants) {
  const problems = mutant === panelSource ? [] : panelProblems(mutant);
  expect(`panel rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const panelReal = panelProblems(panelSource);
expect("Banking's panel meets the contract", panelReal.length === 0, panelReal.join("; "));

// ---- 3. the order card, Settings, /p/<code>, /integrations ---------------------------------------------------
function cardProblems(card: string): string[] {
  const out: string[] = [];
  if (!/const planAllowed = usePaymentLinksPlan\(companyId\);/.test(card)) out.push("the card does not ask the plan");
  if (!/\{canCreate && planAllowed !== false && state\.headroomMinor > 0 \? \(/.test(card)) out.push("New payment link is not hidden on Free");
  if (!/setCreateError\(t\(orderLinkRefusalText\(e\)\)\);/.test(card)) out.push("the plan refusal is not said in its own sentence");
  if (!/\{busy === row\.paymentRequestId \? t\("Cancelling…"\) : t\("Cancel"\)\}/.test(card) || !/row\.canRefund === true/.test(card)) out.push("cancel, or the line pointing to Banking's refund, was taken away (the server allows both on Free)");
  return out;
}
const cardMutants: Array<[string, string]> = [
  ["New payment link on Free", cardSource.replace("{canCreate && planAllowed !== false && state.headroomMinor > 0 ? (", "{canCreate && state.headroomMinor > 0 ? (")],
  ["the raw plan refusal", cardSource.replace("setCreateError(t(orderLinkRefusalText(e)));", "setCreateError(t((e as Error).message));")],
];
for (const [name, mutant] of cardMutants) {
  const problems = mutant === cardSource ? [] : cardProblems(mutant);
  expect(`card rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const cardReal = cardProblems(cardSource);
expect("the order card meets the contract", cardReal.length === 0, cardReal.join("; "));

function settingsProblems(screen: string): string[] {
  const out: string[] = [];
  if (!/setPlanAllowed\(view\.planAllowed\);/.test(screen)) out.push("Settings does not read the plan");
  const block = region(screen, "{planAllowed === false ? (", '<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>');
  if (!/t\("Stripe payments are part of the paid plans\."\)/.test(block) || !/<a className="button secondary" href="\/settings\?section=plan-access">\{t\("See plans"\)\}<\/a>/.test(block)) out.push("Free does not say paid plans with a link to the plan page");
  if (!/\{planAllowed === false \? null : \(<>\s*\{status === "disconnected" \|\| status === "onboarding" \|\| status === "restricted" \? \(/.test(screen)) out.push("Connect / Continue is still offered on Free");
  if (!/\{pickingCountry && status === "disconnected" && planAllowed !== false \? \(/.test(screen)) out.push("the country picker still opens on Free");
  if (!/onClick=\{\(\) => setConfirmDisconnect\(true\)\}/.test(screen)) out.push("Disconnect was taken away (the server allows it on Free)");
  return out;
}
const settingsMutants: Array<[string, string]> = [
  ["Connect on Free", settingsSource.replace("{planAllowed === false ? null : (<>", "{(<>")],
  ["no plan link", settingsSource.replace('<a className="button secondary" href="/settings?section=plan-access">{t("See plans")}</a>', "")],
  ["the picker on Free", settingsSource.replace('{pickingCountry && status === "disconnected" && planAllowed !== false ? (', '{pickingCountry && status === "disconnected" ? (')],
];
for (const [name, mutant] of settingsMutants) {
  const problems = mutant === settingsSource ? [] : settingsProblems(mutant);
  expect(`settings rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const settingsReal = settingsProblems(settingsSource);
expect("Settings ▸ Stripe meets the contract", settingsReal.length === 0, settingsReal.join("; "));
expect("check-stripe-resume's pinned Connect line is unchanged",
  /\{status === "disconnected" \|\| status === "onboarding" \|\| status === "restricted" \? \(/.test(settingsSource));
expect("the plan page the links point at exists in Settings", /id: "plan-access"/.test(read("app/settings/page.tsx")));

function payPageProblems(content: string): string[] {
  const out: string[] = [];
  const open = region(content, 'status === "open" && view ? (', "<div className={styles.amountBox}>");
  if (!/\{view\.reference \? \(\s*<p className=\{styles\.muted\}>\{copy\.forOrder\.replace\("\{reference\}", view\.reference\)\}<\/p>\s*\) : typeof view\.title === "string" && view\.title\.trim\(\) \? \(\s*<p className=\{styles\.muted\} data-pay-title>\{view\.title\.trim\(\)\}<\/p>\s*\) : null\}/.test(open)) out.push("the title is not shown exactly when there is no order reference");
  // One render path: the neutral card and the themed (product) page draw the same section, so the title is in both.
  if ((content.match(/copy\.forOrder/g) || []).length !== 1 || (content.match(/view\.title/g) || []).length !== 3) out.push("the open state is drawn in more than one place");
  if (!/<section className=\{productLayout \? styles\.details : styles\.card\}>/.test(content)) out.push("the themed and neutral layouts no longer share the section");
  if (/dangerouslySetInnerHTML/.test(content)) out.push("the page renders HTML it was sent");
  return out;
}
const payMutants: Array<[string, string]> = [
  ["no title", payPageSource.replace('<p className={styles.muted} data-pay-title>{view.title.trim()}</p>', "null")],
  ["the title over the reference", payPageSource.replace("{view.reference ? (", "{view.reference && !view.title ? (")],
];
for (const [name, mutant] of payMutants) {
  const problems = mutant === payPageSource ? [] : payPageProblems(mutant);
  expect(`/p/ rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const payReal = payPageProblems(payPageSource);
expect("/p/<code> shows the title when the link has no order reference", payReal.length === 0, payReal.join("; "));

// The public /integrations card: one short clause naming the paid plans, in every language.
const { PUBLIC_SITE_TRANSLATIONS } = await import(pathToFileURL(path.join(webRoot, "lib/publicSite/translations.ts")).href) as { PUBLIC_SITE_TRANSLATIONS: Record<string, Record<string, string>> };
const PAID_WORDS: Record<string, RegExp> = {
  English: /paid plans/, "Türkçe": /Ücretli planlarda/, Deutsch: /bezahlten Plänen/, "Français": /plans payants/, Italiano: /piani a pagamento/,
  "Español (Spanish)": /planes de pago/, "Português": /planos pagos/, "Русский (Russian)": /платных тарифах/, "日本語 (Japanese)": /有料プラン/,
  "中文 (Chinese)": /付费套餐/, "العربية (Arabic)": /الخطط المدفوعة/, "हिन्दी (Hindi)": /पेड प्लान/,
};
const noteLangs = Object.keys(PUBLIC_SITE_TRANSLATIONS);
expect("the public site has twelve languages", noteLangs.length === 12, noteLangs.join(","));
for (const lang of noteLangs) {
  const note = String(PUBLIC_SITE_TRANSLATIONS[lang]?.["integrations.note.stripe"] ?? "");
  expect(`/integrations Stripe note names the paid plans: ${lang}`, !!PAID_WORDS[lang] && PAID_WORDS[lang].test(note), note.slice(0, 80));
}

// ---- 4. the sentences ---------------------------------------------------------------------------------------
const libBlock = region(libSource, "// ---- Order-less payment links", "// ---- Refunds from NivaDesk");
const libKeys = [...libBlock.matchAll(/return "([^"]+)"/g)].map((m) => m[1]);
const panelText = region(panelSource, "// ---- Order-less links (SL-24", "const cancel = async")
  + region(panelSource, '<section style={{ display: "grid", gap: 14 }}>', "{createOpen && planAllowed !== false ? (")
  + region(panelSource, "{isStandaloneRow(row) ? (", ") : onOpenOrder ? (");
const settingsText = region(settingsSource, "{planAllowed === false ? (", "<div style={{ display: \"flex\", gap: 8, flexWrap: \"wrap\", marginTop: 8 }}>");
const screenKeys = [...(panelText + settingsText).matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]);
const keys = [...new Set([...libKeys, ...screenKeys])];
expect("the new sentences were found (lib + panel + Settings)", libKeys.length >= 8 && screenKeys.length >= 20, `${libKeys.length} + ${screenKeys.length}`);
const REUSED = new Set(["New payment link", "Amount", "Create link", "Creating…", "Close", "Open order", "See plans", "Payment",
  "Sign in again to see payment links.", "That payment link cannot be created."]);
const tableFiles = readdirSync(path.join(webRoot, "lib/studioflow")).filter((f) => /\.ts$/.test(f)).map((f) => read(`lib/studioflow/${f}`)).join("\n");
const lines = languageSource.split("\n");
const rowOf = (source: string[], key: string): Record<string, string> | null => {
  const head = `  ${JSON.stringify(key)}: `;
  const line = source.find((l) => l.startsWith(`${head}{`));
  if (!line) return null;
  try { return JSON.parse(line.slice(head.length).replace(/,\s*$/, "")); } catch { return null; }
};
const newKeys = keys.filter((key) => !REUSED.has(key));
for (const key of keys) {
  if (REUSED.has(key)) {
    expect(`reused word has a row already: ${key}`, tableFiles.includes(`${JSON.stringify(key)}:`));
    continue;
  }
  const row = rowOf(lines, key);
  const missing = row ? LANGS.filter((lang) => !String(row[lang] ?? "").trim()) : LANGS;
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) || []).sort().join(",");
  const lost = row ? LANGS.filter((lang) => placeholders(row[lang] ?? "") !== placeholders(key)) : [];
  const english = row ? LANGS.filter((lang) => row[lang] === key) : [];
  expect(`twelve languages: ${key.slice(0, 60)}`, !!row && missing.length === 0 && lost.length === 0 && english.length === 0,
    !row ? "no row" : [missing.length ? `missing ${missing.join("/")}` : "", lost.length ? `placeholder lost in ${lost.join("/")}` : "", english.length ? `English in ${english.join("/")}` : ""].filter(Boolean).join("; "));
}

// Where the block lives: one block, right after the refund block, never at the end of the file.
function placementProblems(source: string): string[] {
  const out: string[] = [];
  const at = source.split("\n");
  const index = (key: string) => at.findIndex((l) => l.startsWith(`  ${JSON.stringify(key)}: {`));
  const refundEnd = at.findIndex((l) => l.startsWith('  "The refund could not be confirmed. Try again; it will not be made twice.": {'));
  const positions = newKeys.map(index);
  if (positions.some((p) => p < 0)) return ["a new key has no row"];
  for (const key of newKeys) if (at.filter((l) => l.startsWith(`  ${JSON.stringify(key)}: {`)).length !== 1) out.push(`${key} has more than one row`);
  const first = Math.min(...positions);
  const last = Math.max(...positions);
  if (refundEnd < 0 || first < refundEnd) out.push("the block is not after the refund block");
  // The refund block closes, then this block opens (its comment and mergeIntoTranslations), with nothing else between.
  const between = at.slice(refundEnd + 1, first);
  if (between.length > 10 || !/^\} as Record<string, Partial<Record<StudioLanguage, string>>>\);$/.test(between[0] ?? "") || !/^mergeIntoTranslations\(\{$/.test(between[between.length - 1] ?? "")) out.push("the block does not follow the refund block directly");
  if (last - first !== newKeys.length - 1) out.push("the new keys are not one block");
  // Never at the end: the file goes on with other tables, and the last merge call in the file is not this block.
  const tail = at.slice(last + 1).join("\n");
  if (!/^\} as Record<string, Partial<Record<StudioLanguage, string>>>\);$/.test(at[last + 1] ?? "")) out.push("the block is not closed right after its last key");
  if ((tail.match(/mergeIntoTranslations\(/g) || []).length < 5 || at.length - last < 200) out.push("the block is at the end of language.ts");
  return out;
}
const blockStart = lines.findIndex((l) => l.startsWith("// Order-less payment links and the Free plan gate"));
const blockEnd = lines.findIndex((l, i) => i > blockStart && l.startsWith("} as Record<string, Partial<Record<StudioLanguage, string>>>);"));
const movedToEnd = blockStart > 0 && blockEnd > blockStart
  ? [...lines.slice(0, blockStart), ...lines.slice(blockEnd + 1), ...lines.slice(blockStart, blockEnd + 1)].join("\n")
  : languageSource;
const placementMutants: Array<[string, string]> = [
  ["the block moved to the end of the file", movedToEnd],
  ["one key appended at the end", languageSource.replace(/\n$/, "") + `\nmergeIntoTranslations({\n  ${JSON.stringify(newKeys[0])}: { "Türkçe": "x" },\n});\n`],
];
for (const [name, mutant] of placementMutants) {
  const problems = mutant === languageSource ? [] : placementProblems(mutant);
  expect(`placement rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const placementReal = placementProblems(languageSource);
expect("the new sentences are one block right after the refund block, not at the end of language.ts", placementReal.length === 0, placementReal.join("; "));

rmSync(outDir, { recursive: true, force: true });
// 31 Oct 2026, the £1 live test: Banking's "Order #96" pushed /orders?order=… while the Orders page reads ?orderId=
// (or ?selectedOrderId=), so it selected the first order of the list instead. Every "open this order" link uses ?orderId=.
{
  const ordersPage = read("app/orders/page.tsx");
  const wrong = ["app/bank/page.tsx", "app/inventory/ItemDetailPanel.tsx"].filter((file) => /\/orders\?order=/.test(read(file)));
  expect("open-order links use the Orders page's ?orderId=",
    /searchParams\.get\("orderId"\)/.test(ordersPage) && wrong.length === 0
      && /\/orders\?orderId=\$\{encodeURIComponent\(orderId\)\}/.test(read("app/bank/page.tsx")),
    wrong.join(", "));
}
console.log(failures ? `${failures} of ${checks} standalone-ui checks FAILED` : `All ${checks} standalone-ui checks passed.`);
process.exit(failures ? 1 : 0);
