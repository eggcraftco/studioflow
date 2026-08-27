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

### Kart + Customers raporlarından kalan ürün maddeleri (27 Ağu kaydı)
- Kart: ~~sipariş türüne göre otomatik düzen~~ 27 Ağu gece 4'te TAMAM
  (typeWorkspaceSnapshotsJSON; owner 'Save as the repair-order layout' der,
  her repair siparişi herkes için o düzenle açılır; öncelik bağımsız-sipariş >
  tür > profil > paylaşılan; emülatör 7/7; web+sunucu canlı; NATIVE ÇÖZÜMLEME
  DE TAMAM — Swift'te activeWorkspaceLayoutIsTypeManaged muhafızı ile clobber
  koruması + logout cache hijyeni, Android'de jestler sipariş-bağımsız düzene
  yönlenir; Overview açıklaması + Purchase→Inventory satırı da iki native'de,
  gerçek navigasyonla). Kullanıcıya-özel düzen ZATEN VAR
  (workspaceUserProfilesJSON per-user profilleri) — ayrıca iş çıkmadı.
  (Görsel kararlar 1B/2B/3B DÖRT platformda TAMAM — web canlı-doğrulamalı,
  Mac+iPhone xcodebuild ve Android gradle build'leriyle commit'li, 27 Ağu.)
- Customers ürün — 27 Ağu gece 3'te üçü kapandı (web, canlı yolda; native
  ajan turu sırada): entegrasyon paneli (integrationSyncedAt + son payload
  webhook'ta damgalanıyor; resyncIntegrationCustomer mağaza-kazanır replay —
  emülatörde bozulan telefon geri döndü; Connected store/ID/Last synced/ham
  veri) + profil hızlı aksiyonları (Call/WhatsApp/Email/Instagram) + arama
  vurgusu ("⌕ Matched: Dup Band" kartta). Native paritesi de TAMAM (iki ajan;
  Swift BUILD SUCCEEDED ×2 — setData sunucu alanlarını artık ezmiyor;
  Android BUILD SUCCESSFUL). KALAN: segmentler/etiketler; Messages/AI Replies
  bağlantısı; Overview sekme düzeni. Segmentler de TAMAM (27 Ağu gece 5,
  web+sunucu canlı yolda; tags[] anahtar-varsa yazımı, chip editörü + filtre
  satırı + kart chip'leri; native segment UI'ı sonraki tur). İletişim
  tercihleri de TAMAM (27 Ağu gece 6, rapor §15): preferred channel /
  Do not contact (linkler söner) / marketing durumu / next follow-up +
  Messages(?q= derin bağlantı)/AI Reply kısayolları; cleanCustomerForm
  geçirgenlik bug'ı emülatörde yakalanıp düzeltildi. KALAN (Customers):
  Overview sekme düzeni (görsel yeniden düzen — kullanıcıyla bakmalı);
  AI Reply'a müşteri bağlamı prefill'i; native segment+tercih UI'ları.
- Envanter/Files 3. aşaması (aşağıdaki eski liste).
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

## SIRADA — AKTİF KUYRUK: iki yeni rapor (27 Ağu)
Kaynaklar: NivaDesk_banking.md ve NivaDesk_notes.md (repo kökünde).
Talimat: iki özellik TEK TEK, detaylıca, TÜM platformlara.

