// The page a business's customer lands on after Stripe's hosted payment page (STRIPE-LINKS, 29 Oct 2026).
//
//   1. the copy: twelve languages, every sentence present and translated; the paid sentence never claims the
//      money has arrived (the address is not proof — the webhook is)
//   2. reading the address and the browser: only "paid" / "cancelled" are statuses; Accept-Language picks the
//      best language the page has, else English; Arabic is right-to-left
//   3. the page itself, read from source: public (outside the app shell, no sign-in, no data call), never
//      indexed, rendered per request, at the path the server sends customers to
//
//   npm run test:payment-return
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PAYMENT_RETURN_COPY,
  PAYMENT_RETURN_LANGUAGES,
  PAYMENT_RETURN_PATH,
  paymentReturnDirection,
  paymentReturnLanguage,
  paymentReturnStatus
} from "../lib/publicSite/paymentReturn.ts";

const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

let checks = 0;
let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}

// ---- 1. the copy ---------------------------------------------------------------------------------
const keys = Object.keys(PAYMENT_RETURN_COPY.en) as Array<keyof typeof PAYMENT_RETURN_COPY.en>;
expect("twelve languages", PAYMENT_RETURN_LANGUAGES.length === 12 && Object.keys(PAYMENT_RETURN_COPY).length === 12);
expect("eight sentences per language", keys.length === 8, String(keys.length));
for (const lang of PAYMENT_RETURN_LANGUAGES) {
  const copy = PAYMENT_RETURN_COPY[lang];
  const empty = keys.filter(k => !String(copy?.[k] ?? "").trim());
  expect(`${lang}: every sentence present`, empty.length === 0, empty.join(","));
  const leftovers = keys.filter(k => /[{}]|TODO|\bxx\b/i.test(String(copy?.[k] ?? "")));
  expect(`${lang}: no placeholders`, leftovers.length === 0, leftovers.join(","));
  if (lang !== "en") {
    const untranslated = keys.filter(k => copy[k] === PAYMENT_RETURN_COPY.en[k]);
    expect(`${lang}: translated, not English`, untranslated.length === 0, untranslated.join(","));
  }
  expect(`${lang}: names Stripe in the secure line`, copy.secure.includes("Stripe"));
}
const paidEn = `${PAYMENT_RETURN_COPY.en.paidTitle} ${PAYMENT_RETURN_COPY.en.paidBody}`;
expect("the paid sentence does not claim the money arrived", !/received|arrived|successful|is complete|has been paid/i.test(paidEn), paidEn);
expect("the paid sentence says Stripe confirms it", /Stripe confirms/.test(PAYMENT_RETURN_COPY.en.paidBody));

// ---- 2. reading the address and the browser ---------------------------------------------------------
const statusCases: Array<[string | string[] | undefined, string]> = [
  ["paid", "paid"], ["PAID", "paid"], [" cancelled ", "cancelled"], ["canceled", "unknown"], ["", "unknown"],
  [undefined, "unknown"], [["paid", "paid"], "unknown"], ["paid&x=1", "unknown"], ["<script>", "unknown"]
];
for (const [raw, want] of statusCases) expect(`status ${JSON.stringify(raw)} -> ${want}`, paymentReturnStatus(raw) === want);
const langCases: Array<[string | null, string]> = [
  ["tr-TR,tr;q=0.9,en;q=0.8", "tr"], ["en-GB", "en"], ["xx-YY, de;q=0.5", "de"], ["pt-BR", "pt"], ["zh-Hant-TW", "zh"],
  ["fr;q=0.2, ja;q=0.9", "ja"], ["ar", "ar"], ["hi-IN", "hi"], ["ru;q=0, it", "it"], ["*", "en"], ["", "en"], [null, "en"],
  [";;;,,q=abc", "en"], ["es-419", "es"]
];
for (const [header, want] of langCases) expect(`Accept-Language ${JSON.stringify(header)} -> ${want}`, paymentReturnLanguage(header) === want);
expect("Arabic is right-to-left, the others left-to-right",
  PAYMENT_RETURN_LANGUAGES.every(l => paymentReturnDirection(l) === (l === "ar" ? "rtl" : "ltr")));

// ---- 3. the page --------------------------------------------------------------------------------------
const pageFile = `app${PAYMENT_RETURN_PATH}/page.tsx`;
expect(`the page answers ${PAYMENT_RETURN_PATH}`, existsSync(path.join(webRoot, pageFile)), pageFile);
const page = existsSync(path.join(webRoot, pageFile)) ? read(pageFile) : "";
expect("never indexed", /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/.test(page));
expect("rendered per request (status and language)", /export const dynamic = "force-dynamic"/.test(page));
expect("reads the browser language on the server", /headers\(\)\)\.get\("accept-language"\)/.test(page));
expect("no sign-in, no data call, no client code", !/useAuth|httpsCallable|firebase|"use client"|fetch\(/.test(page));
expect("sets lang and dir on the page", /lang=\{language\}/.test(page) && /dir=\{paymentReturnDirection\(language\)\}/.test(page));
const frame = read("components/AppRouteFrame.tsx");
expect("outside the app shell (no /pay app route)", !/"\/pay"/.test(frame));

console.log(failures ? `${failures} of ${checks} payment-return checks FAILED` : `All ${checks} payment-return checks passed.`);
if (failures) process.exit(1);
