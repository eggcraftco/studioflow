// An order-less "New payment link" that can be attached to an order — the web half (SL-28, 31 Oct 2026).
//   npm run test:attach-order
//
// The owner's rule: in Banking ▸ Payment links ▸ New payment link, what is typed under "What is this payment for?" is the
// name the customer sees; a second, optional field picks one of the workspace's orders, so that when the customer pays,
// the money counts against what that order still owes. The customer never sees which order. So:
//   1. the client (lib/studioflow/stripeConnect.ts), loaded from source with the callable stubbed:
//      createAttachedPaymentRequest calls the ORDER link's callable with { companyId, orderId, amountMinor, purpose,
//      clientRequestId, label } — the typed title trimmed, as `label` — and nothing else (no customer details, no currency)
//   2. Banking's panel (components/PaymentLinksPanel.tsx), from source: the order picker is optional and only when the page
//      gives orders; choosing one swaps the customer-details fields for Purpose and the order's own figures; the submit
//      blanks the details, reads the amount in the order's currency, sends the attempt's order and purpose, and keeps one
//      id per submit; the form is cleared afterwards; an order's row shows the name that was typed
// The source rules run first against known-bad mutants, so a rule that cannot fail is itself a failure.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const verbose = (problems: string[]) => { if (process.env.ATTACH_ORDER_VERBOSE) for (const p of problems) console.log("      caught:", p); };

const libSource = read("lib/studioflow/stripeConnect.ts");
const panelSource = read("components/PaymentLinksPanel.tsx");

