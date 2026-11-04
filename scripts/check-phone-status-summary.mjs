// Order page on a phone: the status strip opens folded (owner, 3 Nov 2026).
//
// "When we open an order on the phone the product part at the top takes so much room that I cannot see the order
// below it." At 375 × 812 the sticky header was 508 px (toolbar 201, status strip 249, jump bar 52) and left the
// order 228 px. The strip now opens as a two-line summary — the steps as small bars, the current step, the delivery,
// then paid · remaining — and a tap opens the tiles; the chevron in the Production tile folds them again. The choice
// is kept on this device. From the source alone (no browser):
//   1. the summary is a real button that opens the strip, the fold chevron closes it, both labelled and translated;
//   2. the choice is read from and written to localStorage under one key, folded unless "true";
//   3. CSS: the summary and the chevron show only at ≤ 640 px; folded hides the tiles, open shows the chevron;
//   4. the summary repeats the tiles' own figures (the same delivery label, Paid / Remaining, blocked step).
//
//   node scripts/check-phone-status-summary.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const read = (rel) => readFileSync(path.join(webRoot, rel), "utf8");
const page = read("app/orders/OrderDetailContent.tsx");
const css = read("app/globals.css");
const translations = read("lib/studioflow/orderStackViewTranslations.ts");
const failures = [];
let checks = 0;
const check = (label, ok) => {
  checks += 1;
  if (!ok) failures.push(label);
};

// 1. The two controls.
const stripStart = page.indexOf("function renderStatusStrip()");
const stripEnd = page.indexOf("\n  }\n", page.indexOf("{renderHeaderMeta()}", stripStart));
const strip = page.slice(stripStart, stripEnd);
check("renderStatusStrip found", stripStart > 0 && stripEnd > stripStart);
check("the strip carries is-open / is-folded", strip.includes('statusStripOpen ? "order-status-strip is-open" : "order-status-strip is-folded"'));
const summaryStart = strip.indexOf('className="order-status-compact"');
// A tag's text: from "<button" to the line that closes it (">" alone; an arrow function's "=>" is not the end).
const tagAt = (at) => strip.slice(strip.lastIndexOf("<button", at), strip.indexOf("\n", strip.indexOf("onClick=", at)) + 1);
const summaryTag = tagAt(summaryStart);
check("summary is a button", summaryTag.startsWith("<button") && summaryTag.includes('type="button"'));
check("summary opens the strip", summaryTag.includes("onClick={() => changeStatusStripOpen(true)}"));
check("summary says it is closed", summaryTag.includes("aria-expanded={false}"));
check("summary is labelled", summaryTag.includes('t("Show status details")'));
const foldStart = strip.indexOf('className="order-status-fold"');
const foldTag = tagAt(foldStart);
check("fold chevron is a button in the Production tile's head", foldStart > strip.indexOf('className="order-status-tile__head"') && foldTag.includes('type="button"'));
check("fold chevron closes the strip", foldTag.includes("onClick={() => changeStatusStripOpen(false)}"));
check("fold chevron says it is open", foldTag.includes("aria-expanded={true}"));
check("fold chevron is labelled", foldTag.includes('aria-label={t("Hide status details")}'));
check("summary comes first, before the Production tile", summaryStart > 0 && summaryStart < strip.indexOf('className="order-status-tile is-production"'));

// 2. Kept on this device.
check("one storage key", /const ORDER_STATUS_STRIP_OPEN_KEY = "orderDetailStatusStripOpenV1";/.test(page));
check("folded unless stored true", /setStatusStripOpen\(window\.localStorage\.getItem\(ORDER_STATUS_STRIP_OPEN_KEY\) === "true"\)/.test(page));
check("starts folded before storage is read", /const \[statusStripOpen, setStatusStripOpen\] = useState\(false\);/.test(page));
check("writes the choice", /window\.localStorage\.setItem\(ORDER_STATUS_STRIP_OPEN_KEY, String\(open\)\)/.test(page));
check("focus moves to the control that undoes it", page.includes('open ? "[data-order-status-fold]" : "[data-order-status-compact]"'));

// 3. CSS: phones only.
const hidden = css.match(/\n\.order-status-compact,\n\.order-status-fold \{ display: none; \}/);
check("summary and chevron hidden by default", Boolean(hidden));
const media = css.slice(css.indexOf("@media (max-width: 640px) {\n  .order-status-strip.is-folded"));
const mediaBlock = media.slice(0, media.indexOf("\n}\n"));
check("folded phone strip hides the tiles", mediaBlock.includes(".order-status-strip.is-folded > :not(.order-status-compact) { display: none; }"));
check("folded phone strip shows the summary", mediaBlock.includes(".order-status-strip.is-folded > .order-status-compact { display: grid; }"));
check("open phone strip shows the chevron", mediaBlock.includes(".order-status-strip.is-open .order-status-fold { display: inline-grid; }"));
check("the summary is a 44 px touch target", /\.order-status-compact \{[^}]*min-height: 44px;/.test(css));
check("condensed header still hides the whole strip", css.includes(".order-detail-head.is-condensed .order-status-strip { display: none; }"));
check("dark theme summary background", css.includes('html[data-studio-theme="dark"] .order-status-compact {'));

// 4. Same figures as the tiles.
check("one delivery label for summary and tile", (strip.match(/\{deliveryLabel\}/g) || []).length === 2);
check("summary shows Paid and Remaining", /order-status-compact__payment[\s\S]{0,400}t\("Paid"\)[\s\S]{0,300}t\("Remaining"\)/.test(strip));
check("summary payment is finance-gated", /\{canSeeFinance \? \(\s*<span className="order-status-compact__payment">/.test(strip));
check("summary names a held step Blocked", strip.includes('currentHeld ? t("Blocked") : t(current.value)'));
check("tile segments and summary bars share one tone rule", (strip.match(/segmentTone\(step\)/g) || []).length === 2);

// Translations: both labels in the ten other languages.
for (const key of ["Show status details", "Hide status details"]) {
  const at = translations.indexOf(`"${key}": {`);
  const entry = at >= 0 ? translations.slice(at, translations.indexOf("}", at)) : "";
  check(`${key}: translated`, at >= 0);
  for (const language of ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"]) {
    check(`${key}: ${language}`, entry.includes(`"${language}": "`));
  }
}

if (failures.length) {
  console.error(`check-phone-status-summary: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-phone-status-summary: ${checks} checks passed`);
