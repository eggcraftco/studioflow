# NivaDesk — Durum Defteri

Amaç: yapılanlar ile yapılacakların birbirine karışmaması. Her büyük iş bittiğinde
buraya taşınır; yeni raporlar "SIRADA" bölümüne girer ve bitince yukarı çıkar.
Son güncelleme: 26 Ağustos 2026.

---

## TAMAMLANANLAR (canlıda / kodda doğrulanmış)

### Settings raporu (notes3) — 26 Ağu, CANLI
Tamamı: yedek v3 (kayıt-kimlikli eşleştirme + içe aktarma önizleme/atlama/geri alma),
teamChat izni (4 platform + sunucu kapısı), entegrasyon teslimat günlükleri + mağaza
test webhook'ları, PDF canlı önizleme (gerçek şablonlardan), web destek eklentileri,
bilgi bankası tek-slot geçmişi, özelleştirilebilir yükleme politikası metni, 10 gruplu
Settings IA (web+Mac+Android), ~200 string × 12 dil. 9 suite emülatör regresyonu yeşil.

### Envanter yeniden tasarımı (rapor 1-2. aşama) — 25-26 Ağu, CANLI
- Faz 1-5 + fotoğraf + QR: 4 platformda, uçtan uca test edilmiş.
- Ürün detay paneli 4 platformda; sunucu-birebir durum geçişleri; ledger'dan aylık
  KPI değişimi (dürüst bastırma ile); kenar çubuğu tek-gezinme; KPI tooltip'leri;
  konum/tedarikçi filtreleri; sayfalama; toplu seçim (taşı/arşivle/CSV); Linked
  Records kartı (purchase→bankTx join'leri).
- Bulunan gizli bug'lar: fotoğraf kaydetmede kısmi-payload veri kaybı (3 yerli
  platformda düzeltildi), Swift 2dp yuvarlama, geçiş haritası sapması.

### Merkezi Dosya Kütüphanesi (rapor §16-25) — 26 Ağu, CANLI
- Sunucu: `fileRecords` kayıt-üstü-depo (sha1 idempotent), 12 callable, kural
  istisnası (client SDK kapalı — owner bile 403). Üç kural testle sabit: dosya BİR
  kez kaydolur; bağlantı ≠ paylaşım; çöp-önce silme (yalnız library-kaynaklı depo
  nesnesi silinir).
- Web: üç panelli /files (ray görünümleri, kayıt paneli, Share with Order, sürümler,
  aktivite, çöp), classic Client & Orders korunarak. Sipariş sayfasında "From the
  Files library" şeridi (audience rozetli). Envanter panelinde Files sekmesi.
- Portal: paylaşılan dosya müşterinin /track sayfasında listelenir; paylaşımda
  storage objesine token URL mint edilir, sürüm değişince yenilenir. Emülatörde tam
  zincir kanıtlı (gerçek baytlarla indirme dahil).
- Karşıt-denetim düzeltmeleri: çöp/silme deleteClientFiles kapısına bağlandı
  (sunucu+UI+test), rename taslağı kayıt değişince sıfırlanır + Cancel, reload
  sıra-korumalı, Trash boş-durumu dürüst, Recent aramadan sonra kırpılır.
