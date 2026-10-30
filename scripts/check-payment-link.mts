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
import { PAYMENT_LINK_COPY, PAYMENT_LINK_PATH_PREFIX, paymentLinkAmount, paymentLinkCode, paymentPageTheme } from "../lib/publicSite/paymentLink.ts";
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

// 4. Stripe for every workspace (30 Oct 2026): who is told the rail is here, and the country picker (SC-8)
const client = read("lib/studioflow/stripeConnect.ts");
expect("Settings asks with purpose \"settings\"", /getStripeConnection\(companyId, "settings"\)/.test(section));
expect("the order card / Banking gate asks with no purpose", /getStripeConnection\(id\)\s*\n?\s*\.then/.test(client) || /= getStripeConnection\(id\)/.test(client));
expect("purpose is only sent when given", /purpose \? \{ companyId, purpose \} : \{ companyId \}/.test(client));
expect("the chosen country reaches the server, upper-cased ISO only", /\/\^\[A-Z\]\{2\}\$\/\.test\(code\) \? \{ companyId, country: code \}/.test(client));
expect("the picker is shown for a first connect, and only with a country list", /status === "disconnected" && countryOptions\.length > 0 \? setPickingCountry\(true\)/.test(section));
expect("Continue is disabled until a country is chosen", /disabled=\{!country \|\| busy === "connect"\} onClick=\{\(\) => void connect\(country\)\}/.test(section));
expect("country names come from Intl in the reader's language", /new Intl\.DisplayNames\(\[studioLocaleTag\(language\)\], \{ type: "region" \}\)/.test(section));
for (const key of [
  "Country your business is registered in", "Choose a country", "Continue to Stripe",
  "Stripe needs this to open your account, and it cannot be changed later.",
  "Not in the list? Stripe does not accept businesses registered there yet.",
  "Customers get a receipt from Stripe by email only when Successful payments is turned on in your Stripe Dashboard (Settings → Customer emails).",
  "Choose the country your business is registered in, then connect Stripe.",
  "Stripe does not accept businesses registered in that country yet, so card payment links cannot be set up for it.",
  "Stripe could not start the setup just now. Try again in a moment; if it keeps failing, contact support."
]) {
  const line = language.split("\n").find(l => l.startsWith(`  ${JSON.stringify(key)}:`)) || "";
  const count = (line.match(/": "/g) || []).length;
  expect(`Stripe words in eleven languages: ${key.slice(0, 44)}`, count === 11, String(count));
}

// 5. A business's own look (SL-18, 30 Oct 2026): EGGcraft's shop on its payment page
const egg = { font: "poppins", titleFont: "serif", buttonColor: "#1346AF", buttonTextColor: "#ffffff", buttonShape: "pill", buttonUppercase: true,
  pageBackground: "#ffffff", textColor: "#2b2b2b", mutedColor: "#8f8f8f", heroImageUrl: "https://eggcraft.co.uk/wp-content/uploads/2025/10/3_3-1536x1536.webp",
  heroImageFocus: "top", layout: "product" };
expect("theme: a valid one passes, colours lower-cased", JSON.stringify(paymentPageTheme(egg)) === JSON.stringify({ ...egg, buttonColor: "#1346af" }));
const dropped = paymentPageTheme({ font: "comic", buttonColor: "red", heroImageUrl: "javascript:alert(1)", buttonUppercase: "yes", layout: "grid" });
expect("theme: what the page cannot draw is dropped", !!dropped && dropped.font === "default" && dropped.buttonColor === "" && dropped.heroImageUrl === ""
  && dropped.buttonUppercase === false && dropped.layout === "card");
expect("theme: http images are refused", paymentPageTheme({ heroImageUrl: "http://x.test/a.png" })?.heroImageUrl === "");
expect("theme: not an object = no theme", paymentPageTheme("x") === null && paymentPageTheme(null) === null);
expect("Poppins only when a theme asks, never preloaded", /Poppins\(\{[^}]*preload: false/.test(page) && /fontClassName=\{poppins\.variable\}/.test(page));
expect("the page re-checks the server's theme", /const theme = paymentPageTheme\(view\?\.theme\)/.test(content));
expect("the theme's button colour wins over the accent", /theme\?\.buttonColor \|\| \(view\?\.accentColor/.test(content));
expect("the hero image is the theme's https image only", /theme\?\.heroImageUrl \? \(/.test(content) && /<img src=\{theme\.heroImageUrl\}/.test(content));
expect("the shop's header bar only in the product layout", /productLayout && view\?\.logoUrl \? \(/.test(content));
const css = read("app/p/[code]/payLink.module.css");
expect("a themed page stays light in dark mode", /\.themed \{[^}]*color-scheme: light/.test(css) && /@media \(prefers-color-scheme: dark\) \{\s*\.themed/.test(css));
expect("the pill and uppercase button exist", /\.pill \{ border-radius: 999px/.test(css) && /\.upper \{ text-transform: uppercase/.test(css));
expect("the hero crop hides the illustration's caption", /\.heroTop \{ aspect-ratio: 1 \/ 0\.7; \}/.test(css) && /\.heroTop img \{ object-position: top; \}/.test(css));

console.log(failures ? `${failures} of ${checks} payment-link checks FAILED` : `All ${checks} payment-link checks passed.`);
process.exit(failures ? 1 : 0);