### 1) BANKING (önce bu)
**Kritik 1-8 TAMAM (27 Ağu, sunucu+web CANLI):** kalıcı provider tx kimlikleri
(provider/providerTransactionId/normalisedProviderId/providerReference +
firstImportedAt) ve normalised id ile pending→booked hayalet mutabakatı;
Pandle kimlikleri (importedId/bankTransactionId + attempts/lastError izi);
deterministik doc-id = unique constraint; Pandle match sırası (manuel onay >
referans > tutar+tarih, ret listesi) + pandleConfirmMatch/pandleRejectMatch +
push'ta sunucu-tarafı eşleşme muhafızı (yön+kuruş+tarih toleransı);
requestId'li idempotent push (pandleSyncRuns defteri, tekrar = stored result);
provider-bağımsız model: 10 kodluk NivaDesk VAT listesi (ZR≠EX, MX=split
gerekir) + bankCategories kayıtları (rename kaskadı, aktif/pasif, Pandle/QB/
Xero mapping + tax fallback çevirisi); 7 review statüsü (tekli+toplu+otomatik
confirmed/sync_error geçişleri); drawer'da BANK DATA (salt-okunur) bölümü.
Ekstra kapanan Yüksek/Orta maddeler: kural formu VAT+appliesTo (vatCodeAuto
ile uygulanıyor; DOĞRULANMIŞ tutarsızlık kapandı), sync activity paneli
(drawer'da Pandle ID/hata/eşleşme durumu), pending/posted gösterimi, custom
kategoriler + mapping yönetimi (Rules sekmesi), review bulk. Emülatör:
banking-core.mjs 45 assert; web drawer/kategori/kural formu tarayıcıda
uçtan uca doğrulandı. 14 fonksiyon + firestore.rules deploy edildi; 51 yeni
anahtar × 11 dil. Native parite ajanları (Swift+Kotlin) bu dilim için çalıştı.
**Yüksek liste de TAMAM (27 Ağu, B2 dilimi, 4 platform):** split transaction
(bankSetTransactionSplits: toplam kuruşuna denk, ≤12 satır; Pandle push'ta
split engeli; web/Swift/Kotlin editörleri canlı toplam göstergeli);
incoming↔order payment eşleştirme (bankMatchIncomingToOrder:
suggest→link→create/unlink; mevcut payment bankTransactionId ile damgalanır,
create idempotent — asla çift kayıt); incomingKind ayrımı (transfer/owner
contribution/loan hasılat sayılmaz, Incoming KPI hariç tutar); receipt
Choose from Files (fileRecordId referansı, kopya yok, çöp korumalı, silme
yalnız bank_receipts yükünde); aranabilir sipariş seçici; çoklu hesap
filtresi. Emülatör: banking-links.mjs 29 assert. Native parite iki ajanla
(BUILD SUCCEEDED ×2 + BUILD SUCCESSFUL). Kalan: multi-currency alanları
(TrueLayer verisi geldikçe).
**Orta'dan kapananlar (27 Ağu gece, B3):** Accounting review kartı (dönem
bazlı 6 kutu → tıkla-filtrele, txReview çipi); rule priority (en uzun anahtar
kazanır) + categoryAutoRule izi; consent bitişi saklanıyor+gösteriliyor
(90 gün, ≤14 gün amber); Disconnect/veri silme AYRILDI (disconnect rızayı
keser veri kalır, purge ayrı onay; banking-b3.mjs 11 assert); receipt güven
% zaten OCR listesindeydi. 6 fonksiyon daha deploy edildi.
**Kalan Orta:** recurring güven/fiyat-değişimi alan zenginleştirmesi (temel
tespit+priceChange var); Supplier/Purchase/Inventory panel genişletmesi;
audit log (kural izi var, genel log yok); Overview soruları
(dönem/pending/transfer açıklamaları).
**Recurring zenginleştirme TAMAM (27 Ağu gece 3, 4 platform):** güven
derecesi (High/Medium/Low), tutar aralığı, ayın beklenen günü, "Detected from
N payments"; Upcoming'de "around <tarih>" + "Based on the last N monthly
payments" + "These are estimates, not booked payments." (§7+§22-23). Web'e
ayrıca Overview dönem açıklaması (§4) + drawer'da Purchase→Inventory zincir
satırı (§14) eklendi (bu iki metin native'e sonraki mikro-turda taşınabilir).
**B3 native paritesi de TAMAM (27 Ağu gece 2):** Swift'te Accounting review
kartı + txReview filtresi + native Disconnect/purge (onay metinli; Reconnect
web deep-link) + consent satırı + kural izi (BUILD SUCCEEDED ×2); Android'de
aynı yüzey, bağlantı yönetimi bilinçli web'de (BUILD SUCCESSFUL). BANKING
RAPORU 4 PLATFORMDA KAPANDI — kalan: recurring alan zenginleştirme,
Supplier/Purchase panel genişletme, genel audit log, multi-currency,
Overview açıklamaları.
**Dört kesin kural (uygulandı):** read-only scope; provider tx ID benzersiz;
Pandle'da mevcut hareket match edilir, yeniden yaratılmaz; kategori/VAT
hard-code değil mapping.

### 2) NOTES
**Yüksek TAMAM (27 Ağu, web + sunucu + NATIVE: Swift BUILD SUCCEEDED ×2,
Android BUILD SUCCESSFUL — evrensel editör, bağlı notlar, merkezi Reminders,
etiket yönetimi, workspace fan-out üç platformda):**
reminder bug'ı kökten kapandı (yerel tarih parse + NaN muhafızı, toISOString
UTC kayması yok, okuyucu {seconds}/ISO tanır, görsel yükleme ara kaydı
taslağı taşır, başarısız yazma sesli; mirror payload reminderDateMillis
kabul eder — sharePersonalNote deploy bekliyor); noteType
(Personal/Order/Customer/Team) + visibility (Only me/Workspace) ayrı
eksenler; evrensel form (aranabilir sipariş bağlama + müşteri adı; Project
sekmesinde + New Note order tipiyle açılır); workspace görünürlüğü mevcut
davet altyapısıyla üyelere fan-out; Project Notes sayacı = liste (8/6 bitti);
Reminders merkezi (not hatırlatıcıları + sipariş Schedule&Alerts tek liste).
**Orta TAMAM:** Customer Notes merkezi görünümü (müşteri Notes sekmesi bağlı
kayıtları listeler) + sipariş Notes kartında "From the Notes app" şeridi;
arama kapsamı (etiket + bağlı adlar) + aramaya/etikete özel boş durumlar;
label rename/sil (renk yok — bilinçli, not rengi zaten var).
**Kalan (sonraya):** client_portal görünürlüğü (portal fazı); collaborator
view/edit ayrımı (mirror sync sunucu işi); checklist; recurring
reminder/snooze; task'a dönüştürme; attachments↔Files; activity; kısayollar;
masonry/kronolojik akış kozmetikleri; created/updated by gösterimi; admin
insights notes sayacı (collectionGroup + index gerekir).
**Temel kural (uygulandı):** not BİR kez oluşturulur; Notes menüsü, Order
kartı ve Customer ekranı aynı kaydı kendi bağlamında gösterir.

---

## TAMAMLANAN raporlardan not (eski SIRADA)

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
Reset kapsam ayrımı da eklendi ("Reset this order" / "Reset shared layout" +
kapsam-açık onay); Customers ülke alanlarına ortak datalist (UK/United
Kingdom/GB kayması için yumuşak standardizasyon).
Actions menüsü de gruplandı (Header display / Documents / Card layout).
Kalan: sol durum şeridi + zemin ayrımı (görsel karar — birlikte bakalım);
renk+etiket anlam sistemi; sipariş türüne göre düzen; kullanıcıya özel düzen.
(Hızlı sekmeler: OrderQuickFilterBar zaten karşılıyor.)

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

## Inventory Faz 3 (NivaDesk_inventory_files.md haritasından) — 27 Ağu gecesi

