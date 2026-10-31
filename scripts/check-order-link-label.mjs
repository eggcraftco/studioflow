// A name typed by hand on an ORDER payment link — the web half (SL-27, 31 Oct 2026).
//   npm run test:order-link-label
//
// Contract: createOrderPaymentRequest takes an optional `label` (what the customer is buying, up to 120 characters). The
// two forms that make an order link — the order card (components/OrderPaymentLinks.tsx) and Banking's panel
// (components/PaymentLinksPanel.tsx) — each get one optional field:
//   - the field is empty to begin with, and NOTHING fills it: not the order's customer name, not its design name (the
//     owner's rule: those stay off the customer's payment page); only what a person types;
//   - `label` is sent only when something was typed (an older server ignores it, an empty one never travels);
//   - an over-long name is refused on the form before anything is sent, with a sentence in the translation table;
//   - the field is cleared after a link is made, so the next link does not inherit the last one's words;
//   - the limit is the server's 120, one constant shared by both forms.
// The source rules run first against known-bad mutants, so a rule that cannot fail is itself a failure.
import { readFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel) => readFileSync(path.join(webRoot, rel), "utf8");
const verbose = (problems) => { if (process.env.ORDER_LINK_LABEL_VERBOSE) for (const p of problems) console.log("      caught:", p); };

let checks = 0;
let failures = 0;
function expect(name, ok, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}

const libSource = read("lib/studioflow/stripeConnect.ts");
const cardSource = read("components/OrderPaymentLinks.tsx");
const panelSource = read("components/PaymentLinksPanel.tsx");

// ---- the library: one constant, one check --------------------------------------------------------------------
function libProblems(source) {
  const out = [];
  if (!/export const ORDER_LABEL_MAX = 120;/.test(source)) out.push("the limit is not the server's 120");
  const fn = /export function orderLabelProblem\(label: string\): string \{([\s\S]*?)\n\}/.exec(source);
  if (!fn) { out.push("orderLabelProblem is missing"); return out; }
  let check;
  try {
    // eslint-disable-next-line no-new-func
    check = new Function("ORDER_LABEL_MAX", `return function (label) {${fn[1]}\n};`)(120);
  } catch (error) { out.push(`orderLabelProblem does not run: ${error.message}`); return out; }
  const sentence = "Keep what the customer is buying to 120 characters or fewer.";
  if (check("") !== "" || check("   ") !== "" || check("Oak coffee table") !== "") out.push("a blank or ordinary name is refused");
  if (check("x".repeat(120)) !== "") out.push("exactly 120 characters is refused");
  if (check("x".repeat(121)) !== sentence) out.push("121 characters is not refused with the translated sentence");
  if (check(`  ${"x".repeat(120)}  `) !== "") out.push("the limit counts the spaces around the name");
  return out;
}
const libMutants = [
  ["no limit", libSource.replace("export const ORDER_LABEL_MAX = 120;", "export const ORDER_LABEL_MAX = 1200;")],
  ["off by one", libSource.replace("label.trim().length > ORDER_LABEL_MAX", "label.trim().length >= ORDER_LABEL_MAX")],
  ["counts the spaces", libSource.replace("label.trim().length > ORDER_LABEL_MAX", "label.length > ORDER_LABEL_MAX")],
  ["another sentence", libSource.replace('"Keep what the customer is buying to 120 characters or fewer."', '"Too long."')],
];
for (const [name, mutant] of libMutants) {
  const problems = mutant === libSource ? [] : libProblems(mutant);
  expect(`library rules catch the mutant: ${name}`, problems.length > 0, "the mutant did not apply, or passed");
  verbose(problems);
}
const libReal = libProblems(libSource);
expect("orderLabelProblem: blank and 120 pass, 121 is refused with the translated sentence", libReal.length === 0, libReal.join("; "));

