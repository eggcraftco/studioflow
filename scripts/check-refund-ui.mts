// Refunds from NivaDesk, the web half (STRIPE-LINKS SL-21/SL-22, 30 Oct 2026; moved to Banking 31 Oct 2026).
//   npm run test:refund-ui
//
// Contract: the callable `refundOrderPayment` takes { companyId, orderId, paymentRequestId, amountMinor,
// reason, clientRefundId } and refuses with `details.reason`; each request row may carry refundableMinor,
// refundPendingMinor and canRefund — all three optional, because an older server sends none of them.
//
//   1. the client (lib/studioflow/stripeConnect.ts), loaded from source with the callable stubbed: the exact
//      payload, one sentence per details.reason, the max from details.refundableMinor, Stripe's statuses, the id
//   2. the refund form (components/RefundPaymentDialog.tsx), read from source: the amount read like the New
//      payment link form and capped at refundableMinor before the call; the id kept for a retried submit and new
//      after a definite refusal (details.retry); busy, focus, Escape; the screen told after a refund and after a
//      refusal; and the guard added on 31 Oct 2026 — the last button stays disabled until a box naming the typed
//      amount is ticked, and any change to the amount unticks it
//   3. the order card (components/OrderPaymentLinks.tsx) makes no refund any more (31 Oct 2026, the owner: a
//      Refund button among the order's buttons could be pressed by mistake): on a settled row whose server said
//      canRefund === true it says where refunds are made, Banking ▸ Payment Links (/bank?tab=payment-links, the
//      tab app/bank/page.tsx opens); it still shows refunded and pending amounts and keeps its 15 s refresh
//   4. Banking's Payment Links panel (components/PaymentLinksPanel.tsx): "Refund…" only on a settled row whose
//      server said canRefund === true; it opens the form, keeps the last submit (so closing the form cannot turn
//      a retry into a second refund), cannot be pressed while a refund is on its way, reads the list again after
//      a refund, and keeps reading it while a refund is pending
//   5. every refund sentence in twelve languages, placeholders kept, in the refund block (never at the end of
//      language.ts), and nowhere a promise that the customer is emailed (whether Stripe emails a refund receipt
//      is the business's own Stripe setting)
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

const REASONS = [
  "refund_not_allowed", "refund_not_refundable", "refund_disputed", "refund_multiple_payments", "refund_mode_mismatch",
  "refund_account_changed", "refund_amount_invalid", "refund_amount_too_large", "refund_in_progress", "refund_provider_error",
] as const;
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)",
  "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
// "email" in each of the twelve languages: a refund sentence must not promise the customer a message.
const EMAIL_WORDS = /e-?mail|receipt|notif|e-posta|makbuz|courriel|correo|почт|メール|邮件|البريد|ईमेल/i;

const libSource = read("lib/studioflow/stripeConnect.ts");
const dialogSource = read("components/RefundPaymentDialog.tsx");
const cardSource = read("components/OrderPaymentLinks.tsx");
const panelSource = read("components/PaymentLinksPanel.tsx");
const bankSource = read("app/bank/page.tsx");
const shellSource = read("components/AppShell.tsx");
const languageSource = read("lib/studioflow/language.ts");

// ---- 1. the client, from source ---------------------------------------------------------------------------
type Call = { name: string; data: Record<string, unknown> };
type Stub = { calls: Call[]; setAnswer: (next: unknown) => void };
type Lib = {
  refundOrderPayment: (input: Record<string, unknown>) => Promise<{ ok: boolean; refund: { status: string; amountMinor: number; currency: string }; request: unknown }>;
  refundRefusal: (error: unknown) => { reason: string; text: string; refundableMinor: number | null };
  refundRefusalText: (reason: string, code?: string) => string;
  refundResult: (status: string) => { tone: string; text: string };
  newClientRefundId: () => string;
};
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-refund-ui-"));
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
  // A fresh copy each time (its own module), with the two client imports pointed at the stub.
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
const callableError = (code: string, details?: Record<string, unknown>) =>
  Object.assign(new Error("internal"), { code: `functions/${code}`, ...(details ? { details } : {}) });

