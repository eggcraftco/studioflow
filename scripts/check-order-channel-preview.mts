// siparis-onizleme (7 Nov 2026): the shop photo on an order's Preview — the client rule, and its wiring.
//   npx tsx scripts/check-order-channel-preview.mts
// The rule (lib/studioflow/orderPreview.ts) is the same on iOS/Mac and Android. RED on the live base (no helper,
// no wiring), GREEN here.
import { readFileSync, existsSync } from "node:fs";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const failures: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };

const helperPath = at("lib/studioflow/orderPreview.ts");
expect("helper exists", existsSync(helperPath));
if (existsSync(helperPath)) {
  const m = await import(helperPath.href);
  const SHOPURL = "https://firebasestorage.googleapis.com/v0/b/b/o/companies%2Fw%2Fdesign_images%2Fchannel-shopify-abc-1.jpg?alt=media&token=t";
  const OWN = "https://firebasestorage.googleapis.com/v0/b/b/o/companies%2Fw%2Fdesign_images%2Fpreview-1.png?alt=media&token=s";
  const STATUS = "https://shop.myshopify.com/1/orders/abc/authenticate?key=k";
  const woo = m.channelPreviewFrom({ channelPreview: { url: SHOPURL, provider: "woocommerce", copiedAtMs: 1, filledDesignLink: true } });
  const ebay = m.channelPreviewFrom({ channelPreview: { url: SHOPURL, provider: "ebay", copiedAtMs: 1762516800000, filledDesignLink: false } });
  const legacy = m.channelPreviewFrom({ channelPreview: { url: SHOPURL, provider: "woocommerce" } });
  expect("a picture in designLink wins", m.effectivePreviewLink(OWN, ebay) === OWN && m.effectivePreviewLink(OWN, woo) === OWN);
  expect("a non-picture link + copy → copy", m.effectivePreviewLink(STATUS, woo) === SHOPURL);
  expect("blank designLink + a copy that filled it → blank (the studio removed it)", m.effectivePreviewLink("", woo) === "" && m.effectivePreviewLink("", legacy) === "");
  expect("blank designLink + eBay copy (never fills) → the copy", m.effectivePreviewLink("", ebay) === SHOPURL);
  expect("a non-picture link without a copy stays", m.effectivePreviewLink(STATUS, null) === STATUS);
  expect("picture test: path before ? ends in a picture extension", m.isPictureLink(OWN) && !m.isPictureLink(STATUS) && m.isPictureLink("https://x/a.JPEG") && !m.isPictureLink(""));
  expect("channelPreview read: https only", m.channelPreviewFrom({ channelPreview: { url: "http://evil.example/a.jpg" } }) === null
    && m.channelPreviewFrom({ channelPreview: { url: "javascript:alert(1)" } }) === null
    && m.channelPreviewFrom({}) === null && m.channelPreviewFrom({ channelPreview: "x" }) === null);
  expect("channelPreview read: the local Storage emulator is allowed", m.channelPreviewFrom({ channelPreview: { url: "http://127.0.0.1:9517/v0/b/demo/o/a.jpg?alt=media" } }) !== null);
  expect("eBay copy shown → its date caption; a studio picture or a Woo copy → none",
    m.previewCopyCaption("", ebay)?.kind === "ebay" && m.previewCopyCaption("", ebay)?.copiedAtMs === 1762516800000
    && m.previewCopyCaption(OWN, ebay) === null && m.previewCopyCaption(STATUS, woo) === null && m.previewCopyCaption("", null) === null);
}

const fsrc = readFileSync(at("lib/studioflow/firestore.ts"), "utf8");
expect("order lists use the effective link (3 list mappers)", (fsrc.match(/previewImageUrl: effectivePreviewLink\(firstStringValue\(/g) || []).length === 3 && (fsrc.match(/\), channelPreviewFrom\(data\)\),/g) || []).length === 3);
expect("order detail reads channelPreview", fsrc.includes("channelPreview: channelPreviewFrom(data),"));
expect("no client write carries channelPreview", !/channelPreview\s*:/.test(readFileSync(at("lib/studioflow/orders.ts"), "utf8")));
const dsrc = readFileSync(at("app/orders/OrderDetailContent.tsx"), "utf8");
expect("Preview card draws the shop photo after the studio's picture and before Etsy's", /isProbablyImageUrl\(order\.designLink\) \? \([\s\S]{0,200}\) : shopPreviewLink \? \([\s\S]{0,900}\) : !order\.designLink && etsyFirstPhoto/.test(dsrc));
expect("PDF uses the effective link and carries the caption", dsrc.includes("previewUrl: effectivePreviewLink(order.designLink, order.channelPreview),") && dsrc.includes("previewCaption: shopPreviewCaption,") && dsrc.includes('<div class="preview-caption">'));
expect("Preview card prints the eBay date caption under the copy", /shopPreviewCaption \? \([\s\S]{0,300}<figcaption>\{shopPreviewCaption\}<\/figcaption>/.test(dsrc) && dsrc.includes('t("Photo from the eBay listing")'));
const lsrc = readFileSync(at("lib/studioflow/language.ts"), "utf8");
const row = lsrc.split("\n").find((l) => l.startsWith('  "Photo from the eBay listing": {')) || "";
expect("the caption is translated into all 11 other languages", (row.match(/": "/g) || []).length === 11);
expect("phone fold counts the shop photo", dsrc.includes("preview: Boolean(order.designLink) || Boolean(shopPreviewLink) ||"));
expect("the Preview menu still edits designLink only", !/savePreviewLink\([^)]*channelPreview/.test(dsrc));

if (failures.length) { console.log(`ORDER-CHANNEL-PREVIEW FAIL ${failures.length}/${checks}`); for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
console.log(`ORDER-CHANNEL-PREVIEW PASS ${checks}/${checks}`);