// ---- the two forms ---------------------------------------------------------------------------------------------
// state = the useState name, set = its setter; both forms follow one shape.
function formProblems(source, { state, set, busyStart, doneReset }) {
  const out = [];
  const importLine = /import \{[^}]*\} from "@\/lib\/studioflow\/stripeConnect";/.exec(source.slice(0, 4000)) ?? /import \{[\s\S]*?\} from "@\/lib\/studioflow\/stripeConnect";/.exec(source);
  if (!importLine || !/\borderLabelProblem\b/.test(importLine[0]) || !/\bORDER_LABEL_MAX\b/.test(importLine[0])) out.push("the form does not take the limit and the check from stripeConnect");
  if (!new RegExp(`const \\[${state}, ${set}\\] = useState\\(""\\);`).test(source)) out.push("the field does not start empty");
  // Nothing fills it but the person: every call is the typed value or the empty string.
  const calls = [...source.matchAll(new RegExp(`${set}\\((.{0,24})`, "g"))].map((m) => m[1]);
  if (calls.length < 2 || calls.some((arg) => !arg.startsWith("e.target.value)") && !arg.startsWith('"")'))) out.push(`the field is filled from somewhere other than typing: ${calls.join(" | ")}`);
  if (/designName|customerName/.test(source.slice(source.indexOf(`const [${state}`), source.indexOf(`const [${state}`) + 400))) out.push("the field is next to a name taken from the order");
  if (!new RegExp(`maxLength=\\{ORDER_LABEL_MAX\\}`).test(source)) out.push("the input has no maxLength from the shared limit");
  // Sent only when typed.
  if (!new RegExp(`\\.\\.\\.\\(${state}\\.trim\\(\\) \\? \\{ label: ${state}\\.trim\\(\\) \\} : \\{\\}\\)`).test(source)) out.push("label is not sent exactly when something was typed, trimmed");
  if ((source.match(new RegExp(`\\blabel: ${state}\\b`, "g")) || []).length !== 1) out.push("label is sent from more than one place");
  if (!/label\?: string/.test(source)) out.push("the call's payload type does not know the optional label");
  // Refused on the form, before anything is sent.
  const check = source.indexOf(`orderLabelProblem(${state})`);
  const start = source.indexOf(busyStart);
  if (check < 0 || start < 0 || check > start) out.push("a too-long name is not refused before the request starts");
  if (!new RegExp(`if \\(labelProblem\\) \\{ setCreateError\\(t\\(labelProblem\\)\\); return; \\}`).test(source)) out.push("the refusal is not shown as a translated sentence");
  // Cleared once a link was made.
  if (!source.includes(doneReset)) out.push("the field keeps its words after a link was made");
  // The three sentences go through t().
  for (const key of ["What the customer is buying (optional)", "Shown on the payment page. Left empty, it shows the order number."]) {
    if (!source.includes(`t(${JSON.stringify(key)})`)) out.push(`"${key.slice(0, 30)}…" is not translated`);
  }
  return out;
}
const forms = [
  ["the order card", cardSource, { state: "label", set: "setLabel", busyStart: 'setBusy("create");', doneReset: 'setLabel("");' }],
  ["Banking's panel", panelSource, { state: "createLabel", set: "setCreateLabel", busyStart: "setCreating(true);", doneReset: 'setCreateLabel("");' }],
];
for (const [name, source, shape] of forms) {
  const mutants = [
    ["filled from the design name", source.replace(`const [${shape.state}, ${shape.set}] = useState("");`, `const [${shape.state}, ${shape.set}] = useState("");\n  const prefill = () => ${shape.set}(order.designName);`)],
    ["no maxLength", source.replace("maxLength={ORDER_LABEL_MAX} ", "")],
    ["always sent", source.replace(new RegExp(`\\.\\.\\.\\(${shape.state}\\.trim\\(\\) \\? \\{ label: ${shape.state}\\.trim\\(\\) \\} : \\{\\}\\)`), `label: ${shape.state}`)],
    ["not trimmed", source.replace(new RegExp(`\\{ label: ${shape.state}\\.trim\\(\\) \\}`), `{ label: ${shape.state} }`)],
    ["checked after sending starts", source.replace(/if \(labelProblem\) \{ setCreateError\(t\(labelProblem\)\); return; \}/, "")],
    ["not cleared", source.replace(shape.doneReset, "")],
    ["sentence not translated", source.replace('t("What the customer is buying (optional)")', '"What the customer is buying (optional)"')],
  ];
  for (const [mutantName, mutant] of mutants) {
    const problems = mutant === source ? [] : formProblems(mutant, shape);
    expect(`${name}: rules catch the mutant: ${mutantName}`, problems.length > 0, "the mutant did not apply, or passed");
    verbose(problems);
  }
  const real = formProblems(source, shape);
  expect(`${name} meets the contract`, real.length === 0, real.join("; "));
}

// ---- both forms read the same limit ---------------------------------------------------------------------------
expect("the order link calls still carry the order, amount, purpose and request id unchanged",
  /orderId, amountMinor, purpose,/.test(cardSource) && /orderId: createOrderId, amountMinor, purpose: createPurpose,/.test(panelSource)
  && /clientRequestId: `\$\{orderId\}:\$\{amountMinor\}:\$\{purpose\}:\$\{Date\.now\(\)\}`/.test(cardSource)
  && /clientRequestId: `\$\{createOrderId\}:\$\{amountMinor\}:\$\{createPurpose\}:\$\{Date\.now\(\)\}`/.test(panelSource));

console.log(failures ? `${failures} of ${checks} order-link-label checks FAILED` : `All ${checks} order-link-label checks passed.`);
process.exit(failures ? 1 : 0);
