// Refunds from NivaDesk, the web half (STRIPE-LINKS SL-21/SL-22, 30 Oct 2026).
//   npm run test:refund-ui
//
// Contract: the callable `refundOrderPayment` takes { companyId, orderId, paymentRequestId, amountMinor,
// reason, clientRefundId } and refuses with `details.reason`; each request row may carry refundableMinor,
// refundPendingMinor and canRefund — all three optional, because an older server sends none of them.
//
//   1. the client (lib/studioflow/stripeConnect.ts), loaded from source with the callable stubbed: the exact
//      payload, one sentence per details.reason, the max from details.refundableMinor, Stripe's statuses, the id
//   2. the order card (components/OrderPaymentLinks.tsx), read from source: the button only on a settled row
//      whose server said canRefund === true; the amount read like the New payment link form and capped at
//      refundableMinor; the id kept for a retried submit; busy, focus, Escape; the 15 s refresh kept while a
//      refund is pending; the list read again after a refund
//   3. Banking's Payment Links panel stays read-only
//   4. every refund sentence in twelve languages, placeholders kept, and nowhere a promise that the customer
//      is emailed (whether Stripe emails a refund receipt is the business's own Stripe setting)
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
const cardSource = read("components/OrderPaymentLinks.tsx");
const panelSource = read("components/PaymentLinksPanel.tsx");
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