**TAMAM — dört platformda:**
- I0 harita kusurları: "removed" tanınan statü + konum taşıması ledger'da
  "moved" izi (lastMovementAtMs'e dokunmaz).
- I1 dürüst rezervasyon: partiallyReserved statüsü, reservedValue gerçek
  rezerve miktarla, sipariş kartında "5 / 15 pcs · Vault Z", recordInventoryLoss
  (returned/damaged/lost/wastage — sebep ledger'da; rezerve stok korumalı).
- I2 tüketim+takas: consumeInventoryForOrder (kısmi/tam; ledger "used" ref=sipariş),
  swapInventoryForOrder (tek transaction bırak+tut); sipariş kartında
  "Use on the job" / "Swap…".
- I3 kısmi mal kabulü: receivePurchase satır+miktar bazlı, partiallyReceived
  statüsü, satırda receivedQuantity, ürün onHand=gelen/incoming=kalan;
  "Receive lines…" + "Receive the rest"; kısmen alınmış satın alma
  düzenlenemez/silinemez.
- I4 içe aktarma çift-kayıt: parse SKU/seri ön-taraması ("Already in stock"
  rozeti) + create/skip/update politikaları (update sayfayı gerçek yapar ama
  numara/statü/rezervasyona dokunmaz, rezervin altına çekemez); yeni sütun
  takma adları barcode/ean/upc→sku + ownership/condition/year/description.
- I5 sayfalama: listInventoryItems cursor+hasMore (çift DESC, indeks gerekmez);
  web/Mac/iPhone/Android'de "Load the next 500 items".
- Tedarikçi evrak alanları: code/address/vatNumber/currency (form+kart).
- Envanter etiketleri: items.tags (müşteri segment deseni), form chip editörü,
  detay paneli, aramada eşleşme.
- Test: functions/test/inventory 10 suite (hepsi düz node script) — 10/10.
- Yayın: round 14–19 canlıda chunk-doğrulamalı; fonksiyonlar isimle deploy edildi.

**Faz 3 kalan (büyük/dizayn işleri):**
- Hiyerarşik konumlar (yeni koleksiyon + kurallar + alt-ağaçla taşıma) — büyük.
- BOM / reçete (net-yeni) — büyük.
- Shopify/Woo stok senkronu — BLOKE: nivadesk-order-management/shopify.app.toml
  salt-okunur scope; kullanıcı kararı gerek (scope genişletme yeniden onay ister).
- Files kütüphanesi depolama yolu göçü — ayrı faz.
- Native parite: tedarikçi alanları + etiketler ajan turu 27 Ağu gecesi
  başlatıldı (Swift+Android; commit bekliyor olabilir — git log'a bak).

## Birikmiş işler dalgası — 27 Ağu gece (rounds 20–22, hepsi canlı chunk-doğrulamalı)

**Customers kalanları KAPANDI (round 20):** whatsappNumber gerçek alan
(payload/anonymize/merge/profil/modal/mükerrer tespiti/arama/GDPR export;
WhatsApp hızlı aksiyonu önce onu çevirir; eski sütun "Phone (from orders)"
olarak dürüst etiketlendi); company alanı aynı yollarda; Total Order Value
altında "incl. £X cancelled or refunded" alt satırı (yalnız öyle sipariş
varsa — countsTowardBalance); arama segment etiketlerini de tarar; AI Reply
kısayolu /quick-reply'a müşteri adını taşır. 4 müşteri fonksiyonu redeploy.
(Not: A3 sıralamalar, A4 shipping/consent, A5 ülke datalist, A6 sipariş-no
araması ZATEN kapanmıştı — DURUM'daki "kalan" listesi eskiydi.)

**Banking audit log KAPANDI (round 21):** her senkron (bağlantı başına,
başarıda import sayısı / hatada sınıflandırılmış sebep), connect, disconnect
ve purge bankAuditLog'a satır bırakır (best-effort); owner-only
bankListAuditLog callable; bağlı hesap barında "Activity" → Connection
activity listesi. 5 bank fonksiyonu deploy edildi.

**Hiyerarşik konumlar KAPANDI (round 22, faz-3 büyüklerinden ilki):**
inventoryLocations ağacı (path dizgileri, derinlik ≤4, döngü/kardeş-ad
muhafızları); rename/taşıma alt-ağacı VE içinde duran ürünlerin location
dizgilerini yeniden yazar (defter satırı yok); silme çocuk/stok varken
reddedilir; web Locations paneli (girintili liste + sayaçlar + Rename/Move +
parent seçici) + ürün formunda yol datalist'i. locations suite 15 assert;
3 callable deploy. Emülatörde uçtan uca: Kasa X/Çekmece 1 → ürün kondu →
Kasa Y rename → ürün dizgisi kendiliğinden izledi.

**Native birleşik parite turu:** iki ajan (Swift+Android) konum ağacı +
whatsapp/company + bank Activity için 27 Ağu gecesi başlatıldı; çeviriler
web language.ts'ten bayt-bayt talimatlı.

**Faz 3'te hâlâ açık:** BOM/reçete, maliyet katmanları, Files depolama yolu
göçü, Shopify/Woo stok senkronu (kullanıcı kararına bloke).

**Reçeteler (BOM) KAPANDI (round 23, faz-3 büyüklerinden ikincisi):**
inventoryRecipes CRUD (≤30 satır) + applyRecipeToOrder — çarpanlı (≤100),
TEK transaction, hepsi-ya-da-hiçbiri (kapasite/sahiplik/statü kontrolleri
yazımdan önce; sığmayan satır hiçbir şeyi rezerve ettirmez, hata mesajı
sığmayan parçayı adıyla söyler). Web: Manage → Recipes paneli + sipariş
kartında "Use a recipe…" (kaç işlik çarpanıyla). recipes suite 15 assert;
4 callable deploy; 23 anahtar × 11 dil. Emülatörde uçtan uca: 2 satırlık
reçete tek hamlede rezerve.
**Maliyet katmanları: TASARIM SONUCU — gerek yok.** Bu mimaride her satın
alma partisi zaten kendi maliyetini taşıyan AYRI ürün dokümanı; FIFO/katman
makinesi eklemek çözdüğü olmayan bir problemi çözerdi. (Aynı-SKU partileri
tek karta birleştirme istenirse o ayrı bir tasarım kararı — kullanıcıyla.)
**Native reçete paritesi:** birleşik parite turu (konumlar+whatsapp+bank
Activity) bittikten sonra ayrı turla.

**Birleşik native parite TAMAM (27 Ağu gece):** Swift 1c2ec0d (iki build
SUCCEEDED) + Android 197b848 (BUILD SUCCESSFUL) — konum ağacı sekmesi
(sayaçlar/Rename-Move/öneriler), müşteri WhatsApp+Company alanları
("Phone (from orders)" dürüst etiketi, WhatsApp aksiyonu doğru numarayı
çevirir, refund alt satırı iki platformda da VERİYLE yapıldı), bank
Connection activity listesi. İki ajan da birer gizli veri-kaybı yolu
yakalayıp kapattı: Android save-path'i web'de girilen primaryPhone'u
eziyordu (artık round-trip); Swift'te alanlar Codable tam-yazımlara girdi.
Reçete paritesi ajanları (Swift+Android) başlatıldı.
**Bekletilen tek kod işi:** Files depolama yolu göçü — canlı storage
nesnelerini taşıyan geri-dönüşsüz bir göç; kullanıcı onayıyla ayrı oturumda.

**Files depolama yolu göçü KAPANDI (27 Ağu sabahı, kullanıcı onayıyla):**
storage.rules'a companies/{id}/library/ bloğu (read+create only; nesneler
değişmez, silme sunucunun çöp-önce işi) deploy edildi; web yüklemeleri artık
kendi yoluna iniyor (round 24 canlı: yeni yol bundle'da, eski squat çıktı).
Üretim taraması (kuru + canlı, tüm şirketler): eski yolda SIFIR nesne —
kütüphane 1 günlük, göç fiilen no-op. Süpürme kalıcı araç olarak
functions/scripts/migrate-library-storage.mjs'te (idempotent: kopyala →
kayıt → portal-URL yeniden bas → orijinali sil). Tek seferlik anahtar-korumalı
HTTPS fonksiyonu işini bitirip üretimden silindi (404 teyitli), kaynağa hiç
commit'lenmedi.
**Reçete paritesi TAMAM:** Swift ad39d4a (BUILD SUCCEEDED ×2) + Android
e172d70 (BUILD SUCCESSFUL) — Recipes sekmesi + sipariş kartında "Use a
recipe…" iki native'de.
**FAZ 3 KOD İŞLERİ BİTTİ.** Kalan tek karar: Shopify/Woo stok senkronu
(salt-okunur scope → yazma izni mağaza yeniden-onayı ister — kullanıcıda).

---

## TAMAMLANDI — Chatbot/Support yeniden kurgusu (27 Ağu, round 25 CANLI)
Kaynak: repo kökünde `NivaDesk_chatbot 2.md` + kullanıcının vereceği "Ask
NivaDesk" tasarım görseli (koyu yeşil başlık, premium sade; referans ekran
görüldü). KULLANICI AYRI BİR GÖREVLE BAŞLATACAK — kendiliğinden başlama.

**Akış (görselle birebir):**
- Pencere açılınca form YOK; direkt sohbet: "Hi 👋 How can I help with
  NivaDesk today?" + 4 öneri çipi: Plans & pricing · Features · Migrating
  to NivaDesk · Talk to our team.
- Başlık: "Ask NivaDesk" / "Get an instant answer, or talk to our team if
  you need us." Alt bilgi: "Conversations are saved and secure · Privacy
  policy". Kullanıcı balonunda saat + çift tik; AI balonlarında sparkle
  avatar, insan cevabında FOTO + isim (örn. "Sarah · 10:47 AM") — AI mı
  insan mı HER ZAMAN belli.
- AI önce cevaplar (Knowledge Base arka planda; ayrıca "Search KB" düğmesi
  YOK). Emin değilse UYDURMAZ: "I'm not fully sure about this one. I can
  pass this conversation to the NivaDesk team." + [Send to team] [Keep
  chatting]. Handoff'ta şerit: "Handed to NivaDesk team"; sonrasında AI
  susar, ekip AYNI thread'e yazar. Küçük "Talk to a person" seçeneği her
  an erişilebilir. Thread asla forma dönmez/ölmez.
- Login'li NivaDesk kullanıcısından email/isim İSTENMEZ; destek tarafında
  bağlam görünür: "Gunes · EGGcraft Ltd / Orders: 42 · Plan: Pro / Current
  page: Banking → Transactions / Conversation: …".
- E-posta politikası: TÜM konuşmalar Support inbox'a; email bildirimi
  YALNIZ needs_human'da, kullanıcı "talk to team" dediğinde ve insan
  cevabından sonra kullanıcı tekrar yazdığında. AI'nın çözdüğü sorular
  için email yok; istenirse günlük özet ("Today: 23 AI conversations ·
  19 resolved · 4 need review").
- Mevcut "Leave your email and we'll come straight back to you" metni
  kalkar. Stocksmith'in üç büyük kartı ALINMAZ; yeşil premium tasarım
  korunur, gerçek chat arayüzüne dönüşür.
Mevcut altyapı notu: postWebsiteChatMessage canlı (23 Ağu), app-support
ticket→Hostinger SMTP maili var — bu kurgu o akışın üstünü yeniden yazar
(email spam'ini needs_human'a indirger).


**Chatbot kurgusu uygulandı (27 Ağu, round 25 canlı chunk-doğrulamalı):**
- Widget görselle birebir: form yok, "Hi 👋" + 4 çip, saat/çift-tik'li ziyaretçi
  balonu, sparkle-AI / isimli-insan avatarı, yuvarlak input + daire gönder,
  kilit+privacy alt bilgisi. 20 anahtar × 11 public dil YENİDEN çevrildi.
- Dürüstlük yolu: asistan JSON {reply, confident} döner; emin değilse spec
  cümlesini ziyaretçi dilinde söyler, widget [Send to team][Keep chatting]
  sunar; handoff "Handed to NivaDesk team" şeridi yazar, asistan kalıcı susar,
  AYNI thread insanla sürer; "Talk to a person" her an bir tık.
  websiteChatRequestHuman yeni callable.
- E-posta politikası: TÜM konuşmalar Support inbox'ta; mail YALNIZ handoff'ta
  ve insan devredeyken gelen ziyaretçi cevaplarında. AI'nın çözdükleri mail
  atmaz. (Günlük özet v1'de bilinçli yok.)
- Login'li kullanıcıdan e-posta hiç istenmez; createWebsiteChat sunucuda
  kimlik+workspace+plan+sayfa damgalar; Settings→Support→Website Chats'te
  bağlam kartı + "Asked for a person" bayrağı (6 anahtar × 11 dil).
- Bonus: website asistanı artık rehberden zeminleniyor (in-process corpus,
  top-3 bölüm) — "detay rehberde" derken rehbere kör olma çelişkisi bitti.
- Kanıt: emülatörde uçtan uca (çip→balon→handoff→divider; bilet dokümanında
  accountName "QA Review"/plan/needsHuman); ÜRETİMDE iki sonda — emin yol
  "£19 per month" (confident:true), emin-olmayan yol spec cümlesi
  (confident:false). 6 fonksiyon isimle deploy (websiteChatRequestHuman yeni).
- Native: destek kutusu bağlam kartı paritesi için iki ajan çalışıyor.

## KALICI SÜREÇ KURALI — "bot anlatabiliyor mu?" (27 Ağu, kullanıcı talimatı)
Her yeni özellik/modül ancak şunlarla KAPANIR:
1. guide.ts'e EN+TR rehber bölümü (kullanıcının yapacağı işler diliyle,
   menü-adım düzeyinde; diğer diller tasarım gereği İngilizce'ye düşer).
2. `node functions/assistant/buildGuideCorpus.js` + getUserGuide/askAppAssistant/
   createWebsiteChat/postWebsiteChatMessage deploy'u (JSON'lar fonksiyonla taşınır).
3. Üretim sondası: özelliğe dair bir nasıl-yapılır sorusu website asistanına
   sorulur — gerçek adımlarla confident:true beklenir; rehber kapsamıyorsa
   asistan confident:false + Send-to-team verir (blöf yasak, kural promptta).
4. Bot düzgün anlatamıyorsa özelliğin kendisi anlatılabilir hâle getirilir
   (adlandırma/akış sadeleştirme) — "gerekirse özellikleri botun anlatacağı
   şekle getirelim".
27 Ağu'da Banking + Envanter bölümleri bu kurala göre yazıldı (41→43 bölüm);
fiş sorusu üç aşamada kanıtlandı: dün blöf → sabah dürüst devir → şimdi
gerçek adımlar.

---

## SIRADA — İki yeni rapor (27 Ağu, "bu işlerden devam et")

### 1) NivaDesk_dashboard.md — Dashboard finans raporu (ÖNCE BU)
**Kritik:** üst menü Month/Year Net ≠ Dashboard Net Profit (üst menü VAT ve
Extra Spending düşmüyor — doğrulanmış; tek formüle bağla + hover'da formül);
finansal metrik adları tek merkezi tanıma; cash/accrual ayrımı (asgari:
Invoiced Revenue / Payments Received / Outstanding ayrı kartlar).
**Yüksek:** Growth işareti yanlış (+24.8% ↔ gerçek −24.8%); "Standard Tax
(Services/New)" kartı → Revenue (+alt notta vergi kuralı); Pending →
Outstanding Balance tanımıyla; refund/cancel/chargeback hesapları; Extra
Spending Summary dönem kapsamı (Year filtresinde all-time gösteriyor);
VAT set-aside'da input VAT/ödenmiş ayrımı.
**Orta:** Active orders/Due soon formül tooltip'i + tıklanabilir sayaçlar;
Bank Activity → "Net Cash Flow This Month" adı + bayat senkron uyarısı
("Last synced 4 days ago" + turuncu); grafik tooltip/drill-down; Customize
genişletme (sırala/boyut/preset/reset); store-channel filtreleri; çoklu para
birimi; Custom aralık preset'leri (Last 7/30, quarter, tax year) + CSV dosya
adına aralık; Start>End engeli.
**Ürün:** dashboard şablonları (Owner/Finance/Ecommerce), AOV, new/returning,
tıklanabilir KPI'lar, muhasebe modu seçimi.

### 2) NivaDesk_domain_link.md — Müşteri portalı özel domain
Model: varsayılan `workspace.nivadesk.app` + isteğe bağlı CNAME
`track.musteri.com` → `customers.nivadesk.app` (Dubsado/Plutio modeli;
Cloudflare for SaaS Custom Hostnames incelenecek). Entity adı genel:
`workspaceClientDomain` — yalnız tracking değil TÜM client-facing yüzeyler
(portal, estimate, invoice, pay, files). Branding ayrıları: logo, renk,
başlık, favicon, iletişim, Powered by NivaDesk ON/OFF. URL'lerde yalnız
yüksek-entropi token (sıralı ID asla — mevcut /e/<token> zaten böyle).
Domain değişince eskiler 301 ile yenisine; kaldırılınca fallback çalışır.
Plan: Pro'da dahil (Seçenek A), Team'de + custom sending email.
**Altyapı notu:** *.nivadesk.app wildcard DNS + Cloudflare for SaaS kurulumu
KULLANICI tarafında; kodda host-çözümleme + doğrulama + branding ben yaparım.

---

## 27 Ağu — Dashboard raporu S1+S2 KAPANDI, Domain-link D1 CANLI

### Dashboard finans raporu — Kritik+Yüksek tamam, 4 platform
- Kritik'lerin ikisi rapor yazılmadan HEAD'de zaten çözülmüştü (üst menü
  "Margin" adı 881b33c'te, Growth işareti de düzeltilmiş) — rapor eski
  sürüme bakıyordu.
- Web S1 (tur 27): Revenue kartı + accrual hint, YENİ Payments Received
  kartı (totals.received), Outstanding Balance, Cost/VAT/Net Profit
  formül tooltip'leri, üst pill'ler tıklanabilir (/orders, /customers),
  bank tile'ları "Spent this month/year" + bayat senkron metni
  ("N days ago" >12sa), Extra Spending dönem kapsamı sayfa filtresine bağlı.
- Web S2 (tur 28): Custom aralık preset'leri (Last 7/30 days, This/Last
  quarter, UK tax year 6-Nisan), start>end sessiz takas + min/max,
  toISOString UTC kayması düzeltildi (BST'de gün kayıyordu — yerel
  YYYY-MM-DD formatla).
- MCP kâr sapması: expectedRevenue = totalPrice || (paid+remaining+custom).
- Native parite: Swift 1c03264 + Android af75195 (ikisi de push'lu, iki
  platform da derlenip doğrulandı). Android'de financialShowBaseCost
  kapısı KPI/grafik/YoY/widget köprüsüne kadar işlendi.
- **Takip:** Android Cost kartı extra spending'i hâlâ dışlıyor (web'in
  dashboardCostTotal'ı dahil ediyor) — ayrı bir tur ister. Android'de
  custom aralık seçici, bank tile'ları, Active/Due-soon sayaçları bilinçli
  atlandı.
- Kalan (Orta/Ürün): grafik tooltip/drill-down, Customize genişletme,
  store-channel filtreleri, çoklu para birimi, refund/chargeback dökümü,
  VAT set-aside input-VAT ayrımı, CSV dosya adına aralık, şablonlar.

### Domain-link D1 — kayıt defteri + Settings UI CANLI
- functions/clientDomains.js (e1c7c57): tek `clientDomains` koleksiyonu,
  host → workspace tek okumada; 6 callable deploy edildi
  (getClientDomainConfig/setClientSubdomain/requestClientDomain/
  verifyClientDomain/removeClientDomain/resolveClientDomain).
  Slug rezerve listesi + transactional devir; custom host Pro/Team kapılı,
  apex ve path reddi ("yourdomain.com/track" açıklamalı); doğrulama DNS'in
  GERÇEKTEN döndürdüğünü raporluyor. 20 assert'lik suite yeşil.
- Web (512da92, yayın turu 29 CANLI): Settings → "Customer Portal Domain"
  (design grubu, yalnız owner). Subdomain claim + custom domain
  bağla/doğrula/kaldır, CNAME talimatı kod bloğu, dürüst doğrulama geri
  bildirimi. 32 string 12 dilde.
- Dev E2E: "my-studio-qa" slug alındı; track.eggcraft.co.uk eklendi,
  Verify dürüstçe "No CNAME record found yet" döndü.
- **Kalan (D2+):** Next.js middleware host-rewrite, portal branding
  (logo/renk/başlık/favicon/poweredBy), spoof-guard (token'ın workspace'i
  servis eden host'a sahip mi), eski link 301.
- **KULLANICI tarafı:** *.nivadesk.app wildcard DNS + Cloudflare for SaaS
  custom-hostname servisi kurulmadan custom host'lar yalnız rezerve edilir,
  servis edilmez (UI bunu dürüstçe söylüyor).

---

## 27 Ağu gece — Rehber kuralı ilk uygulama + Android Cost + Website raporu (tur 29-31)

### Rehber + bot (ayakta duran kuralın ilk rutin uygulaması)
- guide.ts: Dashboard bölümüne "Para kartlarını okumak" (Revenue vs Payments
  Received vs Outstanding, Net Profit formülü, dönem preset'leri) + Settings
  altına "Customer Portal Domain" (set-client-domain) EN+TR eklendi.
- Korpus 43→44 bölüm; 4 fonksiyon deploy edildi; üretim probu GEÇTİ
  (track.mysite.com sorusuna gerçek adımlar, confident:true).
- Not: probe sırasında support inbox'a 1 QA sohbeti düştü (hello + domain
  sorusu) — silinebilir.

### Android Cost kartı sapması KAPANDI (a6fea64)
- dashboardSummaryCards rolledCost'a stats.extraSpending eklendi — web'in
  dashboardCostTotal bileşimiyle birebir (base cost kapılı, extra spending
  koşulsuz). Diğer yüzeyler (grafik/YoY/CT/widget köprüsü) zaten doğruydu.
  BUILD SUCCESSFUL, push'landı.

### NivaDesk_global_website.md — İLK İKİ GEÇİŞ CANLI (tur 30+31)
Kullanıcı talimatı (27 Ağu gece): dosya kuyruğa, yeni özellikler siteye
eklensin, amaç kullanıcının ürünü ANLAMASI; her şey sormadan yapılsın.
**Yapıldı (Yüksek öncelik 8/8'in 7'si + orta birkaçı):**
- Terminoloji: Open Portal → "Open NivaDesk", Login → "Log in"; footer
  support sütununa Log in eklendi; CTA seti standardize.
- Ana sayfa yeniden sıralandı: Hero → hikâye → özelleştirme → sipariş
  kartları → ChatGPT → YENİ "Beyond the order board" bölümü → platformlar
  → CTA. Yeni bölüm 6 kart: Inventory, Bank Spending, Estimates &
  approvals, Repairs intake, Files library, Your own domain.
- Dürüstlük: IMG_2056.zip → approved-design.pdf; "perfect sync" →
  senkron cümlesi; "secure ChatGPT support" → "the secure NivaDesk
  ChatGPT app"; platform durumları Available/Planned'a indirildi.
- Hero eyebrow/body genişletildi (custom orders, repairs and service
  work); heroChip Finance → "Payments & Profit"; project→order taraması
  (schedule.f1.body, plan.pro.note, aiPage.ask.q10).
- Header: Security üst menüde (masaüstü+mobil); dil seçici 🌐 + yalnız
  yerel adlar; footer yılı dinamik; chat düğmesi "Ask NivaDesk".
- ChatGPT bölümüne "Learn about security and permissions" → /security.
- Tüm değişen/yeni string'ler (26+4) 12 dilde; TR dev-preview'da doğrulandı;
  tur 30 ve 31 canlıda chunk-doğrulamalı.
**Kalan (rapor Orta/Görsel):**
- Ürün screenshot okunabilirliği (zoom/tam ekran önizleme, floating kart
  bağlantı çizgileri) — tasarım dokunuşu ister.
- Platform bölümünde Windows kartını soluklaştırma; QR modal klavye/mobil
  davranışları; içerik tekrarını azaltma (editoryal); footer'a store/status
  bağlantıları; erişilebilirlik listesi (skip-link, focus, RTL, 200% zoom);
  demo video caption/fallback; dil değişiminde tarih/para/story localization
  taraması. Rapor Home dışı sayfaları (Features/Pricing/FAQ) ayrıca
  inceleyecekti — o raporlar gelince devam.

---

## 27 Ağu sabah — Website görsel geçiş + Dashboard Orta + D2 adım 1 (tur 32)

### Website raporu görsel maddeler (CANLI)
- Hero screenshot'a "See it full size" düğmesi → tam ekran önizleme
  (Escape kapatır, scroll kilitlenir; dev'de tam tur test edildi).
- Skip-to-content bağlantısı tüm public sayfalarda; Planned (Windows)
  platform kartı soluk + kesikli çerçeve; telefonda QR yerine doğrudan
  mağaza rozeti; demo video yüklenemezse doğrudan bağlantı; footer'a
  App Store + Google Play. 3 yeni string 12 dilde.

### Dashboard Orta maddeleri (ajan, da482b7, CANLI)
- Vergi kartı "Set aside this calendar year" + 1 Oca–31 Ara tooltip'i
  (hesap gerçekten takvim yılı — kod doğrulandı).
- Extra Spending CSV dosya adı aktif aralığı taşıyor
  (extra-spending-this-month.csv / -2026-01-01_2026-03-31.csv); satır
  tarihlerindeki toISOString UTC kayması da düzeltildi.
- Grafik tooltip'i workspace para birimiyle (formatStudioMoney), sağ
  kenarda sola çevriliyor; grafik etiketleri t()'ye taşındı.
- Customize'a "Reset layout" (varsayılanla eşleşince pasif; E2E'li).
- 11 yeni string 12 dilde (language.ts).

### Domain-link D2 adım 1 (web CANLI, fonksiyon deploy BEKLİYOR)
- middleware.ts: /r/<token> → /track/<token> rewrite, her host'ta;
  üretimde doğrulandı (nivadesk.app/r/... track sayfasını veriyor).
- Portal + Estimate sayfaları serving host'u gönderiyor;
  assertHostMayServeCompany: kayıtlı bir client domain'de sunulan token
  sayfası o domain'in workspace'ine ait değilse permission-denied.
  Kayıtsız/birincil host'lar dokunulmadan geçer.
- **DEPLOY EDİLDİ (27 Ağu sabah, reauth sonrası):** getPortalForVisitor,
  getEstimateForVisitor + Notes'tan kalan sharePersonalNoteWithWorkspaceMember
  (raporlardaki "sharePersonalNote" kısaltmasının gerçek adı buydu).
  Deploy sonrası bozuk token temiz NOT_FOUND dönüyor; spoof-guard canlı.
  Not: guard yalnız KAYITLI bir domain'de host≠workspace olduğunda devreye
  girer; kayıtlı iki domain de bizim workspace'te olduğundan mevcut linkler
  etkilenmez.

---

## 27 Ağu öğle — Domain 4 platformda + Portal branding (tur 33)

### Customer Portal Domain native parite TAMAM
- Swift 5e6fb16: ClientDomainSettingsView (Workspace Design grubunda,
  Branding-PDF arası, yalnız owner), 5 callable, DilMotoru'da 25 anahtar
  12 dilde; macOS + iOS Simulator BUILD SUCCEEDED.
- Android f615631: repository + SettingsScreen ClientDomainDetail,
  TR_13 çeviri bloğu web'den bire bir çıkarıldı; BUILD SUCCESSFUL.
- Bölüm artık 4 platformda; native'de status/error satırları BAŞTAN görünür.

### Portal branding (web+server CANLI, native ajanları çalışıyor)
- saveClientPortalBranding (YENİ, deploy edildi): owner-only; hex #rrggbb
  doğrulaması; Powered by gizleme Pro/Team kapılı. getClientDomainConfig
  branding'i okur; portal VE estimate public view'ları
  accentColor/showPoweredBy taşır (getPortalForVisitor +
  getEstimateForVisitor yeniden deploy).
- Web: bölüme "Customer page branding" kartı (renk seçici + varsayılana
  dön + Powered by anahtarı + Save); portal sayfası --portal-accent
  değişkeniyle durum yazısı + ilerleme noktalarını boyar; credit satırı
  koşullu. 9 string 12 dilde. Suite 27 assert yeşil. Tur 33 canlı.
- **Gizli bug bulundu+düzeltildi:** ClientDomainSection status/error
  state'lerini D1'den beri hiç render etmiyordu — "That subdomain is
  already taken." gibi sunucu mesajları sessizdi.
- Rehber: set-client-domain bölümüne markalama alt başlığı (EN+TR),
  korpus yeniden kuruldu, 4 asistan fonksiyonu deploy, üretim probu
  GEÇTİ (confident:true). Probe support inbox'a 1 QA sohbeti bıraktı.

### ÖNEMLİ KEŞİF — dev web TAM emülatör stack'inde
- localhost:3000 functions(5001)+Firestore(8080)+auth+storage
  emülatörlerine bağlı; dünkü "dev E2E" domain claim'leri emülatör
  sandbox'ındaydı. ÜRETİM clientDomains koleksiyonu TEMİZ/BOŞ —
  temizlik gerekmez, ama kullanıcının gerçek alt alan adı üretimde
  HENÜZ CLAIM EDİLMEDİ (nivadesk.app/settings'ten yapılabilir).
- Üretim kanıtı curl ile europe-west2 URL'lerine; hafızaya kaydedildi.

### Portal branding native parite TAMAM (27 Ağu öğleden sonra)
- Swift 00bbefc: brandingCard (ColorPicker + sRGB hex dönüşümü, boşken
  #2563eb; "Use the default colour" yalnız renk seçiliyken), Powered by
  Toggle, 9 anahtar DilMotoru'da web'le bayt-bayt aynı; macOS + iOS
  Simulator BUILD SUCCEEDED.
- Android 2a02f26: ClientPortalBranding + saveClientPortalBranding
  wrapper; renk kontrolü OrderDetail'in CardColorSwatch desenini
  yeniden kullanan 11 swatch'lık FlowRow (web varsayılanı #2563eb +
  sunucu örneği #2f6f6d dahil); SettingSwitch + Save; TR_13'e 9 anahtar
  web'den bire bir; BUILD SUCCESSFUL.
- Branding artık 4 platformda; mağaza sürümleriyle kullanıcıya ulaşır.

---

## 27 Ağu — Pandle konusu yeniden açıldı (araya girme; sonra kuyruğa dönülecek)

Pandle destek (Lily) app kaydı için HTTPS redirect URL'ini sordu (ilk mailde
vardı ama yeniden istediler). Altyapı denetimi:
- **Callback CANLI:** https://nivadesk.app/pandle/callback → 200 (parametreli de).
- **Secret'lar kayıtlı:** NIVADESK_PANDLE_CLIENT_ID / _SECRET v1 ENABLED
  (gerçek kimlikler gelene kadar yer tutucu).
- **Fonksiyonlar:** MD "canlıya bağlı" diyordu ama yalnız 4'ü canlıymış
  (Preview/Push/ConfirmMatch/RejectMatch) — kısmi eski deploy. 27 Ağu'da
  10'u birden isimle deploy edildi (7 create + 3 update); anonim probe
  temiz UNAUTHENTICATED dönüyor (owner kapısı çalışıyor).
- **Kimlikler gelince yapılacak:** `firebase functions:secrets:set` ile iki
  secret'a gerçek değerler + secret bağlayan fonksiyonları yeniden deploy
  (ConnectStart/ConnectFinish/RefreshMeta/Preview/Push — bağlayanlar) →
  /bank'taki PandleCard'dan Connect ile uçtan uca üretim testi.

---

## 27 Ağu akşam — Dashboard finans paketi + erişilebilirlik + ANA SAYFA v2 (tur 35)

### Dashboard finans paketi (ajan, 794be02)
- **BULGU:** iptal/iade siparişler dashboard'ın HER rakamına giriyordu
  (KPI/grafik/YoY/set-aside) — Outstanding hint'i tersini iddia ederken.
  Fix: orderCountsTowardBalance paylaşıldı; her yer dışlıyor; Financial
  Breakdown'a "Cancelled or refunded (n)" satırı.
- VAT set-aside dürüstleşti: input VAT (ST %20 / RR %5 giden ödemeler,
  split satırlar dahil) düşülür → set-aside = net VAT + CT; ödendi barı
  yeni toplama göre. vatFromGross sunucudaki formülün aynası.
  Bilinen sapma: kategori-varsayılanından gelen VAT kodu sayılmaz.
- Grafik: noktaya tıkla → panel o döneme zoom (Custom range, yerel tarih).
- AppShell üst şerit Margin'i de iptalleri dışlıyor (benim fix'im).
- 8 string 12 dilde; rehbere 3 yeni madde (iptal/netVAT/drill-down),
  korpus + 4 fonksiyon deploy, bot probu ↑ bu koşuda.

### Erişilebilirlik geçişi (ajan, 0234ff7)
- :focus-visible halkası tüm public etkileşimlilerde (modallar dahil,
  koyu zeminde beyaz); modallara autoFocus; reduced-motion boşlukları
  (platform stagger, guideFade, hover lift'ler); başlık sırası fix'leri
  (pricing h3→h2, footer h3→h2); alt/aria düzeltmeleri; 44px dokunma
  hedefleri (hamburger, footer linkleri, chat kapat/gönder, QR kapat);
  QR modal + demo video zoom/kısa ekran taşma korumaları.

### NivaDesk_global_website_home_menu.md — ANA SAYFA v2 CANLI
Rapor: önceki önerilerin ~%75-80'i uygulanmış; kalan ana sorun sıralama
(Shipping çok erken) + 12.595px uzunluk. Yapılanlar:
- **Yeni sıra birebir önerilen akış:** Hero → Everything stays connected
  (5 kategori etiketli 19 kart: Customer/Work/Order/Money/Items&records)
  → Customisation → ChatGPT (köprü cümlesi + "You control access" izin
  özeti ✓✓✓✕) → Back office → Shipping (bağlam satırı: "From the order
  board to the customer's door.") → Platforms → 3 satırlık pricing özeti
  → 3 FAQ bağlantısı → CTA.
- **Uzunluk 12.595 → ~9.376px** (pricing+FAQ eklenmişken): story
  3085→1879 (54→38vh adım, 24→10vh gap, hızlı+az kaybolan reveal),
  order-flow 2385→1665 (265→185vh).
- Metin dürüstlüğü: "no refresh" → otomatik+manuel; teslimatı kart
  işaretler (sipariş değil); "never needs a second tool" → savunulabilir
  cümle; Bank Spending → Banking preparation; one-at-a-time → review
  imported records; summarize→summarise; Web Portal → Web App;
  "…and Web."; chat notu "securely stored to provide support".
- Mobil: chat launcher 52px ikon-rozet + safe-area; panel ≤75vh.
  Customisation ikinci CTA'sı /features#customisation'a (anchor eklendi).
  Hero tam-boyut modalına altyazı satırı.
- 36 string 12 dilde (154 değiştirme + 22 yeni anahtar).
- **Bilinçli atlanan/ertelenen:** H1 alt-satırı (eyebrow zaten kapsıyor),
  floating kart bağlantı çizgileri + mobil carousel (tasarım riski),
  Windows waitlist CTA (e-posta toplama → privacy kararı kullanıcıda),
  header kırpılması (pane'de yeniden üretilemedi; nav'da transform/
  overflow yok — gerçek cihazda görülürse tekrar), scroll-story adım
  aktivasyonu pane'de test edilemiyor (programatik scroll artefaktı —
  üretimde de aynı, gerçek kullanıcıda çalışıyor).
- Pandle: destek PS-3869 referansıyla geliştirmeye iletti; kimlik bekleniyor.

---

## 27 Ağu gece — Kanal filtresi (tur 36) + iptal-dışlama 3 PLATFORMDA

### Web: mağaza-kanal filtresi CANLI (tur 36)
- Dashboard'da dönem seçicinin altında kanal pilleri (yalnız Shopify/Woo
  siparişi varsa görünür): All channels / Shopify / WooCommerce / Manual.
  customFields.Source'tan türetilir; aynı memo zincirini beslediği için
  KPI/grafik/YoY/döküm hepsi uyumlu. Dev E2E: £785 = Woo £385 + Manual
  £400. 3 string 12 dilde; rehber dashboard bölümüne madde; korpus + 4
  asistan fonksiyonu deploy.

### Dashboard finans düzeltmeleri NATIVE PARITE TAMAM
- **Android d594653:** iptal siparişler orada da sayılıyormuş —
  DashboardStats.from + WidgetSummaryBridge dahil tüm toplama noktaları
  countsTowardBalance'a bağlandı; dökümde "Cancelled or refunded (N)"
  satırı + Revenue hint cümlesi; vergi kartı Android'de yok → net-VAT
  bilinçli atlandı. BUILD SUCCESSFUL.
- **Swift 6a7871d:** aynı bulgu; Siparis.countsTowardBalance paylaşılan
  predicate oldu (MusterilerView'daki özel kopya silindi), DashboardView
  tüm toplamlar + grafik/YoY + WidgetSummaryBridge düzeltildi; döküm
  satırı + hint; vergi kartı Swift'te de yok → atlandı. macOS + iOS
  BUILD SUCCEEDED.
- Extra Spending her platformda bilinçli olarak filtrelenmedi (web ile
  aynı: harcama listesi, mutabakat değil).
- Net-VAT şu an yalnız web'de ÇÜNKÜ vergi kenara-ayır kartı yalnız
  web'de var — native'e kart gelirse net-VAT'la birlikte gelmeli (not).

---

## 27 Ağu gece 2 — Çoklu para birimi (dürüst dilim) + grid hotfix (tur 37)

### Çoklu para birimi — dönüştürmeden görünürlük CANLI
- Rapor #20 tam dönüşümün kur kararları istediğini söylüyor (hangi kur,
  hangi tarih, refund kuru) — bunlar SAHİBİN kararı, tahmin edilmedi.
- Yapılan dürüst dilim: yabancı kurlu siparişler (Shopify/WooCommerce/
  Currency customField'ı workspace sembolünün ISO karşılığından farklıysa)
  Financial Breakdown'da kendi satırlarında: "USD (çevrilmedi) (3)" +
  tutar kendi para biriminde; Revenue hint'ine açıklama cümlesi.
  Toplamlar değişmedi. 2 string 12 dilde; rehber kuralı: "NivaDesk parayı
  asla sessizce çevirmez". SYMBOL→ISO haritası settings'teki 9 sembol.
- **AÇIK KARAR (kullanıcıya):** gerçek kur dönüşümü istenirse kur
  kaynağı/tarihi/refund kuru kararları gerekiyor.

### HOTFIX tur 37 — gruplu kartlar ezilmişti
- Kullanıcı bildirdi: "Everything stays connected" bölümü bozuk.
  Neden: gruplama grid'in çocuklarını 19 slottan 5 blok'a çevirdi ama
  konteyner 210px auto-fit'te kaldı → gruplar 226px şeride, çipler
  108px'e ezildi (tur 35-36'da canlıya böyle çıkmış). Fix: blok grid'i
  2 gerçek kolon (telefonda 1), çipler 286px'e döndü. Dev'de geometri
  doğrulandı, tur 37 canlıda CSS+JS marker'larıyla teyitli.
- Ders: yapısal DOM değişikliği yapınca konteynerin ESKİ layout
  varsayımlarını da elden geçir; yalnız yeni sınıfların CSS'ini ekleme.

---

## 27 Ağu gece 3 — ANA SAYFA v3: kullanıcının mock'u (tur 38 CANLI)

Kullanıcı görsel mock verdi; talimatlar: mock tasarımı uygula, ChatGPT
bölümünü ve platform bölümünü KORU, kargo hikâyesini Features'a taşı,
fiyatlar gerçek rakamlarla.

**Uygulanan:**
- Hero: eyebrow ve chip'ler gitti; ekran görüntüsünün üstünde 4 stat
  kartı (3 orders / £2,450 / 2 in transit / 4 tasks); CTA'lar Start Free
  + Watch the demo + View Pricing→ (metin bağlantısı); hero.body mock'un
  3 kısa cümlesi. "See it full size" korunud.
- "Everything stays connected" → hub diyagramı: ortada Order kartı
  (Custom Leather Duffle Bag, In Progress, Timeline/Files/Notes çipleri),
  çevresinde Customer/Work/Money/Items kartları, kesikli bağlantılar.
  19 kartlık detay grid'i Features sayfasında yaşamaya devam ediyor.
- Customisation: mini kanban kartı (4 kolon + sürüklenen "Edge
  Finishing" hayaleti) + "Your studio. Your rules." altyazısı.
- ChatGPT bölümü OLDUĞU GİBİ korundu (talimat).
- Back office: 6 tıklanabilir ikon karosu, başlık "Powerful back-office
  features for your studio."; açıklamalar title tooltip'inde.
- Kargo: 4 ekranlık scroll hikâyesi /features'a taşındı (#shipping
  çapası); ana sayfada tek satırlık "Keep customers informed" şeridi +
  "See how tracking works →".
- Platform bölümü OLDUĞU GİBİ korundu (talimat).
- Fiyatlar GERÇEK: Free £0 Süresiz / Pro £19/ay (Recommended rozeti —
  mevcut çevrili anahtar) / Team £49/ay — mock'taki £24/£59 ve yanlış
  "per user" ibaresi KULLANILMADI. Compare plans → /pricing.
- FAQ: 3 soruluk akordeon (içe aktarma/güvenlik/iptal) dürüst kısa
  cevaplarla; mock'taki soru seti mevcut çevrili sorularla eşlendi.
- Kapanış: "Ready to run a calmer, more organised studio?" + Start Free
  + "No credit card required." — mock'taki "Join thousands of makers"
  iddiası YALAN olurdu (37 workspace), bilinçli atlandı.
- Footer mock'a çevrilmedi (yasal bağlantılar korunmalı; mock'ta yok).
- Sayfa yüksekliği ~7.204px (12.595→9.376→7.204). 37 yeni string +
  hero.body 12 dilde. Tur 38 canlıda 5 marker'la doğrulandı.
