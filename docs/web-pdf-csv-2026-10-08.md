# Web: PDF Export önizlemesi + CSV dışa aktarma tarih aralığı — 8 Ekim 2026

Dal: `web-pdf-csv-2026-10-08` (taban: `hostinger/main` @ `7f71fb1d`, CANLI).
Durum: **kod hazır · izole test geçti · ekran kabulü kısmi (statik harness) · CANLI DEĞİL.**
Yayın yok, deploy yok, production Firebase'e bağlanılmadı.

---

## 1. Settings → PDF Export Settings: önizleme seçenekleri yansıtmıyordu

### Sebep (dosya:satır, `7f71fb1d`)

1. **Faturaya 12 anahtarın yalnız 2'si ulaşıyor.** `app/orders/OrderDetailContent.tsx:1005-1006`
   — `invoiceHtml` yalnız `pdfShowAddress` ve `pdfShowShippingAddress` okur; fatura kalemleri
   faturalandırır, diğer 10 bölüm iş emrine aittir. Önizleme varsayılan olarak **fatura** açılıyordu
   (`app/settings/page.tsx:2721`), bu yüzden "Customer & Design", "Materials", "Production Status",
   "Financials…" gibi anahtarları çeviren kullanıcı önizlemede hiçbir değişiklik görmüyordu.
   Teknik olarak önizleme yeniden üretiliyordu (`useMemo` `draft`'a bağlıydı, :2743-2747); ama
   üretilen belge o anahtarları okumadığı için **görünür bir değişiklik yoktu**.
2. **Sessiz yükleme hatası.** `app/settings/page.tsx:2725-2733` — renderer modülü
   `import("@/app/orders/OrderDetailContent").catch(() => undefined)` ile yükleniyordu; hata
   yutuluyor, önizleme sonsuza dek "Loading..." kalıyordu. Yeniden deneme yolu yoktu.
3. **İzin maskesi önizlemede yoktu.** `OrderDetailContent.tsx:11606-11614` — `jobSheetPreviewHtml`
   `canSeeFinance: true, canSeeAdvancedFinance: true` ile sabitlenmişti; `financialInfo: false`
   üye (workflow-only dahil) önizlemede Paid/Remaining/Payment Method/Internal Financials
   bölümlerini **görüyordu**, gerçek "Export PDF" ise gizliyordu. Fatura önizlemesi de izinsiz
   üyeye tüm fiyatlarla açılıyordu (sipariş ekranı aynı üyeden "Invoice PDF" düğmelerini saklar,
   :6785 ve :9042).
4. **İki eşleme, iki kaynak.** Anahtar→bölüm eşlemesi `orderPdfHtml` içinde (:732-743) ve
   `invoiceHtml` içinde (:1005-1006) ayrı ayrı yazılıydı; önizleme ile indirme aynı girdiden
   okumuyordu. Ayrıca `lib/studioflow/firestore.ts:1415-1428` — `loadWorkspaceSettingsOverview`
   PDF anahtarlarını yalnız `companySettings`'ten okur; sunucunun `savePersonalInterfaceSettings`
   ile kişisel belgeye yazdığı 9 finans-dışı anahtar (functions/index.js:8550-8554) gerçek
   PDF'e **hiç ulaşmıyordu**. Settings önizlemesi ise bunları `getPersonalInterfaceSettings` ile
   birleştiriyordu (:2698-2700) → önizleme ≠ indirilen PDF.
5. **Eski sonuç yeniyi ezebilir.** Üretim asenkron (modül yüklemesi) olduğu halde sıra/iptal
   jetonu yoktu; yavaş bir sonuç daha yeni bir ayarı ezebilirdi.

### Ne değişti

- **Yeni, saf modül `lib/studioflow/pdfDocumentOptions.ts`** (React/Firebase/DOM yok):
  - `resolvePdfDocumentOptions(settings, access)` — 12 anahtar + izin maskesi → 12 bölüm bayrağı.
    Maske yalnız burada: Paid&Remaining ⇐ `financialInfo`; Payment Method ⇐ Paid&Remaining ∧ gelişmiş
    finans; Internal Financials ⇐ gelişmiş finans (varsayılan kapalı). Saklanan `true`, eksik izni
    asla yenmez.
  - `pdfViewerAccess(memberAccess, features)` — sipariş ekranının iki satırının birebir karşılığı
    (`financialInfo !== false`; gelişmiş = plan özelliği ∧ finans).
  - `PDF_TOGGLE_DOCUMENTS` — hangi anahtar hangi belgeyi değiştirir (fatura: yalnız iki adres
    anahtarı; iş emri: 12'si). `pdfPreviewKindAfterToggle(current, key)` — çevrilen anahtar
    ekrandaki belgeyi değiştirmiyorsa önizleme onu değiştiren belgeye geçer.
  - `canViewInvoiceDocument(access)` — fatura `financialInfo` ister. `pdfToggleMaskReason` —
    "permission" / "plan" / "none". `pdfRenderSettings(stored, draft)` — tek ayar nesnesi.
    `createPdfPreviewSequencer()` — en yeni jeton kazanır; `cancel()` unmount'ta.
- **`app/orders/OrderDetailContent.tsx`**: `orderPdfHtml` ve `invoiceHtml` bölüm bayraklarını
  artık `resolvePdfDocumentOptions`'tan alır (kendi `settings?.pdfShow…` eşlemeleri silindi);
  `canSeeFinance/canSeeAdvancedFinance` `pdfViewerAccess` ile türetilir (davranış aynı);
  `jobSheetPreviewHtml` üçüncü parametre olarak izleyicinin erişimini alır (varsayılan tam erişim,
  önceki çağrılar bozulmaz).
- **`app/settings/page.tsx` (PdfExportSettingsSection)**:
  - Önizleme üretimi `useEffect` + sıra jetonu: her değişiklik `sequencer.next()`; yalnız güncel
    jeton `setPreview` yapar; hata da aynı kapıdan geçer; unmount `cancel()`.
  - Renderer yükleyici modül düzeyinde önbellekli promise; **başarısız yükleme unutulur**, "Retry"
    yeniden import eder.
  - Durumlar: ilk yüklemede "Loading..." (`role="status"`), hata: "The preview could not be
    generated." + hata metni + **Retry** (`role="alert"`), güncelleme sırasında eski belge soluk +
    rozet (`.is-updating`). `data-preview-status`, `data-preview-kind`, `aria-busy` eklendi.
  - İzin: `viewerAccess = pdfViewerAccess(workspace.memberAccess, workspace.entitlements.features)`;
    iş emri önizlemesine bu erişim verilir; `financialInfo: false` üyeye **fatura önizlemesi
    verilmez** (düğme pasif, açıklama satırı), varsayılan belge iş emri.
  - Her anahtar görünür: anahtar çevrildiğinde ekrandaki belge onu okumuyorsa önizleme iş emrine
    geçer (`updatePdfToggle`). Anahtar satırlarında etiketler: **"Job sheet only"** (faturaya
    girmeyen 10 anahtar), **"Hidden by your permissions"** / **"Hidden by your plan"** (maskelenen
    finans anahtarları, `title` ile açıklama).
  - Tek ayar nesnesi: `pdfRenderSettings(settings, draft)`.
- **`lib/studioflow/firestore.ts` `loadWorkspaceSettingsOverview`**: 9 finans-dışı PDF anahtarı
  için `personalData.X ?? data.X` (sunucu `getPersonalInterfaceSettings` ile aynı öncelik); 3 para
  anahtarı yalnız paylaşılan belgeden (sunucu bunları kişisel saklamaz). Böylece gerçek "Export
  PDF" de üyenin kişisel seçimini basar; önizleme ile aynı kaynak.
  *Not:* owner'ın kişisel belgesinde PDF anahtarı bulunursa (UI bunu yazmaz; yalnız workflow-only
  gönderir) owner da kendi kişisel değerini görür — sunucu tanımıyla tutarlı.
- **CSS** `app/globals.css`: `.settings-pdf-preview-state`, `.is-updating`,
  `.settings-pdf-preview-updating` (`inset-inline-end`, RTL'de aynalanır).

### Test: `npm run test:pdf-export-preview` → `scripts/check-pdf-export-preview.mjs` (**153 kontrol**)

1. Eşleme: 12 anahtarın her biri yalnız kendi bölümünü açar/kapatır (Paid&Remaining ayrıca Payment
   Method'u taşır); eksik anahtar varsayılanı alır; `pdfShowFinInternal` varsayılan kapalı.
2. İzin maskesi: `financialInfo` yok → 3 para bölümü kapalı, diğer 9 dokunulmamış; finans var ama
   gelişmiş yok → Paid&Remaining açık, Payment Method/Internal kapalı; tutarsız girdi
   (`canSeeAdvancedFinance: true, canSeeFinance: false`) yine kapalı.
3. `pdfViewerAccess` 6 durum; `canViewInvoiceDocument`; `pdfToggleMaskReason` 6 durum;
   belge eşlemesi; `pdfPreviewKindAfterToggle`; `pdfRenderSettings`; sıralayıcı (eski jeton
   bayat, cancel geçersiz kılar, jeton tekrarlamaz).
4. Kaynak okuması: iki renderer'da `settings?.pdfShow` kalmadı, ikisi de paylaşılan eşlemeyi
   çağırıyor; sipariş ekranı ve Settings önizlemesi erişimi aynı yardımcıdan türetiyor;
   `jobSheetPreviewHtml` tam erişimi sabitlemiyor; fatura önizlemesi `financialInfo`'ya bağlı;
   jeton alınıyor ve yayından önce kontrol ediliyor (sonuç ve hata); unmount iptali; loading/error
   durumları ve Retry; yükleme hatası unutuluyor; anahtar satırları `updatePdfToggle` kullanıyor;
   loader'da 9 anahtar kişisel-önce, 3 para anahtarı yalnız paylaşılan.
5. Çeviri: 8 yeni + 5 mevcut dize, gerçek `studioT` ile 11 dilde (derin birleştirme, Mac tablosu,
   geç birleştirmeler dahil).

**Eski kodda kırmızı görüldü:** `hostinger/main`'e yalnız saf modül eklenip koşturulunca
**51/153 başarısız** (renderer eşlemesi, önizleme erişimi, jeton, durumlar, loader önceliği,
çeviriler). Temiz dalda 153/153.

---

## 2. Orders → Export → "Export invoices to CSV": tarih aralığı ikonu ile metin çakışıyordu

### Sebep (`components/ExportOrdersPanel.tsx`, `7f71fb1d`)

:154-170 — takvim ikonu `position:absolute; left:12px` ile `<select>`'in **üstüne** konmuş,
metin için `paddingLeft: 38` bırakılmıştı. Üç kırılma:
- **Safari (macOS)** yerli menulist'te `padding-left`'i uygulamaz → metin ikonun altına çizilir.
- **RTL (Arapça, web `dir=rtl`)**: tarayıcının kendi oku sola geçer ve `left:12`'deki ikonla
  **üst üste biner**; metin sağa yaslanır, soldaki 38px dolgu boşa gider. (Statik harness'ta
  Chrome'da yeniden üretildi — ekran görüntüsü aşağıda.)
- **Uzun etiket / dar ekran**: kısaltma yok, `min-width` yok; `title` yok.
`<select>` yerli görünümde kaldığı için ok + ikon + metin üç ayrı katmandı.

### Ne değişti

- Yeni iç bileşen `ExportDateRangeField`: **tek flex satır, `gap: 10px`** — ikon (`flex: 0 0 auto`),
  `<select>` (`flex: 1 1 auto; min-width: 0; appearance: none; white-space: nowrap; overflow:
  hidden; text-overflow: ellipsis`), sağda chevron. Sarıcı ve select'te seçili etiketin tamamı
  `title` olarak; `min-width: 160px`; `:focus-within` odak halkası; `data-disabled`.
  Fiziksel `left/right` yok → `dir=rtl` satırı kendiliğinden aynalar (ikon sağda, chevron solda).
  Sınıflar `app/globals.css`'te (`.export-range-field*`), "/* PDF Export */" bloğunun önünde.
- Grid hücrelerine `minWidth: 0` (içerik altına küçülebilsin). `label`↔`select` `htmlFor`/`id`
  bağı (`export-orders-range`, `export-orders-report`).
- Bileşenin kendi dizeleri `t()`'den geçer: "Date range", "Report", 7 preset etiketi, "From", "To".
  Eksik 4 dize eklendi: **"Report", "Last month", "Last year", "Custom range…"** (11 dil).
  *Kapsam dışı bırakıldı:* panelin başlığı, açıklaması, onay kutuları, ayraç ve "Download CSV"
  hâlâ İngilizce — Haziran kararı ("Export UI her platformda İngilizce, bilerek"); bu dalda
  yalnız tarih aralığı bileşeni ve yanındaki "Report" etiketi çevrildi. Panelin tamamını çevirmek
  ayrı bir karar.

### Aynı bileşenin diğer kullanımları

Paylaşılan bir tarih-aralığı bileşeni **yoktu**; ikon-üstte-select deseni yalnız
`ExportOrdersPanel.tsx`'teydi (`grep "position: \"absolute\", left: 12"` → tek yer). Diğer "Date
range" yüzeyleri farklı bileşenler ve **dokunulmadı**: `components/home/HomeCardShell.tsx:268,314`
(kart menüsü), `app/bank/page.tsx:1795` (dönem seçici), `app/settings/EtsyIntegrationSection.tsx:552`
(başlık), `app/schedule/page.tsx:132` (yardımcı fonksiyon). `ExportOrdersPanel` tek yerde kullanılır:
`app/export/page.tsx` (Orders ve Dashboard'daki "Export" düğmesi `/export`'a yönlendirir).

### Test: `npm run test:export-date-range` → `scripts/check-export-date-range.mjs` (**48 kontrol**)

Bileşen yapısı (sıra: ikon → select → chevron; `title`; `aria-hidden`; `htmlFor`/`id`; `t()`
geçişleri; eski `position:absolute,left:12` ve `paddingLeft:38` yok), stylesheet kuralları
(flex/gap/min-width/ellipsis/nowrap/appearance; **fiziksel sol/sağ ofset yok**), 7 preset +
4 etiket 11 dilde gerçek `studioT` ile; en uzun çevirinin kısaltma gerektirecek uzunlukta olduğu.
**Eski kodda:** 38/48 başarısız. Temiz dalda 48/48.

---

## 3. Doğrulama

| Adım | Sonuç |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | rc=0, hata yok |
| `npm run test:pdf-export-preview` | `check-pdf-export-preview: 153 checks passed` |
| `npm run test:export-date-range` | `check-export-date-range: 48 checks passed` |
| `npm run test:ui-workspace-translations` | 54/54 (12 dil) |
| `npm run test:inbox-translations` | 221/221 |
| `npm run test:customer-card` | 58 kontrol (Invoice PDF → Financial Info kapısı korunuyor) |
| `npm run test:plan-order-usage` | 39/39 (language.ts derlemesi) |
| `npm run build` | `✓ Compiled successfully`, `NEXT_BUILD_EXIT code 0`; uyarılar yalnız `app/integrations/integrations.module.css` autoprefixer (önceden var, bu dalın dosyalarından değil) |
| `studioT(key, "Türkçe")` probu (`npx tsx`) | 12 yeni anahtar 11/11 dil; ör. "Job sheet only" → "Yalnızca iş emri", "Custom range…" → "Özel aralık…" |

### Ekran kabulü — kısmi, **statik harness**

Uygulama **çalıştırılmadı** (production Firebase'e bağlanmak yasak; emülatör yığını bu dalda
kurulmadı). Yapılan: `scratchpad/shots/range-{320,480}.html` — `globals.css`'teki gerçek
`.export-range-field*` bloğu + bileşenin birebir markup'ı, canlı (ikon-üstte) şekliyle yan yana,
EN/TR/DE (LTR) ve AR (`dir=rtl`), 320 ve 480 px; Chrome for Testing 155 (`npx @puppeteer/browsers`,
kendi scratch dizinimde) `--headless=new --screenshot` ile. Gözlem:
- AR/RTL canlı şekilde yerli ok takvim ikonunun üstüne biniyor (çakışma yeniden üretildi); yeni
  satırda ikon sağda, chevron solda, metin sağa yaslı, çakışma yok.
- EN/TR/DE 320 px'te Chrome canlı şekilde metin ikonla çakışmıyor (Chrome `padding-left`'i
  uygular); yeni satır aynı genişlikte düzgün. **Safari'deki çakışma bu ortamda doğrulanamadı**
  (Chrome harness).

**Ekranda test edilmeyenler:** PDF Export Settings önizlemesinin canlı davranışı (anahtar çevirme →
belge geçişi, Retry akışı, `is-updating` rozeti), fatura önizlemesinin izinsiz üyede gizlenmesi,
Export sayfasının gerçek render'ı (Next.js içinde), Safari ve Firefox. Bunlar için önerilen yol:
`dev-web-full-emulator-stack` notundaki EMULATOR=1 kurulumu + `seed-qa.js` ile `store-nofinance`
benzeri `financialInfo: false` üye.

---

## 4. Native karşılıklar (bu dalda dokunulmadı — native ajan kontrol etsin)

**PDF Export ayarları + önizleme**
- iOS/macOS: `EGGcraft/AyarlarView.swift:143` (`@AppStorage("pdfShowFinInternal")`),
  `:350`, `:3453` (`applyBool("pdfShowFinInternal", …)`); belge üretimi
  `EGGcraft/SiparisDetayView.swift:1600` (12 `@AppStorage pdfShow*`), `:12441`
  (`showFinInternal: pdfShowFinInternal` — izin maskesi burada mı? web kuralı:
  `canSeeFinance && advanced && pdfShowFinInternal`).
- Android: `features/settings/SettingsScreen.kt:1221` (`SwitchSpec("Internal Financials", …)`),
  `features/orders/OrderDetailScreen.kt:13373`
  (`showFinInternal = canSeeFinancial && advancedFinanceEnabled && settings.pdfShowFinInternal` —
  web ile aynı kural), `data/model/StudioModels.kt`, `data/firebase/StudioFlowRepository.kt`.
- Kontrol soruları: (a) natives'te PDF ayarı önizlemesi var mı, varsa izin maskesi uygulanıyor mu;
  (b) kişisel (personalInterfaceSettings) 9 anahtar natives'te gerçek PDF'e ulaşıyor mu — web'de
  bu dalda düzeltildi; (c) Payment Method'un Paid&Remaining'e bağlı olması.

**CSV dışa aktarma tarih aralığı**
- iOS/macOS: `EGGcraft/AyarlarView.swift:7938` `struct OrderExportSheet` (açılış `:7082`),
  Settings → Data Management → "Export CSV".
- Android: `features/settings/SettingsScreen.kt:4785` `DataManagementDetail`, `:4947`
  `ExportSelectorRow(t("Date range"), exportRange.label, …)`, `:4968` `performOrderExport`.
- Kontrol: uzun TR/DE etiketlerinde satır/ikon çakışması; Arapça'da natives düzeni aynalamaz
  (bkz. `rtl-layout-web-only` notu) — "RTL OK" denmesin, yalnız metnin çevrildiği söylensin.

---

## 5. Değişen dosyalar

`lib/studioflow/pdfDocumentOptions.ts` (yeni) · `app/orders/OrderDetailContent.tsx` ·
`app/settings/page.tsx` · `lib/studioflow/firestore.ts` · `components/ExportOrdersPanel.tsx` ·
`app/globals.css` · `lib/studioflow/language.ts` (+12 anahtar × 11 dil) · `package.json`
(+2 test) · `scripts/check-pdf-export-preview.mjs` (yeni) · `scripts/check-export-date-range.mjs`
(yeni) · bu not.

Bağımlılık yükseltmesi yok; ilgisiz refactor yok; `hostinger/main`'e push **yapılmadı**.