// ---- 1. the client, from source ---------------------------------------------------------------------------
type Call = { name: string; data: Record<string, unknown> };
type Stub = { calls: Call[]; setAnswer: (next: unknown) => void };
type Lib = {
  createAttachedPaymentRequest: (input: Record<string, unknown>) => Promise<{ ok: boolean; request: unknown }>;
};
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-attach-order-"));
writeFileSync(path.join(outDir, "io-stub.mjs"), [
  "export const functions = null;",
  "export const calls = [];",
  "let answer = null;",
  "export function setAnswer(next) { answer = next; }",
  "export function httpsCallable(_functions, name) {",
  "  return async (data) => { calls.push({ name, data }); if (answer instanceof Error) throw answer; return { data: answer }; };",
  "}",
  "",
].join("\n"));
let loads = 0;
async function loadLib(source: string): Promise<{ lib: Lib; stub: Stub }> {
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

async function clientProblems(source: string): Promise<string[]> {
  const out: string[] = [];
  let loaded: { lib: Lib; stub: Stub };
  try { loaded = await loadLib(source); } catch (error) { return [`does not load: ${(error as Error).message}`]; }
  const { lib, stub } = loaded;
  if (typeof lib.createAttachedPaymentRequest !== "function") return ["no createAttachedPaymentRequest()"];
  const before = stub.calls.length;
  stub.setAnswer({ ok: true, request: { paymentRequestId: "pr7", kind: "order", title: "Oak table" } });
  const made = await lib.createAttachedPaymentRequest({
    companyId: "ws1", orderId: "ord1", title: "  Oak table - second half  ", amountMinor: 30000, purpose: "remaining_balance",
    clientRequestId: "abcDEF12345", customerName: "Ada", customerEmail: "ada@example.com", collectPhone: true, currency: "usd",
  });
  const sent = stub.calls[before];
  if (stub.calls.length !== before + 1 || sent?.name !== "createOrderPaymentRequest") out.push("does not call the ORDER link's callable once");
  const keys = Object.keys(sent?.data ?? {}).sort().join(",");
  if (keys !== "amountMinor,clientRequestId,companyId,label,orderId,purpose") out.push(`payload fields are ${keys}`);
  if (sent?.data?.label !== "Oak table - second half") out.push("the typed title is not sent trimmed as `label`");
  if (sent?.data?.orderId !== "ord1" || sent?.data?.purpose !== "remaining_balance" || sent?.data?.amountMinor !== 30000 || sent?.data?.clientRequestId !== "abcDEF12345") out.push("payload values changed on the way");
  if (made.ok !== true || (made.request as { paymentRequestId?: string } | null)?.paymentRequestId !== "pr7") out.push("the answer is not passed back");
  stub.setAnswer({ request: { paymentRequestId: "pr8" } });
  if ((await lib.createAttachedPaymentRequest({ companyId: "ws1", orderId: "o", title: "x", amountMinor: 1, purpose: "deposit", clientRequestId: "abcDEF12345" })).ok !== false) out.push("an answer without ok:true counts as created");
  const refusal = Object.assign(new Error("That is more than this order still owes."), { code: "functions/failed-precondition", details: { reason: "exceeds_outstanding" } });
  stub.setAnswer(refusal);
  let thrown: unknown = null;
  try { await lib.createAttachedPaymentRequest({ companyId: "ws1", orderId: "o", title: "x", amountMinor: 1, purpose: "deposit", clientRequestId: "abcDEF12345" }); } catch (error) { thrown = error; }
  if (thrown !== refusal) out.push("the server's refusal is swallowed or changed");
  stub.setAnswer(null);
  return out;
}
const libMutants: Array<[string, string]> = [
  ["the order-less callable", libSource.replace('call<Record<string, unknown>, Partial<CreateStandalonePaymentResult>>("createOrderPaymentRequest")', 'call<Record<string, unknown>, Partial<CreateStandalonePaymentResult>>("createStandalonePaymentRequest")')],
  ["not trimmed", libSource.replace('label: String(input.title ?? "").trim(),', 'label: String(input.title ?? ""),')],
  ["sent as title", libSource.replace('label: String(input.title ?? "").trim(),', 'title: String(input.title ?? "").trim(),')],
  ["the purpose dropped", libSource.replace("    purpose: input.purpose,\n    clientRequestId: input.clientRequestId,\n    label:", "    clientRequestId: input.clientRequestId,\n    label:")],
  ["any answer is created", libSource.replace('return { ok: data?.ok === true, request: data?.request ?? null };\n}\n\n/** Why the server refused', 'return { ok: true, request: data?.request ?? null };\n}\n\n/** Why the server refused')],
];
for (const [name, mutant] of libMutants) {
  const problems = mutant === libSource ? [] : await clientProblems(mutant);
  expect(`client rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const libReal = await clientProblems(libSource);
expect("createAttachedPaymentRequest: the order link's callable, the typed title as label, nothing else", libReal.length === 0, libReal.join("; "));

// ---- 2. Banking's panel, from source ----------------------------------------------------------------------
const region = (source: string, from: string, to: string): string => {
  const a = source.indexOf(from);
  if (a < 0) return "";
  const b = source.indexOf(to, a + from.length);
  return b < 0 ? "" : source.slice(a, b);
};
function panelProblems(panel: string): string[] {
  const out: string[] = [];
  const form = region(panel, '<div\n          id="standalone-link-form"', ") : null}\n\n      {createOpen");
  const submit = region(panel, "const createStandalone = async () => {", "/** \"Order #1042\"");
  if (!form || !submit) return ["no order-less form or submit"];
  // The picker: optional, only when the page gives orders, the order's name as the order form shows it.
  if (!/\{orders !== undefined \? \(/.test(form)) out.push("the order picker shows although the page gave no orders");
  if (!/value=\{standaloneOrderId\}[\s\S]*?data-attach-order/.test(form)) out.push("no order picker bound to standaloneOrderId");
  if (!/<option value="">\{orders === null \? t\("Loading…"\) : t\("No order \(a new one opens when it is paid\)"\)\}<\/option>/.test(form)) out.push("the first choice is not 'no order'");
  if (!/\{\[order\.customerName, order\.designName\]\.filter\(Boolean\)\.join\(" — "\) \|\| order\.id\}/.test(form)) out.push("the orders are not named as the order form names them");
  // Chosen: Purpose + the order's figures; not chosen: the customer's details. Never both.
  const attachedAt = form.indexOf('{standaloneOrderId !== "" ? (');
  const elseAt = form.indexOf(") : (", attachedAt + 1);
  const attachedPart = attachedAt >= 0 && elseAt > attachedAt ? form.slice(attachedAt, elseAt) : "";
  const detailsPart = elseAt > 0 ? form.slice(elseAt, form.indexOf("</p>", elseAt) > 0 ? form.indexOf('<p id="standalone-link-form-note"', elseAt) : undefined) : "";
  if (!attachedPart || !/t\("Purpose"\)/.test(attachedPart) || !/t\("Remaining balance"\)/.test(attachedPart)) out.push("choosing an order does not ask what the money is");
  if (!/t\("Still to pay"\)[\s\S]*t\("Not yet asked for"\)/.test(attachedPart)) out.push("the order's own figures are not shown");
  if (/Customer name|Customer email|Ask for phone|Ask for delivery/.test(attachedPart)) out.push("an attached link still asks for the customer's details");
  for (const word of ["Customer name (optional)", "Customer email (optional)", "Ask for phone number", "Ask for delivery address"]) {
    if (!detailsPart.includes(`t("${word}")`)) out.push(`the order-less details lost: ${word}`);
  }
  if (!/standaloneOrderId !== ""\s*\? t\("The payment is added to this order\. Your customer sees only the name you typed above, not the order\."\)\s*: t\("When the customer pays, NivaDesk opens the order with the details they enter\."\)/.test(form)) out.push("the note does not say what an attached link does");
  // The figures: read from the server, the amount pre-filled only while empty, a failed read drops the choice.
  if (!/httpsCallable<[^>]*>\(functions, "listOrderPaymentRequests"\);\s*info\(\{ companyId, orderId: standaloneOrderId \}\)/.test(panel)) out.push("the order's figures are not read from the server");
  if (!/setStandaloneAmount\(\(current\) => current \|\| minorToInputText\(next\.headroomMinor, next\.currency, locale\)\)/.test(panel)) out.push("the amount is pre-filled over what was typed");
  if (!/\.catch\(\(e\) => \{ if \(active\) \{ setStandaloneOrderId\(""\); setStandaloneError\(t\(messageForError\(e\)\)\); \} \}\)/.test(panel)) out.push("a failed read keeps the choice");
  // The submit.
  if (!/const attached = standaloneOrderId !== "";/.test(submit)) out.push("the submit does not know it is attached");
  if (!/customerName: attached \? "" : standaloneName\.trim\(\),\s*customerEmail: attached \? "" : standaloneEmail\.trim\(\),\s*collectPhone: attached \? false : standalonePhone,\s*collectAddress: attached \? false : standaloneAddress,/.test(submit)) out.push("an attached submit still carries the customer's details");
  if (!/orderId: standaloneOrderId,\s*purpose: attached \? standalonePurpose : "",/.test(submit)) out.push("the submit does not carry the order and the purpose");
  if (!/standaloneFormProblem\(\{ title: standaloneTitle, customerEmail: attached \? "" : standaloneEmail \}\)/.test(submit)) out.push("a hidden email still blocks an attached link");
  if (!/const result = attempt\.orderId\s*\? await createAttachedPaymentRequest\(\{\s*companyId, orderId: attempt\.orderId, title: attempt\.title, amountMinor: attempt\.amountMinor,\s*purpose: attempt\.purpose, clientRequestId: attempt\.clientRequestId,\s*\}\)\s*: await createStandalonePaymentRequest\(/.test(submit)) out.push("an attached submit does not go through the order link's call with the attempt's fields");
  if (/createOrderPaymentRequest/.test(panel.replace(/\/\/.*$/gm, "").replace(/functions, "createOrderPaymentRequest"/g, ""))) out.push("the panel calls the order link's callable by hand");
  // After success: the form is cleared, so the next link does not inherit the order.
  if (!/setStandaloneOrderId\(""\); setStandalonePurpose\("remaining_balance"\); setAttachInfo\(null\);/.test(submit)) out.push("the order choice survives a created link");
  // The list: the name that was typed, under the order.
  if (!/const orderRowTitle = \(row: \{ title\?: string \}\) => \(row\.title\s*\? <div [^>]*>\{row\.title\}<\/div>\s*: null\);/.test(panel)) out.push("no helper showing an order row's typed name");
  if ((panel.match(/\{orderRowTitle\(row\)\}/g) || []).length !== 2) out.push("an order row does not show its typed name in both of its forms");
  if (/dangerouslySetInnerHTML/.test(panel)) out.push("the panel renders HTML");
  return out;
}
const panelMutants: Array<[string, string]> = [
  ["the picker without orders", panelSource.replace("{orders !== undefined ? (", "{true ? (")],
  ["details kept when attached", panelSource.replace('customerName: attached ? "" : standaloneName.trim(),', "customerName: standaloneName.trim(),")],
  ["email still blocks", panelSource.replace('customerEmail: attached ? "" : standaloneEmail })', "customerEmail: standaloneEmail })")],
  ["the order not carried", panelSource.replace("      orderId: standaloneOrderId,\n", "      orderId: \"\",\n")],
  ["the order-less call for an attached link", panelSource.replace("const result = attempt.orderId\n        ? await createAttachedPaymentRequest({", "const result = false\n        ? await createAttachedPaymentRequest({")],
  ["the amount over what was typed", panelSource.replace("setStandaloneAmount((current) => current || minorToInputText(", "setStandaloneAmount((current) => minorToInputText(")],
  ["a failed read keeps the choice", panelSource.replace('.catch((e) => { if (active) { setStandaloneOrderId(""); setStandaloneError(t(messageForError(e))); } });', ".catch(() => undefined);")],
  ["the choice survives", panelSource.replace('setStandaloneOrderId(""); setStandalonePurpose("remaining_balance"); setAttachInfo(null);', "setAttachInfo(null);")],
  ["the details shown when attached", panelSource.replace("                {t(\"Purpose\")}\n                <select value={standalonePurpose}", "                {t(\"Customer name (optional)\")}\n                <select value={standalonePurpose}")],
  ["no typed name on a row", panelSource.replace("                        {orderRowTitle(row)}\n                      </>", "                      </>")],
  ["the note unchanged", panelSource.replace('? t("The payment is added to this order. Your customer sees only the name you typed above, not the order.")', '? t("When the customer pays, NivaDesk opens the order with the details they enter.")')],
  ["the order's figures not shown", panelSource.replace('${t("Still to pay")}: ${formatMinor(attachInfo.outstandingMinor, attachInfo.currency)} · ${t("Not yet asked for")}: ${formatMinor(attachInfo.headroomMinor, attachInfo.currency)}', "")],
];
for (const [name, mutant] of panelMutants) {
  const problems = mutant === panelSource ? [] : panelProblems(mutant);
  expect(`panel rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const panelReal = panelProblems(panelSource);
expect("Banking's panel meets the attach-to-an-order contract", panelReal.length === 0, panelReal.join("; "));

rmSync(outDir, { recursive: true, force: true });
console.log(failures ? `${failures} of ${checks} attach-order checks FAILED` : `All ${checks} attach-order checks passed.`);
process.exit(failures ? 1 : 0);