- Native: ürün panelinde Files sekmesi Mac+iPhone+Android (tam build'lerle).
- 73 string × 11 dil. Suite: `functions/test/qa/files-library.mjs` — 33 assert,
  kısıtlı-üye kapısı + portal zinciri dahil, TÜMÜ GEÇTİ.
- Web 4 yayın turu canlı chunk'ta doğrulandı; 18 fonksiyon deploy'u isimle yapıldı.

### Daha eski tamamlananlar
Bkz. bellek/commit geçmişi: KDV brüt düzeltmesi, webhook sertleştirme, Settings
bölüm düzeltmeleri, Quick Reply anahtar durumu, CSV export, fatura kalem-only,
banka akışı (TrueLayer), onarım kabul kartı, teklif/onay/imza, Twilio SMS, vb.

### Native kütüphane paritesi — 26 Ağu, KODDA TAMAM (mağaza sürümü bekler)
Mac/iPhone (ContentView'da Library modu + LibraryFileDetailSheet + Share sheet;
iki platformda xcodebuild BUILD SUCCEEDED) ve Android (ClientFilesScreen'de
Library sekmesi + detay + Share diyaloğu; BUILD SUCCESSFUL). Sipariş detayında
"From the Files library" şeridi 3 yerlide. Çöp/geri yükleme klasik silme
kapısıyla; kalıcı silme + sürüm yönetimi + indeksleme bilinçli web-only.
Çeviriler web tablosundan bayt-bayt.

### Üç yeni rapor — ilk büyük dalga, 26 Ağu, WEB CANLI(yolda)
**Schedule (3 doğrulanmış bug FIX + E2E):**
- Sağ tutamaç: bar, satırın gizli taşmasına kırpılıyordu → tutamaç ulaşılmazdı.
  Genişlik artık satır içine sığar; sürükleme scroll-telafili + kenarda
  oto-kaydırma + canlı tarih önizleme rozeti. Gerçek fareyle kanıtlı (+3 gün
  uzatma → 25 Aug-12 Oct, geri alındı).
- Çift "Sun 25 Oct"/eksik "Sat 31": addDays artık takvim adımı (setDate), 24h
  milisaniye değil. 92 hücre doğru.
- Created Date "kaydetmiyor": gerçek bug — toISOString(UTC) yazımı + yerel
  parse; BST'de bir gün geri gösteriyordu (sunucu doğru kaydediyordu).
  dateInputValue artık yerel gün. E2E: 11 Jul kaydedildi/gösterildi/geri alındı.
- Etiketler: "44d left", "Due £X", "Search Orders", Today + seçiliye-atla
  düğmeleri, "1 order" tekilleri.
**Customers (hızlı düzeltmeler):** "1 order/1 customer" tekil; kart tarihi
"Last contact:" etiketli; Total Spent → Total Order Value + Paid + Outstanding
kartları (totalPaid zaten hesaplanıyordu, hiç gösterilmiyordu); View All Orders
→ /orders?customerName=… (orders arası bağ çalışıyor, E2E'li); Shopify/Woo/API
kaynak rozetleri; Activity satırlarında saat+e-posta + Load more; mükerrer
e-posta/telefonda oluşturma onayı; Notes sekmesi → "Order Notes";
"Phone / WhatsApp" etiketi.
**Müşteri kimliği (sunucu):** upsertIntegrationCustomer artık
externalCustomerId saklıyor (5 webhook çağrı noktası) ve id → e-posta → isim
sırasıyla eşliyor. customer-identity.mjs emülatörde TÜMÜ GEÇTİ (isim değişse
de tek kayıt; guest aynı e-posta → mükerrer yok). 5 webhook CANLI (26 Ağu akşamı).
**Kart sistemi:** tek kart bileşeni 3 yoğunluk (container query; 460/380/290
kademeleri E2E'li); ayırıcı 22px görünmez tutma alanı + çift-tık varsayılan;
bulut genişliği artık EKRAN BAŞINA (schedule/customers kendi alanlarını yazar,
eski alan fallback; saveWorkspaceSidebarLayout deploy edildi); Schedule
varsayılanı 320px; kart resize'da canlı "384 × 497" rozeti; kilit tooltip'i
"yalnız bu cihazda" diyor; DESI/BOYA rozetlerinde tam-ad tooltip'i; Customers'ta
6'lı sıralama (Last contact/Last Order/Most Orders/Highest Value/Outstanding/
Alphabetical). 11+1+4 yeni string × 11 dil. Web canlı doğrulaması: 8 yayının
7'si servis edilen chunk/CSS'te teyitli, 8. poll'da.

## SONRAYA BIRAKILANLAR (bilinçli — kullanıcı onayıyla)
Envanter/Files raporunun 3. aşaması: partial reservation, partial purchase receipt,
maliyet katmanları, iade/hasar/kayıp/fire, BOM/reçete, Shopify/Woo stok senkronu,
sipariş kartında kullanılan-miktar/swap aksiyonları, hiyerarşik lokasyonlar,
import kopya-politikaları, Tags/Storage görünümleri, kütüphaneye özel storage yolu
(kural deploy'u artık açık — istenirse yapılır), 500-üstü sunucu sayfalaması.

## KULLANICIYA BAĞLI BEKLEYENLER
- ~~reauth~~ 26 Ağu akşamı çözüldü: 5 webhook (müşteri kimliği) + storage.rules
  CANLI — envanter fotoğraf yayını artık tamamen açık.
- Ana repo push (commit'ler hazır), mağaza sürümleri (iOS/macOS 1.3 review'da,
  Android 0.1.8; native kütüphane + Files sekmesi bir sonraki sürümle),
  VAPID anahtarı (+ App Check — Schedule raporu §17 de doğruladı),
  "Recalculate Taxes" düğmesi (mağaza sürümlerinden sonra).

---

## SIRADA — üç rapordan KALANLAR (ilk dalga yukarıda tamamlandı)

### A. NivaDesk_schedule.md — kalan orta/iyileştirme
**26 Ağu akşamı eklendi:** hover eşleştirme (kart ↔ çubuk, iki yönlü),
haftalıktan uzun aralıklarda sticky ay şeridi (etiket yatayda da sabit),
range/seçim değişince seçili çubuk görünür alana getiriliyor — üçü de E2E'li.
**26 Ağu gece eklendi:** ortak toast/Undo altyapısı (StudioToastHost, AppShell'de
tek host) — schedule sürüklemesi tarih değişimini Undo'lu toast'la bildiriyor
(gerçek fareyle tam tur: sürükle → toast → Undo → tarihler geri, E2E'li), kart
taşıma "Card moved — Undo" veriyor; zoom % göstergesi preset seçici oldu
(75/100/125/150/Fit); iki ekranın alt başlığı ayrıştı ("Plan your orders" /
"Plan your team"). İlk-kullanım rehberi de eklendi (üç sürükleme jesti + Undo
notu, tarayıcı-başına bir kez). **SCHEDULE RAPORU TAMAM.**
(Not: Duration/Remaining ikili gösterimi bilinçli tek "Xd left" ile çözüldü.)

### B. NivaDesk_order_kart_sistemi.md — kalan iyileştirmeler
**26 Ağu gece eklendi:** "Kart taşındı — Undo" toast'u; kart menüsünde boyut
bölümü (Fit to content / Default / Match column / S-M-L, persistLayout
üstünden); Customize cards 6 kategoriye ayrıldı + panel içi arama; ROL
ŞABLONLARI (Owner/Designer/Finance/Workshop/Compact — yalnız görünürlük,
Undo'lu; Compact 19→5 kart E2E'li) — raporun 1 numaralı önceliği.
**27 Ağu gece eklendi (2):** kart menüsünde Move bölümü (↑↓←→, drag ile aynı
mutator'lar → aynı Undo'lu toast; telefon sırası yolu da toast'lu); ⋮ ayırıcı
tutamacı; Customers araması sipariş no + proje adını da tarar; Customize
panelindeki gereksiz "Save this order" kalktı (autosave zaten var).
Kalan: sol durum şeridi + zemin ayrımı (görsel karar — birlikte bakalım);
renk+etiket anlam sistemi; Actions gruplama; reset kapsam ayrımı; sipariş
türüne göre düzen; kullanıcıya özel düzen. (Hızlı sekmeler: OrderQuickFilterBar
zaten karşılıyor — kapalı sayıldı.)

### C. NivaDesk_customers.md — kalan kritik/orta/ürün
**26 Ağu gece eklendi:** iade/iptal bakiyesi düzeltildi — Outstanding artık
yalnız borç doğurabilen siparişleri sayıyor (Cancelled + Shopify-refunded
dışarıda; brüt Total Order Value ve gerçek Paid aynen; emülatörde £800'lük
iptal kalanı Outstanding'i £0 bıraktı, E2E'li). Outstanding sıralaması da aynı
alanı kullanıyor.
**26 Ağu akşamı eklendi:** duplicate birleştirme CANLI — profil seçilince aynı
e-posta/telefonlu ikiz için uyarı bandı + "Review and merge" diyaloğu (ana kayıt
seçimi, alan bazında isim/e-posta/telefon galibi, sipariş taşıma, sunucuda tam
anlık görüntü `customerMergeLog` — istemciye kapalı, 403 testli).
`mergeWebCustomers` deploy edildi; `customer-merge.mjs` 14 assert TÜMÜ GEÇTİ;
14+1 string × 11 dil.
**27 Ağu gece eklendi:** Primary Phone gerçek alanı (profil formu + yeni-müşteri
modalı + arama + mükerrer tespiti çapraz telefon + merge seçicisi + sunucu;
3 callable redeploy, emülatörde ayrı alan olarak kaydolduğu doğrulandı) ve
SYNC ÇATIŞMA POLİTİKASI: integrationCustomerSync ("store" varsayılan /
"nivadesk" = atölye düzenlemesi kazanır, mağaza yalnız boşluk doldurur) — 5
webhook'ta zorlanıyor, Woo+Shopify ayar bölümlerinde kart, suite'te iki yönlü
kanıt (atölye telefonu korundu + boş city doldu / store'da yeniden yazdı).
**27 Ağu gece eklendi (2):** GDPR — "Export data (JSON)" (profil+toplamlar+
siparişler+notlar+aktivite, istemci tarafında dosya) ve owner-only
"Anonymize (GDPR)": profil + TÜM siparişlerden kişisel alanlar silinir,
finansallar kalır, history'ye iz düşer, geri alınamaz (onay metni önce export
der). Emülatörde kanıtlı: 3 sipariş yeniden adlandı+temizlendi, tutarlar
korundu. `anonymizeWebCustomer` deploy edildi.
**Kritik kalan:**
telefon–WhatsApp gerçek alan ayrımı (şema işi); GDPR export/anonymize/delete
akışları (Shopify redact kısmen var); iade/refund'un müşteri değerine
yansıması. **Orta:** ek sıralamalar (Last Order/Highest Value/Outstanding…);
manuel form genişletme (shipping/company/consent); ülke standardizasyonu;
arama kapsamı (sipariş no/etiket/posta kodu). **Ürün:** segmentler/etiketler,
Messages/AI Replies bağı, hızlı aksiyonlar, Overview sekme düzeni, profil
entegrasyon paneli (last synced/resync/raw data).
