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

## DEVAM EDEN (şu an)
- **Native kütüphane paritesi**: Mac/iPhone + Android'e Library modu (görünümler,
  arama, detay, Share with Order, çöp/geri yükleme) + sipariş detayında kütüphane
  şeridi. İki ajan çalışıyor; tam build doğrulaması şart.

## SONRAYA BIRAKILANLAR (bilinçli — kullanıcı onayıyla)
Envanter/Files raporunun 3. aşaması: partial reservation, partial purchase receipt,
maliyet katmanları, iade/hasar/kayıp/fire, BOM/reçete, Shopify/Woo stok senkronu,
sipariş kartında kullanılan-miktar/swap aksiyonları, hiyerarşik lokasyonlar,
import kopya-politikaları, Tags/Storage görünümleri, kütüphaneye özel storage yolu
(storage.rules `firebase login --reauth` bekliyor), 500-üstü sunucu sayfalaması.

## KULLANICIYA BAĞLI BEKLEYENLER
- Ana repo push (commit'ler hazır), mağaza sürümleri (iOS/macOS 1.3 review'da,
  Android 0.1.8), `firebase login --reauth` (storage.rules), VAPID anahtarı
  (+ App Check yapılandırması — Schedule raporu §17 de bunu doğruladı),
  "Recalculate Taxes" düğmesi (mağaza sürümlerinden sonra).

---

## SIRADA — 26 Ağu'da gelen üç rapor

### A. NivaDesk_schedule.md
**Yüksek (doğrulanmış bug):**
1. Sağ resize tutamacı sağa uzatmıyor (teslim tarihi uzatılamıyor).
2. 3 aylık görünümde 25 Eki çift / 31 Eki yok (yaz saati geçişi; hücreler saat
   değil salt-tarih tabanlı üretilmeli).
3. Order → Timeline & Delivery içindeki Created Date editörü kaydetmiyor
   (Schedule sürüklemesi kaydediyor — tutarsızlık).
4. VAPID/App Check (kullanıcıya bağlı bölümde).
**Orta:** kalan-gün etiketi belirsiz (45d → "45d left" / Duration-Remaining ayrımı),
"Search Tasks" adı, Schedule–Team Schedule ayrım metni, resize'da canlı tarih
önizleme, seçili siparişi görünür alana alma.
**Kullanılabilirlik:** Orders/Schedule aynı kart bileşeni + Detailed/Standard/Compact
yoğunluk (ayırıcı konumuna göre), ekran-başına genişlik hatırlama, ince-ama-kolay
ayırıcı, Today/Jump to selected, sticky ay başlıkları, zoom presetleri, hover
eşleştirme, tarih değişikliğinde Undo, çubukta "Due £X" etiketi.

### B. NivaDesk_order_kart_sistemi.md
(Doğrulanmış arıza yok — kart taşıma çalışıyor; iyileştirme raporu.)
Kart sol durum şeridi + tamamlanan/iptal zemin ayrımı, kısaltma tooltip'leri, hızlı
sekmeler; ayırıcı görünürlüğü (hover mavi, ⋮ tutamaç, çift-tık varsayılan); resize
canlı ölçü etiketi + tutamaç tooltip'leri + kart menüsü boyut seçenekleri; sürükleme
ilk-kullanım ipucu + "taşındı—geri al" bildirimi + klavye taşıma; kilit kapsam
etiketi; renk+etiket anlam sistemi; Actions gruplama; Customize cards kategorileri +
reset kapsam ayrımı + panel içi arama; şablonlar (Owner/Designer/Finance/Workshop/
Mobile), sipariş türüne göre düzen, kullanıcıya özel düzen, mobil tek sütun.

### C. NivaDesk_customers.md
**Kritik:** duplicate tespiti+birleştirme, Shopify/Woo kaynak kimlikleri, alan bazlı
kaynak/sync çatışma politikası, Total Spent → Order Value/Paid/Outstanding ayrımı,
"View All Orders" müşteri filtresiyle, telefon–WhatsApp ayrımı, GDPR
export/anonymize/delete, iade/refund'un müşteri değerine yansıması.
**Orta:** "1 orders" dilbilgisi, kart tarihinin etiketi, Customer/Order Notes adları,
Activity'de kişi+saat+kaynak, kaynak rozetleri, ek sıralamalar, uzun proje listesi
"+N more", manuel form genişletme (shipping/company/consent), ülke standardizasyonu.
**Ürün:** segmentler/etiketler, Messages/AI Replies bağı, hızlı aksiyonlar,
Overview sekme düzeni, responsive müşteri listesi.