/** What the client must do, as a list of what it got wrong (empty = right). */
async function clientProblems(source: string): Promise<string[]> {
  const out: string[] = [];
  let loaded: { lib: Lib; stub: Stub };
  try { loaded = await loadLib(source); } catch (error) { return [`does not load: ${(error as Error).message}`]; }
  const { lib, stub } = loaded;
  for (const fn of ["refundOrderPayment", "refundRefusal", "refundRefusalText", "refundResult", "newClientRefundId"] as const) {
    if (typeof lib[fn] !== "function") out.push(`no ${fn}()`);
  }
  if (out.length) return out;

  // The payload is the contract's six fields and nothing else (no currency: the server uses the request's own).
  const before = stub.calls.length;
  stub.setAnswer({ ok: true, refund: { status: "succeeded", amountMinor: 1250, currency: "gbp" }, request: { paymentRequestId: "pr1", refundableMinor: 0, canRefund: false } });
  const input = { companyId: "ws1", orderId: "o1", paymentRequestId: "pr1", amountMinor: 1250, reason: "duplicate", clientRefundId: "abcDEF12345", currency: "usd", note: "x" };
  const result = await lib.refundOrderPayment(input);
  const sent = stub.calls[before];
  if (stub.calls.length !== before + 1 || sent?.name !== "refundOrderPayment") out.push("does not call the refundOrderPayment callable once");
  const keys = Object.keys(sent?.data ?? {}).sort().join(",");
  if (keys !== "amountMinor,clientRefundId,companyId,orderId,paymentRequestId,reason") out.push(`payload fields are ${keys}`);
  if (sent?.data?.clientRefundId !== "abcDEF12345" || sent?.data?.amountMinor !== 1250 || sent?.data?.reason !== "duplicate") out.push("payload values changed on the way");
  if (result.ok !== true || result.refund.status !== "succeeded" || result.refund.amountMinor !== 1250) out.push("the answer is not passed back");
  stub.setAnswer({});
  const empty = await lib.refundOrderPayment({ ...input });
  if (empty.ok !== false || empty.refund.status !== "" || empty.request !== null) out.push("an empty answer is not read as not ok");

  // One sentence per details.reason, each its own.
  const sentences = REASONS.map((reason) => lib.refundRefusal(callableError("failed-precondition", { reason })).text);
  if (new Set(sentences).size !== REASONS.length) out.push("two refusals share a sentence");
  REASONS.forEach((reason, i) => { if (lib.refundRefusal(callableError("x", { reason })).reason !== reason) out.push(`details.reason ${reason} not read`); if (!sentences[i]) out.push(`${reason} has no sentence`); });
  const tooLarge = lib.refundRefusal(callableError("invalid-argument", { reason: "refund_amount_too_large", refundableMinor: 700 }));
  if (tooLarge.refundableMinor !== 700 || !tooLarge.text.includes("{amount}")) out.push("refund_amount_too_large does not carry the most that can be refunded");
  if (lib.refundRefusal(callableError("invalid-argument", { reason: "refund_amount_too_large", refundableMinor: "lots" })).refundableMinor !== null) out.push("a refundableMinor that is not a number is believed");
  const retryOf = (retry: unknown) => lib.refundRefusal(callableError("unavailable", { reason: "refund_provider_error", retry })).retry;
  if (retryOf(true) !== true || retryOf(undefined) !== false || retryOf("yes") !== false) out.push("details.retry is not read as exactly true");
  if (!/Stripe Dashboard/.test(lib.refundRefusalText("refund_multiple_payments"))) out.push("refund_multiple_payments does not send the owner to the Stripe Dashboard");
  if (!/Stripe Dashboard/.test(lib.refundRefusalText("refund_disputed"))) out.push("refund_disputed does not send the owner to the Stripe Dashboard");
  const lost = lib.refundRefusal(callableError("unavailable"));
  if (lost.reason !== "" || !/not be made twice/.test(lost.text)) out.push("a lost answer is not said to be safe to retry");
  if (lib.refundRefusal(callableError("permission-denied")).text !== lib.refundRefusalText("refund_not_allowed")) out.push("permission-denied without a reason is not the owner-only sentence");
  if (sentences.some((text) => /error|exception|stripe said|code/i.test(text))) out.push("a refusal reads like a raw error");

  // Stripe's statuses: refunded, pending (the balance), and the rest as a problem — never "refunded".
  if (lib.refundResult("succeeded").tone !== "done") out.push("succeeded is not done");
  const pending = lib.refundResult("pending");
  if (pending.tone !== "pending" || !/Stripe balance allows/.test(pending.text)) out.push("pending does not say Stripe finishes it when the balance allows");
  for (const status of ["requires_action", "failed", "canceled", ""]) if (lib.refundResult(status).tone !== "problem") out.push(`${status || "no status"} is not a problem`);

  // The id: the server's pattern, and a new one each time.
  const ids = [lib.newClientRefundId(), lib.newClientRefundId()];
  if (!ids.every((id) => /^[A-Za-z0-9_-]{8,64}$/.test(id)) || ids[0] === ids[1]) out.push(`ids ${ids.join(" ")} do not fit ^[A-Za-z0-9_-]{8,64}$ or repeat`);
  return out;
}