// ---- 2. the order card, from source ---------------------------------------------------------------------
function region(source: string, start: string, end: string) {
  const a = source.indexOf(start);
  const b = a >= 0 ? source.indexOf(end, a + start.length) : -1;
  return a >= 0 && b > a ? source.slice(a, b) : "";
}
function cardProblems(card: string): string[] {
  const out: string[] = [];
  const submit = region(card, "const refund = async (row: OrderLinkRow)", "const copy = async");
  if (!submit) return ["no refund submit"];
  // The button: a settled row, and the server's own canRefund — strictly true, so a missing field is no button.
  if (!/\{tabForStatus\(row\.publicStatus\) !== "open" && row\.canRefund === true && \(row\.refundableMinor \?\? 0\) > 0 \? \(\s*<button/.test(card)) out.push("the button is not gated on a settled row with canRefund === true");
  if ((card.match(/row\.canRefund/g) || []).length !== 1) out.push("canRefund is read somewhere other than the gate");
  // The amount: prefilled with refundableMinor, read like the New payment link form, capped before any call.
  if (!/setRefundAmount\(minorToInputText\(row\.refundableMinor \?\? 0,/.test(card)) out.push("the amount is not prefilled with refundableMinor");
  if (!/const parsed = parseRequestAmount\(refundAmount, rowCurrency, locale\);\s*if \(!parsed\.ok\) \{ setRefundError\(t\(requestAmountMessage\(parsed\.reason\)\)\); return; \}/.test(submit)) out.push("the amount is not read like the New payment link form");
  const cap = submit.indexOf("if (parsed.amountMinor > most) {");
  if (!/const most = row\.refundableMinor \?\? 0;/.test(submit) || cap < 0 || cap > submit.indexOf("refundOrderPayment(")) out.push("the amount is not capped at refundableMinor before the call");
  if (!/inputMode="decimal"/.test(region(card, "{t(\"Amount to refund\")}", "</label>"))) out.push("the amount field is not a decimal field");
  // The id: kept while the same submit is retried, new for a different one, dropped only after an answer.
  if (!/previous\.amountMinor === parsed\.amountMinor\s*&& previous\.reason === refundReason\s*\? previous\s*: \{[^}]*clientRefundId: newClientRefundId\(\) \}/.test(submit)) out.push("the id is not kept for a retried submit");
  // A definite refusal (a reason that is not Stripe failing) starts a new id; Stripe failing or a lost answer keeps it.
  const guarded = /if \(refusal\.reason && refusal\.reason !== "refund_provider_error"\) refundAttempt\.current = null;/;
  if (!guarded.test(submit)) out.push("a definite refusal does not start a new refund id");
  const unguarded = submit.replace(guarded, "");
  const cleared = unguarded.indexOf("refundAttempt.current = null;");
  if ((unguarded.match(/refundAttempt\.current = null;/g) || []).length !== 1 || cleared < unguarded.indexOf("await refundOrderPayment(")) out.push("the id is dropped before the refund is answered");
  if ((card.match(/newClientRefundId\(\)/g) || []).length !== 1) out.push("ids are made in more than one place");
  if (!/clientRefundId: attempt\.clientRefundId/.test(submit)) out.push("the call does not send the attempt's id");
  // Refusals: details.reason through the client, never the raw message; the max from details.
  if (!/const refusal = refundRefusal\(e\);/.test(submit) || /\.message/.test(submit)) out.push("a refusal is not read from details.reason");
  if (!/formatMinor\(refusal\.refundableMinor \?\? most, rowCurrency\)/.test(submit)) out.push("refund_amount_too_large does not show the max");
  // After the refund: the list again (which reloads the order through the fingerprint).
  if (!/setRefundFor\(""\);\s*\/\/[^\n]*\n\s*await load\(\);/.test(submit)) out.push("the list is not read again after a refund");
  // Polling: the 15 s refresh keeps going while a refund is pending.
  if (!/row\.publicStatus === "processing"\s*\|\| \(row\.refundPendingMinor \?\? 0\) > 0\)/.test(card) || !/setInterval\(again, 15000\)/.test(card)) out.push("the refresh does not run while a refund is pending");
  // Busy: nothing to press twice, nothing to edit, no closing while the answer is on its way.
  if (!/const refunding = busy\.startsWith\("refund:"\);/.test(card)) out.push("no refunding state");
  const form = region(card, 'role="dialog"', "})() : null}");
  if ((form.match(/disabled=\{refunding\}/g) || []).length < 4) out.push("the form's fields and buttons are not all disabled while refunding");
  if (!/\{refunding\s*\? t\("Refunding…"\)/.test(form)) out.push("no Refunding… label");
  if (!/disabled=\{busy !== ""\}\s*onClick=\{\(e\) => \(refundFor === row\.paymentRequestId \? closeRefund\(\) : openRefund\(row, e\.currentTarget\)\)\}/.test(card)) out.push("the Refund button can be pressed while busy");
  if (!/const closeRefund = \(\) => \{\s*if \(refunding\) return;/.test(card)) out.push("the form closes while refunding");
  // Accessible: a labelled dialog, labelled fields, focus moves in, Escape closes.
  if (!/aria-labelledby=\{`\$\{formId\}-title`\}/.test(form) || !/aria-describedby=\{`\$\{formId\}-terms`\}/.test(form)) out.push("the dialog is not labelled and described");
  if (!/<label[^>]*>\s*\{t\("Amount to refund"\)\}\s*<input/.test(form) || !/<label[^>]*>\s*\{t\("Reason"\)\}\s*<select/.test(form)) out.push("the fields are not labelled");
  if (!/useEffect\(\(\) => \{\s*if \(!refundFor\) return;\s*refundFieldRef\.current\?\.focus\(\);/.test(card) || !/ref=\{refundFieldRef\}/.test(form)) out.push("focus does not move into the form");
  if (!/onKeyDown=\{\(e\) => \{ if \(e\.key === "Escape"\) \{ e\.stopPropagation\(\); closeRefund\(\); \} \}\}/.test(form)) out.push("Escape does not close the form");
  // The two reasons, the terms, and the states.
  const options = [...form.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]).join(",");
  if (options !== "requested_by_customer,duplicate") out.push(`reasons offered: ${options}`);
  if (!/t\("A refund cannot be undone\. The money comes from your Stripe balance, and Stripe keeps its processing fee\."\)/.test(form)) out.push("the terms are not stated before the refund");
  if (!/const outcome = refundResult\(result\.refund\.status\);/.test(submit)) out.push("Stripe's status is not what the screen says");
  if (!/\{t\("Refund pending"\)\} \{formatMinor\(row\.refundPendingMinor/.test(card)) out.push("a pending refund is not shown on its row");
  if (!/<span role="status"/.test(region(card, "{refundNotice && refundNotice.id === row.paymentRequestId", "</span>"))) out.push("the outcome is not announced");
  const refundCopy = region(card, "// ---- Refunds from NivaDesk", "const copy = async") + form;
  if (/t\("[^"]*(e-?mail|receipt|notif)[^"]*"\)/i.test(refundCopy)) out.push("the refund copy promises the customer a message");
  return out;
}

const cardMutants: Array<[string, string]> = [
  ["the button shows on a truthy canRefund", cardSource.replace("row.canRefund === true &&", "row.canRefund &&")],
  ["the button shows on open rows too", cardSource.replace('{tabForStatus(row.publicStatus) !== "open" && row.canRefund', "{row.canRefund")],
  ["no cap", cardSource.replace("if (parsed.amountMinor > most) {", "if (false) {")],
  ["the amount loses its comma reading", cardSource.replace("const parsed = parseRequestAmount(refundAmount, rowCurrency, locale);", "const parsed = { ok: true as const, amountMinor: Math.round(Number(refundAmount) * 100) };")],
  ["a new id on every submit", cardSource.replace("&& previous.reason === refundReason\n      ? previous", "&& previous.reason === refundReason && false\n      ? previous")],
  ["the id dropped on a failure", cardSource.replace("      const refusal = refundRefusal(e);\n", "      refundAttempt.current = null;\n      const refusal = refundRefusal(e);\n")],
  ["a Stripe failure drops the id", cardSource.replace(' && refusal.reason !== "refund_provider_error") refundAttempt', ") refundAttempt")],
  ["a definite refusal keeps the id", cardSource.replace('      if (refusal.reason && refusal.reason !== "refund_provider_error") refundAttempt.current = null;\n', "")],
  ["the raw message shown", cardSource.replace("setRefundError(t(refusal.text)", "setRefundError((e as Error).message || t(refusal.text)")],
  ["no refresh while pending", cardSource.replace('\n      || (row.refundPendingMinor ?? 0) > 0),', "),")],
  ["no reload after the refund", cardSource.replace("      await load();\n    } catch (e) {\n      const refusal", "    } catch (e) {\n      const refusal")],
  ["pressable while busy", cardSource.replace('disabled={busy !== ""}\n                  onClick={(e) => (refundFor', "onClick={(e) => (refundFor")],
  ["Escape ignored", cardSource.replace('if (e.key === "Escape") { e.stopPropagation(); closeRefund(); }', "")],
  ["fraud offered", cardSource.replace('<option value="duplicate">', '<option value="fraudulent">{t("Fraud")}</option>\n                        <option value="duplicate">')],
  ["an email promise", cardSource.replace('{t("A refund cannot be undone.', '{t("The customer gets an email from Stripe.")} {t("A refund cannot be undone.')],
  ["no fee sentence", cardSource.replace("and Stripe keeps its processing fee.", "and that is all.")],
];
for (const [name, mutant] of cardMutants) {
  const problems = mutant === cardSource ? [] : cardProblems(mutant);
  expect(`card rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const cardReal = cardProblems(cardSource);
expect("the order card meets the contract", cardReal.length === 0, cardReal.join("; "));
expect("check-payment-link's pin still holds: the card asks again every 15 s and when the tab comes back",
  /setInterval\(again, 15000\)/.test(cardSource) && /visibilitychange/.test(cardSource));

// ---- 3. Banking stays read-only -----------------------------------------------------------------------------
expect("Banking's Payment Links panel has no refund action",
  !/refundOrderPayment|canRefund|Refund payment|clientRefundId/.test(panelSource));
const sourcesIn = (base: string) => (readdirSync(path.join(webRoot, base), { recursive: true }) as string[])
  .filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(base, f));
const using = [...sourcesIn("components"), ...sourcesIn("app")].filter((f) => /refundOrderPayment\(/.test(read(f)));
expect("only the order card calls refundOrderPayment", using.join(",") === "components/OrderPaymentLinks.tsx", using.join(","));

// ---- 4. the sentences ---------------------------------------------------------------------------------------
const refundLib = libSource.slice(Math.max(0, libSource.indexOf("// ---- Refunds from NivaDesk")));
const libKeys = [...refundLib.matchAll(/(?:return|text:) "([^"]+)"/g)].map((m) => m[1]);
const cardRefund = region(cardSource, "// ---- Refunds from NivaDesk", "const copy = async")
  + region(cardSource, "{(row.refundPendingMinor ?? 0) > 0 ? (", "{row.stale ? (")
  + region(cardSource, "{/* A settled row, and only when", "{etsyOrder && copiedId");
const cardKeys = [...cardRefund.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]);
const keys = [...new Set([...libKeys, ...cardKeys])];
expect("the refund sentences were found (lib + card)", libKeys.length >= 15 && cardKeys.length >= 10, `${libKeys.length} + ${cardKeys.length}`);
const REUSED = new Set(["Refunded", "Reason", "Close", "Sign in again to see payment links."]);
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

rmSync(outDir, { recursive: true, force: true });
console.log(failures ? `${failures} of ${checks} refund-ui checks FAILED` : `All ${checks} refund-ui checks passed.`);
process.exit(failures ? 1 : 0);
