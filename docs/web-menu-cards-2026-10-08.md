# Web: sol menü genişliği, kart "…" menüsü açıklamaları, kart başlığı hizası — 8 Ekim 2026

Dal: `web-menu-cards-2026-10-08` (publish deposu, `hostinger/main` @ `7f71fb1d` üzerinden).
Durum: **kod hazır · izole test geçti · ekran kabulü kısmi (aşağıda) · CANLI DEĞİL.**
Yayın yapılmadı; `hostinger/main`'e dokunulmadı; üretim Firebase'e bağlanılmadı.

## 1. Sol ana menü (sidebar) genişliği

### Ölçüm

`components/AppShell.tsx` içindeki 16 etiket (NAV_ITEMS 14 + Activity + Insights),
gerçek `studioT` üzerinden 12 dile çevrilip (`scripts/check-menu-card-strings.mjs --labels`)
headless Chrome for Testing'de **Inter 650, 14 px** (uygulamanın menü yazı tipi) ile
ölçüldü; 16 px de ölçüldü (tarayıcı "büyük yazı" ayarı için). En uzun etiket, dil başına:

| Dil | En uzun etiket | 14 px | 16 px |
|---|---|---:|---:|
| Español | Planificación del equipo (Team Schedule) | 162,6 | 185,8 |
| Português | Planeamento da equipa (Team Schedule) | 159,3 | 182,1 |
| Italiano | Pianificazione team (Team Schedule) | 133,7 | 152,8 |
| العربية | ردود الذكاء الاصطناعي (AI Replies) | 127,4 | 145,6 |
| 日本語 | チームスケジュール (Team Schedule) | 123,9 | 141,6 |
| Français | Planning d'équipe (Team Schedule) | 122,5 | 140,0 |
| Русский | Планирование (Schedule) | 104,7 | 117,9 |
| English | Team Schedule | 104,6 | 119,5 |
| Deutsch | Team-Planung (Team Schedule) | 99,5 | 113,8 |
| Türkçe | AI Yanıtları (AI Replies) | 73,2 | 83,6 |
| हिन्दी | टीम शेड्यूल (Team Schedule) | 61,0 | 69,7 |
| 中文 | 团队计划 (Team Schedule) | 57,1 | 65,3 |

Rozetli satırlar (Messages/Notes/Activity) için en uzunlar: Nachrichten 83,7 · Сообщения 82,6 ·
アクティビティ 97,5 px — rozet (22 px + 10 px boşluk) ile birlikte de sığıyor.

### Karar

- Eski genişlik **232 px** (etikete 154 px kalıyordu; İspanyolca ve Portekizce Team Schedule
  orada da sığmıyor, üç nokta ile kesiliyordu).
- Yeni genişlik **208 px**. Çerçeve: nav padding 8+8, satır padding 10+10, ikon 22, boşluk 10
  = 68 px → etikete **140 px**. 12 dilin 10'unda en uzun etiket tek satırda sığıyor
  (İtalyanca 133,7 px dahil). İspanyolca/Portekizce Team Schedule **iki satıra sarıyor**
  (`.app-sidebar-label`: `-webkit-line-clamp: 2`, sonra kesme); tam metin her satırın
  `title`'ında (daraltılmış modda zaten vardı, artık açıkken de var).
- 16 px'te (büyük yazı) İtalyanca, Arapça, Japonca, Fransızca da iki satıra düşer; kesilme yok.
- Daraltılmış mod (68 px), <1280 px varsayılan daraltma, <1024 px çekmece (`min(300px, 86vw)`)
  ve RTL çekmece kuralları değişmedi. `.app-sidebar-item` `text-align: start`,
  rozet `margin-inline-start: auto` (RTL için mantıksal).
- Kısa pencere kuralları (36/32 px satır) iki satırlı etiketi hâlâ taşır (2 × 16 px).

Ekran: `shot-sidebars.png` (EN/DE/ES/IT/JA/AR + daraltılmış PT), `shot-sidebars-dark.png`
(TR/PT/FR/RU/ZH/HI, koyu tema) — CDP ölçümü: yalnız "Planificación del equipo" ve
"Planeamento da equipa" iki satır; hiçbir etiket kesilmiyor (`scrollHeight > clientHeight` yok).

