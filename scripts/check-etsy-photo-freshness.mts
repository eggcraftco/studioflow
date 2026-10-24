/**
 * ETSY-E2E r2 (24 Oct 2026): Etsy product photo freshness. Etsy API Terms: listing
 * content shown must not be more than 6 hours older than Etsy's. A photo is never
 * shown at or after its expiresAtMs; it becomes the placeholder + "View on Etsy" and
 * the server is asked again. Errors, empty addresses and broken images are the same
 * placeholder and never break the order screen.
 *
 * Run: npm run test:etsy-photo-freshness   (npx tsx scripts/check-etsy-photo-freshness.mts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0; let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const lib = await import("../lib/studioflow/etsyListingPhotos").catch(() => ({})) as Record<string, any>;
const need = (name: string) => { assert.equal(typeof lib[name], "function", `lib/studioflow/etsyListingPhotos.ts: ${name} missing`); return lib[name]; };
// tsx compiles the app's JSX with the classic runtime; the app files rely on Next's automatic one.
(globalThis as Record<string, unknown>).React = React;
// The panel must load without a Firebase app (the client is imported on use).
const panelModule = await import("../app/orders/EtsySourcePanel").catch((error) => ({ loadError: error })) as Record<string, any>;
const missing = () => { throw new Error(`EtsySourcePanel did not load: ${panelModule.loadError?.message}`); };
const EtsySourcePanel = panelModule.EtsySourcePanel ?? missing;
const EtsyProductPhoto = panelModule.EtsyProductPhoto ?? missing;

const H = 3600_000;
const NOW = Date.now();
const IMG = "https://i.etsystatic.com/1/r/il/abc/1/il_570xN.1.jpg";
const photo = (over: Record<string, unknown>) => ({ transactionId: "t1", listingId: "123", url: IMG, thumbUrl: IMG, alt: "Mug", listingUrl: "https://www.etsy.com/listing/123", ...over });
const source = { receiptId: "9", isPaid: true, buyerNote: "Please gift wrap", items: [{ title: "Blue mug", listingId: "123", quantity: 1 }] };
const draw = (photos: unknown[], reason = "") => renderToStaticMarkup(React.createElement(EtsySourcePanel, { source, photos: { photos, reason, loading: false }, language: "English", showMoney: false }));

await check("expiry: server expiresAtMs; else fetchedAtMs + 5h50m; else call time + 5h50m", () => {
  const norm = need("normaliseEtsyPhotosResponse");
  const called = 1_000_000;
  assert.equal(norm({ ok: true, fetchedAtMs: 10, expiresAtMs: 10 + 6 * H, photos: [photo({ fetchedAtMs: 10, expiresAtMs: 10 + 6 * H })] }, called).photos[0].expiresAtMs, 10 + 6 * H);
  assert.equal(norm({ ok: true, expiresAtMs: 99 * H, photos: [photo({})] }, called).photos[0].expiresAtMs, 99 * H, "top-level expiry");
  assert.equal(norm({ ok: true, photos: [photo({ fetchedAtMs: 500 })] }, called).photos[0].expiresAtMs, 500 + (5 * 60 + 50) * 60_000);
  assert.equal(norm({ ok: true, photos: [photo({})] }, called).photos[0].expiresAtMs, called + (5 * 60 + 50) * 60_000);
  assert.deepEqual(norm(null, called), { photos: [], reason: "", loading: false });
  assert.deepEqual(norm({ photos: "garbage" }, called).photos, []);
});
await check("an expired photo is hidden: placeholder + 'View on Etsy'; a fresh one is shown", () => {
  const fresh = draw([photo({ expiresAtMs: NOW + H })]);
  assert.match(fresh, /<img src="https:\/\/i\.etsystatic\.com\//);
  const expired = draw([photo({ expiresAtMs: NOW - 1 })]);
  assert.doesNotMatch(expired, /<img /, "expired photo still drawn");
  assert.match(expired, /data-etsy-photo-placeholder=""/);
  assert.match(expired, /href="https:\/\/www\.etsy\.com\/listing\/123"/);
  assert.match(expired, /View on Etsy/);
  const atExpiry = renderToStaticMarkup(React.createElement(EtsyProductPhoto, { photo: photo({ expiresAtMs: Date.now() }), size: 56, label: "Product photo from Etsy" }));
  assert.doesNotMatch(atExpiry, /<img /, "a photo AT its expiry is not shown");
  assert.equal(need("etsyPhotoIsShowable")(photo({ expiresAtMs: 0 }), NOW), false, "no expiry = not shown");
});
await check("expired photos are asked for again; a fresh cached answer serves a reopen", async () => {
  need("clearEtsyPhotoCache")();
  let clock = 1_000_000;
  let calls = 0;
  const call = async () => { calls += 1; return { ok: true, fetchedAtMs: clock, expiresAtMs: clock + 6 * H, photos: [photo({ fetchedAtMs: clock, expiresAtMs: clock + 6 * H })] }; };
  const load = need("loadEtsyListingPhotos");
  const first = await load("o1", call, () => clock);
  assert.equal(calls, 1);
  assert.equal(need("nextEtsyPhotoExpiry")(first.photos), 1_000_000 + 6 * H, "the screen schedules its refetch at the earliest expiry");
  clock += 5 * H;
  await load("o1", call, () => clock);
  assert.equal(calls, 1, "reopen within the 6 h used the fresh cache");
  clock = 1_000_000 + 6 * H;
  const again = await load("o1", call, () => clock);
  assert.equal(calls, 2, "at the expiry the cache is not used: Etsy is asked again");
  assert.equal(again.photos[0].expiresAtMs, clock + 6 * H);
  assert.equal(need("readEtsyPhotoCache")("o1", clock + 6 * H), null, "the module cache respects expiry");
});
await check("the hook refetches at the earliest expiry while the order stays open", () => {
  const panel = readFileSync(join(root, "app/orders/EtsySourcePanel.tsx"), "utf8");
  const hook = panel.slice(panel.indexOf("export function useEtsyListingPhotos"), panel.indexOf("export class EtsySafe"));
  assert.match(hook, /nextEtsyPhotoExpiry\(next\.photos\)/);
  assert.match(hook, /setTimeout\(/);
  assert.match(hook, /setRound\(/);
  assert.match(hook, /\[orderId, enabled, round\]/);
  assert.match(hook, /clearTimeout\(timer\)/);
  assert.match(hook, /loadEtsyListingPhotos\(orderId, callGetEtsyListingPhotos\)/);
});
await check("callable error → placeholder + 'View on Etsy', the rest of the panel renders", async () => {
  need("clearEtsyPhotoCache")();
  const answer = await need("loadEtsyListingPhotos")("o2", async () => { throw new Error("functions/unavailable"); });
  assert.deepEqual(answer, { photos: [], reason: "unavailable", loading: false });
  const html = draw(answer.photos, answer.reason);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /data-etsy-photo-placeholder=""/);
  assert.match(html, /href="https:\/\/www\.etsy\.com\/listing\/123"/, "View on Etsy from the listing id");
  assert.match(html, /Blue mug/);
  assert.match(html, /Please gift wrap/);
  assert.match(html, /Product photos open on Etsy\./);
});
await check("empty url and a non-Etsy host → placeholder; broken image has onError", () => {
  assert.doesNotMatch(draw([photo({ url: "", thumbUrl: "", expiresAtMs: NOW + H })]), /<img /);
  assert.doesNotMatch(draw([photo({ url: "https://evil.example/x.jpg", thumbUrl: "", expiresAtMs: NOW + H })]), /<img /);
  const panel = readFileSync(join(root, "app/orders/EtsySourcePanel.tsx"), "utf8");
  assert.match(panel, /onError=\{\(\) => setBroken\(true\)\}/);
});
await check("EtsySafe: anything the Etsy parts throw becomes the fallback, never a broken order screen", () => {
  const { EtsySafe } = panelModule;
  assert.equal(typeof EtsySafe, "function", "EtsySafe missing");
  assert.deepEqual(EtsySafe.getDerivedStateFromError(new Error("x")), { failed: true });
  const boundary = new EtsySafe({ children: "panel", fallback: "fallback" });
  assert.equal(boundary.render(), "panel");
  boundary.state = { failed: true };
  assert.equal(boundary.render(), "fallback");
  // A garbage photo answer does not throw while drawing.
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(EtsySourcePanel, { source, photos: null, language: "English", showMoney: false })));
});
await check("order screen: the preview photo is fresh-only, wrapped in EtsySafe, placeholder links to Etsy", () => {
  const detail = readFileSync(join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
  assert.match(detail, /etsyPhotos\.photos\.find\(\(row\) => etsyPhotoIsShowable\(row, Date\.now\(\), true\)\)/);
  assert.match(detail, /<EtsySafe>\s*<figure className="app-preview-etsy">/);
  assert.match(detail, /listingUrl=\{etsyFirstPhotoLink\}/);
  const panel = readFileSync(join(root, "app/orders/EtsySourcePanel.tsx"), "utf8");
  assert.match(panel, /return <EtsySafe><EtsySourcePanelBody \{\.\.\.props\} \/><\/EtsySafe>;/);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
