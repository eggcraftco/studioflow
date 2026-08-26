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
