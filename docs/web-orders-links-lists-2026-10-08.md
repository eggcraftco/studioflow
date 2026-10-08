# Web — sipariş kaynak bağlantısı ve daraltılmış liste rayı (8 Ekim 2026)

Dal: `web-orders-links-lists-2026-10-08` (publish repo `hostinger`, `hostinger/main @ 7f71fb1d` üzerinden).
Durum: **kod hazır · izole test geçti · ekran kontrolü kısmi (statik harness) · CANLI DEĞİL.**

## 1. "Open in WordPress" önizleme görselini açıyordu

### Teşhis (dosya:satır — düzeltme öncesi `hostinger/main`)

| Nerede | Ne oluyordu |
|---|---|
| `app/orders/OrderDetailContent.tsx:1461` | `ChannelSourceStrip` bağlantıyı `stamp?.externalAdminUrl \|\| order.designLink` diye kuruyordu. `designLink` siparişin **önizleme** alanıdır: aynı dosyada `:6421` `<img src={order.designLink}>` olarak çizilir, `:4692` görsel yüklenince `designLink: downloadURL` yazılır, `:5292` yazdırma şablonuna `previewUrl: order.designLink` gider. Yani önizleme görseli yüklenen her siparişte "Open in WooCommerce" (ekranda `t("Open in") + providerDisplayName`; metin "WordPress" değil, Woo bağdaştırıcısı `providerDisplayName: "WooCommerce"` yazar) görseli açıyordu. |
| `functions/index.js:19964` (ana repo, eski Woo import yolu) | `designLink: cleanWooText(order?.permalink \|\| order?.url)` ve `Source: "WooCommerce"` yazar, `commerce` damgası YOKTUR. Bu siparişlerde şerit **her zaman** `designLink` yoluna düşüyordu; görsel yüklenmemişse mağazanın müşteri-yüzü permalink'ine, yüklenmişse görsele. |
| `functions/commerce/envelopeToOrder.js:131` | Engine de `designLink = source.provider_metadata.order_status_url` yazar (Woo: `permalink`, Shopify: `order_status_url`, Square: admin URL). Tek alan iki anlam taşıyor; bu notun kapsamı web, sunucu alanı değiştirilmedi. |
| `functions/commerce/adapters/woocommerce.js:140` | Doğru adres damgada zaten var: `external_admin_url = <siteUrl>/wp-admin/post.php?post=<externalId>&action=edit`; `siteUrl` bağlantı kaydından gelir (`functions/wooConnector.js:250, 470, 521`). Diğer bağdaştırıcılar: Shopify `https://<shop>/admin/orders/<id>`, Amazon `https://sellercentral.<pazar>/orders-v3/order/<id>`, Square `https://app.squareup(sandbox).com/dashboard/orders/overview/<id>`, eBay `…/mesh/ord/details?orderid=`, **Etsy `null`**. |
| `components/OrderListCard.tsx` ← `lib/studioflow/firestore.ts:1646` | Liste öğesinin `previewImageUrl` alanı son çare olarak `data.designLink`'e düşer; Woo permalink'i `<img>` olarak denenir (kırık görsel). Ray bunu yapmaz (aşağıda). |

### Ne değişti

