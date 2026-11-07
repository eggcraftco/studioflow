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
  const SHOP = "https://firebasestorage.googleapis.com/v0/b/b/o/companies%2Fw%2Fdesign_images%2Fchannel-shopify-abc-1.jpg?alt=media&token=t";
  const OWN = "https://firebasestorage.googleapis.com/v0/b/b/o/companies%2Fw%2Fdesign_images%2Fpreview-1.png?alt=media&token=s";
  const STATUS = "https://shop.myshopify.com/1/orders/abc/authenticate?key=k";
  expect("a picture in designLink wins", m.effectivePreviewLink(OWN, SHOP) === OWN);
  expect("a non-picture link + shop photo → shop photo", m.effectivePreviewLink(STATUS, SHOP) === SHOP);
  expect("blank designLink + shop photo → blank (the studio removed it)", m.effectivePreviewLink("", SHOP) === "");
  expect("a non-picture link without a shop photo stays", m.effectivePreviewLink(STATUS, "") === STATUS);
  expect("picture test: path before ? ends in a picture extension", m.isPictureLink(OWN) && !m.isPictureLink(STATUS) && m.isPictureLink("https://x/a.JPEG") && !m.isPictureLink(""));
  expect("channelPreview.url read: https only", m.channelPreviewUrlFrom({ channelPreview: { url: SHOP } }) === SHOP
    && m.channelPreviewUrlFrom({ channelPreview: { url: "http://evil.example/a.jpg" } }) === ""
    && m.channelPreviewUrlFrom({ channelPreview: { url: "javascript:alert(1)" } }) === ""
    && m.channelPreviewUrlFrom({}) === "" && m.channelPreviewUrlFrom({ channelPreview: "x" }) === "");
  expect("channelPreview.url read: the local Storage emulator is allowed", m.channelPreviewUrlFrom({ channelPreview: { url: "http://127.0.0.1:9517/v0/b/demo/o/a.jpg?alt=media" } }) !== "");
}

const fsrc = readFileSync(at("lib/studioflow/firestore.ts"), "utf8");
expect("order lists use the effective link (3 list mappers)", (fsrc.match(/previewImageUrl: effectivePreviewLink\(firstStringValue\(/g) || []).length === 3);
expect("order detail reads channelPreviewUrl", fsrc.includes("channelPreviewUrl: channelPreviewUrlFrom(data),"));
expect("no client write carries channelPreview", !/channelPreview\s*:/.test(readFileSync(at("lib/studioflow/orders.ts"), "utf8")));
const dsrc = readFileSync(at("app/orders/OrderDetailContent.tsx"), "utf8");
expect("Preview card draws the shop photo after the studio's picture and before Etsy's", /isProbablyImageUrl\(order\.designLink\) \? \([\s\S]{0,200}\) : shopPreviewLink \? \([\s\S]{0,400}\) : !order\.designLink && etsyFirstPhoto/.test(dsrc));
expect("PDF uses the effective link", dsrc.includes("previewUrl: effectivePreviewLink(order.designLink, order.channelPreviewUrl),"));
expect("phone fold counts the shop photo", dsrc.includes("preview: Boolean(order.designLink) || Boolean(shopPreviewLink) ||"));
expect("the Preview menu still edits designLink only", !/savePreviewLink\([^)]*channelPreview/.test(dsrc));

if (failures.length) { console.log(`ORDER-CHANNEL-PREVIEW FAIL ${failures.length}/${checks}`); for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
console.log(`ORDER-CHANNEL-PREVIEW PASS ${checks}/${checks}`);