## 2. Kart "…" menüsü: her seçenek için açıklama

> **GERİ ALINDI (8 Eki, `web-cards-info-2026-10-08`):** bu bölüm isteği yanlış okumuştu. Seçenek
> açıklamaları kaldırıldı; yerine kart başlığındaki "i" kartın ne için olduğunu söylüyor —
> bkz. `docs/web-card-purposes-2026-10-08.md`. Aşağısı tarihçe.

Sipariş detayındaki her kartın sağ üst "…" düğmesi `renderCardMenu`
(`app/orders/OrderDetailContent.tsx`) ile **Block customisation** panelini açar
(`role="dialog"`). Seçenekler ve açıklamalar `lib/studioflow/orderCardMenuDescriptions.ts`:

| Seçenek | Açıklama (İngilizce kaynak) |
|---|---|
| "…" düğmesi | Block options: hide it, rename its headings, move, resize or colour it. |
| Export to-do PDF (yalnız todo) | Opens a printable PDF of this to-do list in a new tab. |
| Export history PDF (yalnız historyLog) | Opens a printable PDF of this order's history log in a new tab. |
| Edit block heading | Rename the headings inside this block for the whole workspace. |
| Edit block heading (web'de desteklenmeyen kart) | This block's headings cannot be renamed on the web yet. |
| Hide block | Removes this block from the order view. Bring it back from Customize cards in the order menu. |
| ↑ Up / ↓ Down | Moves this block one place up/down in its column. |
| ← Left / → Right | Moves this block to the previous/next column. |
| Fit content | Shrinks the block to the exact height of its content. |
| Match column | Gives every block in this column the same height as this one. |
| S / M / L | Short / Medium / Tall block height. |
| Colour: Default | Removes the tint and shows the block in the default card colour. |
| Colour: Red…Pink | Tints this block in the chosen colour. The colour's meaning appears as a small chip on the block. |
| Manage colour labels | Set what each colour means for the whole workspace. |
| Reset | Restores this block's default height and colour. Position and visibility are kept. |
| Done ve × | Closes this panel. Every change is already saved. |
| Panel başlığındaki ⓘ | "Show what each option does" (aria-pressed) |

19 kart (`lib/studioflow/cardLayouts.ts` `ORDER_DETAIL_CARD_IDS`) aynı `renderCardMenu`'yu
kullanır; karta özel iki seçenek (todo PDF, history PDF) dahil **her mevcut seçenek**
açıklandı. Sunucu listesine (`functions/index.js`) dokunulmadı — yeni kart yok.

### Davranış

- Her seçenek `.block-custom-opt` sarmalayıcısında; açıklama `.block-custom-desc`
  **düğmenin kardeşi**, `aria-describedby` ile bağlı. Açıklamayı görmek seçeneği asla çalıştırmaz.
- **Masaüstü** (`@media (hover: hover) and (pointer: fine)`): hover'da ve klavye odağında
  (`:focus-within`) ipucu olarak düğmenin altında; satır sonundaki öğeler (son çocuk, renk
  ızgarasının çift sütunu, Konum satırının 3.–4. düğmesi) bitiş tarafına, alt kısımdakiler
  (renkler, Manage colour labels, Reset/Done) yukarı açılır — panel `overflow-y:auto` ile
  dışarı taşanı keser, bu yüzden. `.block-custom-segment`'ten `overflow: hidden` kaldırıldı
  (ipuçlarını yutuyordu); köşeleri uç düğmeler taşıyor.
- **Telefon / dokunmatik** (hover yok): panel başlığındaki **ⓘ** düğmesi
  (`cardMenuDescriptionsOn`) açıklamaları her seçeneğin altına yazar; Konum / Genişlik /
  Boyut / Reset-Done satırları alt alta dizilir, renk ızgarası tek sütun olur.
  Aynı düğme masaüstünde de çalışır (hover'ı olmayan dizüstü için).
- `role=menuitem` **kullanılmadı**: panel bir `dialog`; içinde segment düğmeleri ve renk
  ızgarası var, `menu` olmayan bir kapsayıcıda `menuitem` geçersiz ARIA olurdu.
  `aria-describedby` + her düğmenin kendi erişilebilir adı yeterli. "…" düğmesine
  `aria-haspopup="dialog"` ve `aria-expanded` eklendi.
- Panelin boş alanlarına basmak çalışma alanı kaydırmasını (pan) başlatmasın diye
  `shouldStartWorkspacePan` dışlama listesine `.order-card-menu-wrap` ve `.block-custom-panel` eklendi.

### Çeviriler

21 yeni dize × 11 dil `lib/studioflow/language.ts` sonuna `mergeIntoTranslations({...})` ile
(derin birleşim, Mac tablosundan sonra → kazanır). `node scripts/check-menu-card-strings.mjs`
gerçek `studioT` ile her dizeyi 11 dilde sorguluyor: **PASS 258 checks**
(`npm run test:menu-card-strings` olarak package.json'a eklendi).

## 3. Kart başlığı: "…" hizası, boşluk, dokunma alanı

Önce: `.order-card-menu-wrap` `top:14 right:14`, düğme 30×30, içinde metin "..." (satır
tabanına oturduğu için düğmenin altında görünüyordu); sürükleme tutamacı `top:16`, başlık
satırı merkezi 26,5 px. Şimdi (`app/globals.css`):

- Düğme **40×40 px** dokunma alanı (`.order-card-menu-button`, şeffaf), içinde 32 px görünür
  disk (`.order-card-menu-face`) + SVG üç nokta (metin değil). Disk merkezi **26 px**
  (başlık satırının merkezi), diskin kenarı çerçeveden **14 px** (kart padding'iyle hizalı).
  Ölçüm (CDP): `hit 40×40 · faceCenterY 26 · faceRightGap 14 · handleCenterY 26 · chipCenterY 26,5`.
- Sürükleme tutamacı ve kilit simgesi `top: 13px` → merkez 26.
- Anlam çipi `top: 18px`, bitişten 54 px (diskten 8 px boşluk); `max-width: 22%`.
  Çip varken (`:has(> .order-card-meaning-chip)`) başlık `padding-inline-end: calc(60px + 22%)`
  → başlık çipin altına **girmiyor**; 350 px kartta "Metals & Stones" tek satır kalıyor,
  uzun çip metni üç nokta ile kısalıyor (başlık öncelikli).
- Tüm kartlarda başlık `padding-inline-end: 44px` (düğmenin altına girmez), `min-width: 0`,
  `overflow-wrap: anywhere` — uzun meslek başlığı sarar.
- `left/right/padding-left` yerine **mantıksal** özellikler (`inset-inline-start/end`,
  `padding-inline-*`): Arapça'da "…" sola, tutamaç sağa, çip diskin yanına geçiyor
  (`shot-cards-rtl.png`: faceLeftGap 14, handleRightGap 15). Panel `inset-inline-end: 0`,
  `text-align: start`.
- Koyu tema: disk `rgba(255,255,255,.10)`, hover `.16`; ipucu `#1f2330` zemin + ince kenarlık.
- Odak: `:focus-visible` halkası disk üzerinde.
- Tek kart tipi değil: başlık ortak `CardTitle` (`components/CardTitle.tsx`) ve menü ortak
  `renderCardMenu`; 19 kart aynı kuralları alır. Mobil kart çerçevesi (`renderMobileCardFrame`)
  aynı menüyü, tutamaçsız kullanır (`padding-inline-start: 0`).

### Native karşılıklar (bu dalda DEĞİŞTİRİLMEDİ; native ajan için)

| Platform | Yer | Not |
|---|---|---|
| iOS/macOS | `EGGcraft/SiparisDetayView.swift` `struct DetayKarti` (~13760) — `ellipsis.circle` düğmesi (~14479), `macCardOptionsMenu` + `CardMenuRow` (~13689, ~14374) | Kart başı "…" + Hide Block / Edit Block Headings / Export menüsü; açıklama satırı yok |
| iOS/macOS | `SiparisDetayView.swift` ~8905–8930 önizleme kartının "…" diski (36 pt daire, `ellipsis`) | Önizleme kartı ayrı çizilmiş |
| Android | `OrderDetailScreen.kt` `DetailCard` (~8785; `MoreHoriz` ~8928) | Kart başı "…" |
| Android | `OrderDetailScreen.kt` `DesktopPreviewCard` (~3276; `MoreHoriz` ~3395) | Önizleme kartı |
| Android | `OrderDetailScreen.kt` `DetailTopBar` (~831; 40 dp `MoreHoriz` ~980) ve `HeaderActionsMenuButton` (~1862) | Sipariş üst çubuğu — kart değil, ama aynı simge dili |

Hizalama hedefi native için: düğme merkezi başlık satırının merkezinde, dokunma alanı ≥ 40
(Android `DetailCard` 40 dp'ye uyuyor; iOS 36 pt disk + `.padding(10)` zaten ≥ 44 pt),
seçenek açıklamaları: iOS `Menu` içinde `Text` + `.help()` / Android `DropdownMenuItem`
`supportingText` (Material 3) — metinler `orderCardMenuDescriptions.ts` ile birebir.

## 4. Doğrulama

| Adım | Sonuç |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | rc=0, 0 satır |
| `node scripts/check-menu-card-strings.mjs` | PASS 258 checks (16 etiket + 21 açıklama × 11 dil + TSX kullanım kontrolü) |
| Mevcut `npm run test:*` (22 betik) | 21 geçti; `test:finance` bu depoda **dokunulmamış main'de de** düşüyor (`../functions/finance/vectors.json` publish deposunda yok — ortam, kod değil) |
| `npm run build` | NEXT_BUILD_EXIT code 0 (uyarılar: önceden var olan `integrations.module.css` cache uyarısı) |
| Ekran (Chrome for Testing 155, CDP) | aşağıda |

### Ekran kontrolü — ne yapıldı, ne yapılmadı

Yapılan: depodaki **gerçek `app/globals.css`**'e bağlanan statik maket sayfalar (sidebar
markup'ı AppShell'den, kart/panel markup'ı renderCardMenu çıktısından birebir), Chrome for
Testing (scratch dizinine `npx @puppeteer/browsers` ile kurulu; sahibin Chrome.app'i **açılmadı**)
üzerinden CDP ile gerçek hover/odak olayları ve ekran görüntüleri:
`shot-sidebars*.png`, `shot-cards*.png`, `shot-panel-hover-{match,right,m,closex}-2.png`,
`shot-panel-focus-done-2.png`, `shot-panel-dark-hover-hide-2.png`, `shot-panel-rtl-hover-edit.png`,
`shot-panel-describing.png`, `shot-phone-2.png`, `shot-phone-dark-2.png`
(scratchpad `probe/`; depoya eklenmedi).

**Ekran testi yapılmayan:** çalışan uygulama (Next dev/emülatör + oturum) açılmadı — React
durumu (ⓘ toggle, `aria-expanded`), gerçek sipariş verisiyle 19 kartın her birinin
yüksekliği/çip davranışı, Safari/Firefox (`:has()`, `-webkit-line-clamp`, `inset-inline-*`
hepsi 2023+ tarayıcılarda var; `:has()` eski tarayıcıda yalnız çip-başlık rezervini kaybeder,
eski davranışa düşer), gerçek dokunmatik cihazda `hover: none` sorgusu, 1024–1280 px
daraltılmış varsayılan geçişi, Arapça'da gerçek metin yönü içinde çekmece.

## 5. Değişen dosyalar

- `app/globals.css` — sidebar genişliği/etiket sarma; kart başlığı hizası, 40×40 hedef, mantıksal
  konumlar; `.block-custom-opt/.block-custom-desc/.block-custom-info` ve ipucu/satır-içi kuralları.
- `components/AppShell.tsx` — açık menüde de `title` (tooltip) + açıklayıcı yorum.
- `app/orders/OrderDetailContent.tsx` — `renderCardMenu`: açıklamalar, ⓘ toggle, 40×40 düğme,
  `aria-*`; pan dışlama listesi.
- `lib/studioflow/orderCardMenuDescriptions.ts` — yeni (20 seçenek + toggle metni + id yardımcısı).
- `lib/studioflow/language.ts` — 21 dize × 11 dil.
- `scripts/check-menu-card-strings.mjs` + `package.json` `test:menu-card-strings` — yeni.
- `docs/web-menu-cards-2026-10-08.md` — bu not.

Yayın kararı sahibinde. Geri alma: dalı birleştirmemek yeterli; veri/şema değişikliği yok.