const clientMutants: Array<[string, string]> = [
  ["the id is not sent", libSource.replace("    clientRefundId: input.clientRefundId,\n", "")],
  ["the client picks a currency", libSource.replace("    clientRefundId: input.clientRefundId,\n", "    clientRefundId: input.clientRefundId,\n    currency: \"GBP\",\n")],
  ["multiple payments loses the Dashboard", libSource.replace("This link was paid more than once. Refund it in your Stripe Dashboard.", "This link was paid more than once.")],
  ["two reasons share a sentence", libSource.replace('case "refund_in_progress": return', 'case "refund_in_progress": case "refund_in_progress_x": return "That refund amount is not valid."; //')],
  ["the max is not read", libSource.replace("refundableMinor: details?.refundableMinor != null", "refundableMinor: false")],
  ["pending reads as refunded", libSource.replace('case "pending": return { tone: "pending"', 'case "pending": return { tone: "done"')],
  ["the same id every time", libSource.replace('return source.randomUUID().replace(/-/g, "");', 'return "sameid1234";')],
];
// REFUND_UI_VERBOSE=1 prints why each mutant was caught.
const verbose = (problems: string[]) => { if (process.env.REFUND_UI_VERBOSE) console.log(`       ${problems.join("; ")}`); };
for (const [name, mutant] of clientMutants) {
  const problems = mutant === libSource ? [] : await clientProblems(mutant);
  expect(`client rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const clientReal = await clientProblems(libSource);
expect("the client meets the contract", clientReal.length === 0, clientReal.join("; "));
expect("the summary fields are optional (an older server sends none)",
  /refundableMinor\?: number;/.test(libSource) && /refundPendingMinor\?: number;/.test(libSource) && /canRefund\?: boolean;/.test(libSource));
expect("the lib imports nothing from components (check-payment-links-pilot compiles it alone)", !/from "@\/components/.test(libSource));

// ---- 2. the refund form, from source ----------------------------------------------------------------------
function region(source: string, start: string, end: string) {
  const a = source.indexOf(start);
  const b = a >= 0 ? source.indexOf(end, a + start.length) : -1;
  return a >= 0 && b > a ? source.slice(a, b) : "";
}
const count = (source: string, pattern: RegExp) => (source.match(new RegExp(pattern.source, "g")) || []).length;

function dialogProblems(dialog: string): string[] {
  const out: string[] = [];
  const submit = region(dialog, "const refund = async () => {", "const typed = ");
  const form = region(dialog, 'role="dialog"', "\n  );\n}");
  if (!submit || !form) return ["no refund submit or no form"];
  // The amount: prefilled with refundableMinor, read like the New payment link form, capped before any call.
  if (!/useState\(\(\) => minorToInputText\(row\.refundableMinor \?\? 0, rowCurrency, locale\)\)/.test(dialog)) out.push("the amount is not prefilled with refundableMinor");
  if (!/const parsed = parseRequestAmount\(refundAmount, rowCurrency, locale\);\s*if \(!parsed\.ok\) \{ setRefundError\(t\(requestAmountMessage\(parsed\.reason\)\)\); return; \}/.test(submit)) out.push("the amount is not read like the New payment link form");
  const cap = submit.indexOf("if (parsed.amountMinor > most) {");
  if (!/const most = row\.refundableMinor \?\? 0;/.test(submit) || cap < 0 || cap > submit.indexOf("refundOrderPayment(")) out.push("the amount is not capped at refundableMinor before the call");
  if (!/inputMode="decimal"/.test(region(form, "{t(\"Amount to refund\")}", "</label>"))) out.push("the amount field is not a decimal field");
  // The id: kept while the same submit is retried, new for a different one, dropped only after an answer. It lives
  // with the screen that opens the form (attemptRef), so closing and reopening the form keeps it.
  if (!/previous\s*&& previous\.paymentRequestId === row\.paymentRequestId\s*&& previous\.amountMinor === parsed\.amountMinor\s*&& previous\.reason === refundReason\s*\? previous\s*: \{[^}]*clientRefundId: newClientRefundId\(\) \}/.test(submit)) out.push("the id is not kept for a retried submit");
  if (!/const previous = attemptRef\.current;/.test(submit) || !/attemptRef\.current = attempt;/.test(submit) || /useRef<RefundAttempt/.test(dialog)) out.push("the last submit is not the opener's (attemptRef)");
  // A definite refusal (a reason that is not Stripe failing) starts a new id; Stripe failing or a lost answer keeps it.
  const guarded = /if \(refusal\.reason && !refusal\.retry\) attemptRef\.current = null;/;
  if (!guarded.test(submit)) out.push("a definite refusal does not start a new refund id");
  const unguarded = submit.replace(guarded, "");
  const cleared = unguarded.indexOf("attemptRef.current = null;");
  if (count(unguarded, /attemptRef\.current = null;/) !== 1 || cleared < unguarded.indexOf("await refundOrderPayment(")) out.push("the id is dropped before the refund is answered");
  if (count(dialog, /newClientRefundId\(\)/) !== 1) out.push("ids are made in more than one place");
  const call = region(submit, "await refundOrderPayment({", "});");
  const sent = [...call.matchAll(/^\s*([a-zA-Z]+)(?::|,)/gm)].map((m) => m[1]).sort().join(",");
  if (sent !== "amountMinor,clientRefundId,companyId,orderId,paymentRequestId,reason") out.push(`the call sends ${sent}`);
  for (const field of ["paymentRequestId", "amountMinor", "reason", "clientRefundId"]) {
    if (!new RegExp(`${field}: attempt\\.${field},`).test(call)) out.push(`the call does not send the attempt's ${field}`);
  }
  // Refusals: details.reason through the client, never the raw message; the max from details.
  if (!/const refusal = refundRefusal\(e\);/.test(submit) || /\.message/.test(submit)) out.push("a refusal is not read from details.reason");
  if (!/formatMinor\(refusal\.refundableMinor \?\? most, rowCurrency\)/.test(submit)) out.push("refund_amount_too_large does not show the max");
  // The screen is told: after a refund (it says the outcome and reads its list again), and after a refusal with a reason.
  if (!/attemptRef\.current = null;[\s\S]*await onRefunded\(\{/.test(region(submit, "try {", "} catch (e) {"))) out.push("the screen is not told after a refund");
  if (!/if \(refusal\.reason\) onRowChanged\(\);/.test(submit)) out.push("the list is not read again after a refusal about the row");
  // Busy: nothing to press twice, nothing to edit, no closing while the answer is on its way.
  if (!/setBusy\(true\);[\s\S]*await refundOrderPayment\(/.test(submit) || !/\} finally \{\s*setBusy\(false\);/.test(submit)) out.push("no refunding state around the call");
  if (!/const setBusy = \(busy: boolean\) => \{\s*setRefunding\(busy\);\s*onBusyChange\?\.\(busy\);/.test(dialog)) out.push("the opener is not told the refund is on its way");
  if (count(form, /disabled=\{refunding\}/) < 4) out.push("the form's fields and buttons are not all disabled while refunding");
  if (!/\{refunding\s*\? t\("Refunding…"\)/.test(form)) out.push("no Refunding… label");
  if (!/const closeRefund = \(\) => \{\s*if \(refunding\) return;/.test(dialog)) out.push("the form closes while refunding");
  // Accessible: a labelled dialog, labelled fields, focus moves in, Escape closes.
  if (!/aria-labelledby=\{`\$\{formId\}-title`\}/.test(form) || !/aria-describedby=\{`\$\{formId\}-terms`\}/.test(form)) out.push("the dialog is not labelled and described");
  if (!/<label[^>]*>\s*\{t\("Amount to refund"\)\}\s*<input/.test(form) || !/<label[^>]*>\s*\{t\("Reason"\)\}\s*<select/.test(form)) out.push("the fields are not labelled");
  if (!/useEffect\(\(\) => \{\s*refundFieldRef\.current\?\.focus\(\);/.test(dialog) || !/ref=\{refundFieldRef\}/.test(form)) out.push("focus does not move into the form");
  if (!/onKeyDown=\{\(e\) => \{ if \(e\.key === "Escape"\) \{ e\.stopPropagation\(\); closeRefund\(\); \} \}\}/.test(form)) out.push("Escape does not close the form");
  // The two reasons, the terms, and Stripe's status.
  const options = [...form.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]).join(",");
  if (options !== "requested_by_customer,duplicate") out.push(`reasons offered: ${options}`);
  if (!/t\("A refund cannot be undone\. The money comes from your Stripe balance, and Stripe keeps its processing fee\."\)/.test(form)) out.push("the terms are not stated before the refund");
  if (!/const outcome = refundResult\(result\.refund\.status\);/.test(submit)) out.push("Stripe's status is not what the screen says");
  if (/t\("[^"]*(e-?mail|receipt|notif)[^"]*"\)/i.test(dialog)) out.push("the refund copy promises the customer a message");
  // The guard against a refund by mistake (31 Oct 2026): a box that names the amount as typed, unticked at the
  // start and by every change to the amount, and the last button disabled — and the submit refused — until it is ticked.
  if (!/const \[understood, setUnderstood\] = useState\(false\);/.test(dialog)) out.push("the box does not start unticked");
  if (!/<button\s+type="button"\s+disabled=\{refunding \|\| !understood\}\s+onClick=\{\(\) => void refund\(\)\}/.test(form)) out.push("the Refund button is not disabled until the box is ticked");
  if (!/^\s*if \(!understood\) return;\n/.test(submit.slice("const refund = async () => {".length))) out.push("the submit does not refuse an unticked box first");
  if (!/onChange=\{\(e\) => \{ setRefundAmount\(e\.target\.value\); setUnderstood\(false\); \}\}/.test(form) || count(dialog, /setRefundAmount\(/) !== 1) out.push("a changed amount does not untick the box");
  if (/setUnderstood\(true\)/.test(dialog) || count(dialog, /setUnderstood\(/) !== 2) out.push("the box is ticked by something other than the person");
  const box = region(form, "{typed.ok ? (", ") : (");
  if (!/<input type="checkbox" checked=\{understood\} disabled=\{refunding\} onChange=\{\(e\) => setUnderstood\(e\.target\.checked\)\} \/>\s*\{t\("I understand this sends \{amount\} back to the customer's card\."\)\.replace\("\{amount\}", formatMinor\(typed\.amountMinor, rowCurrency\)\)\}/.test(box)) out.push("the box does not name the amount as typed");
  if (!/const typed = parseRequestAmount\(refundAmount, rowCurrency, locale\);/.test(dialog)) out.push("the box's amount is not the typed amount, read like the submit reads it");
  return out;
}

const dialogMutants: Array<[string, string]> = [
  ["no cap", dialogSource.replace("if (parsed.amountMinor > most) {", "if (false) {")],
  ["the amount loses its comma reading", dialogSource.replace("const parsed = parseRequestAmount(refundAmount, rowCurrency, locale);", "const parsed = { ok: true as const, amountMinor: Math.round(Number(refundAmount) * 100) };")],
  ["a new id on every submit", dialogSource.replace("&& previous.reason === refundReason\n      ? previous", "&& previous.reason === refundReason && false\n      ? previous")],
  ["the id kept in the form, lost when it closes", dialogSource.replace("const refundFieldRef = useRef<HTMLInputElement | null>(null);", "const refundFieldRef = useRef<HTMLInputElement | null>(null);\n  const own = useRef<RefundAttempt | null>(null);").replace("const previous = attemptRef.current;", "const previous = own.current;")],
  ["the id dropped on a failure", dialogSource.replace("      const refusal = refundRefusal(e);\n", "      attemptRef.current = null;\n      const refusal = refundRefusal(e);\n")],
  ["a retryable failure drops the id", dialogSource.replace(" && !refusal.retry) attemptRef", ") attemptRef")],
  ["a definite refusal keeps the id", dialogSource.replace("      if (refusal.reason && !refusal.retry) attemptRef.current = null;\n", "")],
  ["the call sends the typed amount, not the attempt's", dialogSource.replace("        amountMinor: attempt.amountMinor,\n", "        amountMinor: parsed.amountMinor,\n")],
  ["the raw message shown", dialogSource.replace("setRefundError(t(refusal.text)", "setRefundError((e as Error).message || t(refusal.text)")],
  ["the screen not told after a refund", dialogSource.replace("      await onRefunded({", "      void ({")],
  ["no reload after a refusal", dialogSource.replace("      if (refusal.reason) onRowChanged();\n", "")],
  ["the opener not told it is busy", dialogSource.replace("    onBusyChange?.(busy);\n", "")],
  ["closes while refunding", dialogSource.replace("    if (refunding) return; // the answer is on its way", "    // the answer is on its way")],
  ["Escape ignored", dialogSource.replace('if (e.key === "Escape") { e.stopPropagation(); closeRefund(); }', "")],
  ["fraud offered", dialogSource.replace('<option value="duplicate">', '<option value="fraudulent">{t("Fraud")}</option>\n          <option value="duplicate">')],
  ["an email promise", dialogSource.replace('{t("A refund cannot be undone.', '{t("The customer gets an email from Stripe.")} {t("A refund cannot be undone.')],
  ["no fee sentence", dialogSource.replace("and Stripe keeps its processing fee.", "and that is all.")],
  ["checkbox guard removed", dialogSource.replace("disabled={refunding || !understood}", "disabled={refunding}")],
  ["the submit ignores the box", dialogSource.replace("    if (!understood) return;\n", "")],
  ["a changed amount keeps the tick", dialogSource.replace("setRefundAmount(e.target.value); setUnderstood(false);", "setRefundAmount(e.target.value);")],
  ["the box starts ticked", dialogSource.replace("const [understood, setUnderstood] = useState(false);", "const [understood, setUnderstood] = useState(true);")],
  ["the box names the most, not the typed amount", dialogSource.replace('.replace("{amount}", formatMinor(typed.amountMinor, rowCurrency))}\n        </label>', '.replace("{amount}", formatMinor(row.refundableMinor ?? 0, rowCurrency))}\n        </label>')],
  ["no box at all", dialogSource.replace('          <input type="checkbox" checked={understood} disabled={refunding} onChange={(e) => setUnderstood(e.target.checked)} />\n', "")],
];
// REFUND_UI_VERBOSE=1 prints why each mutant was caught.
for (const [name, mutant] of dialogMutants) {
  const problems = mutant === dialogSource ? [] : dialogProblems(mutant);
  expect(`form rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const dialogReal = dialogProblems(dialogSource);
expect("the refund form meets the contract", dialogReal.length === 0, dialogReal.join("; "));

// ---- 3. the order card points to Banking ------------------------------------------------------------------
const REFUND_PLACE = "/bank?tab=payment-links";
function cardProblems(card: string): string[] {
  const out: string[] = [];
  // No refund from the card: no call, no form, no button, no id.
  if (/refundOrderPayment|RefundPaymentDialog|newClientRefundId|clientRefundId|refundRefusal|refundResult/.test(card)) out.push("the card can make a refund");
  if (/t\("(Refund payment|Refund this payment|Refund \{amount\}|Refund…|Amount to refund|Refunding…)"\)/.test(card) || /role="dialog"/.test(card)) out.push("the card has a refund button or form");
  // The pointer: a settled row, and the server's own canRefund — strictly true, so a missing field is no line.
  if (!/\{tabForStatus\(row\.publicStatus\) !== "open" && row\.canRefund === true && \(row\.refundableMinor \?\? 0\) > 0 \? \(\(\) => \{\s*const \[before, after = ""\] = t\("To refund this payment, open \{place\}\."\)\.split\("\{place\}"\);/.test(card)) out.push("the Banking line is not gated on a settled row with canRefund === true");
  if (count(card, /row\.canRefund/) !== 1) out.push("canRefund is read somewhere other than the gate");
  if (!card.includes(`const REFUND_PLACE_HREF = ${JSON.stringify(REFUND_PLACE)};`) || !/<a href=\{REFUND_PLACE_HREF\}[^>]*>\s*\{t\("Banking"\)\} ▸ \{t\("Payment Links"\)\}\s*<\/a>/.test(card)) out.push(`the line does not link "Banking ▸ Payment Links" to ${REFUND_PLACE}`);
  // What the card still shows: refunded and pending amounts, and the 15 s refresh while a refund is pending.
  if (!/\{t\("Refunded"\)\} \{formatMinor\(row\.refundedAmountMinor/.test(card) || !/\{t\("Refund pending"\)\} \{formatMinor\(row\.refundPendingMinor/.test(card) || !/status === "partially_refunded" \? t\("Partially refunded"\)/.test(card)) out.push("the card no longer shows refunded, partially refunded or pending amounts");
  if (!/row\.publicStatus === "processing"\s*\|\| \(row\.refundPendingMinor \?\? 0\) > 0\)/.test(card) || !/setInterval\(again, 15000\)/.test(card)) out.push("the refresh does not run while a refund is pending");
  return out;
}
const cardMutants: Array<[string, string]> = [
  ["refund button back on the order card", cardSource.replace("              {etsyOrder && copiedId === row.paymentRequestId ? (", '              <button type="button" className="finance-payments-add" onClick={() => undefined}>{t("Refund payment")}</button>\n              {etsyOrder && copiedId === row.paymentRequestId ? (')],
  ["a refund form back on the card", cardSource.replace("              {etsyOrder && copiedId === row.paymentRequestId ? (", '              <div role="dialog">{t("Refund this payment")}</div>\n              {etsyOrder && copiedId === row.paymentRequestId ? (')],
  ["the refund call back on the card", cardSource.replace('import { orderLinkRefusalText, type PaymentRequestRefundFields } from "@/lib/studioflow/stripeConnect";', 'import { orderLinkRefusalText, refundOrderPayment, type PaymentRequestRefundFields } from "@/lib/studioflow/stripeConnect";')],
  ["the line on a truthy canRefund", cardSource.replace("row.canRefund === true &&", "row.canRefund &&")],
  ["the line on open rows too", cardSource.replace('{tabForStatus(row.publicStatus) !== "open" && row.canRefund', "{row.canRefund")],
  ["the line links somewhere else", cardSource.replace(`const REFUND_PLACE_HREF = ${JSON.stringify(REFUND_PLACE)};`, 'const REFUND_PLACE_HREF = "/bank";')],
  ["no refresh while pending", cardSource.replace("\n      || (row.refundPendingMinor ?? 0) > 0),", "),")],
  ["the pending amount hidden", cardSource.replace("{t(\"Refund pending\")} {formatMinor(row.refundPendingMinor ?? 0, row.currency || currency)}", "")],
];
for (const [name, mutant] of cardMutants) {
  const problems = mutant === cardSource ? [] : cardProblems(mutant);
  expect(`card rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const cardReal = cardProblems(cardSource);
expect("the order card makes no refund and points to Banking", cardReal.length === 0, cardReal.join("; "));
expect("check-payment-link's pin still holds: the card asks again every 15 s and when the tab comes back",
  /setInterval\(again, 15000\)/.test(cardSource) && /visibilitychange/.test(cardSource));
// Where the line points is a real place with the words it uses: the sidebar's "Banking", the tab "Payment Links",
// opened by ?tab=payment-links.
expect("Banking opens its Payment Links tab for ?tab=payment-links",
  /new URLSearchParams\(window\.location\.search\)\.get\("tab"\);\s*return \(\[[^\]]*"payment-links"\] as const\)\.includes\(value as BankTab\)/.test(bankSource)
    && /\["payment-links", t\("Payment Links"\)\]/.test(bankSource) && /\{ href: "\/bank", label: "Banking"/.test(shellSource));

// ---- 4. Banking ▸ Payment Links offers the refund ------------------------------------------------------------
function panelProblems(panel: string): string[] {
  const out: string[] = [];
  // The action: a settled row, and the server's own canRefund — strictly true, so a missing field is no action.
  if (!/\{tabForStatus\(row\.publicStatus\) !== "open" && row\.canRefund === true && \(row\.refundableMinor \?\? 0\) > 0 \? \(\s*<button/.test(panel)) out.push("the Refund… action is not gated on a settled row with canRefund === true");
  if (count(panel, /row\.canRefund/) !== 1) out.push("canRefund is read somewhere other than the gate");
  if (!/disabled=\{refunding \|\| busyId !== ""\}\s*onClick=\{\(e\) => \(refundFor === row\.paymentRequestId \? closeRefund\(\) : openRefund\(row, e\.currentTarget\)\)\}/.test(panel)) out.push("Refund… can be pressed while a refund is on its way");
  if (!/\{refundFor === row\.paymentRequestId \? \(\s*<RefundPaymentDialog/.test(panel) || count(panel, /<RefundPaymentDialog/) !== 1) out.push("the form is not opened for its own row only");
  // The last submit outlives the form; the form's busy state reaches the list.
  if (!/const refundAttempt = useRef<RefundAttempt \| null>\(null\);/.test(panel) || !/attemptRef=\{refundAttempt\}/.test(panel)) out.push("the last submit does not outlive the form");
  if (!/onBusyChange=\{setRefunding\}/.test(panel) || !/const closeRefund = \(\) => \{\s*if \(refunding\) return;/.test(panel)) out.push("the form closes, or another opens, while a refund is on its way");
  // After the answer: the outcome said, the list read again.
  const done = region(panel, "const refunded = async (row: ListedRow, notice: RefundNotice) => {", "\n  };");
  if (!/setRefundFor\(""\);[\s\S]*await load\(\);/.test(done) || !/onRefunded=\{\(notice\) => refunded\(row, notice\)\}/.test(panel)) out.push("the list is not read again after a refund");
  if (!/onRowChanged=\{\(\) => void load\(\)\}/.test(panel)) out.push("the list is not read again after a refusal about the row");
  if (!/<p role="status"/.test(region(panel, "{refundNotice && refundNotice.id === row.paymentRequestId ? (", ") : null}"))) out.push("the outcome is not announced");
  // While a refund is pending, the list is read again every 15 s, and the row shows it.
  if (!/const refundWaiting = useMemo\(\(\) => \(rows \?\? \[\]\)\.some\(\(row\) => \(row\.refundPendingMinor \?\? 0\) > 0\), \[rows\]\);/.test(panel)
    || !/if \(!refundWaiting \|\| typeof document === "undefined"\) return;\s*const timer = window\.setInterval\(\(\) => \{ if \(document\.visibilityState === "visible"\) void load\(\); \}, 15000\);/.test(panel)) out.push("the list is not read again while a refund is pending");
  if (!/\{t\("Refund pending"\)\} \{formatMinor\(row\.refundPendingMinor/.test(panel)) out.push("a pending refund is not shown on its row");
  return out;
}
const panelMutants: Array<[string, string]> = [
  ["panel action not gated", panelSource.replace("row.canRefund === true && (row.refundableMinor ?? 0) > 0 ? (\n                      <button", "(row.refundableMinor ?? 0) > 0 ? (\n                      <button")],
  ["panel action on a truthy canRefund", panelSource.replace("row.canRefund === true &&", "row.canRefund &&")],
  ["panel action on open rows too", panelSource.replace('{tabForStatus(row.publicStatus) !== "open" && row.canRefund', "{row.canRefund")],
  ["pressable while refunding", panelSource.replace('disabled={refunding || busyId !== ""}\n', "")],
  ["the attempt lost when the form closes", panelSource.replace("attemptRef={refundAttempt}", "attemptRef={{ current: null }}")],
  ["the busy state not passed up", panelSource.replace("onBusyChange={setRefunding}", "")],
  ["closes while refunding", panelSource.replace("    if (refunding) return; // the answer is on its way; the form stays until it arrives\n    setRefundFor", "    setRefundFor")],
  ["no reload after the refund", panelSource.replace("    await load();\n  };\n\n  const copy = async", "  };\n\n  const copy = async")],
  ["no refresh while a refund is pending", panelSource.replace("if (!refundWaiting || typeof document", "if (true || typeof document")],
];
for (const [name, mutant] of panelMutants) {
  const problems = mutant === panelSource ? [] : panelProblems(mutant);
  expect(`panel rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const panelReal = panelProblems(panelSource);
expect("Banking's panel offers the refund only where the server says canRefund", panelReal.length === 0, panelReal.join("; "));

const sourcesIn = (base: string) => (readdirSync(path.join(webRoot, base), { recursive: true }) as string[])
  .filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(base, f));
const screens = [...sourcesIn("components"), ...sourcesIn("app")];
const calling = screens.filter((f) => /refundOrderPayment\(/.test(read(f)));
expect("only the refund form calls refundOrderPayment", calling.join(",") === "components/RefundPaymentDialog.tsx", calling.join(","));
const opening = screens.filter((f) => /from "@\/components\/RefundPaymentDialog"/.test(read(f)));
expect("only Banking's panel opens the refund form", opening.join(",") === "components/PaymentLinksPanel.tsx", opening.join(","));

// ---- 5. the sentences ---------------------------------------------------------------------------------------
const refundLib = libSource.slice(Math.max(0, libSource.indexOf("// ---- Refunds from NivaDesk")));
const libKeys = [...refundLib.matchAll(/(?:return|text:) "([^"]+)"/g)].map((m) => m[1]);
const screenRefund = dialogSource
  + region(cardSource, "{(row.refundPendingMinor ?? 0) > 0 ? (", "{row.stale ? (")
  + region(cardSource, "{/* A settled row the server says", "{etsyOrder && copiedId")
  + region(panelSource, "{(row.refundPendingMinor ?? 0) > 0 ? (", "</td>")
  + region(panelSource, "{/* A paid row, and only when the server says", "{/* Etsy API Terms");
const screenKeys = [...screenRefund.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]);
const keys = [...new Set([...libKeys, ...screenKeys])];
expect("the refund sentences were found (lib + form + card + panel)", libKeys.length >= 15 && screenKeys.length >= 14, `${libKeys.length} + ${screenKeys.length}`);
const REUSED = new Set(["Refunded", "Reason", "Close", "Sign in again to see payment links.", "Banking", "Payment Links"]);
const tableFiles = readdirSync(path.join(webRoot, "lib/studioflow")).filter((f) => /\.ts$/.test(f)).map((f) => read(`lib/studioflow/${f}`)).join("\n");
const rowOf = (key: string): Record<string, string> | null => {
  const head = `  ${JSON.stringify(key)}: `;
  const line = languageSource.split("\n").find((l) => l.startsWith(`${head}{`));
  if (!line) return null;
  try { return JSON.parse(line.slice(head.length).replace(/,\s*$/, "")); } catch { return null; }
};
for (const key of keys) {
  if (REUSED.has(key)) {
    expect(`reused word has a row already: ${key}`, tableFiles.includes(`${JSON.stringify(key)}:`));
    continue;
  }
  const row = rowOf(key);
  const missing = row ? LANGS.filter((lang) => !String(row[lang] ?? "").trim()) : LANGS;
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) || []).sort().join(",");
  const lost = row ? LANGS.filter((lang) => placeholders(row[lang] ?? "") !== placeholders(key)) : [];
  const english = row ? LANGS.filter((lang) => row[lang] === key) : [];
  expect(`twelve languages: ${key.slice(0, 60)}`, !!row && missing.length === 0 && lost.length === 0 && english.length === 0,
    !row ? "no row" : [missing.length ? `missing ${missing.join("/")}` : "", lost.length ? `placeholder lost in ${lost.join("/")}` : "", english.length ? `English in ${english.join("/")}` : ""].filter(Boolean).join("; "));
  const promise = [key, ...(row ? LANGS.map((lang) => row[lang] ?? "") : [])].filter((text) => EMAIL_WORDS.test(text));
  expect(`no email promise: ${key.slice(0, 60)}`, promise.length === 0, promise.join(" | "));
}
expect("every details.reason has a translated sentence", REASONS.every((reason) => {
  const text = (refundLib.match(new RegExp(`case "${reason}": return "([^"]+)"`)) || [])[1];
  return !!text && !!rowOf(text);
}));
expect("the email rule recognises an email promise (self-test)", EMAIL_WORDS.test("Stripe emails the customer a receipt") && EMAIL_WORDS.test("Müşteriye e-posta gider"));

// Where they live: inside the refund block, never at the end of language.ts (the tail is the 2FA table and, last,
// the calendar one). The refund block ends with the "could not be confirmed" row, which check-standalone-ui reads.
const BLOCK_END = '  "The refund could not be confirmed. Try again; it will not be made twice.": {';
function placementProblems(source: string): string[] {
  const at = source.split("\n");
  const blockStart = at.findIndex((l) => l.startsWith("// Refunds from NivaDesk ("));
  const blockEnd = at.findIndex((l) => l.startsWith(BLOCK_END));
  if (blockStart < 0 || blockEnd < blockStart) return ["no refund block"];
  const outside = keys.filter((key) => !REUSED.has(key)).filter((key) => {
    const rows = at.map((l, i) => (l.startsWith(`  ${JSON.stringify(key)}: {`) ? i : -1)).filter((i) => i >= 0);
    return rows.length !== 1 || rows[0] < blockStart || rows[0] > blockEnd;
  });
  const out = outside.length ? [`outside the refund block, or twice: ${outside.join(" | ")}`] : [];
  if (!/^\} as Record<string, Partial<Record<StudioLanguage, string>>>\);$/.test(at[blockEnd + 1] ?? "")) out.push("the refund block does not close after its last row");
  return out;
}
const movedRow = (() => {
  const at = languageSource.split("\n");
  const i = at.findIndex((l) => l.startsWith(`  ${JSON.stringify("Refund…")}: {`));
  if (i < 0) return languageSource;
  const [row] = at.splice(i, 1);
  return [...at.filter((l, n) => n < at.length - 1 || l !== ""), "mergeIntoTranslations({", row, "} as Record<string, Partial<Record<StudioLanguage, string>>>);", ""].join("\n");
})();
const placementMutants: Array<[string, string]> = [
  ["a new sentence moved to the end of language.ts", movedRow],
];
for (const [name, mutant] of placementMutants) {
  const problems = mutant === languageSource ? [] : placementProblems(mutant);
  expect(`placement rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const placementReal = placementProblems(languageSource);
expect("every refund sentence is in the refund block, not at the end of language.ts", placementReal.length === 0, placementReal.join("; "));

rmSync(outDir, { recursive: true, force: true });
console.log(failures ? `${failures} of ${checks} refund-ui checks FAILED` : `All ${checks} refund-ui checks passed.`);
process.exit(failures ? 1 : 0);
