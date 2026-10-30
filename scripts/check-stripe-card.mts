// The Stripe card on /integrations (card payment links, STRIPE-LINKS 29 Oct 2026).
//   npm run test:stripe-card
//
// Facts the code supports (functions/paymentConnect.js + payments/connectTransport.js, live 8 Oct
// 2026 + STRIPE-LINKS): a link is a Stripe Checkout session on the business's OWN connected account
// (direct charges, no application fee), for a deposit, an instalment or the balance of an order;
// the customer gets a short link (pay.<domain>/p/<code>) that outlives Stripe's 24-hour session; the order is updated from the signed
// webhook. The rail serves only the workspaces in STRIPE_CONNECT_PILOT_WORKSPACES, so the card is
// "limited" and its note says "on request" — never "live", "every business", "approved", "partner".
// The rules run first against known-bad mutants, so a check that cannot fail is itself a failure.
import { readFileSync } from "node:fs";
import { PUBLIC_SITE_TRANSLATIONS } from "../lib/publicSite/translations.ts";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
let checks = 0;
const failures: string[] = [];
const expect = (name: string, ok: boolean) => { checks += 1; if (ok) console.log(`ok   ${name}`); else { failures.push(name); console.log(`FAIL ${name}`); } };

const KEYS = ["integrations.summary.stripe", "integrations.detail.stripe", "integrations.note.stripe"] as const;
const LANGS = Object.keys(PUBLIC_SITE_TRANSLATIONS) as Array<keyof typeof PUBLIC_SITE_TRANSLATIONS>;

// ---- the rules -------------------------------------------------------------------------------------
type Card = { line: string; summary: string; detail: string; note: string };
function cardProblems(card: Card): string[] {
  const out: string[] = [];
  if (!/state: "limited"/.test(card.line)) out.push("state is not limited");
  if (!/category: "Payments"/.test(card.line)) out.push("not in Payments");
  if (!/note: "integrations\.note\.stripe"/.test(card.line)) out.push("no note");
  if (/logo:/.test(card.line)) out.push("draws a logo file");
  const all = `${card.summary} ${card.detail} ${card.note}`;
  if (/\b(live|every business|all businesses|approved|certified|partner|official|guarantee)/i.test(all)) out.push("over-claims");
  if (!/own Stripe account/.test(card.summary) || !/own Stripe account/.test(card.detail)) out.push("does not say the money goes to the business's own account");
  if (!/no commission/.test(card.detail) || !/Stripe's own fees apply/.test(card.detail)) out.push("fees not stated");
  // Short links (30 Oct 2026): the link stays open until paid or cancelled — the old "24 hours" is now false.
  if (!/until it is paid or you cancel it/.test(card.detail) || /24 hours/.test(card.detail)) out.push("lifetime not stated, or the old 24 hours");
  if (!/on request/.test(card.note)) out.push("limited note does not say on request");
  return out;
}

const dir = read("app/integrations/IntegrationsDirectory.tsx");
const lines = dir.split("\n").filter(l => /\{ name: "Stripe"/.test(l));
expect("exactly one Stripe card", lines.length === 1);
const en = PUBLIC_SITE_TRANSLATIONS.English as Record<string, string>;
const real: Card = { line: lines[0] ?? "", summary: en[KEYS[0]] ?? "", detail: en[KEYS[1]] ?? "", note: en[KEYS[2]] ?? "" };

const mutants: Array<[string, Card]> = [
  ["state live", { ...real, line: real.line.replace('state: "limited"', 'state: "live"') }],
  ["every business", { ...real, note: real.note.replace("business by business", "for every business") }],
  ["approved", { ...real, detail: `${real.detail} Approved by Stripe.` }],
  ["no own account", { ...real, summary: real.summary.replace("your own Stripe account", "NivaDesk's account") }],
  ["no fees", { ...real, detail: real.detail.replace("NivaDesk takes no commission; Stripe's own fees apply. ", "") }],
  ["no lifetime", { ...real, detail: real.detail.replace(" The link is short, can use your own domain, and stays open until it is paid or you cancel it.", "") }],
  ["old 24 hours", { ...real, detail: real.detail + " Each link stays open for 24 hours." }],
  ["no on request", { ...real, note: real.note.replace("Available on request", "Available") }],
];
for (const [name, mutant] of mutants) expect(`the rules catch the mutant: ${name}`, cardProblems(mutant).length > 0);
const problems = cardProblems(real);
expect(`the real card passes the rules${problems.length ? ` (${problems.join("; ")})` : ""}`, problems.length === 0);

// ---- twelve languages ----------------------------------------------------------------------------
expect("twelve languages", LANGS.length === 12);
for (const lang of LANGS) {
  const table = PUBLIC_SITE_TRANSLATIONS[lang] as Record<string, string>;
  for (const key of KEYS) {
    const text = String(table?.[key] ?? "").trim();
    expect(`${lang} ${key} present`, text.length > 0);
    if (lang !== "English") expect(`${lang} ${key} translated`, text !== en[key]);
    expect(`${lang} ${key} names Stripe`, text.includes("Stripe"));
  }
  if (lang !== "English") {
    expect(`${lang} detail no longer says 24 hours`, !String(table["integrations.detail.stripe"]).includes("24"));
  }
}

console.log(failures.length ? `${failures.length} of ${checks} stripe-card checks FAILED` : `All ${checks} stripe-card checks passed.`);
if (failures.length) process.exit(1);
