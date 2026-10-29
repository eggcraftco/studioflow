// The customer's page behind a short payment link, /p/<code> (STRIPE-LINKS short links, 29 Oct 2026).
//
//   1. the copy: twelve languages, every sentence present, translated, and the order sentence keeps its
//      {reference}; the page never promises the money has arrived before the webhook says so
//   2. reading: only codes the server accepts are codes; amounts come from integer minor units with the
//      currency's own digits (GBP 2, JPY 0), never a guess
//   3. the page, read from source: public, never indexed, per request, sends no referrer; it asks the server
//      with the serving host, hands the browser only an https URL, and never builds a Stripe URL itself;
//      the settings block and the order card are wired
//
//   npm run test:payment-link
import { readFileSync } from "node:fs";
import path from "node:path";
import { PAYMENT_LINK_COPY, PAYMENT_LINK_PATH_PREFIX, paymentLinkAmount, paymentLinkCode } from "../lib/publicSite/paymentLink.ts";
import { PAYMENT_RETURN_LANGUAGES } from "../lib/publicSite/paymentReturn.ts";

const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

let checks = 0;
let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}

// 1. copy
const en = PAYMENT_LINK_COPY.en;
const keys = Object.keys(en) as (keyof typeof en)[];
expect("twelve languages", Object.keys(PAYMENT_LINK_COPY).length === 12 && PAYMENT_RETURN_LANGUAGES.every(l => l in PAYMENT_LINK_COPY));
for (const language of PAYMENT_RETURN_LANGUAGES) {
  const copy = PAYMENT_LINK_COPY[language];
  const missing = keys.filter(k => !String(copy[k] ?? "").trim());
  expect(`${language}: every sentence present`, missing.length === 0, missing.join(","));
  expect(`${language}: the order sentence keeps {reference}`, copy.forOrder.includes("{reference}"), copy.forOrder);
  if (language !== "en") {
    const same = keys.filter(k => k !== "poweredBy" && copy[k] === en[k]);
    expect(`${language}: translated, not English`, same.length === 0, same.join(","));
  }
}
expect("the open page does not claim the payment is done", !/received|confirmed|paid\b/i.test(en.pay + en.secure + en.opening));

// 2. reading
expect("a 12-character code is a code", paymentLinkCode("K7m2Qx9aBc3D") === "K7m2Qx9aBc3D");
expect("a path, a list or punctuation is not", paymentLinkCode("../etc") === "" && paymentLinkCode(["a", "b"]) === "" && paymentLinkCode("abc") === "" && paymentLinkCode("abcd-efgh-ijk") === "");
expect("GBP 12000 minor is £120.00 in English", paymentLinkAmount(12000, "GBP", "en") === "£120.00", paymentLinkAmount(12000, "GBP", "en"));
expect("JPY has no minor unit", /¥\s?1,?250|1,?250\s?¥|￥1,?250/.test(paymentLinkAmount(1250, "JPY", "en")), paymentLinkAmount(1250, "JPY", "en"));
expect("Turkish writes the comma decimal", paymentLinkAmount(1250, "GBP", "tr").includes("12,50"), paymentLinkAmount(1250, "GBP", "tr"));
expect("an unknown currency still shows a number", paymentLinkAmount(500, "XYZ1", "en").includes("5.00"), paymentLinkAmount(500, "XYZ1", "en"));

// 3. the page and its wiring, from source
const page = read("app/p/[code]/page.tsx");
const content = read("app/p/[code]/PaymentLinkContent.tsx");
expect("the server writes /p/<code>, and the page lives there", PAYMENT_LINK_PATH_PREFIX === "/p/");
expect("never indexed", /index:\s*false/.test(page) && /follow:\s*false/.test(page));
expect("no referrer leaves the page", /referrer:\s*"no-referrer"/.test(page));
expect("rendered per request", /dynamic\s*=\s*"force-dynamic"/.test(page));
expect("the language comes from Accept-Language", /accept-language/.test(page) && /paymentReturnLanguage/.test(page));
expect("outside the app shell: no sign-in, no workspace", !/useAuth|WorkspaceContext|AppShell/.test(page + content));
expect("both callables are asked with the serving host", /"getPaymentLinkForVisitor"/.test(content) && /"openPaymentLink"/.test(content) && /window\.location\.host/.test(content));
expect("only an https URL is followed", /\/\^https:\\\/\\\/\/\.test\(url\)/.test(content));
expect("no Stripe URL is built here", !/checkout\.stripe\.com/.test(content));
expect("no ids are rendered", !/paymentRequestId|companyId|orderId/.test(content));
const block = read("app/settings/PaymentLinkDomainBlock.tsx");
const section = read("app/settings/StripeIntegrationSection.tsx");
expect("settings: the block is owner-only and shown once links can be made", /capable && isOwner \? <PaymentLinkDomainBlock/.test(section));
expect("settings: it uses its own callable, not the client-domain ones", /managePaymentLinkDomain/.test(block) && !/requestClientDomain|verifyClientDomain/.test(block));
const card = read("components/OrderPaymentLinks.tsx");
const detail = read("app/orders/OrderDetailContent.tsx");
expect("order card: asks again while a link is open, and when the tab comes back", /setInterval\(again, 15000\)/.test(card) && /visibilitychange/.test(card));
expect("order card: a moved payment reloads the order", /onPaymentChanged=\{\(\) => \{ void onReloadOrder\(\); \}\}/.test(detail));
const language = read("lib/studioflow/language.ts");
for (const key of ["Payment link address", "Use this address", "Remove {host}? Payment links already sent on that address stop working.", "A payment domain is part of the Pro and Team plans."]) {
  const line = language.split("\n").find(l => l.startsWith(`  ${JSON.stringify(key)}:`)) || "";
  const count = (line.match(/": "/g) || []).length;
  expect(`settings words in eleven languages: ${key.slice(0, 40)}`, count === 11, String(count));
}

console.log(failures ? `${failures} of ${checks} payment-link checks FAILED` : `All ${checks} payment-link checks passed.`);
process.exit(failures ? 1 : 0);
