/**
 * Etsy API Terms compliance (24 Oct 2026). Etsy's API Terms §5 forbid sending Etsy
 * buyers order, delivery and tracking information; the trademark notice (T1) is
 * Etsy's wording, verbatim, never translated. This probe holds the web to both:
 * one Etsy-order rule, the notices where the seller could otherwise message a buyer,
 * and T1/T2/T3 on the Etsy screens.
 *
 * Run: npm run test:etsy-compliance   (npx tsx scripts/check-etsy-compliance.mts)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let failed = 0; let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`); }
}
const ROOT = new URL("..", import.meta.url).pathname;
const read = (path: string) => { try { return readFileSync(join(ROOT, path), "utf8"); } catch { return ""; } };

const T1 = "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.";
const T7 = "Etsy order — NivaDesk does not send status, delivery or tracking messages to Etsy buyers (Etsy's API terms). Add tracking on Etsy; Etsy tells the buyer.";
const M2 = "Etsy order — NivaDesk does not send this link to the buyer. If you share it yourself, use Etsy Messages.";
const M3 = "Etsy order — NivaDesk does not send this reply to the buyer. Paste it into Etsy Messages yourself.";
const M4 = "This conversation is linked to an Etsy order. NivaDesk can't send replies here (Etsy's API terms) — reply in Etsy Messages. Reading, linking and notes still work.";
const M5 = "Etsy order — the buyer's e-mail is not sent to DHL.";

const lib = await import("../lib/studioflow/etsyOrder").catch(() => ({})) as Record<string, any>;
const fn = (name: string) => { assert.equal(typeof lib[name], "function", `lib/studioflow/etsyOrder.ts: ${name} missing`); return lib[name]; };

// ── The one Etsy-order rule ────────────────────────────────────────────────
await check("isEtsyOrder: etsySource object → Etsy", () => {
  assert.equal(fn("isEtsyOrder")({ id: "abc", etsySource: { receiptId: "1" } }), true);
});
await check("isEtsyOrder: commerce.provider 'Etsy' (any case) → Etsy", () => {
  assert.equal(fn("isEtsyOrder")({ id: "abc", commerce: { provider: "Etsy" } }), true);
  assert.equal(fn("isEtsyOrder")({ id: "abc", commerce: { provider: "etsy" } }), true);
  assert.equal(fn("isEtsyOrder")({ id: "abc", commerceProvider: "etsy" }), true, "list rows carry commerceProvider");
});
await check("isEtsyOrder: customFields.Source ' etsy ' (trim, lowercase) → Etsy", () => {
  assert.equal(fn("isEtsyOrder")({ id: "abc", customFields: { Source: " etsy " } }), true);
  assert.equal(fn("isEtsyOrder")({ id: "abc", customFields: { Source: "Etsy" } }), true);
});
await check("isEtsyOrder: importer id etsy_… alone → Etsy", () => {
  assert.equal(fn("isEtsyOrder")({ id: "etsy_123_456" }), true);
  assert.equal(fn("isEtsyOrderId")("etsy_9"), true);
  assert.equal(fn("isEtsyOrderId")("woo_9"), false);
});
await check("isEtsyOrder: a plain order, a Woo order, null → not Etsy", () => {
  const is = fn("isEtsyOrder");
  assert.equal(is({ id: "a1", customFields: {}, commerce: null }), false);
  assert.equal(is({ id: "woo_1", customFields: { Source: "WooCommerce" }, commerce: { provider: "woocommerce" } }), false);
  assert.equal(is({ id: "x", etsySource: null }), false);
  assert.equal(is(null), false);
  assert.equal(is(undefined), false);
});

// ── T1 verbatim, the old variant nowhere ──────────────────────────────────
const SECTION = "app/settings/EtsyIntegrationSection.tsx";
const PANEL = "app/orders/EtsySourcePanel.tsx";
const DIRECTORY = "app/integrations/IntegrationsDirectory.tsx";
for (const file of [SECTION, PANEL, DIRECTORY]) {
  await check(`T1 verbatim in ${file}`, () => { assert.ok(read(file).includes(T1), `${file} lacks the exact T1 string`); });
}
await check("T1 shown in every Etsy settings state (not set up, before connecting, connected)", () => {
  const src = read(SECTION);
  const footers = (src.match(/<EtsyLegalNotes t=\{t\}/g) || []).length;
  assert.ok(footers >= 3, `EtsyLegalNotes rendered in ${footers} states, want ≥ 3`);
});
await check("old reworded variant ('uses the Etsy API but') appears nowhere in app/, components/, lib/", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = join(dir, name);
      const st = statSync(join(ROOT, rel));
      if (st.isDirectory()) walk(rel);
      else if (/\.(tsx?|mts|js|json|md)$/.test(name) && /uses the Etsy API but/i.test(readFileSync(join(ROOT, rel), "utf8"))) hits.push(rel);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(dir);
  assert.deepEqual(hits, []);
});
await check("T1 is never translated (studioT returns it unchanged in Türkçe)", async () => {
  const { studioT, studioTranslationKeys } = await import("../lib/studioflow/language");
  assert.equal(studioT(T1, "Türkçe"), T1);
  assert.ok(!studioTranslationKeys().includes(T1), "T1 must not be a translation key");
});

// ── T2 + T3 on the Etsy settings section ──────────────────────────────────
await check("T2: 'Questions about the Etsy connection? Email' + mailto:contact@nivadesk.co.uk", () => {
  const src = read(SECTION);
  assert.ok(src.includes("Questions about the Etsy connection? Email"), "T2 text missing");
  assert.ok(src.includes('href="mailto:contact@nivadesk.co.uk"'), "T2 mailto link missing");
});
await check("T3: Terms → /terms, Privacy Policy → /privacy, new tab", () => {
  const src = read(SECTION);
  assert.ok(src.includes("By connecting Etsy you agree to the NivaDesk {terms} and our {privacy}."), "T3 sentence missing");
  assert.match(src, /href="\/terms" target="_blank" rel="noopener noreferrer">\{t\("Terms"\)\}/);
  assert.match(src, /href="\/privacy" target="_blank" rel="noopener noreferrer">\{t\("Privacy Policy"\)\}/);
});

// ── Render: the Etsy order panel shows T1 ─────────────────────────────────
(globalThis as Record<string, unknown>).React = React;
await check("render: Etsy order panel prints T1 verbatim (English and Türkçe)", async () => {
  const mod = await import("../app/orders/EtsySourcePanel").catch((error) => ({ loadError: error })) as Record<string, any>;
  assert.ok(mod.EtsySourcePanel, `EtsySourcePanel did not load: ${mod.loadError?.message}`);
  for (const language of ["English", "Türkçe"]) {
    const html = renderToStaticMarkup(React.createElement(mod.EtsySourcePanel, {
      source: { receiptId: "9", isPaid: true, items: [{ title: "Mug", listingId: "1", quantity: 1 }], fetchedAtMs: Date.UTC(2026, 9, 24) },
      photos: { photos: [], reason: "", loading: false }, language, showMoney: false
    }));
    assert.ok(html.includes(T1.replace(/'/g, "&#x27;")), `${language}: T1 not rendered verbatim`);
  }
});

// ── M1: Automatic Updates locked on an Etsy order ─────────────────────────
const DETAIL = read("app/orders/OrderDetailContent.tsx");
await check("M1: Etsy rule decided by isEtsyOrder (with etsySource, commerce, customFields, id)", () => {
  assert.match(DETAIL, /const etsyBuyerMessagingBlocked = orderComesFromEtsy\(\{ id: order\.id, commerce: order\.commerce, customFields: order\.customFields, etsySource \}\)/);
});
await check("M1: Automatic Updates switch and channel pills render OFF, disabled, aria-disabled for Etsy", () => {
  assert.match(DETAIL, /const autoLocked = etsyBuyerMessagingBlocked;/);
  assert.match(DETAIL, /const auto = autoLocked \? \{ \.\.\.portal\.autoUpdates, enabled: false, email: false, sms: false \} : portal\.autoUpdates;/);
  assert.match(DETAIL, /className=\{`portal-switch \$\{auto\.enabled \? "is-on" : ""\}`\}\s+disabled=\{!canEditPortal \|\| autoLocked\}\s+aria-disabled=/);
  assert.equal((DETAIL.match(/onClick=\{\(\) => \{ if \(!autoLocked\) void savePortalPreferences/g) || []).length, 3, "all three auto-update controls guarded");
});
await check("M1: saveOrderPortalSettings never writes a changed autoUpdates for Etsy", () => {
  assert.match(DETAIL, /const nextAutoUpdates = etsyBuyerMessagingBlocked \? portal\.autoUpdates : autoUpdates;\s+try \{\s+await saveOrderPortalSettings\(workspace, order\.id, visibility, nextAutoUpdates\);/);
});
await check("M1: T7 note beside Automatic Updates, and instead of the tracking e-mail offer", () => {
  assert.match(DETAIL, /\{autoLocked \? \(\s+<p className="portal-hint" data-etsy-compliance="auto-updates" role="note">\{t\(ETSY_NO_BUYER_UPDATES_NOTE\)\}<\/p>/);
  assert.match(DETAIL, /cleanTrackingNumber\(order\.trackingNumber\) && etsyBuyerMessagingBlocked \? \(\s+<p [^>]*data-etsy-compliance="tracking-email"[^>]*>\{t\(ETSY_NO_BUYER_UPDATES_NOTE\)\}/);
  assert.equal(lib.ETSY_NO_BUYER_UPDATES_NOTE, T7);
});

// ── M2: copy links ────────────────────────────────────────────────────────
await check("M2: portal + estimate copy show the warning, and the post-copy notice is the warning", () => {
  assert.equal(lib.ETSY_COPY_LINK_NOTE, M2);
  assert.ok((DETAIL.match(/data-etsy-compliance="copy-link"/g) || []).length >= 3, "portal row + estimate row + estimate send");
  assert.match(DETAIL, /setPortalNotice\(etsyBuyerMessagingBlocked \? ETSY_COPY_LINK_NOTE : "Link copied\. Send it to your customer\."\)/);
  assert.match(DETAIL, /setEstimateNotice\(etsyBuyerMessagingBlocked \? ETSY_COPY_LINK_NOTE : "Link copied\. Send it to your customer\."\)/);
  assert.match(DETAIL, /etsyOrder=\{etsyBuyerMessagingBlocked\}\s*\/>/);
});
await check("M2: payment links (order card + Banking list) warn on Etsy orders", () => {
  const order = read("components/OrderPaymentLinks.tsx");
  assert.ok(order.includes("{t(ETSY_COPY_LINK_NOTE)}") && /etsyOrder && copiedId === row\.paymentRequestId/.test(order), "OrderPaymentLinks");
  const panel = read("components/PaymentLinksPanel.tsx");
  assert.ok(/isEtsyOrderId\(row\.orderId\)/.test(panel) && panel.includes("{t(ETSY_COPY_LINK_NOTE)}"), "PaymentLinksPanel");
});

// ── M3: Quick Reply ───────────────────────────────────────────────────────
await check("M3: Quick Reply shows the note near Copy when the reply is about an Etsy order", () => {
  assert.equal(lib.ETSY_QUICK_REPLY_NOTE, M3);
  const page = read("app/quick-reply/page.tsx");
  assert.match(page, /\{etsyOrderSelected \? \(\s+<p [^>]*data-etsy-compliance="quick-reply"[^>]*>\{t\(ETSY_QUICK_REPLY_NOTE\)\}/);
  assert.match(read("lib/studioflow/firestore.ts"), /isEtsy: isEtsyOrder\(\{/);
});

// ── M4: inbox ─────────────────────────────────────────────────────────────
await check("M4: inbox REPLY refusal map: etsy_order_messaging → the M4 sentence", () => {
  const text = fn("inboxReplyRefusalText");
  assert.equal(text({ code: "functions/failed-precondition", details: { reason: "etsy_order_messaging" } }), M4);
  assert.equal(text({ details: { reason: "something_else" } }), "");
  assert.equal(text(new Error("x")), "");
  assert.equal(lib.INBOX_REPLY_REFUSALS?.etsy_order_messaging, M4);
  assert.match(read("lib/studioflow/customerInbox.ts"), /export \{ INBOX_REPLY_REFUSALS, inboxReplyRefusalText \} from "\.\/etsyOrder";/);
});
await check("M4: inbox composer disabled and the note shown for an Etsy-linked conversation", () => {
  const inbox = read("app/inbox/InboxContent.tsx");
  assert.match(inbox, /const composerDisabled = linkedEtsyOrder \|\|/);
  assert.match(inbox, /if \(isEtsyOrderId\(orderId\)\) return true;/);
  assert.match(inbox, /\{linkedEtsyOrder \? \(\s+<div [^>]*data-etsy-compliance="inbox">\s+<p>\{t\(ETSY_INBOX_NOTE\)\}<\/p>/);
  assert.match(inbox, /const refusal = inboxReplyRefusalText\(failure\);/);
});

// ── M5: DHL draft ─────────────────────────────────────────────────────────
await check("M5: DHL draft hides the buyer e-mail on an Etsy order and never sends it", () => {
  assert.equal(lib.ETSY_DHL_EMAIL_NOTE, M5);
  const dialog = read("app/orders/ShipmentDraftDialog.tsx");
  assert.match(dialog, /\{etsyOrder \? \(\s+<p [^>]*data-etsy-compliance="dhl-email"[^>]*>\{t\(ETSY_DHL_EMAIL_NOTE\)\}/);
  assert.match(dialog, /email: etsyOrder \? "" : recipient\.email/);
  assert.match(read("app/orders/OrderShipmentsPanel.tsx"), /etsyOrder=\{etsyOrder\}/);
});

// ── Translations: Turkish for every note, English elsewhere ───────────────
await check("Türkçe: the notes are translated; Deutsch falls back to English", async () => {
  const { studioT } = await import("../lib/studioflow/language");
  for (const text of [T7, M2, M3, M4, M5, "Questions about the Etsy connection? Email"]) {
    assert.notEqual(studioT(text, "Türkçe"), text, `no Türkçe for: ${text.slice(0, 40)}…`);
  }
  assert.match(studioT("By connecting Etsy you agree to the NivaDesk {terms} and our {privacy}.", "Türkçe"), /\{terms\}.*\{privacy\}/);
  assert.equal(studioT(M4, "Deutsch"), M4);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