- **`lib/studioflow/orderSourceLink.ts` (yeni, saf fonksiyon).** Girdi: `commerce` damgası (+ eski importlar için `customFields`), isteğe bağlı `connectedHosts`. `designLink` girdi bile değil. Kurallar: yalnız `https:`; kullanıcı adı/şifre yok; host sağlayıcının kendi hostu (Amazon Seller Central listesi, Square `app.squareup.com`/`app.squareupsandbox.com`, Shopify `*.myshopify.com`/`admin.shopify.com`); **WooCommerce'te host, workspace'in bağlı mağaza hostlarından biri olmalı**, yol `/wp-admin/post.php`, `post=` bu siparişin `externalId`'si olmalı. Shopify eski alanları (`Shopify Domain` + `Shopify Order ID`) okunmaz, sabit host üzerinde **kurulur**. eBay `ebayOrderLink`'e devredilir. Etsy ve stamp'siz eski Woo importu → bağlantı yok, sebep `no-address`. Manuel / web formu siparişi → `no-source` (şerit zaten çizilmez). Sebep metinleri `orderSourceLinkReasonText()`.
- **`lib/studioflow/useConnectedStoreHosts.ts` (yeni).** Yalnız Woo siparişinde `getWooConnections(companyId)` bir kez çağrılır, hostlar workspace başına önbelleğe alınır; okuma başarısızsa `[]` (bağlantı reddedilir, tahmin edilmez).
- **`app/orders/OrderDetailContent.tsx:1439-1493`** `ChannelSourceStrip`: `:1456` hostları okur, `:1468` `orderSourceLink(...)`; `:1483` bağlantı varsa `<a target="_blank" rel="noopener noreferrer" data-order-source-link="1">Open in {source} ↗`; `:1487` yoksa `<span class="shopify-source-link is-unavailable" aria-disabled title={sebep}>Order link not available</span>` — yanıltıcı bağlantı yok, sebep tooltipte. Prop tipi `companyId?` aldı, `designLink` prop'tan çıktı. Test `check-ebay-screens.mjs:308`'in beklediği `<ChannelSourceStrip order={order} showMoney={canSeeFinance} />` satırı aynen duruyor.
- **`app/orders/OrderDetailContent.tsx:6508`** önizleme kartı menüsündeki çevrilmemiş "Open" → `t("Open preview image")`, `rel="noopener noreferrer"`. Görseli açmak artık ayrı ve adı konmuş bir eylem.
- **`app/globals.css:15459`** `.shopify-source-link.is-unavailable` (soluk, noktalı alt çizgi, `cursor: help`).
- Shopify eski şeridi (`ShopifySourceStrip`, `:1384`) zaten sabit host üzerinde kuruyordu; `View in Shopify` metnine dokunulmadı (kapsam dışı; `rel="noreferrer"` kalıyor, `noopener` eklenmesi ayrı küçük iş).

### Diğer kanallar

| Kaynak | Davranış |
|---|---|
| WooCommerce (engine) | Damga adresi, bağlı mağaza hostunda, bu siparişi adlandırıyorsa açılır; aksi hâlde "Order link not available" + sebep |
| WooCommerce (eski import, stamp yok) | Bağlantı yok (`no-address`) — eskiden permalink/görsel açılıyordu |
| Shopify | Damga `…myshopify.com/admin/orders/<id>` ya da eski alanlardan kurulan `admin.shopify.com/store/<handle>/orders/<id>` |
| Etsy | Sunucu adres yazmaz → bağlantı yok, sebep gösterilir |
| eBay | `EbayOrderBlock` kendi kurucusuyla (değişmedi); şerit eBay'i zaten çizmiyor |
| Amazon | Seller Central host listesi, `/orders-v3/order/<id>` |
| Square | `app.squareup.com` / sandbox, `/dashboard/orders/overview/<id>` |
| Manuel / Web formu | Kaynak yok, şerit yok |

## 2. Daraltılmış liste kayboluyordu → ray

### Teşhis

`lib/studioflow/useResizableSidebar.ts` daraltınca genişliği 64 px yapar; `app/globals.css:3394-3402` `.is-sidebar-collapsed .orders-list { display: none }` listeyi tamamen gizler. Geriye yalnız `>` düğmesi kalıyordu. `display:none` ayrıca listenin kaydırma konumunu sıfırlar.

### Ne değişti

- **`components/OrderListRail.tsx` (yeni)** + **`lib/studioflow/orderRail.ts` (yeni, saf).** `role="listbox"` / `role="option"`, `aria-selected`, seçili kareye halka; her karede fotoğraf (yalnız http(s) görsel adresi — mağaza permalink'i fotoğraf sayılmaz, kırık görsel `onError` ile gizlenir) ya da müşteri baş harfleri → `#projeNo` → tasarım baş harfleri; köşede durum rengi (`OrderListCard.statusTone` ile aynı okuma). Tooltip/aria-label: `#No · Müşteri · Durum` (durum `t()`'den). Klavye: ok tuşları, Home/End; Enter/Space seçer. Seçili kare `scrollIntoView`.
- **`app/orders/page.tsx:1140`** ve **`app/schedule/page.tsx:1071`**: `sidebar.collapsed` iken `<OrderListRail orders={filteredOrders} selectedId={selectedOrderId} …/>`. Tam liste DOM'da kalır (CSS gizler), bu yüzden filtre/arama/sıralama/seçim sayfanın kendi state'i olarak dokunulmadan yaşar. Kaydırma: `:1107` / `:1047` `onScroll` son `scrollTop`'u ref'e yazar, `:176` / `:453` `useLayoutEffect` liste açılınca geri koyar. Schedule'da tarih konumu (`anchorDate`, zaman çizelgesinin `scrollLeft`) ana bölmede; daraltma ona dokunmaz. Ray üzerinde hover, karttaki gibi `setHoveredOrderId` ile zaman çizelgesi satırını vurgular.
- **`lib/studioflow/firestore.ts:320, 354, 1650, 1709`**: `OrderListItem` ve `ScheduleOrderItem` `projectNumber` taşır (ray ve tooltip için; `OrderDetail`'de zaten vardı).
- **`app/globals.css:3487-3575`** `.orders-rail*`: 44 px kareler, `overflow-x: hidden`, köşe noktası `inset-inline-end` (Arapça'da aynalanır), koyu tema satırları.
- ≤ 980 px'te kenar çubuğu zaten `display:none` ve mobil liste devrede (`app/globals.css:12007`); 375 px'te ray çizilmez, yatay taşma yok.

## Çeviriler

8 yeni cümle, 11 dil, `lib/studioflow/language.ts:8747` bloğu: "Order link not available", 4 sebep cümlesi, "Checking the connected store...", "Open preview image", "Collapsed order list". `npx tsx` ile `studioT(key, "Türkçe")` probu: 8/8 Türkçe karşılık, 11 dilde eksik hücre 0 (`scripts/check-order-source-links.mjs` §5 aynı kontrolü her çalıştırmada yapar).

## Nasıl doğrulanır

```
npx tsc --noEmit -p tsconfig.json           # rc=0
npm run test:order-source-links             # 80 kontrol (yeni)
npm run test:ebay-screens                   # şerit satırı korunmuş: 398 kontrol
for s in $(node -e 'console.log(Object.keys(require("./package.json").scripts).filter(k=>k.startsWith("test:")).join(" "))'); do npm run -s $s; done
npm run build                               # hostinger-build → next build, rc=0
```

- Tüm `test:*` geçti. Not: `test:finance` publish repo'da `../functions/finance/vectors.json` arar (repo'da `functions/` yok → ENOENT). Ana repodan dosya `scratchpad/pub/functions/finance/` altına kopyalanınca 36 vektör geçti; bu dalın değişikliğiyle ilgisi yok.
- Ekran kontrolü: Chrome for Testing 155 (`npx @puppeteer/browsers`, scratch dizini) ile **statik harness** — gerçek `app/globals.css` + `OrderListRail` react-dom markup'ı, `.orders-workspace.is-sidebar-collapsed` içinde: LTR açık, RTL (`dir="rtl"`, nokta sola geçti), koyu tema, fotoğraflı kareler. Ölçümler: `sidebarWidth=64`, `railWidth=62`, `scrollWidth==clientWidth` (taşma yok), `.orders-list display:none`; 375/500 px pencerede kenar çubuğu 0 px.

## Ekranda TEST EDİLMEYEN

- Canlı Orders/Schedule sayfası (giriş, Firestore verisi, daralt/aç geçişinde kaydırma geri yükleme, Schedule'da tarih korunumu, klavye gezinmesi, hover tooltip): makinede Java yok → Firestore emülatörü başlatılamadı; `lib/firebase/client.ts:61-84` emülatör portları sabit (9099/8080/5001/9199) ve bu portlar yasaklı. Üretime bağlanılmadı.
- Woo siparişinde `getWooConnections` çağrısı ve "Checking the connected store..." → bağlantı geçişi (yalnız birim testte: `connectedHosts null → loading`, `[] → host-mismatch`, host eşleşince link).
- `OrderListCard`'ın Woo permalink'ini `<img>` olarak denemesi (önceden de vardı) değiştirilmedi.

## Yayın kararı

CANLI DEĞİL. Dal `hostinger`'a yalnız dal olarak itildi; `main`'e dokunulmadı, deploy yapılmadı.
